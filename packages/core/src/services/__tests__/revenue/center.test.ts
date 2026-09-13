import { describe, it, expect } from "vitest";
import {
  computeRevenueCenter,
  computeMonthlyRecurringRevenue,
  createPendingLedgerLine,
  applyLedgerCollect,
  applyLedgerRefund,
  type LedgerLine,
} from "../../revenue";

function line(id: string, orgId: string, gross: number, fee: number, status: LedgerLine["status"]): LedgerLine {
  return createPendingLedgerLine({
    id,
    organizationId: orgId,
    grossCents: gross,
    feeCents: fee,
    netCents: gross - fee,
    basisPoints: Math.round((fee * 10000) / gross),
  });
}

describe("Revenue Center (7I)", () => {
  it("com zero dados devolve tudo a zero (nunca NaN)", () => {
    const m = computeRevenueCenter([]);
    expect(m.gmvCents).toBe(0);
    expect(m.platformRevenueCents).toBe(0);
    expect(m.netCents).toBe(0);
    expect(m.refundsCents).toBe(0);
    expect(m.averageFeeBps).toBe(0);
    expect(m.payingOrgCount).toBe(0);
    expect(Number.isNaN(m.gmvCents)).toBe(false);
  });

  it("calcula GMV, revenue e taxa média a partir de linhas recolhidas", () => {
    const a = applyLedgerCollect(line("a", "orgA", 100000, 2500, "PENDING"));
    const aL = a.ok && a.line ? a.line : line("a", "orgA", 100000, 2500, "COLLECTED");
    const b = applyLedgerCollect(line("b", "orgA", 50000, 1000, "PENDING"));
    const bL = b.ok && b.line ? b.line : line("b", "orgA", 50000, 1000, "COLLECTED");

    const m = computeRevenueCenter([aL, bL]);
    expect(m.gmvCents).toBe(150000);
    expect(m.platformRevenueCents).toBe(3500);
    expect(m.payingOrgCount).toBe(1);
    // taxa média = 3500*10000/150000 = 233.33 → 233
    expect(m.averageFeeBps).toBe(233);
  });

  it("refunds reduzem a revenue e aumentam refundsCents", () => {
    const a = applyLedgerCollect(line("a", "orgA", 100000, 2500, "PENDING"));
    const aL = a.ok && a.line ? a.line : line("a", "orgA", 100000, 2500, "COLLECTED");
    const partial = applyLedgerRefund(aL, 50000);
    const pL = partial.ok && partial.line ? partial.line : aL;

    const m = computeRevenueCenter([pL]);
    expect(m.refundsCents).toBe(1250);
    expect(m.platformRevenueCents).toBe(1250); // 2500 - 1250
  });

  it("failadas e reversões não contribuem revenue", () => {
    const failed = line("f", "orgB", 100000, 2500, "FAILED");
    const reversed = line("r", "orgB", 100000, 2500, "REVERSED");
    const m = computeRevenueCenter([failed, reversed]);
    expect(m.platformRevenueCents).toBe(0);
    expect(m.payingOrgCount).toBe(0);
  });

  it("computeMonthlyRecurringRevenue soma planos ativos", () => {
    const r = computeMonthlyRecurringRevenue({
      activeMonthlyPriceCents: [4900, 9900, 1490],
    });
    expect(r.mrrCents).toBe(16290);
    expect(r.count).toBe(3);
    const empty = computeMonthlyRecurringRevenue({ activeMonthlyPriceCents: [] });
    expect(empty.mrrCents).toBe(0);
    expect(empty.count).toBe(0);
  });
});
