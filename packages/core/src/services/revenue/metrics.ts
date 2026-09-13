/**
 * RPG-OS — Business Metrics (FASE 8).
 *
 * Métricas comerciais expandidas do Revenue Center:
 *   GMV, receita bruta, comissão RPG-OS, receita líquida, reembolsos,
 *   MRR, ARR, clientes pagantes, ARPU, churn, crescimento, e desagregação
 *   por empresa / plano / serviço.
 *
 * Tudo PURA, zero-when-empty, em CENTAVOS inteiros (nunca floats). Reutiliza
 * `computeRevenueCenter` para os agregados base e `billing`/`plans` para MRR/ARR.
 */

import { computeRevenueCenter } from "./center";
import type { LedgerLine } from "./ledger";
import {
  planMonthlyEquivalentCents,
  isRevenuePlanId,
  type BillingInterval,
  type RevenuePlanId,
} from "./plans";

export interface ActiveSubscriptionSnapshot {
  planId: string;
  billingInterval: BillingInterval;
}

export interface ChurnContext {
  /** Subscrições ativas no início do período. */
  startCount: number;
  /** Subscrições canceladas durante o período. */
  cancelledCount: number;
}

export interface BusinessMetricsInput {
  lines: readonly LedgerLine[];
  activeSubscriptions: ReadonlyArray<ActiveSubscriptionSnapshot>;
  /** GMV do período anterior (para cálculo de crescimento). */
  previousGmvCents: number;
  churn: ChurnContext;
}

export interface BusinessBreakdownRow {
  key: string;
  grossCents: number;
  commissionCents: number;
  netCents: number;
  count: number;
}

export interface BusinessMetrics {
  gmvCents: number;
  grossRevenueCents: number;
  commissionCents: number;
  netCents: number;
  refundsCents: number;
  averageFeeBps: number;
  payingCustomerCount: number;
  subscriptionsMrrCents: number;
  subscriptionsArrCents: number;
  arpuCents: number;
  churnCancelledCount: number;
  churnRateBps: number;
  growthCents: number;
  growthRateBps: number;
  byCompany: BusinessBreakdownRow[];
  byPlan: BusinessBreakdownRow[];
  byService: BusinessBreakdownRow[];
}

const ZERO: BusinessMetrics = {
  gmvCents: 0,
  grossRevenueCents: 0,
  commissionCents: 0,
  netCents: 0,
  refundsCents: 0,
  averageFeeBps: 0,
  payingCustomerCount: 0,
  subscriptionsMrrCents: 0,
  subscriptionsArrCents: 0,
  arpuCents: 0,
  churnCancelledCount: 0,
  churnRateBps: 0,
  growthCents: 0,
  growthRateBps: 0,
  byCompany: [],
  byPlan: [],
  byService: [],
};

export function computeBusinessMetrics(
  input: BusinessMetricsInput,
): BusinessMetrics {
  const lines = input.lines ?? [];
  const base = computeRevenueCenter(lines);

  // Desagregações por empresa / plano / serviço (só linhas recolhidas).
  const companyMap = new Map<string, BusinessBreakdownRow>();
  const planMap = new Map<string, BusinessBreakdownRow>();
  const serviceMap = new Map<string, BusinessBreakdownRow>();

  for (const l of lines) {
    if (l.status !== "COLLECTED" && l.status !== "PARTIALLY_REFUNDED") continue;
    const retained = l.feeCollectedCents - l.feeRefundedCents;
    const companyKey = l.companyId ?? "__none__";
    companyMap.set(companyKey, bump(companyMap.get(companyKey), l, retained, companyKey));
    const planKey = l.planId ?? "FREE";
    planMap.set(planKey, bump(planMap.get(planKey), l, retained, planKey));
    const serviceKey = (l.sourceType ?? "PAYMENT").trim() || "PAYMENT";
    serviceMap.set(serviceKey, bump(serviceMap.get(serviceKey), l, retained, serviceKey));
  }

  // MRR / ARR a partir das subscrições ativas.
  let mrr = 0;
  for (const sub of input.activeSubscriptions ?? []) {
    if (!isRevenuePlanId(sub.planId)) continue;
    mrr += planMonthlyEquivalentCents(sub.planId, sub.billingInterval);
  }
  const arr = mrr * 12;

  const paying = base.payingOrgCount;
  const arpu = paying > 0 ? Math.floor(mrr / paying) : 0;

  const startCount = Number(input.churn?.startCount) || 0;
  const cancelled = Number(input.churn?.cancelledCount) || 0;
  const churnRateBps =
    startCount > 0 ? Math.round((cancelled * 10000) / startCount) : 0;

  const prevGmv = Number(input.previousGmvCents) || 0;
  const growth = base.gmvCents - prevGmv;
  const growthRateBps =
    prevGmv > 0 ? Math.round((growth * 10000) / prevGmv) : 0;

  return {
    gmvCents: base.gmvCents,
    grossRevenueCents: base.platformRevenueCents + base.refundsCents,
    commissionCents: base.platformRevenueCents,
    netCents: base.netCents,
    refundsCents: base.refundsCents,
    averageFeeBps: base.averageFeeBps,
    payingCustomerCount: paying,
    subscriptionsMrrCents: mrr,
    subscriptionsArrCents: arr,
    arpuCents: arpu,
    churnCancelledCount: cancelled,
    churnRateBps,
    growthCents: growth,
    growthRateBps,
    byCompany: [...companyMap.values()].sort((a, b) => b.grossCents - a.grossCents),
    byPlan: [...planMap.values()].sort((a, b) => b.grossCents - a.grossCents),
    byService: [...serviceMap.values()].sort((a, b) => b.grossCents - a.grossCents),
  };
}

function bump(
  row: BusinessBreakdownRow | undefined,
  line: LedgerLine,
  retained: number,
  key: string,
): BusinessBreakdownRow {
  const current = row ?? {
    key,
    grossCents: 0,
    commissionCents: 0,
    netCents: 0,
    count: 0,
  };
  current.grossCents += line.grossCents;
  current.commissionCents += retained;
  current.netCents += line.netCents - (line.feeCents - retained);
  current.count += 1;
  return current;
}

export function emptyBusinessMetrics(): BusinessMetrics {
  return { ...ZERO, byCompany: [], byPlan: [], byService: [] };
}
