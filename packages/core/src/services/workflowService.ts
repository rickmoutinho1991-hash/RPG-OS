/**
 * RPG-OS — Regras de domínio do motor de Workflows / Aprovações.
 * Lógica pura, sem dependência de Next.js ou Supabase, testável unitariamente.
 *
 * O motor persiste `workflow_instances`. Esta camada decide, de forma estrita,
 * quem pode decidir (aprovar/rejeitar) e quem pode cancelar um pedido.
 * Nunca confia no cliente: a mesma regra é usada server-side nas Server Actions
 * e (no futuro) replicada em RLS para acesso direto.
 */

import { hasPermission } from "../constants/permissions";
import { resolveEffectivePermissions } from "./RbacService";

export type WorkflowStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type WorkflowDecision = "APPROVED" | "REJECTED";

export interface WorkflowInstanceLike {
  id: string;
  organizationId?: string | null;
  entityType?: string;
  entityId?: string;
  currentStep?: string;
  status: WorkflowStatus;
  requestedBy?: string | null;
  approverId?: string | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  createdAt?: string;
}

export interface WorkflowDecisionContext {
  /** id do utilizador autenticado a executar a ação */
  actorId: string;
  /** permissão efetiva `workflows.approve` (ou `*`) do ator na organização */
  canApproveForOrg: boolean;
}

export type WorkflowRuleResult =
  | { allowed: true }
  | { allowed: false; reason: WorkflowRuleDenyReason };

export type WorkflowRuleDenyReason =
  | "NOT_PENDING"
  | "NOT_ASSIGNED_APPROVER"
  | "MISSING_ORG_APPROVE_PERMISSION"
  | "NOT_REQUESTER"
  | "MISSING_ACTOR";

/**
 * Aprovar/reprovar é permitido apenas a:
 *  1. o aprovador explicitamente designado no pedido (approver_id); OU
 *  2. um utilizador com permissão `workflows.approve` na organização
 *     quando o pedido é organizacional sem aprovador designado.
 * Em qualquer caso o pedido tem de estar PENDING.
 */
export function canDecideWorkflow(
  instance: WorkflowInstanceLike,
  ctx: WorkflowDecisionContext,
): WorkflowRuleResult {
  if (!ctx.actorId) return { allowed: false, reason: "MISSING_ACTOR" };
  if (instance.status !== "PENDING") {
    return { allowed: false, reason: "NOT_PENDING" };
  }
  if (instance.approverId) {
    if (instance.approverId === ctx.actorId) return { allowed: true };
    return { allowed: false, reason: "NOT_ASSIGNED_APPROVER" };
  }
  if (instance.organizationId && ctx.canApproveForOrg) {
    return { allowed: true };
  }
  return { allowed: false, reason: "MISSING_ORG_APPROVE_PERMISSION" };
}

/**
 * Cancelar é permitido ao requerente de um pedido ainda PENDING.
 * O aprovador nunca cancela — decide. Owners de organização podem cancelar
 * pedidos organizacionais se tiverem `workflows.manage`.
 */
export function canCancelWorkflow(
  instance: WorkflowInstanceLike,
  ctx: WorkflowDecisionContext & { canManageForOrg?: boolean },
): WorkflowRuleResult {
  if (!ctx.actorId) return { allowed: false, reason: "MISSING_ACTOR" };
  if (instance.status !== "PENDING") {
    return { allowed: false, reason: "NOT_PENDING" };
  }
  if (instance.requestedBy === ctx.actorId) return { allowed: true };
  if (instance.organizationId && ctx.canManageForOrg) {
    return { allowed: true };
  }
  return { allowed: false, reason: "NOT_REQUESTER" };
}

/** Estado legível em PT para badges/UI. Mapeia sem contexto de sistema. */
export const WORKFLOW_STATUS_LABEL: Record<WorkflowStatus, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  CANCELLED: "Cancelado",
};

/* ─── Progresso visual do workflow (UI de passos) ─────────────────────── */

export type WorkflowStepVisualState =
  | "done"
  | "current"
  | "future"
  | "completed"
  | "rejected"
  | "cancelled";

export interface WorkflowStepView {
  key: string;
  name: string;
  requiredPermission?: string | null;
  state: WorkflowStepVisualState;
}

/**
 * Constrói a vista de progresso por passos para a UI, a partir da definição
 * carregada server-side e do estado persistido da instância. Sem definição
 * (workflows legados) devolve [] — a UI mantém a apresentação atual.
 * Regras:
 *  - ordena por posição;
 *  - PENDING: anteriores concluídos, atual em curso, seguintes futuros;
 *  - APPROVED: passo atual marcado como terminado com sucesso;
 *  - REJECTED / CANCELLED: passo atual marcado com o respetivo fim,
 *    mantendo os anteriores como concluídos;
 *  - passo atual desconhecido: nenhum passo fica "atual" (vista conservadora).
 */
export function buildWorkflowProgress(
  steps: Array<{
    key: string;
    name?: string | null;
    position?: number | null;
    requiredPermission?: string | null;
  }>,
  currentStep: string | null | undefined,
  status: WorkflowStatus,
): WorkflowStepView[] {
  const ordered = [...(steps ?? [])]
    .map((s, index) => ({
      key: String(s.key ?? ""),
      name: s.name?.trim() || String(s.key ?? ""),
      position: typeof s.position === "number" ? s.position : index,
      requiredPermission: s.requiredPermission?.trim() || null,
    }))
    .sort((a, b) => a.position - b.position || 0);

  if (ordered.length === 0) return [];

  const currentKey = String(currentStep ?? "").trim().toUpperCase();
  const currentIndex = currentKey
    ? ordered.findIndex((s) => s.key.toUpperCase() === currentKey)
    : -1;

  const statusByDecision: Partial<
    Record<WorkflowStatus, WorkflowStepVisualState>
  > = {
    APPROVED: "completed",
    REJECTED: "rejected",
    CANCELLED: "cancelled",
  };
  const currentState: WorkflowStepVisualState =
    status === "PENDING"
      ? "current"
      : (statusByDecision[status] ?? "current");

  return ordered.map((s, index) => {
    let state: WorkflowStepVisualState;
    if (currentIndex === -1) {
      // Passo persistido não corresponde à definição (ex.: definição
      // editada): vista conservadora — o resultado global fica no badge
      // de estado; nenhum passo é apresentado como concluído.
      state = status === "PENDING" ? "future" : "future";
      if (index === ordered.length - 1 && status !== "PENDING") {
        state = currentState;
      }
    } else if (index < currentIndex) {
      state = "done";
    } else if (index === currentIndex) {
      state = currentState;
    } else {
      state = "future";
    }
    return {
      key: s.key,
      name: s.name,
      requiredPermission: s.requiredPermission,
      state,
    };
  });
}

/** Etiqueta PT e classe de estilo para cada estado visual de passo. */
export const WORKFLOW_STEP_VISUAL_LABELS: Record<
  WorkflowStepVisualState,
  { label: string; className: string; icon: string }
> = {
  done: { label: "Concluído", className: "success", icon: "✓" },
  current: { label: "Em curso", className: "warning", icon: "●" },
  future: { label: "Aguarda", className: "", icon: "○" },
  completed: { label: "Aprovado", className: "success", icon: "✓" },
  rejected: { label: "Rejeitado", className: "danger", icon: "✕" },
  cancelled: { label: "Cancelado", className: "", icon: "⊘" },
};

/**
 * Classifica um erro devolvido pelo PostgREST/Supabase como violação de
 * constraint UNIQUE (SQLSTATE 23505). Usado para tornar o INSERT de
 * workflow_instances idempotente em corridas reais entre chamadas simultâneas:
 * o segundo pedido deteta que "perdeu" a corrida e reutiliza a instância
 * PENDING existente em vez de falhar.
 */
export function isUniqueViolation(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return Boolean(
    error.message?.toLowerCase().includes("duplicate key") ||
      error.message?.toLowerCase().includes("unique constraint"),
  );
}

/* ─── Histórico real de decisões por passo (audit_logs) ───────────────── */

/** Evento de decisão vindos dos audit_logs (formato já persistido). */
export interface WorkflowAuditDecisionEvent {
  /** Instância à qual o evento pertence (metadata.workflowInstanceId). */
  instanceId: string;
  /** Só estes dois actions são considerados factos de decisão. */
  action: string;
  userId?: string | null;
  /** Passo real no momento da decisão (metadata.decidedStep). */
  decidedStep?: string | null;
  /** Momento da decisão (audit_logs.timestamp). */
  timestamp?: string | null;
}

export interface WorkflowStepHistoryEntry {
  decision: "APPROVED" | "REJECTED";
  userId?: string | null;
  /** Nome resolvido server-side (nunca enviado pelo cliente). */
  displayName: string;
  timestamp?: string | null;
}

/**
 * Associa eventos de auditoria aos passos de uma instância, usando apenas
 * factos comprováveis:
 *  - só aceita eventos da PRÓPRIA instância;
 *  - só aceita actions WORKFLOW_APPROVED / WORKFLOW_REJECTED;
 *  - só associa quando `decidedStep` corresponde a um passo da definição
 *    (eventos legados sem `decidedStep` são ignorados — nada é inferido);
 *  - devolve os eventos por chave de passo, ordenados cronologicamente.
 */
export function buildWorkflowStepHistory(input: {
  instanceId: string;
  steps: Array<{ key: string }>;
  events: WorkflowAuditDecisionEvent[];
  resolveName?: (userId: string | null | undefined) => string;
}): Record<string, WorkflowStepHistoryEntry[]> {
  const resolve =
    input.resolveName ??
    ((id: string | null | undefined) => id ?? "Utilizador");
  const known = new Set(
    (input.steps ?? []).map((s) => String(s.key ?? "").toUpperCase()),
  );
  const result: Record<string, WorkflowStepHistoryEntry[]> = {};
  for (const event of input.events ?? []) {
    if (!event || event.instanceId !== input.instanceId) continue;
    const decision =
      event.action === "WORKFLOW_APPROVED"
        ? ("APPROVED" as const)
        : event.action === "WORKFLOW_REJECTED"
          ? ("REJECTED" as const)
          : null;
    if (!decision) continue;
    const stepKey = String(event.decidedStep ?? "").trim().toUpperCase();
    if (!stepKey || !known.has(stepKey)) continue;
    (result[stepKey] ??= []).push({
      decision,
      userId: event.userId ?? null,
      displayName: resolve(event.userId),
      timestamp: event.timestamp ?? null,
    });
  }
  // Ordenação temporal ascendente por passo (o mais antigo primeiro).
  for (const key of Object.keys(result)) {
    result[key].sort((a, b) =>
      String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? "")),
    );
  }
  return result;
}

/** Representação mínima de um passo de definição (vindo só do servidor). */
export interface WorkflowStepLite {
  key: string;
  name?: string | null;
  requiredPermission?: string | null;
}

/**
 * Resolve a permissão exigida pelo passo atual a partir da definição
 * carregada do servidor. Nunca aceita permissão fornecida pelo cliente.
 * Devolve null quando o passo não é encontrado ou não exige permissão.
 */
export function getStepRequiredPermission(
  steps: WorkflowStepLite[],
  currentStep: string | null | undefined,
): string | null {
  if (!currentStep) return null;
  const key = String(currentStep).toUpperCase();
  const step = (steps ?? []).find(
    (s) => String(s.key || "").toUpperCase() === key,
  );
  const perm = step?.requiredPermission?.trim();
  return perm ? perm : null;
}

export type WorkflowStepDenyReason =
  | WorkflowRuleDenyReason
  | "MISSING_STEP_PERMISSION";

export interface WorkflowStepDecisionContext extends WorkflowDecisionContext {
  /**
   * O ator detém a `requiredPermission` do passo atual, calculada
   * server-side a partir das effective permissions na organização
   * **da instância** (não da organização ativa da sessão).
   * Só relevante quando o passo exige permissão.
   */
  actorHasStepPermission?: boolean;
}

/**
 * Decisão por passo: quando o passo atual tem `requiredPermission`,
 * APENAS quem detém essa permissão pode decidir (o cliente não pode
 * influenciar o passo nem a permissão). Sem permissão configurada,
 * mantém-se integralmente a lógica legada de `canDecideWorkflow`.
 */
export function canDecideWorkflowStep(
  instance: WorkflowInstanceLike,
  ctx: WorkflowStepDecisionContext,
  currentStep: WorkflowStepLite | null,
): { allowed: true } | { allowed: false; reason: WorkflowStepDenyReason } {
  if (!ctx.actorId) return { allowed: false, reason: "MISSING_ACTOR" };
  if (instance.status !== "PENDING") {
    return { allowed: false, reason: "NOT_PENDING" };
  }
  if (currentStep?.requiredPermission) {
    if (ctx.actorHasStepPermission === true) return { allowed: true };
    return { allowed: false, reason: "MISSING_STEP_PERMISSION" };
  }
  // Sem permissão exigida no passo: comportamento legado preservado.
  const legacy = canDecideWorkflow(instance, ctx);
  return legacy as { allowed: true } | { allowed: false; reason: WorkflowStepDenyReason };
}

/**
 * Resolve os utilizadores elegíveis para um passo com base numa permissão,
 * reutilizando o mecanismo RBAC existente (cargo builtin / cargo custom /
 * override temporário) — sem criar um sistema paralelo de permissões.
 * Apenas memberships ACTIVE e temporalmente válidas são consideradas.
 */
export function resolveEligibleApproverIds<
  M extends {
    id?: string;
    organizationId: string;
    userId: string;
    roleKey?: string;
    customRoleId?: string | null;
    status?: string;
    isPrimary?: boolean;
    permissionsOverride?: string[] | null;
    validFrom?: string | null;
    validUntil?: string | null;
  },
>(input: {
  /** Organização-alvo; memberships de outras organizações são ignoradas */
  organizationId?: string | null;
  memberships: M[];
  customRoles?: Array<{
    id: string;
    organization_id: string;
    key: string;
    label: string;
    permissions: string[] | null;
    scope?: string | null;
  }>;
  requiredPermission: string;
}): string[] {
  if (!input.requiredPermission) return [];
  const scopedMemberships = input.organizationId
    ? input.memberships.filter(
        (m) => m.organizationId === input.organizationId,
      )
    : input.memberships;
  const customRoles = (input.customRoles ?? []).map((cr) => ({
    id: cr.id,
    organizationId: cr.organization_id,
    key: cr.key,
    label: cr.label,
    permissions: cr.permissions ?? [],
    scope: (["ORGANIZATION", "DEPARTMENT", "TEAM"].includes(
      String(cr.scope ?? "ORGANIZATION"),
    )
      ? (cr.scope as "ORGANIZATION" | "DEPARTMENT" | "TEAM")
      : "ORGANIZATION") as "ORGANIZATION" | "DEPARTMENT" | "TEAM",
  }));
  const seen = new Set<string>();
  for (const m of scopedMemberships) {
    if (m.organizationId !== undefined && m.userId === undefined) continue;
    const resolved = resolveEffectivePermissions(
      {
        ...m,
        id: m.id ?? "",
        organizationId: m.organizationId,
        userId: m.userId,
        roleKey: m.roleKey ?? "EMPLOYEE",
        customRoleId: m.customRoleId ?? undefined,
        status: (m.status as never) ?? "ACTIVE",
        isPrimary: m.isPrimary === true,
        permissionsOverride: m.permissionsOverride ?? [],
        validFrom: m.validFrom ?? undefined,
        validUntil: m.validUntil ?? undefined,
      },
      customRoles.filter((r) => r.organizationId === m.organizationId),
    );
    if (hasPermission(resolved.permissions, input.requiredPermission)) {
      seen.add(m.userId);
    }
  }
  return [...seen];
}