/**
 * RPG-OS — Centro de Operações (OperationsService).
 *
 * Cockpit organizacional, 100% derivado de dados reais (nunca inventa):
 *   - KPIs de operações da organização (tarefas, aprovações, reclamações,
 *     documentos, contas, membros, saldo);
 *   - alertas operacionais acionáveis (aprovação parada, reclamação sem
 *     resposta, tarefa urgente atrasada, contas vencidas/a vencer, docs a expirar);
 *   - timeline unificada de atividade da organização (síntese de fontes reais);
 *   - proposta de follow-up validada (regras puras; a escrita é sempre feita
 *     pela camada server-side com tenant scoped + auditoria).
 *
 * Serviço puro: sem I/O, sem Supabase, sem dependências de runtime.
 */
import type { FinanceBill } from "../types/finance";
import type { ReputationReviewInput } from "./ReputationService";

// ---------------------------------------------------------------------------
// Tipos do bundle (entrada) e das saídas
// ---------------------------------------------------------------------------

export type OperationEntityKind =
  | "TASK"
  | "APPROVAL"
  | "COMPLAINT"
  | "DOCUMENT"
  | "BILL"
  | "MEMBER"
  | "REPUTATION"
  | "SYSTEM";

export type OperationActivitySource = "TASK" | "APPROVAL" | "REPUTATION" | "AUDIT";

export interface OperationTarget {
  kind: OperationEntityKind;
  id: string;
  label: string;
  href?: string;
}

export type OperationAlertSeverity = "URGENT" | "WARNING" | "INFO";

export type OperationAlertKind =
  | "STALE_APPROVAL"
  | "UNANSWERED_COMPLAINT"
  | "OVERDUE_URGENT_TASK"
  | "OVERDUE_BILL"
  | "BILL_DUE_SOON"
  | "DOC_EXPIRING";

export const OPERATION_ALERT_KINDS: OperationAlertKind[] = [
  "STALE_APPROVAL",
  "UNANSWERED_COMPLAINT",
  "OVERDUE_URGENT_TASK",
  "OVERDUE_BILL",
  "BILL_DUE_SOON",
  "DOC_EXPIRING",
];

export interface OperationAlert {
  id: string;
  kind: OperationAlertKind;
  severity: OperationAlertSeverity;
  title: string;
  detail?: string;
  target?: OperationTarget;
}

/** Inputs denormalizados que a camada web prepara a partir da BD (tenant scoped). */
export interface OperationsTaskInput {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string | null;
  completedAt?: string | null;
}

export interface OperationsApprovalInput {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

export interface OperationsDocumentInput {
  id: string;
  fileName: string;
  status: string;
  expiresAt?: string | null;
}

export interface OperationsActivityInput {
  id: string;
  source: OperationActivitySource;
  action: string;
  kind: OperationEntityKind;
  label: string;
  detail?: string;
  actorName?: string | null;
  timestamp: string;
}

export interface OperationsBundle {
  organizationId: string | null;
  tasks: OperationsTaskInput[];
  approvals: OperationsApprovalInput[];
  reviews: ReputationReviewInput[];
  documents: OperationsDocumentInput[];
  bills: FinanceBill[];
  members: { id: string; name?: string | null }[];
  activity: OperationsActivityInput[];
  currentBalance?: number;
  /** Relógio injetável para testes determinísticos (ISO). */
  now?: string;
}

export interface OperationsKpi {
  openTasks: number;
  overdueTasks: number;
  overdueUrgentTasks: number;
  completedTasks7d: number;
  pendingApprovals: number;
  staleApprovals: number;
  unansweredComplaints: number;
  expiringDocuments14d: number;
  overdueBills: number;
  billsDue7d: number;
  activeMembers: number;
  currentBalance: number;
}

export type OperationsTone = "CRITICAL" | "ATTENTION" | "CALM";

export interface OperationsOverview {
  kpi: OperationsKpi;
  tone: OperationsTone;
  statusLabel: string;
  summary: string;
  generatedAt: string;
}

export interface OrgTimelineEntry {
  id: string;
  kind: OperationEntityKind;
  source: OperationActivitySource;
  action: string;
  label: string;
  detail?: string;
  actorName?: string | null;
  timestamp: string;
}

/** Proposta de follow-up validada (a execução pertence à camada server-side). */
export interface FollowUpProposal {
  kind: OperationAlertKind;
  title: string;
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
  dueDate?: string | null;
  note?: string | null;
}

export type FollowUpProposalResult =
  | { ok: true; proposal: FollowUpProposal }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Utilidades de tempo (determinísticas e injetáveis)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function atOf(bundle: OperationsBundle): Date {
  return bundle.now ? new Date(bundle.now) : new Date();
}

/** Dias corridos desde from até to (fracionários mantidos para comparações). */
function daysSince(iso: string, at: Date): number {
  const from = new Date(iso).getTime();
  if (Number.isNaN(from)) return Number.POSITIVE_INFINITY;
  return (at.getTime() - from) / DAY_MS;
}

function inDateRange(iso: string | undefined | null, start: Date, end: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= start.getTime() && t <= end.getTime();
}

const ACTIVE_TASK_STATUSES = new Set(["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW"]);
const UNRESPONDED_REVIEW_STATUSES = new Set(["SUBMITTED", "UNDER_REVIEW", "IN_PROGRESS"]);

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export function computeOperationsOverview(bundle: OperationsBundle): OperationsOverview {
  const at = atOf(bundle);
  const generatedAt = at.toISOString();

  const openTasks = bundle.tasks.filter(
    (t) => ACTIVE_TASK_STATUSES.has(t.status),
  );
  const overdueTasks = openTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate).getTime() < at.getTime(),
  );
  const overdueUrgentTasks = overdueTasks.filter((t) => t.priority === "URGENT").length;
  const completedTasks7d = bundle.tasks.filter(
    (t) =>
      t.status === "DONE" &&
      inDateRange(t.completedAt ?? null, new Date(at.getTime() - 7 * DAY_MS), at),
  ).length;

  const pendingApprovals = bundle.approvals.filter((a) => a.status === "PENDING");
  const staleApprovals = pendingApprovals.filter(
    (a) => daysSince(a.createdAt, at) > 3,
  ).length;

  const unansweredComplaints = bundle.reviews.filter(
    (r) =>
      r.entryType === "COMPLAINT" &&
      UNRESPONDED_REVIEW_STATUSES.has(r.status) &&
      !r.respondedAt,
  ).length;

  const expiringDocuments14d = bundle.documents.filter(
    (d) =>
      d.status !== "EXPIRED" &&
      d.expiresAt &&
      inDateRange(d.expiresAt, at, new Date(at.getTime() + 14 * DAY_MS)),
  ).length;

  const unpaidBills = bundle.bills.filter((b) => (b.status ?? "PENDING") !== "PAID");
  const overdueBills = unpaidBills.filter(
    (b) => new Date(b.dueDate).getTime() < at.getTime(),
  ).length;
  const billsDue7d = unpaidBills.filter(
    (b) => inDateRange(b.dueDate, at, new Date(at.getTime() + 7 * DAY_MS)),
  ).length;

  const kpi: OperationsKpi = {
    openTasks: openTasks.length,
    overdueTasks: overdueTasks.length,
    overdueUrgentTasks,
    completedTasks7d,
    pendingApprovals: pendingApprovals.length,
    staleApprovals,
    unansweredComplaints,
    expiringDocuments14d,
    overdueBills,
    billsDue7d,
    activeMembers: bundle.members.length,
    currentBalance: bundle.currentBalance ?? 0,
  };

  const critical =
    kpi.overdueBills > 0 ||
    kpi.staleApprovals > 0 ||
    kpi.unansweredComplaints > 0 ||
    kpi.overdueUrgentTasks > 0;
  const attention =
    kpi.billsDue7d > 0 ||
    kpi.expiringDocuments14d > 0 ||
    kpi.currentBalance < 0 ||
    kpi.overdueTasks > 0 ||
    kpi.pendingApprovals > 0;

  const tone: OperationsTone = critical ? "CRITICAL" : attention ? "ATTENTION" : "CALM";
  const statusLabel =
    tone === "CRITICAL"
      ? "Existem pontos críticos a resolver."
      : tone === "ATTENTION"
        ? "Operação estável com ações a acompanhar."
        : "Operação sob controlo — tudo em dia.";

  const parts: string[] = [];
  if (kpi.overdueBills > 0) parts.push(`${kpi.overdueBills} conta(s) vencida(s)`);
  if (kpi.staleApprovals > 0) parts.push(`${kpi.staleApprovals} aprovação(ões) parada(s)`);
  if (kpi.unansweredComplaints > 0)
    parts.push(`${kpi.unansweredComplaints} reclamação(ões) sem resposta`);
  if (kpi.overdueUrgentTasks > 0)
    parts.push(`${kpi.overdueUrgentTasks} tarefa(s) urgente(s) atrasada(s)`);
  const summary =
    parts.length > 0
      ? `Atenção: ${parts.join(", ")}.`
      : `${kpi.openTasks} tarefa(s) em curso, ${kpi.pendingApprovals} aprovação(ões) pendente(s), ${kpi.activeMembers} membro(s) ativo(s).`;

  return { kpi, tone, statusLabel, summary, generatedAt };
}

// ---------------------------------------------------------------------------
// Alertas operacionais
// ---------------------------------------------------------------------------

export const STALE_APPROVAL_DAYS = 3;
export const UNANSWERED_COMPLAINT_DAYS = 5;

const LIMITS: Record<OperationAlertKind, number> = {
  STALE_APPROVAL: 5,
  UNANSWERED_COMPLAINT: 5,
  OVERDUE_URGENT_TASK: 5,
  OVERDUE_BILL: 5,
  BILL_DUE_SOON: 5,
  DOC_EXPIRING: 5,
};

export function buildOperationsAlerts(bundle: OperationsBundle): OperationAlert[] {
  const at = atOf(bundle);
  const alerts: OperationAlert[] = [];

  for (const a of bundle.approvals) {
    if (a.status !== "PENDING") continue;
    const idleDays = daysSince(a.createdAt, at);
    if (idleDays <= STALE_APPROVAL_DAYS) continue;
    if (alerts.filter((x) => x.kind === "STALE_APPROVAL").length >= LIMITS.STALE_APPROVAL) break;
    alerts.push({
      id: `STALE_APPROVAL:${a.id}`,
      kind: "STALE_APPROVAL",
      severity: "WARNING",
      title: `Aprovação parada: ${a.title}`,
      detail: `Aguarda decisão há ${Math.floor(idleDays)} dia(s).`,
      target: { kind: "APPROVAL", id: a.id, label: a.title, href: "/aprovacoes" },
    });
  }

  const unanswered = bundle.reviews
    .filter(
      (r) =>
        r.entryType === "COMPLAINT" &&
        UNRESPONDED_REVIEW_STATUSES.has(r.status) &&
        !r.respondedAt,
    )
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  for (const r of unanswered) {
    const ageDays = daysSince(r.createdAt, at);
    if (ageDays <= UNANSWERED_COMPLAINT_DAYS) continue;
    if (alerts.filter((x) => x.kind === "UNANSWERED_COMPLAINT").length >= LIMITS.UNANSWERED_COMPLAINT) break;
    alerts.push({
      id: `UNANSWERED_COMPLAINT:${r.id}`,
      kind: "UNANSWERED_COMPLAINT",
      severity: (r.rating ?? 0) <= 2 ? "URGENT" : "WARNING",
      title: `Reclamação sem resposta: ${r.title || r.comment || "avaliação"}`,
      detail: `Aberta há ${Math.floor(ageDays)} dia(s)${r.rating ? ` (${r.rating}★)` : ""}.`,
      target: { kind: "COMPLAINT", id: r.id, label: r.title || "Reclamação", href: "/reputacao/reclamacoes" },
    });
  }

  const urgentOverdue = bundle.tasks
    .filter(
      (t) =>
        t.priority === "URGENT" &&
        ACTIVE_TASK_STATUSES.has(t.status) &&
        t.dueDate &&
        new Date(t.dueDate).getTime() < at.getTime(),
    )
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  for (const t of urgentOverdue) {
    if (alerts.filter((x) => x.kind === "OVERDUE_URGENT_TASK").length >= LIMITS.OVERDUE_URGENT_TASK) break;
    alerts.push({
      id: `OVERDUE_URGENT_TASK:${t.id}`,
      kind: "OVERDUE_URGENT_TASK",
      severity: "WARNING",
      title: `Tarefa urgente atrasada: ${t.title}`,
      detail: `Vencida a ${new Date(t.dueDate!).toLocaleDateString("pt-PT")}.`,
      target: { kind: "TASK", id: t.id, label: t.title, href: "/tarefas" },
    });
  }

  const unpaidBills = bundle.bills
    .filter((b) => (b.status ?? "PENDING") !== "PAID")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  for (const b of unpaidBills) {
    const due = new Date(b.dueDate).getTime();
    const overdue = due < at.getTime();
    const soon = due >= at.getTime() && due <= at.getTime() + 7 * DAY_MS;
    if (overdue) {
      if (alerts.filter((x) => x.kind === "OVERDUE_BILL").length >= LIMITS.OVERDUE_BILL) continue;
      alerts.push({
        id: `OVERDUE_BILL:${b.id}`,
        kind: "OVERDUE_BILL",
        severity: "URGENT",
        title: `Conta vencida: ${b.name}`,
        detail: `${Number(b.amount).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })} — venceu a ${new Date(b.dueDate).toLocaleDateString("pt-PT")}.`,
        target: { kind: "BILL", id: b.id, label: b.name, href: "/financas" },
      });
    } else if (soon) {
      if (alerts.filter((x) => x.kind === "BILL_DUE_SOON").length >= LIMITS.BILL_DUE_SOON) continue;
      alerts.push({
        id: `BILL_DUE_SOON:${b.id}`,
        kind: "BILL_DUE_SOON",
        severity: "INFO",
        title: `Conta a vencer: ${b.name}`,
        detail: `${Number(b.amount).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })} — vence a ${new Date(b.dueDate).toLocaleDateString("pt-PT")}.`,
        target: { kind: "BILL", id: b.id, label: b.name, href: "/financas" },
      });
    }
  }

  const expiringDocs = bundle.documents
    .filter((d) => d.status !== "EXPIRED" && d.expiresAt)
    .sort((a, b) => (a.expiresAt ?? "").localeCompare(b.expiresAt ?? ""));
  for (const d of expiringDocs) {
    if (!inDateRange(d.expiresAt, at, new Date(at.getTime() + 7 * DAY_MS))) continue;
    if (alerts.filter((x) => x.kind === "DOC_EXPIRING").length >= LIMITS.DOC_EXPIRING) break;
    alerts.push({
      id: `DOC_EXPIRING:${d.id}`,
      kind: "DOC_EXPIRING",
      severity: "INFO",
      title: `Documento a expirar: ${d.fileName}`,
      detail: `Expira a ${new Date(d.expiresAt!).toLocaleDateString("pt-PT")}.`,
      target: { kind: "DOCUMENT", id: d.id, label: d.fileName, href: "/documentos" },
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Timeline unificada da organização
// ---------------------------------------------------------------------------

const TASK_ACTION_LABELS: Record<string, string> = {
  CREATE: "criou uma tarefa",
  CREATE_FOLLOW_UP: "criou um follow-up a partir do Centro de Operações",
  UPDATE: "atualizou uma tarefa",
  STATUS_CHANGE: "alterou o estado de uma tarefa",
  COMMENT: "comentou numa tarefa",
};

const REPUTATION_ACTION_LABELS: Record<string, string> = {
  CREATE: "submeteu uma avaliação",
  SUBMIT: "submeteu uma reclamação",
  RESPOND: "publicou uma resposta",
  COMMENT: "comentou numa avaliação",
  STATUS_CHANGE: "alterou o estado de uma avaliação",
  FLAG: "sinalizou uma avaliação",
  MODERATE: "moderou uma avaliação",
  RESOLVE: "resolveu uma avaliação",
  CLOSE: "fechou uma avaliação",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  APPROVAL_REQUESTED: "submeteu um pedido de aprovação",
  WORKFLOW_APPROVED: "aprovou um pedido",
  WORKFLOW_REJECTED: "rejeitou um pedido",
  WORKFLOW_CANCELLED: "cancelou um pedido",
  "actions.executed": "executou uma ação recomendada",
  "reputation.responded": "respondeu a uma reclamação",
  "reputation.status_changed": "alterou o estado de uma avaliação",
  "reputation.moderated": "moderou uma avaliação",
  FOLLOW_UP_CREATED: "criou um follow-up no Centro de Operações",
};

function humanizeAction(action: string): string {
  return action.toLowerCase().replace(/[_-]+/g, " ");
}

function labelFor(entry: OperationsActivityInput): string {
  switch (entry.source) {
    case "TASK":
      return TASK_ACTION_LABELS[entry.action] ?? humanizeAction(entry.action);
    case "APPROVAL":
      return "submeteu um pedido de aprovação";
    case "REPUTATION":
      return REPUTATION_ACTION_LABELS[entry.action] ?? humanizeAction(entry.action);
    case "AUDIT":
      return AUDIT_ACTION_LABELS[entry.action] ?? humanizeAction(entry.action);
    default:
      return humanizeAction(entry.action);
  }
}

export function buildOrgTimeline(
  bundle: OperationsBundle,
  maxEntries = 40,
): OrgTimelineEntry[] {
  const entries: OrgTimelineEntry[] = bundle.activity.map((a) => ({
    id: `${a.source}:${a.id}`,
    kind: a.kind,
    source: a.source,
    action: a.action,
    label: labelFor(a),
    detail: a.detail ?? (a.kind === "TASK" ? a.label : undefined),
    actorName: a.actorName ?? null,
    timestamp: a.timestamp,
  }));

  return entries
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, maxEntries);
}

// ---------------------------------------------------------------------------
// Follow-up (regras puras de validação/normalização)
// ---------------------------------------------------------------------------

const FOLLOW_UP_PRIORITIES: FollowUpProposal["priority"][] = [
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
];

export function buildFollowUpProposal(input: {
  alertKind: OperationAlertKind;
  targetLabel?: string | null;
  title?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  note?: string | null;
}): FollowUpProposalResult {
  if (!OPERATION_ALERT_KINDS.includes(input.alertKind)) {
    return { ok: false, error: `ALERT_KIND_INVALID:${input.alertKind}` };
  }

  const priority = (
    FOLLOW_UP_PRIORITIES.includes(input.priority as FollowUpProposal["priority"])
      ? input.priority
      : "MEDIUM"
  ) as FollowUpProposal["priority"];

  const baseLabel = input.targetLabel?.trim() || "alerta operacional";
  const custom = input.title?.trim();
  const title = custom || `Follow-up: ${baseLabel}`;

  let dueDate: string | null = null;
  if (input.dueDate) {
    const d = new Date(input.dueDate);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "DUE_DATE_INVALID" };
    dueDate = d.toISOString();
  }

  const note = input.note?.trim() || null;
  return {
    ok: true,
    proposal: { kind: input.alertKind, title, priority, dueDate, note },
  };
}