/**
 * RPG-OS — Assistente de Vida: Planos de Ação (server-side).
 *
 * Camada segura que liga o núcleo puro (ActionPlanService) à persistência:
 *   - rendez-vous entre sessão (owner/tenant), dados reais do centro de vida
 *     (loadLifeData — sem duplicar queries) e o motor de propostas;
 *   - desduplicação por chave determinística (id = userId::type::entityId);
 *   - preserva estados do utilizador (CONFIRMED/EXECUTED/FAILED) entre sincronizações;
 *   - auto-cancela propostas que deixaram de ser relevantes;
 *   - executor de ações SÓ com autorização + tenant scoped explícito;
 *   - ações financeiras (BILL_PAYMENT/MARK_BILL_PAID) exigem CONFIRMED;
 *   - auditoria + notificação + revalidação para cada transição.
 *
 * NUNCA confiar em ids do cliente: toda a escrita filtra por user_id
 * (e, quando aplicável, organization_id) resolvido na sessão. RLS intacto.
 */
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { resolveFinanceTenant } from "@/lib/finance/tenant";
import { loadLifeData } from "@/lib/life/tenant";
import { recordAuditEvent } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { respondToReviewAction } from "@/app/reputacao/actions";
import { revalidatePath } from "next/cache";
import {
  actionAuthorizationError,
  buildLifeOverview,
  cancelAction,
  confirmProposedAction,
  markActionExecuted,
  markActionFailed,
  proposeLifeActions,
  sortPlanByPriority,
  type ActionPlan,
  type ActionPlanScope,
  type ActionPriority,
  type ActionStatus,
  type ActionType,
  type LifeContextInput,
  type LifeOverview,
  type ProposedAction,
} from "@rpg/core";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID determinístico (v5-like) a partir do id textual da ação, para colunas UUID (ex.: audit_logs.entity_id). */
function actionAuditUuid(id: string): string {
  const hash = createHash("sha256").update(`rpg-os:action_plans:${id}`).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface ActionPlanRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  company_id: string | null;
  type: ActionType;
  title: string;
  description: string;
  reason: string;
  impact: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  related_entity_label: string | null;
  required_data: Record<string, unknown>;
  requires_confirmation: boolean;
  priority: ActionPriority;
  status: ActionStatus;
  proposed_at: string | null;
  confirmed_at: string | null;
  executed_at: string | null;
  cancelled_at: string | null;
  failed_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionPlanResult {
  plan: ActionPlan | null;
  error?: string;
}

const TASK_PRIORITY: Record<ActionPriority, string> = {
  CRITICAL: "URGENT",
  HIGH: "HIGH",
  NORMAL: "MEDIUM",
  INFO: "LOW",
};

export function toProposedAction(row: ActionPlanRow): ProposedAction {
  const scope: ActionPlanScope = {
    userId: row.user_id,
    organizationId: row.organization_id,
    companyId: row.company_id,
  };
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    reason: row.reason,
    impact: row.impact,
    relatedEntity: {
      kind: row.related_entity_type ?? "n/a",
      id: row.related_entity_id,
      label: row.related_entity_label ?? row.title,
    },
    requiredData: row.required_data ?? {},
    requiresConfirmation: row.requires_confirmation,
    priority: row.priority,
    status: row.status,
    scope,
    proposedAt: row.proposed_at ?? new Date().toISOString(),
    ...(row.confirmed_at ? { confirmedAt: row.confirmed_at } : {}),
    ...(row.executed_at ? { executedAt: row.executed_at } : {}),
    ...(row.cancelled_at ? { cancelledAt: row.cancelled_at } : {}),
    ...(row.failed_reason ? { failedReason: row.failed_reason } : {}),
  };
}

function toRowShape(a: ProposedAction): Record<string, unknown> {
  return {
    id: a.id,
    user_id: a.scope.userId,
    organization_id: a.scope.organizationId ?? null,
    company_id: a.scope.companyId ?? null,
    type: a.type,
    title: a.title,
    description: a.description,
    reason: a.reason,
    impact: a.impact,
    related_entity_type: a.relatedEntity?.kind ?? null,
    related_entity_id: a.relatedEntity?.id ?? null,
    related_entity_label: a.relatedEntity?.label ?? null,
    required_data: a.requiredData,
    requires_confirmation: a.requiresConfirmation,
    priority: a.priority,
    status: a.status,
    proposed_at: a.proposedAt,
  };
}

async function loadStoredPlan(supabase: ReturnType<typeof createAdminClient>, userId: string): Promise<ProposedAction[]> {
  const { data, error } = await supabase
    .from("action_plans")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[Ações] Erro ao carregar plano:", error.message);
    return [];
  }
  return sortPlanByPriority((data ?? []).map((r) => toProposedAction(r as ActionPlanRow)));
}

async function persistPlan(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  actions: ProposedAction[],
): Promise<void> {
  const wanted = new Map(actions.map((a) => [a.id, a]));

  let existing: Array<{ id: string; status: string }> = [];
  if (wanted.size > 0) {
    const { data } = await supabase
      .from("action_plans")
      .select("id,status")
      .in("id", [...wanted.keys()]);
    existing = (data ?? []) as Array<{ id: string; status: string }>;
  }
  const existingStatus = new Map(existing.map((r) => [r.id, r.status]));

  for (const a of actions) {
    const prev = existingStatus.get(a.id);
    if (!prev) {
      await supabase.from("action_plans").insert(toRowShape(a));
      continue;
    }
    // Preserva estados do utilizador/terminais; revive propostas canceladas.
    const patch = toRowShape(a);
    if (prev === "CONFIRMED" || prev === "EXECUTED" || prev === "FAILED") {
      delete patch.status;
      delete patch.proposed_at;
    }
    if (prev === "CANCELLED") {
      patch.cancelled_at = null;
      patch.failed_reason = null;
    }
    await supabase.from("action_plans").update(patch).eq("id", a.id);
  }

  // Auto-cancela ações ativas que deixaram de ser relevantes.
  const stale = supabase
    .from("action_plans")
    .update({
      status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
      failed_reason: "Já não é necessária no resumo mais recente",
    })
    .eq("user_id", userId)
    .in("status", ["PROPOSED", "CONFIRMED"]);
  if (wanted.size > 0) {
    await stale.not("id", "in", [...wanted.keys()]);
  } else {
    await stale;
  }
}

/**
 * Sincroniza (propõe + persiste + auto-cancela) o plano de ações usando UMA
 * única carga de dados do centro de vida (sem duplicar queries) e devolve tb a
 * visão geral. É a entrada usada pela página /vida.
 */
export async function syncActionPlanAndOverviewForSession(): Promise<{
  overview: LifeOverview | null;
  plan: ActionPlan | null;
  error?: string;
}> {
  const session = await getSessionContext();
  if (!session) return { overview: null, plan: null, error: "UNAUTHENTICATED" };

  const financeCtx = await resolveFinanceTenant();
  if (!financeCtx) return { overview: null, plan: null, error: "UNAUTHENTICATED" };

  const scope: ActionPlanScope = {
    userId: session.user.id,
    organizationId: session.organization?.id ?? null,
    companyId: financeCtx.companyId,
  };

  let data: LifeContextInput;
  try {
    data = await loadLifeData(financeCtx);
  } catch (err) {
    console.error("[Ações] Erro ao carregar os dados do centro de vida:", err);
    return { overview: null, plan: null, error: "LOAD_FAILED" };
  }

  const overview = buildLifeOverview(data);
  const { plan } = proposeLifeActions({ ...scope, ctx: data });
  const supabase = createAdminClient();
  await persistPlan(supabase, session.user.id, plan.actions);

  const stored = await loadStoredPlan(supabase, session.user.id);
  return { overview, plan: { ...plan, actions: stored } };
}

/**
 * Sincroniza apenas o plano de ações (chamado pelo assistente /ia).
 */
export async function syncActionPlanForSession(): Promise<ActionPlanResult> {
  const res = await syncActionPlanAndOverviewForSession();
  if (res.plan) return { plan: res.plan };
  return { plan: null, error: res.error ?? "UNAVAILABLE" };
}

// ---------------------------------------------------------------------------
// Transições dirigidas pelo utilizador
// ---------------------------------------------------------------------------

async function loadActionScoped(actionId: string): Promise<{ row: ActionPlanRow; action: ProposedAction } | null> {
  if (typeof actionId !== "string" || !actionId.includes("::")) return null;
  const supabase = createAdminClient();
  const { data } = await supabase.from("action_plans").select("*").eq("id", actionId).maybeSingle();
  if (!data) return null;
  const row = data as ActionPlanRow;
  return { row, action: toProposedAction(row) };
}

/** Confirmação explícita de uma proposta → CONFIRMED (ou CANCELLED por via de cancelar). */
export async function confirmActionForSession(actionId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };
  const loaded = await loadActionScoped(actionId);
  if (!loaded) return { ok: false, error: "NOT_FOUND" };

  const scope: ActionPlanScope = {
    userId: session.user.id,
    organizationId: session.organization?.id ?? null,
    companyId: null,
  };
  const auth = actionAuthorizationError(loaded.action, scope);
  if (auth) return { ok: false, error: auth };
  if (loaded.action.status !== "PROPOSED") return { ok: false, error: `INVALID_FROM:${loaded.action.status}` };

  const next = confirmProposedAction(loaded.action);
  void next;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("action_plans")
    .update({ status: "CONFIRMED", confirmed_at: new Date().toISOString() })
    .eq("id", loaded.action.id)
    .eq("user_id", session.user.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "UPDATE_FAILED" };

  await recordAuditEvent({
    userId: session.user.id,
    companyId: loaded.row.company_id,
    organizationId: loaded.row.organization_id ?? undefined,
    action: "actions.confirmed",
    module: "action_plans",
    entityType: "action_plans",
    entityId: actionAuditUuid(loaded.action.id),
    metadata: { type: loaded.action.type, title: loaded.action.title },
  });
  revalidatePath("/vida");
  revalidatePath("/ia");
  return { ok: true };
}

export async function cancelActionForSession(actionId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };
  const loaded = await loadActionScoped(actionId);
  if (!loaded) return { ok: false, error: "NOT_FOUND" };

  const scope: ActionPlanScope = {
    userId: session.user.id,
    organizationId: session.organization?.id ?? null,
    companyId: null,
  };
  const auth = actionAuthorizationError(loaded.action, scope);
  if (auth) return { ok: false, error: auth };
  if (loaded.action.status !== "PROPOSED" && loaded.action.status !== "CONFIRMED") {
    return { ok: false, error: `INVALID_FROM:${loaded.action.status}` };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("action_plans")
    .update({
      status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
      failed_reason: "Cancelada pelo utilizador",
    })
    .eq("id", loaded.action.id)
    .eq("user_id", session.user.id);
  if (error) return { ok: false, error: error.message };

  await recordAuditEvent({
    userId: session.user.id,
    companyId: loaded.row.company_id,
    organizationId: loaded.row.organization_id ?? undefined,
    action: "actions.cancelled",
    module: "action_plans",
    entityType: "action_plans",
    entityId: actionAuditUuid(loaded.action.id),
    metadata: { type: loaded.action.type, title: loaded.action.title },
  });
  revalidatePath("/vida");
  revalidatePath("/ia");
  return { ok: true };
}

export interface ExecuteActionResult {
  ok: boolean;
  error?: string;
  executedAction?: ProposedAction;
}

/**
 * Executa uma ação confirmada. Regra de segurança:
 *   - requiresConfirmation=true (financeiras) → tem de estar CONFIRMED;
 *   - requiresConfirmation=false → confirmação implícita pelo clique explícito
 *     (PROPOSED→CONFIRMED→EXECUTED com intenção única do utilizador).
 * A escrita é sempre escopada por user_id da sessão; nunca confia em ids do cliente.
 */
export async function executeActionForSession(actionId: string): Promise<ExecuteActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };
  const loaded = await loadActionScoped(actionId);
  if (!loaded) return { ok: false, error: "NOT_FOUND" };

  const scope: ActionPlanScope = {
    userId: session.user.id,
    organizationId: session.organization?.id ?? null,
    companyId: null,
  };
  const auth = actionAuthorizationError(loaded.action, scope);
  if (auth) return { ok: false, error: auth };

  const { action: original } = loaded;
  if (original.status === "EXECUTED") return { ok: true, executedAction: original };
  if (original.status === "CANCELLED" || original.status === "FAILED") {
    return { ok: false, error: `INVALID_FROM:${original.status}` };
  }

  let confirmed = original;
  if (original.status === "PROPOSED") {
    if (original.requiresConfirmation) {
      return { ok: false, error: "REQUIRES_EXPLICIT_CONFIRMATION" };
    }
    confirmed = confirmProposedAction(original);
  }

  const supabase = createAdminClient();
  const executed = await executeProposedAction(confirmed, session.user.id, scope);
  if (!executed.ok) {
    const failed = markActionFailed(confirmed, executed.error ?? "EXECUTION_FAILED");
    await supabase
      .from("action_plans")
      .update({ status: "FAILED", failed_reason: failed.failedReason ?? null })
      .eq("id", original.id)
      .eq("user_id", session.user.id);
    await recordAuditEvent({
      userId: session.user.id,
      companyId: loaded.row.company_id,
      organizationId: loaded.row.organization_id ?? undefined,
      action: "actions.failed",
      module: "action_plans",
      entityType: "action_plans",
      entityId: actionAuditUuid(original.id),
      metadata: { type: original.type, title: original.title, reason: executed.error },
    });
    await notifyUser(session.user.id, `Ação falhou: ${original.title}`, {
      category: "WARNING",
      body: executed.error ?? "Não foi possível concluir a ação.",
      link: "/vida",
    });
    revalidatePath("/vida");
    revalidatePath("/ia");
    return { ok: false, error: executed.error };
  }

  const done = markActionExecuted(confirmed);
  await supabase
    .from("action_plans")
    .update({ status: "EXECUTED", executed_at: done.executedAt ?? new Date().toISOString() })
    .eq("id", original.id)
    .eq("user_id", session.user.id);

  await recordAuditEvent({
    userId: session.user.id,
    companyId: loaded.row.company_id,
    organizationId: loaded.row.organization_id ?? undefined,
    action: "actions.executed",
    module: "action_plans",
    entityType: "action_plans",
    entityId: actionAuditUuid(original.id),
    metadata: { type: original.type, title: original.title, target: executed.meta },
  });
  await notifyUser(session.user.id, `Ação executada: ${original.title}`, {
    category: "SUCCESS",
    body: `Impacto previsto: ${original.impact}`,
    link: "/vida",
  });
  revalidatePath("/vida");
  revalidatePath("/ia");
  return { ok: true, executedAction: done };
}

// ---------------------------------------------------------------------------
// Executor (escritas tenant-scoped)
// ---------------------------------------------------------------------------

type ExecutedMeta = { kind: string; id: string | null; label: string };

interface ExecuteOutcome {
  ok: boolean;
  error?: string;
  meta?: ExecutedMeta;
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
}

async function executeProposedAction(
  action: ProposedAction,
  userId: string,
  scope: ActionPlanScope,
): Promise<ExecuteOutcome> {
  const supabase = createAdminClient();
  const entity = action.relatedEntity;

  switch (action.type) {
    case "REMINDER": {
      const doc = asRecord(action.requiredData.document);
      const { error } = await supabase.from("personal_reminders").insert({
        user_id: userId,
        title: action.title,
        category: "TASK",
        frequency: "ONCE",
        scheduled_time: null,
        notes: action.description,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, meta: { kind: "personal_reminder", id: doc.id ? String(doc.id) : null, label: action.title } };
    }

    case "TASK":
    case "OBLIGATION_TASK": {
      const req = asRecord(
        action.type === "TASK" ? action.requiredData : action.requiredData.debt,
      );
      const dueTime: string | null =
        typeof req.nextDueDate === "string"
          ? String(req.nextDueDate)
          : typeof req.dueDate === "string"
            ? String(req.dueDate)
            : null;
      const { error } = await supabase.from("tasks").insert({
        title: action.title,
        description: action.description,
        status: "TODO",
        priority: TASK_PRIORITY[action.priority],
        due_date: dueTime ? new Date(dueTime).toISOString() : null,
        assignee_id: userId,
        created_by: userId,
        organization_id: scope.organizationId ?? null,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, meta: { kind: "task", id: entity?.id ?? null, label: action.title } };
    }

    case "EVENT": {
      const startRaw = asRecord(action.requiredData)["startTime"];
      const startTime =
        typeof startRaw === "string" && startRaw.length > 0
          ? startRaw
          : new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const { error } = await supabase.from("calendar_events").insert({
        user_id: userId,
        title: action.title,
        description: action.description,
        event_type: (asRecord(action.requiredData).eventType as string) ?? "PESSOAL",
        start_time: startTime,
        status: "SCHEDULED",
        priority: TASK_PRIORITY[action.priority],
        reminder_minutes: 30,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, meta: { kind: "calendar_event", id: entity?.id ?? null, label: action.title } };
    }

    case "FOLLOW_UP": {
      const client = asRecord(action.requiredData.client ?? action.requiredData);
      const name = typeof client.name === "string" ? client.name : entity?.label ?? "cliente";
      const dueRaw = client.dueDate;
      const dueDate = typeof dueRaw === "string" && dueRaw.length > 0 ? dueRaw : new Date().toISOString();
      const { error } = await supabase.from("tasks").insert({
        title: `Follow-up ${name}`,
        description: action.description,
        status: "TODO",
        priority: "HIGH",
        due_date: dueDate,
        assignee_id: userId,
        created_by: userId,
        organization_id: scope.organizationId ?? null,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, meta: { kind: "task", id: entity?.id ?? null, label: `Follow-up ${name}` } };
    }

    case "BILL_PAYMENT": {
      // Não existe tabela de pagamentos: agendar DRAFT/PENDING é o passo seguro
      // (lembrete financeiro na data de vencimento). Nada de movimento real.
      const bill = asRecord(action.requiredData.bill);
      const name = typeof bill.name === "string" ? bill.name : action.title;
      const due = typeof bill.dueDate === "string" ? bill.dueDate : null;
      const amount = typeof bill.amount === "number" ? bill.amount : 0;
      const { error } = await supabase.from("personal_reminders").insert({
        user_id: userId,
        title: `Agendar pagamento: ${name}`,
        category: "FINANCIAL",
        frequency: "ONCE",
        scheduled_time: "09:00",
        notes: `Conta "${name}" de ${amount.toFixed(2)}€ vence a ${due ?? "breve"}.`,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, meta: { kind: "personal_reminder", id: entity?.id ?? null, label: name } };
    }

    case "MARK_BILL_PAID": {
      const bill = asRecord(action.requiredData.bill);
      const billId = typeof bill.id === "string" ? bill.id : entity?.id;
      if (!billId || !UUID_RE.test(billId)) return { ok: false, error: "BILL_ID_INVALID" };
      const { data, error } = await supabase
        .from("finance_bills")
        .update({ status: "PAID", paid_at: new Date().toISOString() })
        .eq("id", billId)
        .eq("user_id", userId) // POR NINGUÉM MAIS
        .select("id,name")
        .maybeSingle();
      if (error || !data) {
        return { ok: false, error: error?.message ?? "BILL_NOT_FOUND_IN_SCOPE" };
      }
      return { ok: true, meta: { kind: "finance_bill", id: String(data.id), label: String(data.name) } };
    }

    case "REPLY_REVIEW": {
      const review = asRecord(action.requiredData.review);
      const reviewId = typeof review.id === "string" ? review.id : entity?.id;
      if (!reviewId || !UUID_RE.test(reviewId)) return { ok: false, error: "REVIEW_ID_INVALID" };
      const suggested = action.requiredData.suggestedResponse;
      const content =
        typeof suggested === "string" && suggested.trim().length > 0
          ? suggested.trim()
          : `Olá, obrigado pelo teu feedback. Já estamos a tratar do assunto e voltamos a contactar-te em breve.`;
      const res = await respondToReviewAction(reviewId, content);
      if (!res.ok) return { ok: false, error: res.error ?? "REPLY_FAILED" };
      const label = typeof review.title === "string" ? review.title : entity?.label ?? "reclamação";
      return { ok: true, meta: { kind: "reputation_review", id: reviewId, label } };
    }

    default:
      return { ok: false, error: `UNSUPPORTED_TYPE:${action.type}` };
  }
}