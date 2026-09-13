import { describe, it, expect } from "vitest";
import { computeRevenueSimulator } from "../../revenue/simulator";

describe("Revenue Simulator (FASE 8)", () => {
  const companies = [
    { name: "Empresa A", planId: "PRO" as const, billingInterval: "MONTH" as const, monthlyGmvCents: 1000000 },
    { name: "Empresa B", planId: "FREE" as const, billingInterval: "MONTH" as const, monthlyGmvCents: 500000 },
  ];

  it("calcula MRR estrutural (comissão + subscrição) sem crescimento/churn", () => {
    const r = computeRevenueSimulator({
      companies,
      growthRateBpsPerMonth: 0,
      monthlyChurnBps: 0,
      months: 12,
    });
    // MRR comissão: A=2%*1M=20000c; B=3%*500k=15000c -> 35000c
    expect(r.commissionMrrCents).toBe(35000);
    // MRR subscrição: A=4900c; B=0 -> 4900c
    expect(r.subscriptionMrrCents).toBe(4900);
    expect(r.totalMrrCents).toBe(39900);
    // sem crescimento/churn: 12 meses * 39900 = 478800
    expect(r.annualRevenueCents).toBe(39900 * 12);
    for (const point of r.months) {
      expect(point.totalRevenueCents).toBe(39900);
      expect(point.activeCompanies).toBe(2);
    }
    // comissão média ponderada = (200*1M + 300*500k)/1.5M = 233 (arredondado)
    expect(r.averageCommissionBps).toBe(233);
  });

  it("aplica crescimento do GMV ao longo dos meses", () => {
    const r = computeRevenueSimulator({
      companies,
      growthRateBpsPerMonth: 1000, // +10%/mês
      monthlyChurnBps: 0,
      months: 3,
    });
    expect(r.months[0].gmvCents).toBe(1500000);
    // +10% -> 1650000
    expect(r.months[1].gmvCents).toBe(1650000);
    // +10% -> 1815000
    expect(r.months[2].gmvCents).toBe(1815000);
    expect(r.months[2].totalRevenueCents).toBeGreaterThan(r.months[0].totalRevenueCents);
  });

  it("aplica churn reduzindo o número de empresas ativas", () => {
    const single = [{ name: "X", planId: "PRO" as const, billingInterval: "MONTH" as const, monthlyGmvCents: 100000 }];
    const r = computeRevenueSimulator({
      companies: single,
      growthRateBpsPerMonth: 0,
      monthlyChurnBps: 5000, // 50% churn
      months: 3,
    });
    expect(r.startingCompanies).toBe(1);
    expect(r.months[0].activeCompanies).toBe(1);
    expect(r.months[1].activeCompanies).toBe(0);
    // empresa saiu -> receita do mês 2 = 0
    expect(r.months[1].totalRevenueCents).toBe(0);
  });

  it("devolve zero quando não há empresas", () => {
    const r = computeRevenueSimulator({
      companies: [],
      growthRateBpsPerMonth: 0,
      monthlyChurnBps: 0,
      months: 12,
    });
    expect(r.totalMrrCents).toBe(0);
    expect(r.annualRevenueCents).toBe(0);
    expect(r.months).toHaveLength(12);
  });

  it("default de 12 meses quando não fornecido", () => {
    const r = computeRevenueSimulator({
      companies: [],
      growthRateBpsPerMonth: 0,
      monthlyChurnBps: 0,
    });
    expect(r.months).toHaveLength(12);
  });
});
