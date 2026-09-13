"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/session";
import {
  hasPermission,
  canDecideWorkflow,
  canDecideWorkflowStep,
  canCancelWorkflow,
  resolveExecutionNextStep,
  isExecutionTerminalStep,
} from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications";
import {
  loadWorkflowDefinitionById,
  resolveActorPermissionsInOrg,
  resolveStepResponsibleUserIds,
  type LoadedWorkflowDefinition,
} from "@/lib/workflows";
import { applyFeeConfigChange } from "@/lib/feeConfig";
import { applyMarketingConfigChange } from "@/lib/marketing";

const result = (error?: string): { success: boolean; error?: string } =>
  error ? { success: false, error } : { success: true };

interface WorkflowRow {
  id: string;
  organization_id: string | null;
  entity_type: string;
  entity_id: string;
  status: string;
  current_step: string | null;
  requested_by: string | null;
  approver_id: string | null;
  title: string | null;
  metadata: Record<string, unknown> | null;
}

async function loadInstance(instanceId: string): Promise<WorkflowRow | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(instanceId)) {
    return null;
  }
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("workflow_instances")
    .select("id, organization_id, entity_type, entity_id, status, current_step, requested_by, approver_id, title, metadata")
    .eq("id", instanceId)
    .maybeSingle();
  return (data as WorkflowRow | null) ?? null;
}

export async function decideWorkflowAction(
  instanceId: string,
  decision: "APPROVED" | "REJECTED",
  note?: string,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx) return result("Inicie sessão para continuar.");

  const row = await loadInstance(instanceId);
  if (!row) return { success: false, error: "Pedido de aprovação não encontrado." };

  // ── Autorização server-side ─────────────────────────────────────────
  // Com definição ativa: passo e required_permission vêm SEMPRE da base de
  // dados (nunca do cliente); as permissões efetivas do ator são calculadas
  // para a organização DA INSTÂNCIA (isolamento multi-tenant).
  // Sem definição: comportamento legado preservado.
  const rawDefId = row.metadata?.definitionId;
  const definitionId = typeof rawDefId === "string" ? rawDefId : null;
  const definition = definitionId
    ? await loadWorkflowDefinitionById(definitionId)
    : null;

  const instanceLike = {
    id: row.id,
    organizationId: row.organization_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    status: row.status as "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED",
    requestedBy: row.requested_by,
    approverId: row.approver_id,
  };

  let verdict: { allowed: true } | { allowed: false; reason: string };
  let currentStepDef: LoadedWorkflowDefinition["steps"][number] | null = null;

  if (definition) {
    const currentKey = (row.current_step ?? "").trim().toUpperCase();
    currentStepDef = currentKey
      ? (definition.steps.find((s) => s.key.toUpperCase() === currentKey) ??
        null)
      : null;
    const orgScopedPerms = await resolveActorPermissionsInOrg(
      row.organization_id,
      ctx.user.id,
    );
    const stepPerm = currentStepDef?.requiredPermission || null;
    verdict = canDecideWorkflowStep(
      instanceLike,
      {
        actorId: ctx.user.id,
        canApproveForOrg: hasPermission(orgScopedPerms, "workflows.approve"),
        ...(stepPerm
          ? { actorHasStepPermission: hasPermission(orgScopedPerms, stepPerm) }
          : {}),
      },
      currentStepDef,
    );
  } else {
    // Caminho legado: as permissões têm de refletir a organização DA
    // INSTÂNCIA (nunca apenas a organização ativa da sessão — senão um
    // aprovador da org A decidiria instâncias da org B). Instâncias sem
    // organização mantêm o comportamento histórico com ctx.permissions.
    const canApproveForOrg = row.organization_id
      ? hasPermission(
          await resolveActorPermissionsInOrg(
            row.organization_id,
            ctx.user.id,
          ),
          "workflows.approve",
        )
      : hasPermission(ctx.permissions, "workflows.approve");
    verdict = canDecideWorkflow(instanceLike, {
      actorId: ctx.user.id,
      canApproveForOrg,
    });
  }

  if (!verdict.allowed) {
    return { success: false, error: denyMessage(verdict.reason) };
  }

  const supabase = createAdminClient();
  const decidedAt = new Date().toISOString();
  const decisionNote =
    decision === "REJECTED"
      ? (note?.trim() || "Sem justificação indicada.")
      : (note?.trim() || null);

  const next = await resolveTransitionOnDecision(row, decision, definition);
  if (next.error !== undefined) {
    return { success: false, error: next.error };
  }

  // Fail-safe: se o fluxo avança para um passo intermédio, tem de existir
  // pelo menos um responsável elegível ANTES de persistir a mudança.
  let responsibleUserIds: string[] = [];
  let nextStepLabel = "";
  if (next.status === "PENDING") {
    const nextStepDef =
      definition?.steps.find(
        (s) =>
          String(s.key).toUpperCase() ===
          next.currentStep.trim().toUpperCase(),
      ) ?? null;
    nextStepLabel = nextStepDef?.name || next.currentStep;
    responsibleUserIds = await resolveStepResponsibleUserIds({
      organizationId: row.organization_id,
      stepRequiredPermission: nextStepDef?.requiredPermission || null,
      designatedApproverId: row.approver_id,
    });
    if (responsibleUserIds.length === 0) {
      return {
        success: false,
        error: `Sem responsáveis elegíveis para o passo "${nextStepLabel}". O pedido mantém-se no passo atual — atribua a permissão necessária ou designe um aprovador.`,
      };
    }
  }

  // ── Persistência com guarda de concorrência (anti-TOCTOU) ────────────
  // O UPDATE só é aceite se a instância continuar PENDING e no MESMO passo
  // lido acima. Se outro utilizador decidir entretanto, nenhuma linha é
  // alterada, não há segunda notificação nem audit log duplicado.
  let updateQuery = supabase
    .from("workflow_instances")
    .update({
      status: next.status,
      decided_at: decidedAt,
      decision_note: decisionNote,
      current_step: next.currentStep,
    })
    .eq("id", instanceId)
    .eq("status", "PENDING");
  if (row.current_step) {
    updateQuery = updateQuery.eq("current_step", row.current_step);
  }
  const { data: updated, error } = await updateQuery.select("id");

  if (error) {
    return { success: false, error: "Não foi possível concluir a decisão." };
    }
  if (!updated || updated.length === 0) {
    // Outro ator decidiu/cancelou primeiro: o estado local estava obsoleto.
    return {
      success: false,
      error: "Este pedido já foi decidido ou mudou de passo. Atualize a página.",
    };
  }

  // ─── Efeito colateral server-side: aprovação de taxa RPG-OS ──────────
  // A taxa só passa a vigorar APÓS aprovação — valores futuros vêm da
  // metadata da própria instância (não do cliente).
  if (row.entity_type === "PLATFORM_FEE_CONFIG" && decision === "APPROVED") {
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    const scope = meta.scope as "GLOBAL" | "COMPANY" | undefined;
    if (scope === "GLOBAL" || scope === "COMPANY") {
      const r = await applyFeeConfigChange({
        scope,
        companyId:
          scope === "COMPANY"
            ? (meta.scopeCompanyId as string | null) ?? null
            : null,
        newBasisPoints: Number(meta.newBps),
        reason: (meta.reason as string) ?? "",
        actorId: ctx.user.id,
      });
      if (!r.success) {
        // A decisão foi persistida; o operator deve rever manualmente.
        await supabase.from("audit_logs").insert({
          user_id: ctx.user.id,
          action: "FEE_CONFIG_APPLY_FAILED",
          module: "PLATFORM_FEES",
          entity_type: "PLATFORM_FEE_CONFIG",
          entity_id: row.entity_id,
          metadata: {
            workflowInstanceId: row.id,
            error: r.error,
          },
        });
      }
    }
  }

  // ─── Efeito colateral server-side: aprovação de config Marketing AI ───
  // O AUTOPILOT só fica ativo APÓS aprovação — valores vêm da metadata da
  // própria instância (nunca do cliente) e são revalidados em @rpg/core.
  if (row.entity_type === "MARKETING_CONFIG" && decision === "APPROVED") {
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    const companyId = typeof meta.companyId === "string" ? meta.companyId : "";
    const proposed = meta.proposed as Record<string, unknown> | undefined;
    if (companyId && proposed) {
      const r = await applyMarketingConfigChange({
        companyId,
        proposed,
        actorId: ctx.user.id,
      });
      if (!r.success) {
        // A decisão foi persistida; o operator deve rever manualmente.
        await supabase.from("audit_logs").insert({
          user_id: ctx.user.id,
          action: "MARKETING_CONFIG_APPLY_FAILED",
          module: "MARKETING_AI",
          entity_type: "MARKETING_CONFIG",
          entity_id: row.entity_id,
          metadata: {
            workflowInstanceId: row.id,
            error: r.error,
          },
        });
      }
    }
  }

  if (next.status === "PENDING") {
    // Avanço intermédio: notificar os responsáveis do novo passo.
    const recipients = responsibleUserIds
      .filter((id) => id !== ctx.user.id)
      .slice(0, 20);
    for (const userId of recipients) {
      try {
        await notifyUser(userId, "Aprovação à sua espera", {
          body: `O pedido "${row.title ?? row.entity_type}" aguarda a sua ação no passo "${nextStepLabel}".`,
          link: "/aprovacoes",
          category: "APPROVAL",
        });
      } catch {
        // Falha de notificação não pode invalidar o avanço já persistido.
      }
    }
  } else if (row.requested_by) {
    const rejectedReason =
      decisionNote && decisionNote !== "Sem justificação indicada."
        ? ` Motivo: ${decisionNote}`
        : "";
    await notifyUser(
      row.requested_by,
      decision === "APPROVED" ? "Pedido aprovado" : "Pedido rejeitado",
      {
        body:
          decision === "APPROVED"
            ? `O pedido "${row.title ?? row.entity_type}" foi aprovado.`
            : `O pedido "${row.title ?? row.entity_type}" foi rejeitado.${rejectedReason}`,
        link: "/aprovacoes",
        category: "APPROVAL",
      },
    );
  }

  await supabase.from("audit_logs").insert({
    user_id: ctx.user.id,
    action: `WORKFLOW_${decision}`,
    module: "WORKFLOWS",
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    metadata: {
      workflowInstanceId: row.id,
      decisionNote,
      approverId: ctx.user.id,
      // Passo REAL no momento da decisão (facto persistido; nunca inferido).
      decidedStep: row.current_step ?? null,
      ...(next.status === "PENDING"
        ? { advancedTo: next.currentStep }
        : { finalizedStatus: next.status }),
    },
  });

  revalidatePath("/aprovacoes");
  revalidatePath("/");
  return { success: true };
}

export async function cancelWorkflowAction(
  instanceId: string,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx) return { success: false, error: "Inicie sessão para continuar." };

  const row = await loadInstance(instanceId);
  if (!row) return { success: false, error: "Pedido de aprovação não encontrado." };

  const canManageForOrg = ctx.permissions.includes("workflows.manage");
  const verdict = canCancelWorkflow(
    {
      id: row.id,
      organizationId: row.organization_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      status: row.status as "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED",
      requestedBy: row.requested_by,
      approverId: row.approver_id,
    },
    { actorId: ctx.user.id, canApproveForOrg: false, canManageForOrg },
  );

  if (!verdict.allowed) {
    return { success: false, error: cancelDenyMessage(verdict.reason) };
  }

  const supabase = createAdminClient();
  // Guarda de concorrência (anti-TOCTOU): só cancela se continuar PENDING.
  const { data: updated, error } = await supabase
    .from("workflow_instances")
    .update({ status: "CANCELLED" })
    .eq("id", instanceId)
    .eq("status", "PENDING")
    .select("id");

  if (error) {
    return { success: false, error: "Não foi possível cancelar o pedido." };
  }
  if (!updated || updated.length === 0) {
    return {
      success: false,
      error: "Este pedido já foi decidido ou cancelado. Atualize a página.",
    };
  }

  await supabase.from("audit_logs").insert({
    user_id: ctx.user.id,
    action: "WORKFLOW_CANCELLED",
    module: "WORKFLOWS",
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    metadata: { workflowInstanceId: row.id },
  });

  revalidatePath("/aprovacoes");
  revalidatePath("/");
  return { success: true };
}

function denyMessage(reason: string): string {
  switch (reason) {
    case "NOT_PENDING":
      return "Este pedido já foi decidido ou cancelado.";
    case "NOT_ASSIGNED_APPROVER":
      return "Apenas o aprovador designado pode decidir este pedido.";
    case "MISSING_STEP_PERMISSION":
      return "Não tem a permissão exigida pelo passo atual deste fluxo de aprovação.";
    case "MISSING_ORG_APPROVE_PERMISSION":
      return "Não tem permissão de aprovação para esta organização.";
    default:
      return "Não tem autorização para decidir este pedido.";
  }
}

function cancelDenyMessage(reason: string): string {
  switch (reason) {
    case "NOT_PENDING":
      return "Este pedido já foi decidido ou cancelado.";
    case "NOT_REQUESTER":
      return "Apenas o requerente do pedido o pode cancelar.";
    default:
      return "Não tem autorização para cancelar este pedido.";
  }
}
/**
 * Aplica a transição configurada na decisão. Devolve o estado e o passo
 * seguintes, ou um erro quando a definição de workflow é inválida.
 * - Sem definição ativa: fallback ao comportamento histórico (terminal).
 * - Com definição: avança conforme as transições carregadas do servidor
 *   (passo/permissão/transição nunca vêm do cliente); sem próximo passo,
 *   completa com o estado da decisão.
 */
async function resolveTransitionOnDecision(
  row: WorkflowRow,
  decision: "APPROVED" | "REJECTED",
  definition: LoadedWorkflowDefinition | null,
): Promise<{
  status: "PENDING" | "APPROVED" | "REJECTED";
  currentStep: string;
  error?: undefined;
} | { error: string }> {
  const fallbackStep = row.current_step ?? "SUBMITTED";

  // Sem definição: comportamento histórico (decisão terminal imediata).
  if (!definition) {
    return {
      status: decision,
      currentStep: fallbackStep,
    };
  }

  const steps = definition.steps.map((s) => ({
    key: String(s.key),
    position: 0,
  }));
  const transitions = definition.transitions.map((t) => ({
    fromStep: String(t.fromStep),
    toStep: String(t.toStep),
    condition: (t.condition as Record<string, unknown> | null) ?? null,
  }));

  const res = resolveExecutionNextStep(
    row.current_step ?? "SUBMITTED",
    decision,
    steps,
    transitions,
  );

  if (res.type === "ERROR") {
    return { error: executionErrorLabel(res.reason) };
  }

  if (res.type === "COMPLETED") {
    return { status: decision, currentStep: row.current_step ?? "SUBMITTED" };
  }

  const target = res.toStep;
  const terminal = isExecutionTerminalStep(transitions, target);
  return terminal
    ? { status: decision, currentStep: target }
    : { status: "PENDING", currentStep: target };
}

function executionErrorLabel(
  reason: "INVALID_CURRENT_STEP" | "MISSING_TARGET_STEP",
): string {
  switch (reason) {
    case "INVALID_CURRENT_STEP":
      return "Estado atual do pedido não corresponde à definição de workflow.";
    case "MISSING_TARGET_STEP":
      return "A definição de workflow aponta para um passo inexistente.";
    default:
      return "A definição de workflow é inválida.";
  }
}