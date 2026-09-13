/**
 * RPG-OS — Revenue Simulator (FASE 8, rule 7).
 *
 * Modelo de projeção PURO e determinístico: dado um conjunto de empresas com
 * plano + volume de GMV mensal, um ritmo de crescimento e de churn, projeta a
 * receita mensal/anual do RPG-OS (comissão transacional + subscrição).
 *
 * Tudo em CENTAVOS inteiros; crescimento/churn aplicados com aritmética de
 * inteiros (arredondamentos determinísticos). Nenhuma escrita/BD.
 */

import {
  planMonthlyEquivalentCents,
  revenuePlanFeeBps,
  type BillingInterval,
  type RevenuePlanId,
} from "./plans";
import { isRevenuePlanId } from "./plans";

export interface SimulatorCompany {
  name: string;
  planId: RevenuePlanId;
  billingInterval: BillingInterval;
  /** Volume bruto de pagamentos processado mensalmente (CENTAVOS). */
  monthlyGmvCents: number;
}

export interface SimulatorInput {
  companies: ReadonlyArray<SimulatorCompany>;
  /** Crescimento mensal do GMV por empresa em bps (ex.: 200 = 2%/mês). */
  growthRateBpsPerMonth: number;
  /** Churn mensal de empresas em bps (ex.: 300 = 3%/mês). */
  monthlyChurnBps: number;
  /** Horizonte de projeção em meses (default 12). */
  months?: number;
}

export interface SimulatorMonthPoint {
  month: number;
  activeCompanies: number;
  gmvCents: number;
  commissionCents: number;
  subscriptionCents: number;
  totalRevenueCents: number;
}

export interface SimulatorResult {
  months: SimulatorMonthPoint[];
  startingCompanies: number;
  commissionMrrCents: number;
  subscriptionMrrCents: number;
  totalMrrCents: number;
  /** Receita total do ano 1 (soma dos meses projetados). */
  annualRevenueCents: number;
  /** Receita média mensal do ano 1. */
  averageMonthlyRevenueCents: number;
  /** Comissão média ponderada (bps) das empresas no arranque. */
  averageCommissionBps: number;
}

export function computeRevenueSimulator(
  input: SimulatorInput,
): SimulatorResult {
  const months = Number.isSafeInteger(input.months) && input.months! > 0
    ? input.months!
    : 12;
  const growthBps = Number.isSafeInteger(input.growthRateBpsPerMonth)
    ? Math.max(0, input.growthRateBpsPerMonth)
    : 0;
  const churnBps =
    Number.isSafeInteger(input.monthlyChurnBps)
      ? Math.min(10000, Math.max(0, input.monthlyChurnBps))
      : 0;

  const companies = input.companies ?? [];
  const startCompanies = companies.length;

  // Estado por empresa (mutable durante a simulação, mas tudo inteiro).
  const state = companies.map((c) => {
    const planId = isRevenuePlanId(c.planId) ? c.planId : "FREE";
    const gmv = Number(c.monthlyGmvCents);
    return {
      active: true,
      planId,
      interval: c.billingInterval,
      monthlyGmvCents: Number.isSafeInteger(gmv) && gmv >= 0 ? gmv : 0,
    };
  });

  const points: SimulatorMonthPoint[] = [];
  let annual = 0;

  for (let m = 1; m <= months; m++) {
    let activeCount = 0;
    let gmvSum = 0;
    let commissionSum = 0;
    let subscriptionSum = 0;

    for (const s of state) {
      if (!s.active) continue;
      activeCount += 1;
      // Utiliza o GMV base deste período (o crescimento é aplicado no fim
      // do mês, para que o mês 1 reflita o volume atual sem crescimento).
      const gmv = s.monthlyGmvCents;
      const bps = revenuePlanFeeBps(s.planId);
      const fee = Math.round((gmv * bps) / 10000);
      const subMrr = planMonthlyEquivalentCents(s.planId, s.interval);
      gmvSum += gmv;
      commissionSum += fee;
      subscriptionSum += subMrr;
    }

    const total = commissionSum + subscriptionSum;
    annual += total;
    points.push({
      month: m,
      activeCompanies: activeCount,
      gmvCents: gmvSum,
      commissionCents: commissionSum,
      subscriptionCents: subscriptionSum,
      totalRevenueCents: total,
    });

    // Aplicar crescimento do GMV para o próximo mês (inteiro, determinístico).
    if (growthBps > 0) {
      for (const s of state) {
        if (!s.active) continue;
        s.monthlyGmvCents = Math.round(
          (s.monthlyGmvCents * (10000 + growthBps)) / 10000,
        );
      }
    }

    // Aplicar churn ao fim do mês (remove algumas empresas).
    if (churnBps > 0 && m < months) {
      const toKeep = Math.floor(
        (activeCount * (10000 - churnBps)) / 10000,
      );
      let keepCount = 0;
      for (const s of state) {
        if (!s.active) continue;
        if (keepCount < toKeep) keepCount += 1;
        else s.active = false;
      }
    }
  }

  // MRR estrutural (sem crescimento/churn) — mês base.
  let commissionMrr = 0;
  let subscriptionMrr = 0;
  let avgCommissionNumerator = 0;
  let avgCommissionDenominator = 0;
  for (const c of companies) {
    const planId = isRevenuePlanId(c.planId) ? c.planId : "FREE";
    const gmv = Number(c.monthlyGmvCents) || 0;
    const bps = revenuePlanFeeBps(planId);
    commissionMrr += Math.round((gmv * bps) / 10000);
    subscriptionMrr += planMonthlyEquivalentCents(planId, c.billingInterval);
    avgCommissionNumerator += bps * gmv;
    avgCommissionDenominator += gmv;
  }

  const averageCommissionBps =
    avgCommissionDenominator > 0
      ? Math.round(avgCommissionNumerator / avgCommissionDenominator)
      : 0;

  return {
    months: points,
    startingCompanies: startCompanies,
    commissionMrrCents: commissionMrr,
    subscriptionMrrCents: subscriptionMrr,
    totalMrrCents: commissionMrr + subscriptionMrr,
    annualRevenueCents: annual,
    averageMonthlyRevenueCents: months > 0 ? Math.round(annual / months) : 0,
    averageCommissionBps,
  };
}
