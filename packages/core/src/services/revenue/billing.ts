/**
 * RPG-OS — Billing Engine (FASE 7/8/10).
 *
 * Motor de faturação puro e determinístico para subscrições do RPG-OS.
 * Todas as operações são em CENTAVOS inteiros (minor units) — zero float/NaN/Infinity.
 * Events are append-oriented: cada evento cria um novo registo; nunca se atualiza
 * um evento anterior. O saldo de um ponto do tempo é derivado da soma dos eventos.
 *
 * FASE 7: Money Engine core com 480 testes.
 * FASE 8: REVENUE_PLANS expandido, pricing/limits configuráveis, billing engine.
 * FASE 10: Funções puras de lifecycle, proration, idempotency, limit checking.
 */

import {
  planIntervalPriceCents,
  planMonthlyEquivalentCents,
  resolveRevenuePlan,
  type BillingInterval,
  type RevenuePlanId,
  planLimit,
} from "./plans";
import { assertNonNegativeCents, type MonetaryResult } from "./money";
import { validateSubscriptionTransition } from "./subscriptions";

export { validateSubscriptionTransition };
export type { BillingInterval, RevenuePlanId };

/** Eventos de ciclo de vida da subscrição (FASE 10). */
export type SubscriptionLifecycleEvent =
  | "SUBSCRIPTION_CREATED"
  | "SUBSCRIPTION_UPGRADED"
  | "SUBSCRIPTION_DOWNGRADED"
  | "SUBSCRIPTION_RENEWED"
  | "SUBSCRIPTION_CANCELLED"
  | "SUBSCRIPTION_REACTIVATED"
  | "SUBSCRIPTION_EXPIRED"
  | "SUBSCRIPTION_PAYMENT_FAILED";

export const SUBSCRIPTION_LIFECYCLE_EVENTS: SubscriptionLifecycleEvent[] = [
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_UPGRADED",
  "SUBSCRIPTION_DOWNGRADED",
  "SUBSCRIPTION_RENEWED",
  "SUBSCRIPTION_CANCELLED",
  "SUBSCRIPTION_REACTIVATED",
  "SUBSCRIPTION_EXPIRED",
  "SUBSCRIPTION_PAYMENT_FAILED",
];

export function isSubscriptionLifecycleEvent(
  value: unknown,
): value is SubscriptionLifecycleEvent {
  return (
    typeof value === "string" &&
    (SUBSCRIPTION_LIFECYCLE_EVENTS as string[]).includes(value)
  );
}

/** billingPeriodDays: número de dias em um período de faturação. */
export function billingPeriodDays(interval: BillingInterval): number {
  if (interval === "YEAR") return 365;
  return 30; // MONTH
}

/** billingPeriodPriceCents: preço do período de faturação em centavos.
 *  - MONTH → monthlyPriceCents (sem desconto anual — discount só afeta YEAR)
 *  - YEAR  → total anual com desconto via planIntervalPriceCents
 *
 * Regra da fonte de verdade (REVENUE_PLANS):
 *   - MONTH = monthlyPriceCents (preço mensal puro)
 *   - YEAR  = round(monthly × 12 × (10000 - annualDiscountBps) / 10000)
 */
export function billingPeriodPriceCents(
  planId: RevenuePlanId,
  interval: BillingInterval,
): number {
  const plan = resolveRevenuePlan(planId);
  const monthly = plan.monthlyPriceCents;
  if (monthly === 0) return 0;
  if (interval === "MONTH") return monthly;
  // YEAR: total anual com desconto
  return planIntervalPriceCents(planId, "YEAR");
}

/** computeNextChargeDate: data da próxima cobrança. */
export function computeNextChargeDate(
  currentPeriodEnd: Date,
  interval: BillingInterval,
): Date {
  const next = new Date(currentPeriodEnd.getTime());
  const days = billingPeriodDays(interval);
  next.setDate(next.getDate() + days);
  return next;
}

/** calculateUpgradeProration: prorata para upgrade em centavos. */
export function calculateUpgradeProration(input: {
  oldPriceCents: number;
  newPriceCents: number;
  periodDays: number;
  remainingDays: number;
}): MonetaryResult {
  const oldP = assertNonNegativeCents(input.oldPriceCents, "preço antigo");
  if (!oldP.ok) return oldP;
  const newP = assertNonNegativeCents(input.newPriceCents, "preço novo");
  if (!newP.ok) return newP;
  if (
    !Number.isSafeInteger(input.periodDays) ||
    input.periodDays <= 0
  ) {
    return { ok: false, error: "Período deve ter dias > 0." };
  }
  if (
    !Number.isSafeInteger(input.remainingDays) ||
    input.remainingDays < 0 ||
    input.remainingDays > input.periodDays
  ) {
    return { ok: false, error: "Dias restantes fora do período." };
  }

  const dailyOld = Math.round(input.oldPriceCents / input.periodDays);
  const dailyNew = Math.round(input.newPriceCents / input.periodDays);
  const delta = input.remainingDays * (dailyNew - dailyOld);
  if (!Number.isSafeInteger(delta)) {
    return { ok: false, error: "Delta de prorata fora do inteiro seguro." };
  }
  return { ok: true, cents: delta };
}

/** calculateDowngradeProration: prorata para downgrade (delta negativo = crédito). */
export function calculateDowngradeProration(input: {
  oldPriceCents: number;
  newPriceCents: number;
  periodDays: number;
  remainingDays: number;
}): MonetaryResult {
  return calculateUpgradeProration({
    oldPriceCents: input.oldPriceCents,
    newPriceCents: input.newPriceCents,
    periodDays: input.periodDays,
    remainingDays: input.remainingDays,
  });
}

/** calculateRenewal: preço do período para renovação. */
export function calculateRenewal(planId: RevenuePlanId, interval: BillingInterval): number {
  return planIntervalPriceCents(planId, interval);
}

/** calculateNextBillingDate: próxima data de faturação. */
export function calculateNextBillingDate(
  currentPeriodEnd: Date,
  interval: BillingInterval,
): Date {
  return computeNextChargeDate(currentPeriodEnd, interval);
}

/** calculateSubscriptionPeriod: período de subscrição. */
export function calculateSubscriptionPeriod(
  startDate: Date,
  interval: BillingInterval,
): { start: Date; end: Date } {
  let end: Date;
  if (interval === "MONTH") {
    // Advance one month, keep same day; clamp to last day of month if needed
    const year = startDate.getFullYear();
    const nextMonth = startDate.getMonth() + 1; // 0-indexed, so Jan(0) → Feb(1)
    const day = Math.min(
      startDate.getDate(),
      new Date(year, nextMonth + 1, 0).getDate() // last day of next month
    );
    end = new Date(year, nextMonth, day); // nextMonth is already 0-indexed
  } else {
    // YEAR interval: same date next year
    const tryDate = new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());
    // If the day doesn't exist in that month (e.g., Jan 31 → Dec 31)
    if (tryDate.getMonth() !== startDate.getMonth()) {
      // Use last day of the same month in the next year
      end = new Date(startDate.getFullYear() + 1, startDate.getMonth(), 0);
    } else {
      end = tryDate;
    }
  }
  return { start: startDate, end };
}

/** buildSubscriptionIdempotencyKey: chave idempotente para operações. */
export function buildSubscriptionIdempotencyKey(
  ...parts: (string | number)[]
): string {
  const sep = ":";
  return parts
    .map((p) => String(p).replace(/\s+/g, "").toLowerCase())
    .filter((p) => p.length > 0)
    .join(sep);
}

/** subscriptionMrrCents: MRR normalizado por mês independentemente do intervalo. */
export function subscriptionMrrCents(
  planId: RevenuePlanId,
  interval: BillingInterval,
): number {
  return planMonthlyEquivalentCents(planId, interval);
}

/** arrFromMrr: ARR a partir de MRR mensal. */
export function arrFromMrr(mrrCents: number): number {
  return mrrCents * 12;
}

/** checkPlanLimit: validar se uso de limite está dentro do permitido. */
export function checkPlanLimit(
  planId: RevenuePlanId,
  key: keyof import("./plans").RevenuePlanLimits,
  used: number,
): { ok: boolean; limit: number; usagePct: number } {
  const limit = planLimit(planId, key);
  const usagePct = limit === Infinity ? 0 : Math.round((used * 100) / limit);
  // Ordem: EXCEEDED primeiro (usage >= limit), depois WARNING (>= 80%), então OK
  const isExceeded = used >= limit && limit !== Infinity;
  return { ok: !isExceeded && used <= limit, limit, usagePct };
}

/** planLimitStatus: retorna OK/WARNING/EXCEEDED baseado no uso. */
export function planLimitStatus(
  planId: RevenuePlanId,
  key: keyof import("./plans").RevenuePlanLimits,
  used: number,
): "OK" | "WARNING" | "EXCEEDED" {
  const { ok, limit, usagePct } = checkPlanLimit(planId, key, used);
  if (used >= limit && limit !== Infinity) return "EXCEEDED";
  if (usagePct >= 80) return "WARNING";
  return "OK";
}

/** planLimitMessage: mensagem explicativa para o UI. */
export function planLimitMessage(
  planId: RevenuePlanId,
  key: keyof import("./plans").RevenuePlanLimits,
  used: number,
): string {
  const { ok, limit, usagePct } = checkPlanLimit(planId, key, used);
  if (!ok) {
    const plan = resolveRevenuePlan(planId);
    return `Plano ${plan.label}: limite de ${
      limit === Infinity ? "ilimitado" : limit
    }. Já utiliza ${used}. ${usagePct >= 80
      ? `Faça upgrade para o plano ${resolveRevenuePlan(
        plan.id === "BUSINESS"
          ? "BUSINESS"
          : plan.id === "PRO"
            ? "PRO"
            : "STARTER"
          ).label} para mais capacidade.`
      : `Considere upgrade para o plano ${resolveRevenuePlan(
        plan.id === "BUSINESS"
          ? "BUSINESS"
          : plan.id === "PRO"
            ? "PRO"
            : "STARTER"
          ).label} para mais capacidade.`}`;
  }
  return `Within limits (${usagePct}% used).`;
}

/** isPlanUpgrade: classifica se é upgrade de plano. */
export function isPlanUpgrade(
  fromPlan: RevenuePlanId,
  toPlan: RevenuePlanId,
  interval: BillingInterval,
): boolean {
  const from = resolveRevenuePlan(fromPlan);
  const to = resolveRevenuePlan(toPlan);
  if (!from || !to) return false;
  if (from.order === to.order) return false;
  const fromPrice = billingPeriodPriceCents(fromPlan, interval);
  const toPrice = billingPeriodPriceCents(toPlan, interval);
  return to.order > from.order && toPrice >= fromPrice;
}

/** isPlanDowngrade: classifica se é downgrade de plano. */
export function isPlanDowngrade(
  fromPlan: RevenuePlanId,
  toPlan: RevenuePlanId,
  interval: BillingInterval,
): boolean {
  const from = resolveRevenuePlan(fromPlan);
  const to = resolveRevenuePlan(toPlan);
  if (!from || !to) return false;
  return from.order > to.order || (from.order === to.order && billingPeriodPriceCents(fromPlan, interval) > billingPeriodPriceCents(toPlan, interval));
}

/** calculateSubscriptionRevenue: comissão e net a partir do gross. */
export function calculateSubscriptionRevenue(
  planId: RevenuePlanId,
  interval: BillingInterval,
  grossCents: number,
): { commissionCents: number; netCents: number } {
  const bps = resolveRevenuePlan(planId).platformFeeBps;
  const commission = Math.round((grossCents * bps) / 10000);
  const net = grossCents - commission;
  return { commissionCents: commission, netCents: net };
}



/** Subscription lifecycle event payload (pure, no side effects). */
export interface SubscriptionLifecycleEventPayload {
  organizationId: string;
  subscriptionId: string;
  event: SubscriptionLifecycleEvent;
  /** Previous plan/snapshot (optional). */
  fromPlanId?: string;
  /** New plan/snapshot (optional). */
  toPlanId?: string;
  /** Previous status (optional). */
  fromStatus?: string;
  /** New status (optional). */
  toStatus?: string;
  /** Billing interval (optional). */
  billingInterval?: BillingInterval;
  /** Period price in cents after the event. */
  periodPriceCents?: number;
  /** Idempotency key to prevent duplicate processing. */
  idempotencyKey: string;
  /** Timestamp of the event. */
  occurredAt: string;
  /** User/origin who triggered the event. */
  origin?: "USER" | "ADMIN" | "SYSTEM" | "AUTOMATION";
  /** Reason for the event (optional). */
  reason?: string;
  /** Metadata for extensibility. */
  metadata?: Record<string, unknown>;
}

/** Example payload for SUBSCRIPTION_UPGRADED. */
export function createUpgradePayload(
  organizationId: string,
  subscriptionId: string,
  fromPlanId: string,
  toPlanId: string,
  fromStatus: string,
  toStatus: string,
  billingInterval: BillingInterval,
  periodPriceCents: number,
  origin: "USER" | "ADMIN" | "SYSTEM" | "AUTOMATION",
  reason?: string,
): SubscriptionLifecycleEventPayload {
  return {
    organizationId,
    subscriptionId,
    event: "SUBSCRIPTION_UPGRADED",
    fromPlanId,
    toPlanId,
    fromStatus,
    toStatus,
    billingInterval,
    periodPriceCents,
    idempotencyKey: buildSubscriptionIdempotencyKey(
      "upgrade",
      organizationId,
      subscriptionId,
      fromPlanId,
      toPlanId,
    ),
    occurredAt: new Date().toISOString(),
    origin,
    reason,
  };
}

/** Example payload for SUBSCRIPTION_CREATED. */
export function createCreatedPayload(
  organizationId: string,
  subscriptionId: string,
  planId: string,
  billingInterval: BillingInterval,
  periodPriceCents: number,
  origin: "USER" | "ADMIN" | "SYSTEM" | "AUTOMATION",
  reason?: string,
): SubscriptionLifecycleEventPayload {
  return {
    organizationId,
    subscriptionId,
    event: "SUBSCRIPTION_CREATED",
    toPlanId: planId,
    billingInterval,
    periodPriceCents,
    idempotencyKey: buildSubscriptionIdempotencyKey(
      "created",
      organizationId,
      subscriptionId,
      planId,
    ),
    occurredAt: new Date().toISOString(),
    origin,
    reason,
  };
}

/** Example payload for SUBSCRIPTION_CANCELLED. */
export function createCancelledPayload(
  organizationId: string,
  subscriptionId: string,
  fromPlanId: string,
  fromStatus: string,
  origin: "USER" | "ADMIN" | "SYSTEM" | "AUTOMATION",
  reason?: string,
): SubscriptionLifecycleEventPayload {
  return {
    organizationId,
    subscriptionId,
    event: "SUBSCRIPTION_CANCELLED",
    fromPlanId,
    fromStatus,
    idempotencyKey: buildSubscriptionIdempotencyKey(
      "cancelled",
      organizationId,
      subscriptionId,
      fromPlanId,
    ),
    occurredAt: new Date().toISOString(),
    origin,
    reason,
  };
}

/** Example payload for SUBSCRIPTION_RENEWED. */
export function createRenewedPayload(
  organizationId: string,
  subscriptionId: string,
  periodPriceCents: number,
  origin: "USER" | "ADMIN" | "SYSTEM" | "AUTOMATION",
  reason?: string,
): SubscriptionLifecycleEventPayload {
  return {
    organizationId,
    subscriptionId,
    event: "SUBSCRIPTION_RENEWED",
    periodPriceCents,
    idempotencyKey: buildSubscriptionIdempotencyKey(
      "renewed",
      organizationId,
      subscriptionId,
    ),
    occurredAt: new Date().toISOString(),
    origin,
    reason,
  };
}

/** Example payload for SUBSCRIPTION_PAYMENT_FAILED. */
export function createPaymentFailedPayload(
  organizationId: string,
  subscriptionId: string,
  origin: "USER" | "ADMIN" | "SYSTEM" | "AUTOMATION",
  reason?: string,
): SubscriptionLifecycleEventPayload {
  return {
    organizationId,
    subscriptionId,
    event: "SUBSCRIPTION_PAYMENT_FAILED",
    idempotencyKey: buildSubscriptionIdempotencyKey(
      "payment-failed",
      organizationId,
      subscriptionId,
    ),
    occurredAt: new Date().toISOString(),
    origin,
    reason,
  };
}