/**
 * RPG-OS — Reputation Service (Centro de Reputação, Avaliações e Reclamações).
 *
 * Camada pura e determinística do domínio de reputação:
 *   - tipos e listas válidas (entradas, alvos, relações, estados, moderação, permissões)
 *   - criação validada (autor/permissão, combinação relação→alvo, limites de rating e score)
 *   - regras de permissão por ação (ver, responder, moderar, gerir, editar/apagar draft)
 *   - máquina de estados com transições por permissão
 *   - imutabilidade de autor/tenant (as mesmas regras do trigger SQL)
 *   - heurísticas de moderação (marcar, nunca apagar avaliações negativas automaticamente)
 *   - métricas (média, distribuição, evolução mensal, taxa de resolução, tempo de resposta)
 *   - plano de automação (reclamação crítica → caso+notify+tarefa; elogio → reconhecimento)
 *   - assistente de reputação (as 10 perguntas previstas para /ia e /vida)
 *
 * Sem I/O — recebe inputs já autorizados pela camada server-side (tenant).
 */
import { hasPermission } from "../constants/permissions";

// ---------------------------------------------------------------------------
// Tipos do domínio
// ---------------------------------------------------------------------------

export const REPUTATION_ENTRY_TYPES = [
  "COMPLAINT",
  "RECOMMENDATION",
  "PRAISE",
  "REVIEW",
] as const;
export type ReputationEntryType = (typeof REPUTATION_ENTRY_TYPES)[number];

export const REPUTATION_TARGET_TYPES = [
  "CUSTOMER",
  "COMPANY",
  "EMPLOYEE",
  "SERVICE",
  "PROJECT",
  "SUPPLIER",
] as const;
export type ReputationTargetType = (typeof REPUTATION_TARGET_TYPES)[number];

export const REPUTATION_RELATION_TYPES = [
  "CUSTOMER_TO_COMPANY",
  "CUSTOMER_TO_EMPLOYEE",
  "CUSTOMER_TO_SERVICE",
  "COMPANY_TO_CUSTOMER",
  "COMPANY_TO_EMPLOYEE",
  "COMPANY_TO_SUPPLIER",
  "EMPLOYEE_TO_COMPANY",
  "EMPLOYEE_TO_CUSTOMER",
  "EMPLOYEE_TO_SERVICE",
] as const;
export type ReputationRelationType = (typeof REPUTATION_RELATION_TYPES)[number];

export const REPUTATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "RESPONDED",
  "IN_PROGRESS",
  "RESOLVED",
  "REJECTED",
  "CLOSED",
] as const;
export type ReputationStatus = (typeof REPUTATION_STATUSES)[number];

export const REPUTATION_MODERATION_VALUES = [
  "FLAGGED",
  "MODERATION_REQUIRED",
  "APPROVED",
  "REJECTED",
] as const;
export type ReputationModeration = (typeof REPUTATION_MODERATION_VALUES)[number];

export const REPUTATION_PERMISSIONS = [
  "reputation.view",
  "reputation.create",
  "reputation.respond",
  "reputation.manage",
  "reputation.moderate",
  "reputation.admin",
] as const;
export type ReputationPermission = (typeof REPUTATION_PERMISSIONS)[number];

/** Relação válida ⇒ tipo de alvo obrigatório (combinações permitidas). */
export const RELATION_TARGET_MAP: Record<ReputationRelationType, ReputationTargetType> = {
  CUSTOMER_TO_COMPANY: "COMPANY",
  CUSTOMER_TO_EMPLOYEE: "EMPLOYEE",
  CUSTOMER_TO_SERVICE: "SERVICE",
  COMPANY_TO_CUSTOMER: "CUSTOMER",
  COMPANY_TO_EMPLOYEE: "EMPLOYEE",
  COMPANY_TO_SUPPLIER: "SUPPLIER",
  EMPLOYEE_TO_COMPANY: "COMPANY",
  EMPLOYEE_TO_CUSTOMER: "CUSTOMER",
  EMPLOYEE_TO_SERVICE: "SERVICE",
};

/** Estados "ativos" (abertos / a aguardar ação). */
const ACTIVE_STATUSES: ReputationStatus[] = ["SUBMITTED", "UNDER_REVIEW", "RESPONDED", "IN_PROGRESS"];

/** Estados terminais/resolvidos usados na taxa de resolução. */
const RESOLVED_STATUSES: ReputationStatus[] = ["RESOLVED", "CLOSED"];

export interface ReputationReviewInput {
  id: string;
  authorUserId: string;
  authorName?: string | null;
  organizationId: string | null;
  companyId: string | null;
  entryType: ReputationEntryType;
  relationType: ReputationRelationType;
  targetType: ReputationTargetType;
  targetUserId?: string | null;
  targetCompanyId?: string | null;
  targetProjectId?: string | null;
  targetServiceId?: string | null;
  targetLabel?: string | null;
  rating?: number | null;
  score10?: number | null;
  title: string;
  comment?: string | null;
  status: ReputationStatus;
  moderation: ReputationModeration;
  isPublic: boolean;
  responseDueAt?: string | null;
  respondedAt?: string | null;
  resolvedAt?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReputationResponseInput {
  id: string;
  reviewId: string;
  authorUserId: string;
  official: boolean;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReputationActor {
  userId: string;
  /** Permissões efetivas do papel (resolve via resolveEffectivePermissions). */
  permissions: string[];
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function timestampOf(value: string | null | undefined): number {
  if (!value) return NaN;
  const t = Date.parse(value);
  return Number.isNaN(t) ? NaN : t;
}

function monthOf(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}`;
}

function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function hoursBetween(fromISO: string, toISO: string): number | null {
  const from = timestampOf(fromISO);
  const to = timestampOf(toISO);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return (to - from) / 3_600_000;
}

/** Concede se houver wildcard total, wildcard do módulo ou manage/admin do módulo. */
export function hasReputationPermission(
  permissions: string[],
  required: ReputationPermission,
): boolean {
  return hasPermission(permissions, required);
}

// ---------------------------------------------------------------------------
// Validação de criação
// ---------------------------------------------------------------------------

export interface ReputationCreateResult {
  ok: boolean;
  errors: string[];
}

export function validateReputationCreate(
  input: Pick<
    ReputationReviewInput,
    "entryType" | "relationType" | "targetType" | "rating" | "score10" | "title" | "comment" | "targetUserId" | "targetCompanyId" | "targetProjectId"
  >,
): ReputationCreateResult {
  const errors: string[] = [];

  if (!REPUTATION_ENTRY_TYPES.includes(input.entryType)) {
    errors.push("Tipo de entrada inválido.");
  }
  const expected = RELATION_TARGET_MAP[input.relationType];
  if (!expected) {
    errors.push("Relação inválida.");
  } else if (input.targetType !== expected) {
    errors.push(`A relação exige alvo ${expected} (recebido ${input.targetType}).`);
  }

  if (input.rating !== undefined && input.rating !== null) {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      errors.push("Avaliação (1–5 abaixo) inválida.");
    }
  } else if (input.entryType === "COMPLAINT" || input.entryType === "REVIEW") {
    errors.push("Reclamações e avaliações exigem avaliação de 1 a 5.");
  }

  if (input.score10 !== undefined && input.score10 !== null) {
    if (typeof input.score10 !== "number" || input.score10 < 0 || input.score10 > 10) {
      errors.push("Score (0–10) inválido.");
    }
  }

  const title = (input.title ?? "").trim();
  if (title.length === 0) {
    errors.push("É obrigatório um título curto.");
  } else if (title.length > 200) {
    errors.push("O título não pode exceder 200 caracteres.");
  }

  const comment = (input.comment ?? "").trim();
  if (comment.length > 5000) {
    errors.push("A descrição não pode exceder 5000 caracteres.");
  }

  if (RELATION_TARGET_MAP[input.relationType] === "EMPLOYEE" && RELATION_TARGET_MAP[input.relationType] && input.targetType === "EMPLOYEE" && !input.targetUserId) {
    errors.push("A avaliação de um colaborador exige identificar o colaborador (destinatário).");
  }

  return { ok: errors.length === 0, errors };
}

/** Expressa o estado inicial de moderação calculado na criação (sem nunca rejeitar automaticamente). */
export function analyzeReputationContent(
  text: string,
  options?: { fileName?: string | null; mimeType?: string | null },
): { flags: string[]; moderation: ReputationModeration } {
  const flags: string[] = [];
  const q = normalize(text ?? "");

  const INSULTS = [
    "burro", "burra", "idiota", "imbecil", "estupido", "estupida", "otario", "otaria",
    "palerma", "parvo", "parva", "cretino", "cretina", "panhonha", "chavalo", "basbaque",
  ];
  for (const word of INSULTS) {
    if (q.includes(word)) {
      flags.push("ABUSE");
      break;
    }
  }
  if (/([!]){3,}/.test(q)) flags.push("SPAM");
  if (/(\b\w+\b) \1 \1/.test(q)) flags.push("SPAM");
  const urlMatches = (q.match(/https?:\/\/[^\s]+/g) ?? []).length;
  if (urlMatches >= 2) flags.push("SPAM");
  if (/^(?:\p{Lu}[\p{L}\s]{40,})$/u.test(q.trim())) flags.push("SPAM");

  if (
    /\b\d{9}\b/.test(q) ||
    /\b(?:PT\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?(?:[0-9A-Z]{2})?)\b/.test(q) ||
    /((\+351)|00351)?\s?9\d{8}/.test(q) ||
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.test(q)
  ) {
    flags.push("PERSONAL_INFO");
  }

  const DEFAMATORY = [
    "vigarista", "ladrao", "ladra", "charlatao", "charlata", "enganou-me", "enganou me",
    "estelionatario", "roubou-me", "roubou me", "burlou", "fraudulento",
  ];
  for (const word of DEFAMATORY) {
    if (q.includes(word)) {
      flags.push("DEFAMATORY");
      break;
    }
  }

  if (options?.fileName) {
    const ext = options.fileName.toLowerCase().split(".").pop() ?? "";
    const SUSPICIOUS = ["exe", "bat", "cmd", "scr", "ps1", "vbs", "jar", "msi", "com"];
    if (SUSPICIOUS.includes(ext)) flags.push("SUSPICIOUS_ATTACHMENT");
  }

  if (flags.includes("DEFAMATORY") || flags.includes("SUSPICIOUS_ATTACHMENT")) {
    return { flags, moderation: "MODERATION_REQUIRED" };
  }
  if (flags.length > 0) {
    return { flags, moderation: "FLAGGED" };
  }
  return { flags, moderation: "APPROVED" };
}

/** Estado de moderação quando uma ocorrência é submetida (submeter nunca rejeita). */
export function moderationForSubmission(text: string): { flags: string[]; moderation: ReputationModeration } {
  const analysis = analyzeReputationContent(text);
  return {
    flags: analysis.flags,
    moderation: analysis.moderation === "MODERATION_REQUIRED" ? "MODERATION_REQUIRED" : analysis.moderation === "FLAGGED" ? "FLAGGED" : "APPROVED",
  };
}

// ---------------------------------------------------------------------------
// Permissões por ação
// ---------------------------------------------------------------------------

function actorIsAuthor(actor: ReputationActor, review: ReputationReviewInput): boolean {
  return actor.userId === review.authorUserId;
}

function actorIsTarget(actor: ReputationActor, review: ReputationReviewInput): boolean {
  return actor.userId !== undefined && actor.userId !== null && actor.userId === review.targetUserId;
}

export function canViewReputationReview(actor: ReputationActor, review: ReputationReviewInput): boolean {
  return actorIsAuthor(actor, review) || actorIsTarget(actor, review) || hasReputationPermission(actor.permissions, "reputation.view");
}

/** Criar quando é o autor ou tem permissão de criação. */
export function canCreateReputation(actor: ReputationActor, review: ReputationReviewInput): boolean {
  return actorIsAuthor(actor, review) || hasReputationPermission(actor.permissions, "reputation.create");
}

/** Responder quando é o alvo ou representante autorizado (permissão de responder). */
export function canRespondReputation(actor: ReputationActor, review: ReputationReviewInput): boolean {
  if (review.status === "DRAFT" || review.status === "REJECTED" || review.status === "CLOSED") return false;
  return (
    actorIsTarget(actor, review) ||
    actorIsAuthor(actor, review) ||
    hasReputationPermission(actor.permissions, "reputation.respond")
  );
}

export function canManageReputation(actor: ReputationActor): boolean {
  return hasReputationPermission(actor.permissions, "reputation.manage");
}

export function canModerateReputation(actor: ReputationActor): boolean {
  return (
    hasReputationPermission(actor.permissions, "reputation.moderate") ||
    hasReputationPermission(actor.permissions, "reputation.admin")
  );
}

/** Editar/apagar apenas no estado DRAFT e apenas pelo autor. */
export function canEditDraft(actor: ReputationActor, review: ReputationReviewInput): boolean {
  return review.status === "DRAFT" && actorIsAuthor(actor, review);
}

export function canDeleteDraft(actor: ReputationActor, review: ReputationReviewInput): boolean {
  return review.status === "DRAFT" && actorIsAuthor(actor, review);
}

export function canRequestDeleteReputation(actor: ReputationActor, review: ReputationReviewInput): boolean {
  return actorIsAuthor(actor, review) || hasReputationPermission(actor.permissions, "reputation.manage");
}

/** Nunca alterar autor, tenant, tipo/relação/alvo após criação. Regra espelhada no trigger SQL. */
export function assertReputationImmutables(
  original: ReputationReviewInput,
  candidate: Partial<ReputationReviewInput>,
): string | null {
  if (candidate.authorUserId !== undefined && candidate.authorUserId !== original.authorUserId) {
    return "O autor de uma avaliação é imutável após a criação.";
  }
  if (candidate.organizationId !== undefined && candidate.organizationId !== original.organizationId) {
    return "O tenant (organização) de uma avaliação é imutável.";
  }
  if (candidate.companyId !== undefined && candidate.companyId !== original.companyId) {
    return "O tenant (empresa) de uma avaliação é imutável.";
  }
  if (candidate.entryType !== undefined && candidate.entryType !== original.entryType) {
    return "O tipo de entrada é imutável.";
  }
  if (candidate.relationType !== undefined && candidate.relationType !== original.relationType) {
    return "A relação é imutável.";
  }
  if (candidate.targetType !== undefined && candidate.targetType !== original.targetType) {
    return "O tipo de alvo é imutável.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Máquina de estados
// ---------------------------------------------------------------------------

export interface TransitionRule {
  permission?: ReputationPermission;
  targetOnly?: boolean;
  bypassByAuthor?: boolean;
}

const TRANSITIONS: Record<ReputationStatus, Partial<Record<ReputationStatus, TransitionRule>>> = {
  DRAFT: {
    SUBMITTED: { bypassByAuthor: true },
    REJECTED: { bypassByAuthor: true }, // autor desiste do rascunho
  },
  SUBMITTED: {
    UNDER_REVIEW: { permission: "reputation.manage" },
    RESPONDED: { targetOnly: true },
    IN_PROGRESS: { permission: "reputation.manage" },
    RESOLVED: { permission: "reputation.manage" },
    REJECTED: { permission: "reputation.moderate" },
    CLOSED: { permission: "reputation.manage" },
  },
  UNDER_REVIEW: {
    RESPONDED: { targetOnly: true },
    IN_PROGRESS: { permission: "reputation.manage" },
    RESOLVED: { permission: "reputation.manage" },
    REJECTED: { permission: "reputation.moderate" },
    CLOSED: { permission: "reputation.manage" },
  },
  RESPONDED: {
    UNDER_REVIEW: { permission: "reputation.manage" },
    IN_PROGRESS: { permission: "reputation.manage" },
    RESOLVED: { permission: "reputation.manage" },
    CLOSED: { permission: "reputation.manage" },
  },
  IN_PROGRESS: {
    RESPONDED: { targetOnly: true },
    RESOLVED: { permission: "reputation.manage" },
    REJECTED: { permission: "reputation.moderate" },
    CLOSED: { permission: "reputation.manage" },
  },
  RESOLVED: {
    CLOSED: { permission: "reputation.manage" },
    REJECTED: { permission: "reputation.moderate" },
  },
  REJECTED: {
    RESOLVED: { permission: "reputation.moderate" },
  },
  CLOSED: {},
};

export function canTransitionReputation(
  current: ReputationStatus,
  next: ReputationStatus,
  actor: ReputationActor,
  review: ReputationReviewInput,
): { allowed: boolean; reason?: string } {
  if (current === next) return { allowed: true };
  const rule = TRANSITIONS[current]?.[next];
  if (!rule) {
    return { allowed: false, reason: `Transição ${current} → ${next} não é permitida.` };
  }
  if (rule.permission && hasReputationPermission(actor.permissions, rule.permission)) {
    return { allowed: true };
  }
  if (rule.targetOnly && (actorIsTarget(actor, review) || hasReputationPermission(actor.permissions, "reputation.respond"))) {
    return { allowed: true };
  }
  if (rule.bypassByAuthor && actorIsAuthor(actor, review)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: `Transição ${current} → ${next} requer autorização específica.`,
  };
}

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

export interface ReputationMonthPoint {
  month: string;
  avg: number | null;
  count: number;
}

export interface ReputationMetrics {
  globalRating: number | null;
  reviewCount: number;
  totalCount: number;
  complaints: number;
  complaintsOpen: number;
  complaintsResolved: number;
  recommendations: number;
  praises: number;
  resolutionRate: number | null;
  avgResponseHours: number | null;
  starDistribution: Record<string, number>;
  monthlyEvolution: ReputationMonthPoint[];
}

export function buildReputationMetrics(reviews: ReputationReviewInput[]): ReputationMetrics {
  const nonDraft = reviews.filter((r) => r.status !== "DRAFT");
  const ratingVisible = nonDraft.filter((r) => r.moderation === "APPROVED" && r.status !== "REJECTED");
  const active = nonDraft.filter((r) => ACTIVE_STATUSES.includes(r.status));
  const closed = nonDraft.filter((r) => RESOLVED_STATUSES.includes(r.status));
  const withResponse = nonDraft.filter((r) => r.respondedAt);

  const ratings = ratingVisible
    .flatMap((r) => (r.rating !== null && r.rating !== undefined ? [r.rating] : []))
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));

  const globalRating = ratings.length > 0 ? round(ratings.reduce((s, n) => s + n, 0) / ratings.length, 2) : null;

  const starDistribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const r of ratingVisible) {
    if (r.rating === null || r.rating === undefined) continue;
    starDistribution[String(r.rating)] = (starDistribution[String(r.rating)] ?? 0) + 1;
  }

  const byMonth = new Map<string, { sum: number; count: number }>();
  for (const r of ratingVisible) {
    const m = monthOf(r.createdAt);
    if (!m) continue;
    if (r.rating === null || r.rating === undefined) continue;
    const cur = byMonth.get(m) ?? { sum: 0, count: 0 };
    cur.sum += r.rating;
    cur.count += 1;
    byMonth.set(m, cur);
  }
  const monthlyEvolution: ReputationMonthPoint[] = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      avg: v.count > 0 ? round(v.sum / v.count, 2) : null,
      count: v.count,
    }));

  const complaints = nonDraft.filter((r) => r.entryType === "COMPLAINT").length;
  const complaintsOpen = active.filter((r) => r.entryType === "COMPLAINT").length;
  const complaintsResolved = closed.filter((r) => r.entryType === "COMPLAINT").length;

  const responsiveness = {
    closedOrActive: closed.length + active.length,
    closedCount: closed.length,
  };
  const resolutionRate =
    responsiveness.closedOrActive > 0
      ? round((responsiveness.closedCount / responsiveness.closedOrActive) * 100, 2)
      : null;

  let responseHoursSum = 0;
  let responseHoursCount = 0;
  for (const r of withResponse) {
    const h = hoursBetween(r.createdAt, r.respondedAt as string);
    if (h !== null) {
      responseHoursSum += h;
      responseHoursCount += 1;
    }
  }
  const avgResponseHours = responseHoursCount > 0 ? round(responseHoursSum / responseHoursCount, 1) : null;

  return {
    globalRating,
    reviewCount: ratingVisible.length,
    totalCount: nonDraft.length,
    complaints,
    complaintsOpen,
    complaintsResolved,
    recommendations: nonDraft.filter((r) => r.entryType === "RECOMMENDATION").length,
    praises: nonDraft.filter((r) => r.entryType === "PRAISE").length,
    resolutionRate,
    avgResponseHours,
    starDistribution,
    monthlyEvolution,
  };
}

export function buildReputationOverview(reviews: ReputationReviewInput[]): {
  metrics: ReputationMetrics;
  recent: ReputationReviewInput[];
  activeComplaints: ReputationReviewInput[];
  praise: ReputationReviewInput[];
  recommendations: ReputationReviewInput[];
} {
  const metrics = buildReputationMetrics(reviews);
  const nonDraft = reviews.filter((r) => r.status !== "DRAFT");
  const recent = [...nonDraft].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const activeComplaints = nonDraft
    .filter((r) => r.entryType === "COMPLAINT" && ACTIVE_STATUSES.includes(r.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const praise = nonDraft.filter((r) => r.entryType === "PRAISE");
  const recommendations = nonDraft.filter((r) => r.entryType === "RECOMMENDATION");
  return { metrics, recent, activeComplaints, praise, recommendations };
}

// ---------------------------------------------------------------------------
// Plano de automação (workflows)
// ---------------------------------------------------------------------------

export interface ReputationAutomationAction {
  type: "NOTIFY" | "CREATE_TASK" | "CREATE_CASE";
  recipientUserId?: string | null;
  message?: string;
  taskTitle?: string;
  taskDueAt?: string | null;
  caseType?: "CRITICAL" | "UNANSWERED" | "MODERATION" | "STALE";
  notes?: string;
}

export interface ReputationAutomationContext {
  responsibleUserId?: string | null;
  now: string;
}

/**
 * Regras de automação (determinísticas):
 *  - reclamação crítica (rating ≤ 2 ou score_10 ≤ 4): caso CRITICAL + notificação do responsável + tarefa com prazo de 24h
 *  - avaliação baixa (rating ≤ 2, não-reclamação): notificação de follow-up ao responsável
 *  - elogio: reconhecimento (nunca um problema) — notificação ao colaborador elogiado
 *  - reclamação sem resposta após 48h: caso UNANSWERED
 */
export function planReputationAutomation(
  review: ReputationReviewInput,
  ctx: ReputationAutomationContext,
): ReputationAutomationAction[] {
  const actions: ReputationAutomationAction[] = [];
  const created = timestampOf(review.createdAt);
  const now = timestampOf(ctx.now);
  const isCritical =
    (review.entryType === "COMPLAINT" && review.rating !== null && review.rating !== undefined && review.rating <= 2) ||
    (review.score10 !== null && review.score10 !== undefined && review.score10 <= 4);

  if (review.entryType === "COMPLAINT" || review.entryType === "REVIEW") {
    if (isCritical) {
      actions.push({
        type: "CREATE_CASE",
        caseType: "CRITICAL",
        notes: `Ocorrência crítica "${review.title}" aguarda resolução urgente.`,
      });
      if (ctx.responsibleUserId) {
        actions.push({
          type: "NOTIFY",
          recipientUserId: ctx.responsibleUserId,
          message: `Ocorrência crítica de reputação: "${review.title}". Age nas próximas 24h.`,
        });
        actions.push({
          type: "CREATE_TASK",
          recipientUserId: ctx.responsibleUserId,
          taskTitle: `Resolver reclamação: ${review.title}`,
          taskDueAt: new Date(now + 24 * 3_600_000).toISOString(),
        });
      }
    } else if (review.rating !== null && review.rating !== undefined && review.rating <= 2) {
      actions.push({
        type: "NOTIFY",
        recipientUserId: ctx.responsibleUserId,
        message: `Avaliação baixa registada: "${review.title}". Considera um acompanhamento ao cliente.`,
      });
    }
  }

  if (review.entryType === "PRAISE" && review.targetUserId && review.targetUserId !== review.authorUserId) {
    actions.push({
      type: "NOTIFY",
      recipientUserId: review.targetUserId,
      message: `Recebeste um elogio: "${review.title}". O teu trabalho foi reconhecido.`,
    });
  }

  if (
    ["COMPLAINT", "REVIEW"].includes(review.entryType) &&
    !review.respondedAt &&
    !Number.isNaN(created) &&
    !Number.isNaN(now) &&
    now - created > 48 * 3_600_000
  ) {
    actions.push({
      type: "CREATE_CASE",
      caseType: "UNANSWERED",
      notes: `"${review.title}" continua sem resposta após 48h.`,
    });
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Assistente de reputação (as 10 perguntas do enunciado)
// ---------------------------------------------------------------------------

export const REPUTATION_EXTRA_INTENTS = [
  "REP_GLOBAL",
  "REP_OPEN_COMPLAINTS",
  "REP_UNSATISFIED_CLIENTS",
  "REP_WORST_SERVICES",
  "REP_MOST_PRAISED",
  "REP_BEST_EMPLOYEE",
  "REP_RESOLUTION_RATE",
  "REP_UNANSWERED",
  "REP_RECOMMENDERS",
  "REP_MONTHLY_AVERAGE",
  "REP_FIVE_STAR_COUNT",
  "REP_MONTH_COMPLAINTS",
  "REP_EVOLUTION",
] as const;

export type ReputationIntent = (typeof REPUTATION_EXTRA_INTENTS)[number] | "UNKNOWN";

export interface ReputationAssistantData {
  reviews: ReputationReviewInput[];
  today?: string;
}

export interface ReputationAssistantAnswer {
  intent: ReputationIntent;
  answer: string;
}

export const REPUTATION_HINTS: Array<{ intent: ReputationIntent; keywords: string[] }> = [
  {
    intent: "REP_GLOBAL",
    keywords: ["como esta a minha reputacao", "como esta a reputacao", "qual e a minha reputacao", "qual e a reputacao", "minha reputacao", "a minha reputacao", "reputacao geral", "avaliacao geral"],
  },
  {
    intent: "REP_OPEN_COMPLAINTS",
    keywords: ["reclamacoes abertas", "tenho reclamacoes abertas", "reclamacoes por resolver", "reclamacoes em aberto", "quantas reclamacoes abertas"],
  },
  {
    intent: "REP_UNSATISFIED_CLIENTS",
    keywords: ["clientes insatisfeitos", "que clientes estao insatisfeitos", "avaliacoes negativas", "avaliacoes baixas", "quem esta insatisfeito", "clientes com queixas", "pior avaliacao", "esta com pior avaliacao", "quem esta com pior avaliacao", "pior avaliado", "quem esta pior avaliado"],
  },
  {
    intent: "REP_WORST_SERVICES",
    keywords: [
      "servicos com pior avaliacao", "servico com pior avaliacao", "pior avaliacao de servico",
      "servicos pior avaliados", "servicos mal avaliados", "servicos tem pior avaliacao",
      "quais servicos tem pior avaliacao", "pior servico avaliado", "servico tem pior reputacao",
      "qual servico tem pior reputacao", "pior reputacao",
    ],
  },
  {
    intent: "REP_MOST_PRAISED",
    keywords: ["mais elogios", "quem recebeu mais elogios", "elogios recebidos", "quem foi mais elogiado", "elogio recebido"],
  },
  {
    intent: "REP_BEST_EMPLOYEE",
    keywords: [
      "melhor avaliado", "colaborador com melhor avaliacao", "colaborador melhor avaliado",
      "funcionario com melhor avaliacao", "quem tem melhor avaliacao", "melhor avaliacao do departamento",
      "qual colaborador tem melhor avaliacao", "qual funcionario tem melhor avaliacao",
      "qual funcionario recebeu melhor avaliacao", "funcionario recebeu melhor avaliacao",
    ],
  },
  {
    intent: "REP_RESOLUTION_RATE",
    keywords: ["taxa de resolucao", "taxa de resolucao de reclamacoes", "quantas reclamacoes sao resolvidas", "reclamacoes resolvidas"],
  },
  {
    intent: "REP_UNANSWERED",
    keywords: ["reclamacao sem resposta", "reclamacoes sem resposta", "sem resposta", "por responder", "reclamacoes por responder", "temos reclamacoes sem resposta", "tens reclamacoes sem resposta"],
  },
  {
    intent: "REP_RECOMMENDERS",
    keywords: ["que clientes recomendaram", "clientes que recomendaram", "recomendacoes recebidas", "quem recomendou", "me recomendam", "recomendam a empresa", "recomendam o serviço"],
  },
  {
    intent: "REP_MONTHLY_AVERAGE",
    keywords: ["media deste mes", "media este mes", "media do mes", "qual foi a media", "avaliacao deste mes", "media mensal"],
  },
  {
    intent: "REP_FIVE_STAR_COUNT",
    keywords: ["avaliacoes de 5 estrelas", "avaliacoes 5 estrelas", "quantas avaliacoes de 5 estrelas", "cinco estrelas", "de 5 estrelas tivemos"],
  },
  {
    intent: "REP_MONTH_COMPLAINTS",
    keywords: ["reclamaram este mes", "clientes reclamaram", "quais clientes reclamaram", "reclamacoes deste mes", "reclamacoes este mes", "quem reclamou este mes", "clientes que reclamaram"],
  },
  {
    intent: "REP_EVOLUTION",
    keywords: ["como evoluiu a reputacao", "evoluiu a reputacao", "evolucao da reputacao", "evolucao da minha reputacao", "como evoluiu", "tendencia da reputacao", "evolucao mensal"],
  },
];

function intentScore(q: string, keywords: string[]): number {
  return keywords.reduce((s, kw) => {
    const words = kw.split(" ");
    return words.every((w) => q.includes(w)) ? s + words.length : s;
  }, 0);
}

export function resolveReputationIntent(question: string): ReputationIntent {
  const q = normalize(question);
  let best: ReputationIntent = "UNKNOWN";
  let bestScore = 0;
  for (const { intent, keywords } of REPUTATION_HINTS) {
    const score = intentScore(q, keywords);
    if (score > bestScore) {
      bestScore = score;
      best = intent;
    }
  }
  return best;
}

function entryLabel(review: ReputationReviewInput): string {
  return (
    review.targetLabel ??
    review.authorName ??
    review.targetType.toLowerCase()
  );
}

function ratingText(rating: number | null | undefined): string {
  return rating !== null && rating !== undefined ? `${rating}/5` : "—";
}

function answerRepGlobal(data: ReputationAssistantData): ReputationAssistantAnswer {
  const m = buildReputationMetrics(data.reviews);
  const visible = data.reviews.filter(
    (r) => r.status !== "DRAFT" && r.moderation === "APPROVED" && r.status !== "REJECTED",
  );
  const parts: string[] = [];
  if (m.globalRating === null) {
    parts.push("Ainda não tens avaliações com pontuação publicada.");
  } else {
    parts.push(
      `A tua reputação média é ${m.globalRating}/5, baseada em ${visible.length} avaliação(ões).`,
    );
  }
  if (m.complaints > 0) parts.push(`  • ${m.complaints} reclamação(ões) (${m.complaintsOpen} em aberto)`);
  if (m.recommendations > 0) parts.push(`  • ${m.recommendations} recomendação(ões)`);
  if (m.praises > 0) parts.push(`  • ${m.praises} elogio(s)`);
  return { intent: "REP_GLOBAL", answer: parts.join("\n") };
}

function answerRepOpenComplaints(data: ReputationAssistantData): ReputationAssistantAnswer {
  const open = data.reviews.filter(
    (r) => r.entryType === "COMPLAINT" && ["SUBMITTED", "UNDER_REVIEW", "RESPONDED", "IN_PROGRESS"].includes(r.status),
  );
  if (open.length === 0) {
    return {
      intent: "REP_OPEN_COMPLAINTS",
      answer: "Não tens reclamações abertas neste momento. Bons ventos.",
    };
  }
  const lines = open.map((r) => `  • ${entryLabel(r)}: ${r.title} (${ratingText(r.rating)})`);
  return {
    intent: "REP_OPEN_COMPLAINTS",
    answer: `Tens ${open.length} reclamação(ões) em aberto:\n${lines.join("\n")}`,
  };
}

function answerRepUnsatisfiedClients(data: ReputationAssistantData): ReputationAssistantAnswer {
  const negative = data.reviews.filter(
    (r) =>
      r.status !== "DRAFT" &&
      r.status !== "REJECTED" &&
      r.rating !== null &&
      r.rating !== undefined &&
      r.rating <= 2,
  );
  if (negative.length === 0) {
    return {
      intent: "REP_UNSATISFIED_CLIENTS",
      answer: "Não tens avaliações negativas (≤ 2) registadas. Nenhum cliente identificado como insatisfeito.",
    };
  }
  const lines = negative.map((r) => `  • ${entryLabel(r)} — ${r.title} (${ratingText(r.rating)})`);
  return {
    intent: "REP_UNSATISFIED_CLIENTS",
    answer: `Identifiquei ${negative.length} avaliação(ões) negativa(s):\n${lines.join("\n")}`,
  };
}

function answerRepWorstServices(data: ReputationAssistantData): ReputationAssistantAnswer {
  const worst = data.reviews.filter(
    (r) =>
      r.targetType === "SERVICE" &&
      r.status !== "DRAFT" &&
      r.status !== "REJECTED" &&
      r.rating !== null &&
      r.rating !== undefined &&
      r.rating <= 2,
  );
  if (worst.length === 0) {
    return {
      intent: "REP_WORST_SERVICES",
      answer: "Nenhum serviço tem avaliação negativa (≤ 2) registada.",
    };
  }
  const lines = worst.map((r) => `  • ${entryLabel(r)} — ${r.title} (${ratingText(r.rating)})`);
  return {
    intent: "REP_WORST_SERVICES",
    answer: `Serviços com pior avaliação:\n${lines.join("\n")}`,
  };
}

function answerRepMostPraised(data: ReputationAssistantData): ReputationAssistantAnswer {
  const praised = data.reviews.filter(
    (r) => r.entryType === "PRAISE" && r.status !== "DRAFT" && r.status !== "REJECTED",
  );
  if (praised.length === 0) {
    return {
      intent: "REP_MOST_PRAISED",
      answer: "Ainda não recebeste elogios registados. É uma boa altura para pedir feedback a clientes satisfeitos.",
    };
  }
  const lines = praised.map((r) => `  • ${entryLabel(r)}: ${r.title}`);
  return {
    intent: "REP_MOST_PRAISED",
    answer: `Recebeste ${praised.length} elogio(s):\n${lines.join("\n")}`,
  };
}

function answerRepBestEmployee(data: ReputationAssistantData): ReputationAssistantAnswer {
  const employees = data.reviews
    .filter(
      (r) =>
        r.targetType === "EMPLOYEE" &&
        r.status !== "DRAFT" &&
        r.status !== "REJECTED" &&
        r.moderation === "APPROVED" &&
        r.rating !== null &&
        r.rating !== undefined,
    )
    .reduce<Map<string, { name: string; sum: number; count: number }>>((map, r) => {
      const key = r.targetUserId ?? entryLabel(r);
      const cur = map.get(key) ?? { name: entryLabel(r), sum: 0, count: 0 };
      cur.sum += r.rating as number;
      cur.count += 1;
      map.set(key, cur);
      return map;
    }, new Map());
  if (employees.size === 0) {
    return {
      intent: "REP_BEST_EMPLOYEE",
      answer: "Ainda não tens avaliações de colaboradores com pontuação publicada.",
    };
  }
  const ranked = Array.from(employees.values())
    .map((e) => ({ ...e, avg: e.sum / e.count }))
    .sort((a, b) => b.avg - a.avg);
  const top = ranked[0];
  const lines = ranked
    .slice(0, 3)
    .map((e) => `  • ${e.name} — ${round(e.avg, 2)}/5 (${e.count} avaliação(ões))`);
  return {
    intent: "REP_BEST_EMPLOYEE",
    answer: `O colaborador com melhor avaliação é ${top.name} (${round(top.avg, 2)}/5).\n${lines.join("\n")}`,
  };
}

function answerRepResolutionRate(data: ReputationAssistantData): ReputationAssistantAnswer {
  const m = buildReputationMetrics(data.reviews);
  if (m.complaints === 0) {
    return {
      intent: "REP_RESOLUTION_RATE",
      answer: "Não tens reclamações registadas, pelo que ainda não há taxa de resolução.",
    };
  }
  const rate = m.resolutionRate === null ? "—" : `${m.resolutionRate}%`;
  return {
    intent: "REP_RESOLUTION_RATE",
    answer: `Taxa de resolução: ${rate} (${m.complaintsResolved} resolvidas de um total de ${m.complaints} reclamação(ões); ${m.complaintsOpen} em aberto).`,
  };
}

function answerRepUnanswered(data: ReputationAssistantData): ReputationAssistantAnswer {
  const unanswered = data.reviews.filter(
    (r) =>
      ["COMPLAINT", "REVIEW"].includes(r.entryType) &&
      ["SUBMITTED", "UNDER_REVIEW", "IN_PROGRESS"].includes(r.status) &&
      !r.respondedAt,
  );
  if (unanswered.length === 0) {
    return {
      intent: "REP_UNANSWERED",
      answer: "Todas as tuas reclamações e avaliações em curso já têm resposta.",
    };
  }
  const lines = unanswered.map((r) => `  • ${entryLabel(r)}: ${r.title}`);
  return {
    intent: "REP_UNANSWERED",
    answer: `Tens ${unanswered.length} reclamação(ões)/avaliação(ões) por responder:\n${lines.join("\n")}`,
  };
}

function answerRepRecommenders(data: ReputationAssistantData): ReputationAssistantAnswer {
  const recs = data.reviews.filter(
    (r) => r.entryType === "RECOMMENDATION" && r.status !== "DRAFT" && r.status !== "REJECTED",
  );
  if (recs.length === 0) {
    return {
      intent: "REP_RECOMMENDERS",
      answer: "Ainda não tens recomendações registadas.",
    };
  }
  const lines = recs.map((r) => `  • ${entryLabel(r)} — ${r.title}`);
  return {
    intent: "REP_RECOMMENDERS",
    answer: `Recebeste ${recs.length} recomendação(ões):\n${lines.join("\n")}`,
  };
}

function answerRepMonthlyAverage(data: ReputationAssistantData): ReputationAssistantAnswer {
  const m = buildReputationMetrics(data.reviews);
  const last = m.monthlyEvolution[m.monthlyEvolution.length - 1];
  if (!last || last.avg === null) {
    return {
      intent: "REP_MONTHLY_AVERAGE",
      answer: "Este mês ainda não tens avaliações com pontuação registada.",
    };
  }
  const typeMonthName = last.month;
  return {
    intent: "REP_MONTHLY_AVERAGE",
    answer: `A média deste mês (${typeMonthName}) é ${last.avg}/5 (${last.count} avaliação(ões)).`,
  };
}

function answerRepFiveStarCount(data: ReputationAssistantData): ReputationAssistantAnswer {
  const approved = data.reviews.filter(
    (r) =>
      r.status !== "DRAFT" &&
      r.status !== "REJECTED" &&
      r.moderation === "APPROVED" &&
      r.rating !== null &&
      r.rating !== undefined,
  );
  const five = approved.filter((r) => r.rating === 5).length;
  if (five === 0) {
    return {
      intent: "REP_FIVE_STAR_COUNT",
      answer: "Ainda não tens avaliações de 5 estrelas registadas.",
    };
  }
  const ofTotal = approved.length > 0 ? ` (de ${approved.length} avaliação(ões) publicada(s))` : "";
  return {
    intent: "REP_FIVE_STAR_COUNT",
    answer: `Tens ${five} avaliação(ões) de 5 estrelas${ofTotal}.`,
  };
}

function answerRepMonthComplaints(data: ReputationAssistantData): ReputationAssistantAnswer {
  const monthPrefix = data.today ? data.today.slice(0, 7) : null;
  const currentMonth = data.reviews.filter(
    (r) =>
      r.entryType === "COMPLAINT" &&
      r.status !== "DRAFT" &&
      r.status !== "REJECTED" &&
      (!monthPrefix || (r.createdAt ?? "").slice(0, 7) === monthPrefix),
  );
  if (currentMonth.length === 0) {
    return {
      intent: "REP_MONTH_COMPLAINTS",
      answer: "Nenhum cliente reclamou este mês. Bom sinal.",
    };
  }
  const lines = currentMonth.map((r) => `  • ${entryLabel(r)} — ${r.title} (${ratingText(r.rating)})`);
  const who = entryLabel(currentMonth[0]);
  return {
    intent: "REP_MONTH_COMPLAINTS",
    answer: `${currentMonth.length} cliente(s) reclamaram este mês (${who} e outros):\n${lines.join("\n")}`,
  };
}

function answerRepEvolution(data: ReputationAssistantData): ReputationAssistantAnswer {
  const m = buildReputationMetrics(data.reviews);
  const evolution = m.monthlyEvolution.filter((p) => p.avg !== null) as (ReputationMonthPoint & {
    avg: number;
  })[];
  if (evolution.length === 0) {
    return {
      intent: "REP_EVOLUTION",
      answer: "Ainda não tens dados mensais suficientes para mostrar a evolução da reputação.",
    };
  }
  const lines = evolution
    .slice(-6)
    .map((p) => `  • ${p.month} — ${p.avg}/5 (${p.count} avaliação(ões))`);
  const trend =
    evolution.length < 2
      ? "Ainda só tens um mês com dados; trás mais tempo para veres a tendência."
      : `Tendência: ${evolution[0].avg} → ${evolution[evolution.length - 1].avg} (${compareDelta(evolution[0].avg, evolution[evolution.length - 1].avg)})`;
  return {
    intent: "REP_EVOLUTION",
    answer: `Evolução da reputação (média mensal):\n${lines.join("\n")}\n${trend}`,
  };
}

function compareDelta(from: number, to: number): string {
  if (to > from) return "a subir 📈";
  if (to < from) return "a descer 📉";
  return "estável";
}

/** Ponto de entrada do assistente de reputação (usado por /ia e /vida). */
export function askReputationAssistant(question: string, data: ReputationAssistantData): ReputationAssistantAnswer {
  const intent = resolveReputationIntent(question);
  switch (intent) {
    case "REP_GLOBAL":
      return answerRepGlobal(data);
    case "REP_OPEN_COMPLAINTS":
      return answerRepOpenComplaints(data);
    case "REP_UNSATISFIED_CLIENTS":
      return answerRepUnsatisfiedClients(data);
    case "REP_WORST_SERVICES":
      return answerRepWorstServices(data);
    case "REP_MOST_PRAISED":
      return answerRepMostPraised(data);
    case "REP_BEST_EMPLOYEE":
      return answerRepBestEmployee(data);
    case "REP_RESOLUTION_RATE":
      return answerRepResolutionRate(data);
    case "REP_UNANSWERED":
      return answerRepUnanswered(data);
    case "REP_RECOMMENDERS":
      return answerRepRecommenders(data);
    case "REP_MONTHLY_AVERAGE":
      return answerRepMonthlyAverage(data);
    case "REP_FIVE_STAR_COUNT":
      return answerRepFiveStarCount(data);
    case "REP_MONTH_COMPLAINTS":
      return answerRepMonthComplaints(data);
    case "REP_EVOLUTION":
      return answerRepEvolution(data);
    case "UNKNOWN":
    default:
      return { intent: "UNKNOWN", answer: "" };
  }
}