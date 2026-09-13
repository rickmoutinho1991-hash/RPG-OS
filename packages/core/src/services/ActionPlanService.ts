/**
 * RPG-OS — Action Plan Service (Assistente de Vida ativo).
 *
 * Camada pura e determinística do plano de ações proposto pelo assistente.
 * Cruza as áreas do centro de vida (dinheiro, vida, empresa) e transforma o
 * que é detetável (contas vencidas, documentos a expirar, reclamações sem
 * resposta, ...) em PROPOSTAS de ação (ProposedAction).
 *
 * Invariantes centrais:
 *   - propor NUNCA executa: proposal gera apenas ações PROPOSED;
 *   - ações financeiras irreversíveis exigem confirmação explícita
 *     (requiresConfirmation = true para BILL_PAYMENT / MARK_BILL_PAID);
 *   - a transição para EXECUTED só é permitida a partir de CONFIRMED;
 *   - a autorização é verificada por assertActionAuthorization (owner + tenant),
 *     mantendo RLS/RBAC intactos na camada server-side.
 *
 * Sem I/O — recebe o mesmo LifeContextInput já autorizado (tenant) que o
 * assistente narrativo reutiliza (sem duplicação de queries).
 */
import { roundToCurrency } from "./QuoteCalculationService";
import {
  buildFinanceOverview,
  classifyBillStatus,
  dateKey,
  daysBetween,
  formatEuro,
} from "./LifeFinanceService";
import type { LifeContextInput, LifeDocumentInput } from "./LifeAssistantService";
import type { FinanceBill } from "../types/finance";
import type { ReputationReviewInput } from "./ReputationService";

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

export const ACTION_TYPES = [
  "REMINDER",
  "TASK",
  "OBLIGATION_TASK",
  "EVENT",
  "FOLLOW_UP",
  "BILL_PAYMENT",
  "MARK_BILL_PAID",
  "REPLY_REVIEW",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_PRIORITIES = ["CRITICAL", "HIGH", "NORMAL", "INFO"] as const;
export type ActionPriority = (typeof ACTION_PRIORITIES)[number];

export const ACTION_STATUSES = [
  "PROPOSED",
  "CONFIRMED",
  "EXECUTED",
  "CANCELLED",
  "FAILED",
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/** Tipos que mexe(ão) com dinheiro real — exigem confirmação explícita. */
const FINANCIAL_ACTIONS: ActionType[] = ["BILL_PAYMENT", "MARK_BILL_PAID"];

const PRIORITY_ORDER: Record<ActionPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  INFO: 3,
};

const STATUS_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  PROPOSED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["EXECUTED", "CANCELLED", "FAILED"],
  EXECUTED: [],
  CANCELLED: [],
  FAILED: [],
};

export interface RelatedEntityRef {
  kind: string;
  id: string | null;
  label: string;
}

/** Âmbito do dono da ação (sessão do utilizador, resolvida server-side). */
export interface ActionPlanScope {
  userId: string;
  organizationId?: string | null;
  companyId?: string | null;
}

export interface ProposedAction {
  id: string;
  type: ActionType;
  title: string;
  description: string;
  /** Porquê o assistente recomenda (raciocínio com dados reais). */
  reason: string;
  /** Consequência prevista de executar (para o utilizador decidir com segurança). */
  impact: string;
  relatedEntity: RelatedEntityRef | null;
  requiredData: Record<string, unknown>;
  requiresConfirmation: boolean;
  priority: ActionPriority;
  status: ActionStatus;
  scope: ActionPlanScope;
  proposedAt: string;
  confirmedAt?: string;
  executedAt?: string;
  cancelledAt?: string;
  failedReason?: string;
}

export interface ActionPlan {
  id: string;
  createdAt: string;
  summary: string;
  actions: ProposedAction[];
}

export interface ProposeLifeActionsInput {
  userId: string;
  organizationId?: string | null;
  companyId?: string | null;
  ctx: LifeContextInput;
  today?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  const clean = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return clean || "geral";
}

export function dateKeyOf(value: string | null | undefined): string | null {
  if (!value || value.length === 0) return null;
  return dateKey(value);
}

function formatDays(delta: number): string {
  if (delta <= 0) return "hoje";
  return `em ${delta} dia(s)`;
}

/**
 * Chave determinística de uma ação: mesma entidade + mesmo tipo ⇒ mesma chave.
 * Usada como chave de desduplicação no servidor (proposal_key).
 */
export function actionKey(
  scope: ActionPlanScope,
  type: ActionType,
  entity: RelatedEntityRef | null,
): string {
  const entityKey = entity ? entity.id ?? slugify(entity.label) : "n/a";
  return `${scope.userId}::${type}::${entityKey}`;
}

export function sortPlanByPriority(actions: ProposedAction[]): ProposedAction[] {
  return [...actions].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );
}

/** Se uma transição de estado é permitida pelo modelo. */
export function canTransitionActionStatus(
  from: ActionStatus,
  to: ActionStatus,
): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

/** Ações que movem dinheiro real requerem confirmação explícita. */
export function requiresExplicitConfirmation(type: ActionType): boolean {
  return FINANCIAL_ACTIONS.includes(type);
}

export function validateProposedAction(action: ProposedAction): string[] {
  const errors: string[] = [];
  if (!action.id || !action.id.includes("::")) errors.push("id inválido");
  if (!action.title.trim()) errors.push("título em falta");
  if (!action.reason.trim()) errors.push("motivo em falta");
  if (!action.impact.trim()) errors.push("impacto em falta");
  if (!ACTION_TYPES.includes(action.type)) errors.push("tipo inválido");
  if (!ACTION_PRIORITIES.includes(action.priority)) errors.push("prioridade inválida");
  if (!action.scope?.userId) errors.push("âmbito (dono) em falta");
  return errors;
}

export interface CreateProposedActionInput {
  type: ActionType;
  title: string;
  description: string;
  reason: string;
  impact: string;
  relatedEntity?: RelatedEntityRef | null;
  requiredData?: Record<string, unknown>;
  priority: ActionPriority;
  scope: ActionPlanScope;
  proposedAt?: string;
}

/** Cria uma ação apenas em estado PROPOSED — nunca executa nada. */
export function createProposedAction(input: CreateProposedActionInput): ProposedAction {
  const relatedEntity = input.relatedEntity ?? null;
  return {
    id: actionKey(input.scope, input.type, relatedEntity),
    type: input.type,
    title: input.title,
    description: input.description,
    reason: input.reason,
    impact: input.impact,
    relatedEntity,
    requiredData: input.requiredData ?? {},
    requiresConfirmation: requiresExplicitConfirmation(input.type),
    priority: input.priority,
    status: "PROPOSED",
    scope: {
      userId: input.scope.userId,
      organizationId: input.scope.organizationId ?? null,
      companyId: input.scope.companyId ?? null,
    },
    proposedAt: input.proposedAt ?? new Date().toISOString(),
  };
}

/**
 * Autorização pura: a ação pertence ao dono e, se for de uma organização,
 * ao mesmo tenant. As escritas server-side aplicam isto + RLS + RBAC.
 */
export function actionAuthorizationError(
  action: ProposedAction,
  actor: ActionPlanScope,
): string | null {
  if (action.scope.userId !== actor.userId) return "PERMISSION_DENIED_OWNER";
  if (
    action.scope.organizationId &&
    action.scope.organizationId !== actor.organizationId
  ) {
    return "PERMISSION_DENIED_TENANT";
  }
  return null;
}

export function confirmProposedAction(
  action: ProposedAction,
  at?: string,
): ProposedAction {
  if (action.status !== "PROPOSED") {
    throw new Error(`ACTION_CONFIRM_INVALID_FROM:${action.status}`);
  }
  return { ...action, status: "CONFIRMED", confirmedAt: at ?? new Date().toISOString() };
}

export function cancelAction(
  action: ProposedAction,
  reason?: string,
  at?: string,
): ProposedAction {
  if (action.status !== "PROPOSED" && action.status !== "CONFIRMED") {
    throw new Error(`ACTION_CANCEL_INVALID_FROM:${action.status}`);
  }
  return {
    ...action,
    status: "CANCELLED",
    cancelledAt: at ?? new Date().toISOString(),
    failedReason: reason,
  };
}

export function markActionExecuted(action: ProposedAction, at?: string): ProposedAction {
  if (action.status !== "CONFIRMED") {
    throw new Error(`ACTION_EXECUTE_INVALID_FROM:${action.status}`);
  }
  return { ...action, status: "EXECUTED", executedAt: at ?? new Date().toISOString() };
}

export function markActionFailed(action: ProposedAction, reason: string, at?: string): ProposedAction {
  if (action.status !== "CONFIRMED") {
    throw new Error(`ACTION_FAIL_INVALID_FROM:${action.status}`);
  }
  return { ...action, status: "FAILED", failedReason: reason };
}

// ---------------------------------------------------------------------------
// Motor de decisão (cruzamento de dinheiro + vida + empresa)
// ---------------------------------------------------------------------------

export interface ActionPlanResult {
  plan: ActionPlan;
  /** Ids das entidades cuja proposta não é mais necessária (para auto-cancelar). */
  staleActionIds: string[];
}

interface ProposeContext {
  today: string;
  scope: ActionPlanScope;
}

function proposeBillActions(
  bill: FinanceBill,
  balance: number,
  p: ProposeContext,
): ProposedAction | null {
  const status = classifyBillStatus(bill, p.today);
  if (bill.status === "PAID" || status === "PAID") return null;
  const days = daysBetween(p.today, bill.dueDate);

  if (status === "OVERDUE") {
    const remaining = roundToCurrency(balance - bill.amount);
    return createProposedAction({
      type: "MARK_BILL_PAID",
      title: `Marcar "${bill.name}" como paga`,
      description: `Conta "${bill.name}" vencida a ${bill.dueDate} no valor de ${formatEuro(bill.amount)} (categoria ${bill.category}).`,
      reason: `A conta está em atraso há ${Math.abs(days)} dia(s). Confirma o pagamento para regularizar o teu centro financeiro.`,
      impact:
        remaining >= 0
          ? `Se já pagaste e confirmares, ficas com ${formatEuro(remaining)} de saldo disponível.`
          : `Confirma apenas se o pagamento foi realmente feito — o saldo projetado ficaria em ${formatEuro(remaining)} (a descoberto).`,
      relatedEntity: { kind: "finance_bill", id: bill.id, label: bill.name },
      requiredData: { bill: { id: bill.id, name: bill.name, amount: bill.amount, dueDate: bill.dueDate } },
      priority: "CRITICAL",
      scope: p.scope,
    });
  }

  if (days <= 7) {
    const remaining = roundToCurrency(balance - bill.amount);
    return createProposedAction({
      type: "BILL_PAYMENT",
      title: `Pagar "${bill.name}"`,
      description: `Conta "${bill.name}" no valor de ${formatEuro(bill.amount)}, vence a ${bill.dueDate}.`,
      reason: `Vence ${formatDays(days)} (${bill.dueDate}). Aproveita para agendar o pagamento e evitar atrasos.`,
      impact:
        remaining >= 0
          ? `Depois de pagar ficas com ${formatEuro(remaining)} de saldo disponível.`
          : `Cuidado: depois de pagar o saldo fica em ${formatEuro(remaining)} (a descoberto).`,
      relatedEntity: { kind: "finance_bill", id: bill.id, label: bill.name },
      requiredData: { bill: { id: bill.id, name: bill.name, amount: bill.amount, dueDate: bill.dueDate } },
      priority: days <= 3 ? "HIGH" : "NORMAL",
      scope: p.scope,
    });
  }

  return null;
}

function proposeDebtActions(
  ctx: LifeContextInput,
  p: ProposeContext,
): ProposedAction[] {
  const debts = (ctx.finance.debts ?? []).filter(
    (d) => d.status === "OPEN" || d.status === "DEFAULTED",
  );
  const out: ProposedAction[] = [];
  for (const debt of debts) {
    if (!debt.nextDueDate && debt.status !== "DEFAULTED") continue;
    const due = dateKeyOf(debt.nextDueDate);
    const overdue = debt.status === "DEFAULTED" || (due !== null && due < p.today);
    const days = due !== null ? daysBetween(p.today, due) : 0;
    const inWindow = overdue || (due !== null && days <= 14);
    if (!inWindow) continue;

    const installment = debt.installmentAmount ?? debt.outstandingAmount;
    out.push(
      createProposedAction({
        type: "OBLIGATION_TASK",
        title: `Preparar prestação de "${debt.creditorName}"`,
        description: `Dívida a "${debt.creditorName}" de ${formatEuro(debt.outstandingAmount)}${due ? `, próxima prestação a ${due}` : ""}.`,
        reason: overdue
          ? `Esta prestação já está vencida. Cria uma tarefa hoje para não deixares passar.`
          : `A próxima prestação de ${formatEuro(installment)} vence ${formatDays(days)}.`,
        impact: `Cria uma tarefa com prazo em ${due ?? p.today} para preparares o pagamento atempadamente.`,
        relatedEntity: { kind: "finance_debt", id: debt.id, label: debt.creditorName },
        requiredData: {
          debt: { id: debt.id, creditorName: debt.creditorName, installmentAmount: installment, nextDueDate: due },
        },
        priority: overdue ? "CRITICAL" : days !== null && days <= 7 ? "HIGH" : "NORMAL",
        scope: p.scope,
      }),
    );
  }
  return out;
}

function proposeDocumentActions(
  docs: LifeDocumentInput[],
  p: ProposeContext,
): ProposedAction[] {
  const out: ProposedAction[] = [];
  for (const doc of docs) {
    const expiry = dateKeyOf(doc.expiresAt);
    if (!expiry) continue;
    const days = daysBetween(p.today, expiry);
    if (days > 14) continue;

    out.push(
      createProposedAction({
        type: "REMINDER",
        title: `Renovar "${doc.fileName}"`,
        description: `Documento "${doc.fileName}" (${doc.category ?? "Documento"}) expira a ${expiry}.`,
        reason: days <= 0
          ? `O documento já expirou (há ${Math.abs(days)} dia(s)).`
          : `O documento expira ${formatDays(days)}.`,
        impact: `Cria um lembrete com a data ${expiry} para não te esqueceres da renovação.`,
        relatedEntity: { kind: "document", id: doc.id, label: doc.fileName },
        requiredData: { document: { id: doc.id, fileName: doc.fileName, expiresAt: expiry } },
        priority: days <= 0 ? "CRITICAL" : days <= 7 ? "HIGH" : "NORMAL",
        scope: p.scope,
      }),
    );
  }
  return out;
}

function proposeReviewActions(
  reviews: ReputationReviewInput[],
  p: ProposeContext,
): ProposedAction[] {
  const out: ProposedAction[] = [];
  for (const r of reviews) {
    if (r.entryType !== "COMPLAINT") continue;
    if (r.respondedAt) continue;
    if (["DRAFT", "RESOLVED", "CLOSED", "REJECTED"].includes(r.status)) continue;

    const label = r.targetLabel ?? r.title ?? `reclamação ${r.id.slice(0, 8)}`;
    const rating = typeof r.rating === "number" ? r.rating : null;
    out.push(
      createProposedAction({
        type: "REPLY_REVIEW",
        title: `Responder à reclamação "${r.title ?? label}"`,
        description: `Reclamação aberta de ${r.authorName ?? "cliente"} com ${rating !== null ? `${rating}★` : "avaliação não indicada"}.`,
        reason: `Esta reclamação ainda não tem resposta pública. Responder rapidamente protege a tua reputação (RAI e resolução).`,
        impact: `Publica uma resposta oficial no perfil e reabre o diálogo com o cliente — passo reversível e editável.`,
        relatedEntity: { kind: "reputation_review", id: r.id, label },
        requiredData: {
          review: { id: r.id, rating, title: r.title, authorName: r.authorName },
          suggestedResponse: `Olá ${r.authorName ?? "cliente"}, obrigado pelo teu feedback. Já estamos a tratar do assunto e voltamos a contactar-te em breve.`,
        },
        priority: rating !== null && rating <= 2 ? "CRITICAL" : "HIGH",
        scope: p.scope,
      }),
    );
  }
  return out;
}

function proposeFinanceHealthTask(
  ctx: LifeContextInput,
  p: ProposeContext,
): ProposedAction | null {
  const overview = buildFinanceOverview({
    currentBalance: ctx.finance.currentBalance,
    bills: ctx.finance.bills,
    debts: ctx.finance.debts,
    incomes: ctx.finance.incomes,
    expenses: ctx.finance.expenses,
    today: p.today,
  });
  if (overview.availableAfterObligations >= 0) return null;

  return createProposedAction({
    type: "TASK",
    title: "Reavaliar despesas — saldo insuficiente",
    description: `As obrigações previstas deste mês ultrapassam o teu saldo em ${formatEuro(Math.abs(overview.availableAfterObligations))}.`,
    reason: `O cruzamento previu um saldo de ${formatEuro(overview.availableAfterObligations)} depois das obrigações (mínimo ${formatEuro(overview.minProjectedBalance)} em ${overview.minProjectedDate ?? "breve"}).`,
    impact: `Cria uma tarefa para reveres receitas e despesas antes do fim do mês.`,
    relatedEntity: null,
    requiredData: {
      finance: { availableAfterObligations: overview.availableAfterObligations, minProjectedBalance: overview.minProjectedBalance },
    },
    priority: "CRITICAL",
    scope: p.scope,
  });
}

/**
 * Gera o plano de ações do assistente (PROPOSED apenas).
 * Não executa nada — a execução exige CONFIRMED + serve de base à UI.
 */
export function proposeLifeActions(input: ProposeLifeActionsInput): ActionPlanResult {
  const today = dateKey(input.today ?? new Date());
  const scope: ActionPlanScope = {
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    companyId: input.companyId ?? null,
  };
  const p: ProposeContext = { today, scope };
  const ctx = input.ctx;

  const actions: ProposedAction[] = [];

  for (const bill of ctx.finance.bills ?? []) {
    const a = proposeBillActions(bill, ctx.finance.currentBalance, p);
    if (a) actions.push(a);
  }

  actions.push(...proposeDebtActions(ctx, p));
  actions.push(...proposeDocumentActions(ctx.documents ?? [], p));
  actions.push(...proposeReviewActions(ctx.reviews ?? [], p));

  const health = proposeFinanceHealthTask(ctx, p);
  if (health) actions.push(health);

  const unique: ProposedAction[] = [];
  const seen = new Set<string>();
  for (const a of sortPlanByPriority(actions)) {
    let key = a.id;
    let suffix = 2;
    while (seen.has(key)) {
      key = `${a.id}-${suffix}`;
      suffix += 1;
    }
    seen.add(key);
    unique.push({ ...a, id: key });
  }

  const active = unique;
  const critical = active.filter((a) => a.priority === "CRITICAL").length;
  const high = active.filter((a) => a.priority === "HIGH").length;

  const summary =
    active.length === 0
      ? "Está tudo em dia — não encontrei nada que exija a tua atenção neste momento."
      : critical > 0
        ? `${critical} ação(ões) crítica(s) requerem a tua atenção (mais ${active.length - critical} recomendada(s)).`
        : high > 0
          ? `${high} prioridade(s) alta(s) merecem a tua atenção.`
          : `${active.length} recomendação(ões) para planeares com calma.`;

  return {
    plan: {
      id: `actionplan:${input.userId}:${today}`,
      createdAt: new Date().toISOString(),
      summary,
      actions: unique,
    },
    staleActionIds: [],
  };
}