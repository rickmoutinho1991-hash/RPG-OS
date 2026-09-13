import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatBasisPoints,
  parsePercentToBasisPoints,
  resolveApplicableBasisPoints,
  validateFeeConfigProposal,
} from "@rpg/core";
import { startApproval } from "@/lib/workflows";

/** Permissão específica para gerir a taxa RPG-OS (financeiro sensível). */
export const PLATFORM_FEE_MANAGE_PERMISSION = "platform_fees.manage";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/* ─── Leitura (page server-side) ──────────────────────────────────────── */

export interface FeeConfigRowView {
  basisPoints: number;
  notes: string | null;
  updatedAt: string | null;
}

export interface FeeConfigOverrideView extends FeeConfigRowView {
  companyId: string;
  companyName: string;
  isActive: boolean;
}

export interface FeeConfigHistoryView {
  action: string;
  actorName: string;
  timestamp: string | null;
  previousBps: number | null;
  newBps: number | null;
  reason: string | null;
  scopeLabel: string;
  status?: string;
}

/**
 * Devolve null quando o utilizador não tem permissão (403 ao nível da
 * página). Tudo é lido service-role server-side; nunca do cliente.
 */
export async function getPlatformFeeAdminData(): Promise<
  | {
      authorized: false;
    }
  | {
      authorized: true;
      userId: string;
      globalConfig: FeeConfigRowView | null;
      effectiveBps: number;
      overrides: FeeConfigOverrideView[];
      pendingInstanceId: string | null;
      history: FeeConfigHistoryView[];
      managedCompanies: Array<{ id: string; name: string }>;
    }
> {
  const ctx = await getSessionContext();
  if (!ctx || !hasPermission(ctx.permissions, PLATFORM_FEE_MANAGE_PERMISSION)) {
    return { authorized: false };
  }

  const supabase = createAdminClient();
  const [{ data: configs }, { data: memberships }] = await Promise.all([
    supabase
      .from("platform_fee_config")
      .select("company_id, basis_points, is_active, notes, updated_at")
      .order("updated_at", { ascending: false }),
    supabase
      .from("company_employees")
      .select("company_id, companies(name)")
      .eq("user_id", ctx.user.id),
  ]);

  const rows = (configs ?? []) as Array<Record<string, unknown>>;
  const snapshots = rows
    .filter((r) => r.is_active === true)
    .map((r) => ({
      companyId: r.company_id as string | null,
      isActive: true,
      basisPoints: Number(r.basis_points ?? 0),
    }));
  const globalActive = rows.find(
    (r) => r.is_active === true && r.company_id === null,
  );

  // Empresas em que o administrador é colaborador (âmbito dos overrides).
  const managedCompanies = (memberships ?? [])
    .map((m: Record<string, unknown>) => ({
      id: String(m.company_id ?? ""),
      name:
        ((m.companies as { name?: string } | null)?.name as string) ??
        "Empresa",
    }))
    .filter((c) => c.id);

  const overrides: FeeConfigOverrideView[] = rows
    .filter((r) => r.company_id !== null)
    .map((r) => ({
      companyId: String(r.company_id),
      companyName:
        managedCompanies.find((c) => c.id === r.company_id)?.name ??
        "Empresa",
      basisPoints: Number(r.basis_points ?? 0),
      notes: (r.notes as string | null) ?? null,
      updatedAt: (r.updated_at as string | null) ?? null,
      isActive: r.is_active === true,
    }));

  // Histórico de alterações (audit_logs) com nomes resolvidos.
  const [{ data: audits }, { data: users }] = await Promise.all([
    supabase
      .from("audit_logs")
      .select("user_id, action, timestamp, metadata")
      .in("action", ["FEE_CONFIG_REQUESTED", "FEE_CONFIG_APPLIED"])
      .order("timestamp", { ascending: false })
      .limit(50),
    supabase.from("users").select("id, full_name, email"),
  ]);
  const nameById = new Map<string, string>(
    ((users ?? []) as Array<Record<string, unknown>>).map((u) => [
      String(u.id),
      (u.full_name as string) || (u.email as string) || "Utilizador",
    ]),
  );
  const history: FeeConfigHistoryView[] = (
    (audits ?? []) as Array<Record<string, unknown>>
  ).map((a) => {
    const meta = (a.metadata as Record<string, unknown> | null) ?? {};
    const prev = meta.previousBps != null ? Number(meta.previousBps) : Number(meta.currentBps);
    const next = Number(meta.newBps);
    return {
      action: String(a.action),
      actorName: nameById.get(String(a.user_id)) ?? "Utilizador",
      timestamp: (a.timestamp as string | null) ?? null,
      previousBps: Number.isFinite(prev) ? prev : null,
      newBps: Number.isFinite(next) && meta.newBps != null ? next : null,
      reason: (meta.reason as string | null) ?? null,
      scopeLabel:
        typeof meta.scopeCompanyId === "string" && meta.scopeCompanyId
          ? managedCompanies.find((c) => c.id === meta.scopeCompanyId)
            ?.name ?? "Empresa"
          : "Global",
      status: (meta.status as string | null) ?? undefined,
    };
    });

  // Pedido de alteração ainda pendente de aprovação? (platform-level, sem org)
  const { data: pending } = await supabase
    .from("workflow_instances")
    .select("id")
    .eq("entity_type", "PLATFORM_FEE_CONFIG")
    .eq("status", "PENDING")
    .limit(1)
    .maybeSingle();

  return {
    authorized: true,
    userId: ctx.user.id,
    globalConfig: globalActive
      ? {
          basisPoints: Number(globalActive.basis_points ?? 0),
          notes: (globalActive.notes as string | null) ?? null,
          updatedAt: (globalActive.updated_at as string | null) ?? null,
        }
      : null,
    effectiveBps: resolveApplicableBasisPoints(snapshots, null),
    overrides,
    pendingInstanceId: (pending?.id as string) ?? null,
    history,
    managedCompanies,
  };
}

/* ─── Escrita (server actions) ────────────────────────────────────────── */

/** Outcome da proposta de alteração da taxa. */
export interface FeeConfigProposeResult {
  success: boolean;
  error?: string;
  instanceId?: string;
}

/**
 * Proposta de alteração de taxa (global ou override por empresa).
 * - Valida permissão `platform_fees.manage` server-side;
 * - Valida bps com `validateFeeConfigChange` (0..10000, inteiro, != atual);
 * - NÃO altera nada na BD ainda — cria uma instância PENDING no workflow engine;
 * - Grava fatos na metadata (não enviados pelo cliente): scope, companyId,
 *   bps atual e novo. A taxa só passa a vigorar APÓS aprovação.
 */
export async function proposeFeeConfigChange(input: {
  scope: "GLOBAL" | "COMPANY";
  companyId?: string | null;
  newBasisPoints: number;
  reason?: string;
}): Promise<FeeConfigProposeResult> {
  try {
    const ctx = await getSessionContext();
    if (!ctx || !hasPermission(ctx.permissions, PLATFORM_FEE_MANAGE_PERMISSION)) {
      return { success: false, error: "Sem autorização." };
    }

    const newBps = Number(input.newBasisPoints);
    if (!Number.isInteger(newBps) || newBps < 0 || newBps > 10000) {
      return { success: false, error: "Percentagem inválida (0%–100%)." };
    }

    const supabase = createAdminClient();

                        // Corrente de leitura: snapshots ativos → resolveApplicableBasisPoints
    const { data: snapshots } = await supabase
      .from("platform_fee_config")
      .select("company_id, basis_points, is_active")
      .eq("is_active", true);
    const currentBps = resolveApplicableBasisPoints(
      (snapshots ?? []).map((s: Record<string, unknown>) => ({
        companyId: s.company_id as string | null,
        basisPoints: Number(s.basis_points ?? 0),
        isActive: true,
      })),
      input.scope === "COMPANY" ? input.companyId : null,
    );

    const reason = (input.reason || "").trim();

    // ── Multi-tenant: âmbito de empresas do ator resolvido NA BD ──────────
    // O cliente pode enviar qualquer companyId; só aceitamos empresas em que
    // o utilizador é colaborador (a página limita o dropdown, mas o servidor
    // é quem decide — nunca confiar no cliente).
    let managedCompanyIds: string[] = [];
    if (input.scope === "COMPANY") {
      const { data: memberships } = await supabase
        .from("company_employees")
        .select("company_id")
        .eq("user_id", ctx.user.id);
      managedCompanyIds = (memberships ?? [])
        .map((m: Record<string, unknown>) => String(m.company_id ?? ""))
        .filter(Boolean);
    }

    const val = validateFeeConfigProposal({
      scope: input.scope,
      companyId: input.companyId ?? null,
      newBps,
      currentBps,
      reason,
      managedCompanyIds,
    });
    if (!val.valid) {
      return { success: false, error: val.errors.join(" ") };
    }

    // Criar workflow REQUESTED (não há organização — configuração global da
    // plataforma); aprovação garante que a taxa só vigora após aceitação.
    const entityId =
      input.scope === "COMPANY"
        ? (input.companyId as string)
        : "global";
    const result = await startApproval({
      title: `Taxa RPG-OS: ${formatBasisPoints(currentBps)} → ${formatBasisPoints(newBps)} (${input.scope}${input.companyId ? ` (${input.companyId})` : ""})`,
      summary: reason,
      entityType: "PLATFORM_FEE_CONFIG",
      entityId,
      organizationId: null, // platform-level, sem tenant
      requestedBy: ctx.user.id,
      currentStep: "REQUESTED",
      metadata: {
        scope: input.scope,
        scopeCompanyId: input.scope === "COMPANY" ? input.companyId : null,
        currentBps,
        newBps,
        reason,
      },
    });
    if (!result.success) {
      return { success: false, error: result.error ?? "Não foi possível criar o pedido." };
    }

    // Audit log específico para FEE_CONFIG_REQUESTED
    await supabase.from("audit_logs").insert({
      user_id: ctx.user.id,
      action: "FEE_CONFIG_REQUESTED",
      module: "PLATFORM_FEES",
      entity_type: "PLATFORM_FEE_CONFIG",
      entity_id: entityId,
      metadata: {
        scope: input.scope,
        scopeCompanyId: input.scope === "COMPANY" ? input.companyId : null,
        currentBps,
        newBps,
        reason,
        workflowInstanceId: result.instanceId,
        status: "PENDING",
      },
    });

    return { success: true, instanceId: result.instanceId };
  } catch (e: unknown) {
    void e;
    return { success: false, error: "Erro inesperado." };
  }
}

/**
 * Aplicada apenas após WORKFLOW_APPROVED (gatilho no decideWorkflowAction).
 * - company_id NULL = global; override por empresa caso scopeCompanyId;
 * - Insere/desativa de forma atómica por escopo (unique index PARTIAL is_active);
 * - NÃO toca platform_fees existentes — snapshots imutáveis.
 */
export async function applyFeeConfigChange(input: {
  scope: "GLOBAL" | "COMPANY";
  companyId: string | null;
  newBasisPoints: number;
  reason: string;
  actorId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const bps = Number(input.newBasisPoints);
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
      return { success: false, error: "Percentagem inválida (0%–100%)." };
    }
    const supabase = createAdminClient();

    // Capturar o valor anterior antes de desativar
    const { data: currentConfig } = await supabase
      .from("platform_fee_config")
      .select("basis_points")
      .eq("company_id", input.companyId ?? null)
      .eq("is_active", true)
      .maybeSingle();

    const previousBps = currentConfig ? Number(currentConfig.basis_points) : null;

    // Ativar nova: primeiro desativar qualquer config ativa no mesmo escopo.
    const scopeMatch = [
      input.scope === "COMPANY"
        ? supabase
            .from("platform_fee_config")
            .update({ is_active: false })
            .eq("company_id", input.companyId ?? null)
            .eq("is_active", true)
        : supabase
            .from("platform_fee_config")
            .update({ is_active: false })
            .is("company_id", null)
            .eq("is_active", true),
    ];
    const { error: deactErr } = await scopeMatch[0];
    if (deactErr) return { success: false, error: "Não foi possível atualizar a configuração." };

    const { error: insErr } = await supabase.from("platform_fee_config").insert([
      {
        company_id: input.companyId ?? null,
        basis_points: bps,
        notes: input.reason || null,
      },
    ]);
    if (insErr) return { success: false, error: "Não foi possível aplicar a nova taxa." };

    await supabase.from("audit_logs").insert({
      user_id: input.actorId,
      action: "FEE_CONFIG_APPLIED",
      module: "PLATFORM_FEES",
      entity_type: "PLATFORM_FEE_CONFIG",
      entity_id: input.companyId ?? "",
      metadata: {
        scope: input.scope,
        companyId: input.companyId,
        previousBps,
        newBps: bps,
        reason: input.reason,
        status: "APPLIED",
      },
    });
    return { success: true };
  } catch {
    return { success: false, error: "Erro inesperado." };
  }
}
