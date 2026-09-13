import { describe, it, expect } from "vitest";
import { computeBusinessMetrics, emptyBusinessMetrics } from "../../revenue/metrics";
import type { LedgerLine } from "../../revenue/ledger";

function line(p: Partial<LedgerLine>): LedgerLine {
  return {
    id: p.id ?? "l",
    organizationId: p.organizationId ?? "orgA",
    grossCents: p.grossCents ?? 0,
    feeCents: p.feeCents ?? 0,
    netCents: p.netCents ?? 0,
    feeCollectedCents: p.feeCollectedCents ?? p.feeCents ?? 0,
    basisPoints: p.basisPoints ?? 0,
    feeRefundedCents: p.feeRefundedCents ?? 0,
    planId: p.planId,
    sourceType: p.sourceType,
    companyId: p.companyId,
    status: p.status ?? "COLLECTED",
    createdAt: p.createdAt ?? "2026-08-01T00:00:00.000Z",
    updatedAt: p.updatedAt ?? "2026-08-01T00:00:00.000Z",
  };
}

describe("Business Metrics (FASE 8)", () => {
  it("devolve todos os valores a zero com dados vazios", () => {
    const m = !!emptyBusinessMetrics && computeBusinessMetrics({
      lines: [],
      activeSubscriptions: [],
      previousGmvCents: 0,
      churn: { startCount: 0, cancelledCount: 0 },
    });
    expect(m.gmvCents).toBe(0);
    expect(m.commissionCents).toBe(0);
    expect(m.subscriptionsMrrCents).toBe(0);
    expect(m.subscriptionsArrCents).toBe(0);
    expect(m.arpuCents).toBe(0);
    expect(m.byCompany).toHaveLength(0);
    expect(m.byPlan).toHaveLength(0);
    expect(m.byService).toHaveLength(0);
  });

  it("calcula GMV, comissão, líquido e reembolsos com dedução de refund", () => {
    const lines = [
      line({ id: "a", organizationId: "orgA", grossCents: 10000, feeCents: 200, netCents: 9800, feeCollectedCents: 200, basisPoints: 200, planId: "PRO", sourceType: "PAYMENT", status: "COLLECTED" }),
      line({ id: "b", organizationId: "orgA", grossCents: 5000, feeCents: 100, netCents: 4900, feeCollectedCents: 100, feeRefundedCents: 50, basisPoints: 200, planId: "PRO", sourceType: "PAYMENT", status: "PARTIALLY_REFUNDED" }),
      line({ id: "c", organizationId: "orgB", grossCents: 1000, feeCents: 30, netCents: 970, feeCollectedCents: 30, basisPoints: 300, planId: "FREE", sourceType: "SUBSCRIPTION", status: "COLLECTED" }),
    ];
    const m = computeBusinessMetrics({
      lines,
      activeSubscriptions: [
        { planId: "PRO", billingInterval: "MONTH" },
        { planId: "FREE", billingInterval: "MONTH" },
      ],
      previousGmvCents: 10000,
      churn: { startCount: 5, cancelledCount: 1 },
    });
    expect(m.gmvCents).toBe(16000);
    // comissão retida = (200) + (100-50) + (30) = 280
    expect(m.commissionCents).toBe(280);
    expect(m.refundsCents).toBe(50);
    // receita bruta = comissão + refunds = 330
    expect(m.grossRevenueCents).toBe(330);
    // MRR: PRO=4900, FREE=0
    expect(m.subscriptionsMrrCents).toBe(4900);
    expect(m.subscriptionsArrCents).toBe(58800);
    // clientes pagantes = orgs com comissão retida > 0 = 2
    expect(m.payingCustomerCount).toBe(2);
    expect(m.arpuCents).toBe(Math.floor(4900 / 2));
    // churn 1/5 = 2000 bps
    expect(m.churnRateBps).toBe(2000);
    // crescimento = 16000 - 10000 = 6000, +60%
    expect(m.growthCents).toBe(6000);
    expect(m.growthRateBps).toBe(6000);
  });

  it("desagrega por empresa, plano e serviço", () => {
    const lines = [
      line({ id: "a", organizationId: "orgA", companyId: "co1", grossCents: 10000, feeCents: 200, netCents: 9800, feeCollectedCents: 200, basisPoints: 200, planId: "PRO", sourceType: "PAYMENT", status: "COLLECTED" }),
      line({ id: "b", organizationId: "orgA", companyId: "co2", grossCents: 5000, feeCents: 150, netCents: 4850, feeCollectedCents: 150, basisPoints: 300, planId: "FREE", sourceType: "SUBSCRIPTION", status: "COLLECTED" }),
    ];
    const m = computeBusinessMetrics({
      lines,
      activeSubscriptions: [],
      previousGmvCents: 0,
      churn: { startCount: 0, cancelledCount: 0 },
    });
    expect(m.byCompany).toHaveLength(2);
    expect(m.byCompany[0].grossCents).toBe(10000);
    expect(m.byCompany[1].grossCents).toBe(5000);
    expect(m.byPlan.map((p) => p.key).sort()).toEqual(["FREE", "PRO"]);
    expect(m.byService.map((s) => s.key).sort()).toEqual(["PAYMENT", "SUBSCRIPTION"]);
  });
});
