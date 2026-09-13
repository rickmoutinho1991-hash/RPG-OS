/**
 * RPG-OS — Revenue Center (FASE 7I).
 *
 * Agregação pura de métricas de receita a partir de linhas do ledger e
 * subscrições. Todos os valores em CENTAVOS inteiros. Com zero dados, todas
 * as métricas devolvem 0 (zero) — nunca undefined/NaN.
 */

import { computePlatformFee } from "../PlatformFeeService";
import type { RevenueLedgerStatus } from "./ledger";
import type { LedgerLine } from "./ledger";

export interface RevenueCenterMetrics {
  /** GMV = volume bruto de pagamentos (soma gross). */
  gmvCents: number;
  /** Receita da plataforma = fees recolhidas (não reembolsadas). */
  platformRevenueCents: number;
  /** Líquido agregado (para as empresas). */
  netCents: number;
  /** Total de reembolsos de fee. */
  refundsCents: number;
  /** Taxa média efetiva (bps) derivada dos snapshots. */
  averageFeeBps: number;
  /** Nº de organizações pagantes (com pelo menos uma linha recolhida). */
  payingOrgCount: number;
  /** Receita recorrente mensal em CENTAVOS (MRR). */
  mrrCents: number;
  /** Nº de subscrições ativas. */
  activeSubscriptionCount: number;
}

const ZERO: RevenueCenterMetrics = {
  gmvCents: 0,
  platformRevenueCents: 0,
  netCents: 0,
  refundsCents: 0,
  averageFeeBps: 0,
  payingOrgCount: 0,
  mrrCents: 0,
  activeSubscriptionCount: 0,
};

function isCollectedOrPartial(
  status: RevenueLedgerStatus,
): boolean {
  return status === "COLLECTED" || status === "PARTIALLY_REFUNDED";
}

/**
 * Calcula métricas do Revenue Center a partir de linhas do ledger.
 * Com lista vazia → tudo 0.
 */
export function computeRevenueCenter(
  lines: readonly LedgerLine[],
): RevenueCenterMetrics {
  const list = lines ?? [];
  let gmv = 0;
  let revenue = 0;
  let net = 0;
  let refunds = 0;
  let sumFeeOverGross = 0;
  let grossForAverage = 0;
  const payingOrgs = new Set<string>();

  for (const l of list) {
    const g = Number(l.grossCents) || 0;
    gmv += g;

    if (isCollectedOrPartial(l.status)) {
      const retained = l.feeCollectedCents - l.feeRefundedCents;
      revenue += retained;
      net += retained > 0 ? g - (l.feeCollectedCents - l.feeRefundedCents) : 0;
      refunds += l.feeRefundedCents;
      sumFeeOverGross += retained;
      grossForAverage += g;
      payingOrgs.add(l.organizationId);
    }
  }

  const averageFeeBps =
    grossForAverage > 0
      ? Math.round((sumFeeOverGross * 10000) / grossForAverage)
      : 0;

  return {
    gmvCents: gmv,
    platformRevenueCents: revenue,
    netCents: net,
    refundsCents: refunds,
    averageFeeBps,
    payingOrgCount: payingOrgs.size,
    mrrCents: 0,
    activeSubscriptionCount: 0,
  };
}

/** Calcula MRR (receita recorrente mensal) a partir de subscrições ativas. */
export function computeMonthlyRecurringRevenue(input: {
  activeMonthlyPriceCents: number[];
}): { mrrCents: number; count: number } {
  const prices = input.activeMonthlyPriceCents ?? [];
  let mrr = 0;
  for (const p of prices) {
    if (!Number.isSafeInteger(p) || p < 0) continue;
    mrr += p;
  }
  return { mrrCents: mrr, count: prices.length };
}

/**
 * Formatação em Basis Points por percentagem (reutiliza implementação
 * existente do PlatformFeeService para consistência).
 */
export function formatFeeRate(bps: number): string {
  const c = computePlatformFee({ grossCents: bps, basisPoints: 100 });
  const intPart = String(Math.floor(c.grossCents === bps ? bps / 100 : bps / 100));
  return `${intPart},${String(bps % 100).padStart(2, "0")}%`;
}
