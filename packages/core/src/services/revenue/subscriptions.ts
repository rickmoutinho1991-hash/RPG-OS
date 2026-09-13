/**
 * RPG-OS — OrganizationSubscription (FASE 7H / FASE 8).
 *
 * Abstração do ciclo de vida da subscrição de uma organização ao plano
 * RPG-OS. Estados (FASE 8):
 *   PROPOSED (proposta aguardando aceitação) → ACTIVE → PAST_DUE → PAUSED → CANCELLED
 *   PROPOSED → CANCELLED (proposta rejeitada/expirada)
 *   ACTIVE → PAST_DUE (cobrança falhada) → ACTIVE/PAUSED/CANCELLED
 *   Upgrade/downgrade entre planos dentro de um ciclo (FASE 8, prorated).
 *
 * Lógica PURA de transição de estado + validação. Persistência e cobrança
 * (FakePaymentProvider) são camadas de integração.
 */

import type { BillingInterval, RevenuePlanId } from "./plans";
import { REVENUE_PLANS, isRevenuePlanId } from "./plans";

export type SubscriptionStatus =
  | "PROPOSED"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "PAUSED"
  | "CANCELLED";

export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "PROPOSED",
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "PAUSED",
  "CANCELLED",
];

export function isSubscriptionStatus(
  value: unknown,
): value is SubscriptionStatus {
  return (
    typeof value === "string" &&
    (SUBSCRIPTION_STATUSES as string[]).includes(value)
  );
}

const SUB_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  PROPOSED: ["ACTIVE", "CANCELLED"],
  TRIALING: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["PAST_DUE", "PAUSED", "CANCELLED"],
  PAST_DUE: ["ACTIVE", "PAUSED", "CANCELLED"],
  PAUSED: ["ACTIVE", "CANCELLED"],
  CANCELLED: [],
};

export function canTransitionSubscription(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  if (!isSubscriptionStatus(from) || !isSubscriptionStatus(to)) return false;
  return SUB_TRANSITIONS[from].includes(to);
}

export interface OrganizationSubscription {
  id: string;
  organizationId: string;
  planId: string;
  status: SubscriptionStatus;
  /** Preço mensal atual em CENTAVOS (snapshot). */
  monthlyPriceCents: number;
  /** Intervalo de faturação (FASE 8). */
  billingInterval: BillingInterval;
  /** Preço total do período atual em CENTAVOS (snapshot). */
  periodPriceCents: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionTransitionInput {
  from: SubscriptionStatus;
  to: SubscriptionStatus;
}

/** Valida uma transição de subscrição (sem mutação). */
export function validateSubscriptionTransition(
  input: SubscriptionTransitionInput,
): { ok: boolean; error?: string } {
  if (!canTransitionSubscription(input.from, input.to)) {
    return {
      ok: false,
      error: `Transição de subscrição inválida: ${input.from} → ${input.to}.`,
    };
  }
  return { ok: true };
}

/**
 * Determina se a subscrição está expirada com base no fim do período atual.
 * Se periodEnd estiver no passado e o estado ainda for ativo, o sistema
 * deve marcar a subscrição como cancelada/vencida no ciclo de faturação.
 */
export function isSubscriptionExpired(
  sub: Pick<OrganizationSubscription, "status" | "currentPeriodEnd">,
  now: Date,
): boolean {
  if (sub.status === "CANCELLED") return true;
  if (!sub.currentPeriodEnd) return false;
  const end = new Date(sub.currentPeriodEnd);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() < now.getTime();
}

/** Nº de dias restantes do período atual (0 se expirado). */
export function subscriptionRemainingDays(
  sub: Pick<OrganizationSubscription, "currentPeriodEnd">,
  now: Date,
): number {
  if (!sub.currentPeriodEnd) return 0;
  const end = new Date(sub.currentPeriodEnd).getTime();
  const diff = Math.floor((end - now.getTime()) / 1000 / 60 / 60 / 24);
  return diff > 0 ? diff : 0;
}

/* ─── FASE 8: plan changes (upgrade/downgrade) & histórico ─────────────── */

export type SubscriptionChangeAction =
  | "CREATED"
  | "UPGRADED"
  | "DOWNGRADED"
  | "PAUSED"
  | "RESUMED"
  | "CANCELLED"
  | "RENEWED"
  | "PAYMENT_SETTLED"
  | "STATUS_CHANGED"
  | "PLAN_CHANGED";

export const SUBSCRIPTION_CHANGE_ACTIONS: SubscriptionChangeAction[] = [
  "CREATED",
  "UPGRADED",
  "DOWNGRADED",
  "PAUSED",
  "RESUMED",
  "CANCELLED",
  "RENEWED",
  "PAYMENT_SETTLED",
  "STATUS_CHANGED",
  "PLAN_CHANGED",
];

/** Evento de histórico de subscrição (append-oriented, FASE 8). */
export interface SubscriptionHistoryEvent {
  organizationId: string;
  subscriptionId: string;
  action: SubscriptionChangeAction;
  fromPlanId: string | null;
  toPlanId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  billingInterval: BillingInterval;
  /** Preço total do período (centavos) após a mudança. */
  periodPriceCents: number;
  /** Código de idempotência (evita duplicar o mesmo evento). */
  idempotencyKey: string;
  occurredAt: string;
  byUserId: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

/** Ordenação dos planos por valor comercial (FASE 8). */
export function planRank(planId: unknown): number {
  if (!isRevenuePlanId(planId)) return -1;
  return REVENUE_PLANS[planId as RevenuePlanId].order;
}

/**
 * Classifica uma mudança de plano como UPGRADED / DOWNGRADED / SAME.
 * Compara pela ordem comercial (não pelo preço).
 */
export function classifyPlanChange(
  fromPlanId: string | null,
  toPlanId: string | null,
): "UPGRADED" | "DOWNGRADED" | "SAME" {
  if (!fromPlanId || !toPlanId) return "SAME";
  if (fromPlanId === toPlanId) return "SAME";
  return planRank(toPlanId) > planRank(fromPlanId) ? "UPGRADED" : "DOWNGRADED";
}
