import {
  buildFollowUpProposal,
  buildOperationsAlerts,
  buildOrgTimeline,
  computeOperationsOverview,
  hasPermission,
  type FinanceBill,
  type OperationAlert,
  type OperationAlertKind,
  type OperationsActivityInput,
  type OperationsApprovalInput,
  type OperationsBundle,
  type OperationsOverview,
  type OrgTimelineEntry,
  type ReputationReviewInput,
  type SessionContext,
} from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { recordAuditEvent } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { resolveFinanceTenant, loadFinanceTenantData } from "@/lib/finance/tenant";
import { loadReputationReviews } from "@/lib/reputation/tenant";

// ---------------------------------------------------------------------------
// Centro de Operações — camada segura (lado servidor).
// O tenant (organização da sessão) é SEMPRE resolvido a partir da sessão;
// nunca confiar em ids vindos do cliente. As leituras usam o client admin com
// scope explícito por organização; a única mutação (criar follow-up) insere uma
// tarefa org-scoped, regista atividade, auditoria e notificação. Sem novas
// tabelas: a timeline é sintetizada a partir de fontes reais existentes.
// ---------------------------------------------------------------------------

export interface OperationsPageData {
  organizationId: string | null;
  organizationName: string | null;
  overview: OperationsOverview;
  alerts: OperationAlert[];
  timeline: OrgTimelineEntry[];
  documentsTotal: number;
  flags: { canManage: boolean; canCreateFollowUp: boolean };
}

const AUDIT_TIMELINE_ACTIONS = [
  "APPROVAL_REQUESTED",
  "WORKFLOW_APPROVED",
  "WORKFLOW_REJECTED",
  "WORKFLOW_CANCELLED",
  "actions.executed",
  "reputation.responded",
  "reputation.status_changed",
  "reputation.moderated",
  "FOLLOW_UP_CREATED",
];

async function resolveUserNames(
  userIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return result;
  const supabase = createAdminClient();
  const [profilesRes, usersRes] = await Promise.all([
    supabase.from("profiles").select("user_id, name").in("user_id", unique),
    supabase.from("users").select("id, email").in("id", unique),
  ]);
  const emails = new Map<string, string>();
  for (const u of (usersRes.data ?? []) as Record<string, unknown>[]) {
    emails.set(String(u.id), String(u.email ?? ""));
  }
  for (const p of (profilesRes.data ?? []) as Record<string, unknown>[]) {
    result.set(String(p.user_id), String(p.name ?? ""));
  }
  for (const id of unique) {
    if (!result.has(id)) {
      result.set(id, emails.get(id)?.split("@")[0] ?? "Utilizador");
    }
  }
  return result;
}

function scopeTasks(
  base: any,
  session: SessionContext,
) {
  if (session.organization?.id) {
    return base.eq("organization_id", session.organization.id);
  }
  return base.is("organization_id", null).eq("assignee_id", session.user.id);
}

/** Carrega todos os dados operacionais do tenant da sessão e calcula a visão. */
export async function loadOperationsPageData(
  session: SessionContext,
): Promise<OperationsPageData | null> {
  const orgId = session.organization?.id ?? null;
  const supabase = createAdminClient();
  const financeCtx = await resolveFinanceTenant();
  const financeData = financeCtx ? await loadFinanceTenantData(financeCtx) : null;
  const reputationCtx = hasPermission(session.permissions, "reputation.view")
    ? {
        userId: session.user.id,
        companyId: null,
        organizationId: session.organization?.id ?? null,
        permissions: session.permissions,
      }
    : null;
  const reviews: ReputationReviewInput[] = reputationCtx
    ? await loadReputationReviews(reputationCtx)
    : [];

  const [tasksRes, approvalsRes, membersRes] = await Promise.all([
    scopeTasks(
      supabase
        .from("tasks")
        .select("id,title,status,priority,due_date,completed_at,created_at"),
      session,
    ),
    (() => {
      const base = supabase
        .from("workflow_instances")
        .select("id,title,status,created_at,requested_by,approver_id");
      return orgId
        ? base.eq("organization_id", orgId)
        : base.or(`requested_by.eq.${session.user.id},approver_id.eq.${session.user.id}`);
    })(),
    orgId
      ? supabase
          .from("org_memberships")
          .select("user_id")
          .eq("organization_id", orgId)
          .eq("status", "ACTIVE")
      : Promise.resolve({ data: [] as unknown[] as { user_id: string }[] }),
  ]);

  const tasks = (tasksRes.data ?? []) as Record<string, unknown>[];
  const approvals = (approvalsRes.data ?? []) as Record<string, unknown>[];
  const memberRows = ((membersRes as { data?: { user_id: string }[] }).data ??
    []) as Record<string, unknown>[];

  const memberIds = orgId
    ? Array.from(new Set(memberRows.map((m) => String(m.user_id))))
    : [session.user.id];

  // Documentos do tenant (pessoal + empresa, semelhante ao Centro de Vida).
  const docsBase = supabase
    .from("documents")
    .select("id,file_name,status,expires_at,company_id,owner_user_id");
  const docsRes = financeCtx?.companyId
    ? await docsBase.or(
        `company_id.eq.${financeCtx.companyId},owner_user_id.eq.${session.user.id}`,
      )
    : await docsBase.eq("owner_user_id", session.user.id);
  const documents = (docsRes.data ?? []) as Record<string, unknown>[];

  // ── Timeline (síntese read-only de fontes reais) ────────────────────────
  const activity: OperationsActivityInput[] = [];
  const taskById = new Map(tasks.map((t) => [String(t.id), t as Record<string, unknown>]));

  const taskIds = tasks.map((t) => String(t.id)).slice(0, 120);
  if (taskIds.length > 0) {
    const { data: taRows } = await supabase
      .from("task_activity")
      .select("task_id,actor_id,action,created_at")
      .in("task_id", taskIds)
      .order("created_at", { ascending: false })
      .limit(120);
    for (const row of (taRows ?? []) as Record<string, unknown>[]) {
      const taskRow = taskById.get(String(row.task_id));
      activity.push({
        id: String(row.id ?? `${row.task_id}:${row.created_at}`),
        source: "TASK",
        action: String(row.action ?? "UPDATE"),
        kind: "TASK",
        label: String(taskRow?.title ?? "Tarefa"),
        actorName: String(row.actor_id ?? ""),
        timestamp: String(row.created_at),
      });
    }
  }

  const approvalTaskIds = approvals.map((a) => String(a.id)).slice(0, 120);
  for (const a of approvals) {
    activity.push({
      id: `approval:${String(a.id)}`,
      source: "APPROVAL",
      action: "CREATE",
      kind: "APPROVAL",
      label: String(a.title ?? "Pedido de aprovação"),
      actorName: String((a.requested_by as string | null) ?? ""),
      timestamp: String(a.created_at),
    });
  }
  void approvalTaskIds;

  if (orgId) {
    const { data: repEvents } = await supabase
      .from("reputation_events")
      .select("id,review_id,user_id,action,created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100);
    for (const row of (repEvents ?? []) as Record<string, unknown>[]) {
      activity.push({
        id: `rep:${String(row.id)}`,
        source: "REPUTATION",
        action: String(row.action ?? "CREATE"),
        kind: "REPUTATION",
        label: String(row.action ?? "CREATE"),
        detail:
          reviews.find((r) => r.id === String(row.review_id))?.title ??
          undefined,
        actorName: (row.user_id as string | null) ?? null,
        timestamp: String(row.created_at),
      });
    }
  } else {
    const { data: repEvents } = await supabase
      .from("reputation_events")
      .select("id,review_id,user_id,action,created_at")
      .in("user_id", memberIds)
      .order("created_at", { ascending: false })
      .limit(100);
    for (const row of (repEvents ?? []) as Record<string, unknown>[]) {
      activity.push({
        id: `rep:${String(row.id)}`,
        source: "REPUTATION",
        action: String(row.action ?? "CREATE"),
        kind: "REPUTATION",
        label: String(row.action ?? "CREATE"),
        detail:
          reviews.find((r) => r.id === String(row.review_id))?.title ??
          undefined,
        actorName: (row.user_id as string | null) ?? null,
        timestamp: String(row.created_at),
      });
    }
  }

  const { data: auditRows } = await supabase
    .from("audit_logs")
    .select("id,user_id,action,module,timestamp,metadata")
    .in("user_id", memberIds)
    .in("action", AUDIT_TIMELINE_ACTIONS)
    .order("timestamp", { ascending: false })
    .limit(150);
  for (const row of (auditRows ?? []) as Record<string, unknown>[]) {
    activity.push({
      id: `audit:${String(row.id)}`,
      source: "AUDIT",
      action: String(row.action),
      kind: "SYSTEM",
      label: String(row.action),
      detail:
        typeof (row.metadata as Record<string, unknown> | null)?.title === "string"
          ? String((row.metadata as Record<string, unknown>).title)
          : undefined,
      actorName: (row.user_id as string | null) ?? null,
      timestamp: String(row.timestamp),
    });
  }

  // Nomes dos atores (batch, sem N+1).
  const actorIds = Array.from(
    new Set(
      activity.map((a) => a.actorName).filter((v): v is string => Boolean(v)),
    ),
  );
  const names = await resolveUserNames([...memberIds, ...actorIds]);
  const normalizedActivity = activity.map((a) => ({
    ...a,
    actorName: a.actorName ? (names.get(a.actorName) ?? null) : null,
  }));

  const members = memberIds.map((id) => ({
    id,
    name: names.get(id) || null,
  }));

  // Names for approval requesters.
  const approvalInputs: OperationsApprovalInput[] = approvals.map((a) => ({
    id: String(a.id),
    title: String(a.title ?? "Pedido de aprovação"),
    status: String(a.status ?? "PENDING"),
    createdAt: String(a.created_at),
  }));

  const bills: FinanceBill[] = financeData?.bills ?? [];

  const bundle: OperationsBundle = {
    organizationId: orgId,
    tasks: tasks.map((t) => ({
      id: String(t.id),
      title: String(t.title ?? "Tarefa"),
      status: String(t.status ?? "TODO"),
      priority: String(t.priority ?? "MEDIUM"),
      dueDate: t.due_date ? String(t.due_date) : null,
      completedAt: t.completed_at ? String(t.completed_at) : null,
    })),
    approvals: approvalInputs,
    reviews,
    documents: documents.map((d) => ({
      id: String(d.id),
      fileName: String(d.file_name ?? "Documento"),
      status: String(d.status ?? "ACTIVE"),
      expiresAt: d.expires_at ? String(d.expires_at) : null,
    })),
    bills,
    members,
    activity: normalizedActivity,
    currentBalance: financeData?.currentBalance ?? 0,
  };

  const overview = computeOperationsOverview(bundle);
  const alerts = buildOperationsAlerts(bundle);
  const timeline = buildOrgTimeline(bundle);

  return {
    organizationId: orgId,
    organizationName: session.organization?.name ?? null,
    overview,
    alerts,
    timeline,
    documentsTotal: documents.length,
    flags: {
      canManage: hasPermission(session.permissions, "operations.manage"),
      canCreateFollowUp: hasPermission(session.permissions, "tarefas.create"),
    },
  };
}

// ---------------------------------------------------------------------------
// Mutação segura: criar follow-up a partir de um alerta operacional.
// O tenant (organização da sessão) é sempre o scope; a tarefa criada é
// auditada (FOLLOW_UP_CREATED) e o autor é notificado.
// ---------------------------------------------------------------------------

export async function createFollowUpForSession(input: {
  alertKind: OperationAlertKind;
  targetLabel?: string | null;
  title?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  note?: string | null;
}): Promise<{ success: boolean; error?: string; taskId?: string }> {
  const session = await getSessionContext();
  if (!session) return { success: false, error: "Inicia sessão para criar follow-ups." };
  if (
    !hasPermission(session.permissions, "operations.view") ||
    !hasPermission(session.permissions, "tarefas.create")
  ) {
    return { success: false, error: "Sem permissão para criar follow-ups operacionais." };
  }

  const result = buildFollowUpProposal(input);
  if (!result.ok) return { success: false, error: result.error };
  const { proposal } = result;

  const supabase = createAdminClient();

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      title: proposal.title,
      priority: proposal.priority,
      due_date: proposal.dueDate ? new Date(proposal.dueDate).toISOString() : null,
      assignee_id: session.user.id,
      created_by: session.user.id,
      organization_id: session.organization?.id ?? null,
      related_entity_type: "OPS_ALERT",
    })
    .select("id")
    .single();
  if (taskError || !task) {
    return { success: false, error: "Não foi possível criar a tarefa de follow-up." };
  }

  await supabase.from("task_activity").insert({
    task_id: task.id,
    actor_id: session.user.id,
    action: "CREATE_FOLLOW_UP",
    metadata: { source: "operations_center", alertKind: proposal.kind },
  });

  await recordAuditEvent({
    userId: session.user.id,
    companyId: await financeCompanyIdFor(session.user.id),
    organizationId: session.organization?.id ?? null,
    action: "FOLLOW_UP_CREATED",
    module: "OPERATIONS",
    entityType: "TASK",
    entityId: task.id,
    metadata: {
      alertKind: proposal.kind,
      title: proposal.title,
      priority: proposal.priority,
      note: proposal.note,
      via: "operations_center",
    },
  });

  await notifyUser(session.user.id, `Follow-up criado: ${proposal.title}`, {
    body: proposal.note || "Criado a partir do Centro de Operações.",
    link: "/operacoes",
    category: "TASK",
  });

  return { success: true, taskId: task.id };
}

/** Resolve companyId do ator para a auditoria (in-session, sem expor nada). */
async function financeCompanyIdFor(userId: string): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();
    return (data?.company_id as string | null) ?? null;
  } catch {
    return null;
  }
}