import { describe, it, expect } from "vitest";
import {
  REVENUE_PLANS,
  resolveRevenuePlan,
  revenuePlanFee,
  revenuePlanFeeBps,
  assertNonNegativeCents,
  validateFeeSplit,
  proportionalFeeRefund,
  sumCents,
} from "../../revenue";

describe("REVENUE_PLANS (7C)", () => {
  it("define FREE/STARTER/PRO/BUSINESS/ENTERPRISE com fees centrais", () => {
    expect(REVENUE_PLANS.FREE.platformFeeBps).toBe(300);
    expect(REVENUE_PLANS.STARTER.platformFeeBps).toBe(250);
    expect(REVENUE_PLANS.PRO.platformFeeBps).toBe(200);
    expect(REVENUE_PLANS.BUSINESS.platformFeeBps).toBe(150);
    expect(REVENUE_PLANS.ENTERPRISE.platformFeeBps).toBe(100);
  });

  it("FREE tem mensalidade zero", () => {
    expect(REVENUE_PLANS.FREE.monthlyPriceCents).toBe(0);
  });

  it("resolve plano com ID desconhecido cai em FREE (seguro)", () => {
    expect(resolveRevenuePlan("BOGUS").id).toBe("FREE");
    expect(resolveRevenuePlan(undefined).id).toBe("FREE");
    expect(resolveRevenuePlan("PRO").id).toBe("PRO");
  });

  it("taxa de cada plano é a única fonte de cálculo de fee", () => {
    expect(revenuePlanFeeBps("PRO")).toBe(200);
    expect(revenuePlanFee(100000, "PRO")).toBe(2000); // 1000€ @2% = 20€
    expect(revenuePlanFee(100000, "ENTERPRISE")).toBe(1000); // 1000€ @1% = 10€
    expect(revenuePlanFee(100000, "FREE")).toBe(3000);
  });
});

describe("Money safety (7D)", () => {
  it("rejeita NaN, Infinity, floats e negativos", () => {
    expect(assertNonNegativeCents(NaN).ok).toBe(false);
    expect(assertNonNegativeCents(Infinity).ok).toBe(false);
    expect(assertNonNegativeCents(-1).ok).toBe(false);
    expect(assertNonNegativeCents(1.5).ok).toBe(false);
    expect(assertNonNegativeCents("10" as unknown as number).ok).toBe(false);
    expect(assertNonNegativeCents(100).ok).toBe(true);
    expect(assertNonNegativeCents(0).ok).toBe(true);
  });

  it("valida invariante gross = fee + net", () => {
    expect(
      validateFeeSplit({ grossCents: 100000, feeCents: 2500, netCents: 97500 })
        .ok,
    ).toBe(true);
    expect(
      validateFeeSplit({ grossCents: 100000, feeCents: 2500, netCents: 96000 })
        .ok,
    ).toBe(false);
    expect(
      validateFeeSplit({ grossCents: 100, feeCents: 200, netCents: -100 }).ok,
    ).toBe(false);
  });

  it("fee nunca excede o bruto", () => {
    expect(
      validateFeeSplit({ grossCents: 1000, feeCents: 2000, netCents: 0 }).ok,
    ).toBe(false);
  });

  it("amostras monetárias validadas garantem gross = fee + net", () => {
    const samples = [
      { g: 0, b: 300 },
      { g: 1, b: 100 },
      { g: 99, b: 150 },
      { g: 100, b: 200 },
      { g: 99999, b: 250 },
      { g: 1000000, b: 150 },
      { g: 100000000, b: 100 },
    ];
    for (const s of samples) {
      const fee = Math.round((s.g * s.b) / 10000);
      const net = s.g - fee;
      expect(
        validateFeeSplit({
          grossCents: s.g,
          feeCents: fee,
          netCents: net,
          basisPoints: s.b,
        }).ok,
      ).toBe(true);
      expect(fee + net).toBe(s.g);
      expect(fee).toBeGreaterThanOrEqual(0);
      expect(fee).toBeLessThanOrEqual(s.g);
    }
  });

  it("proportionalFeeRefund devolve 100% da fee em refund total", () => {
    const r = proportionalFeeRefund({
      totalCents: 100000,
      totalFeeCents: 2500,
      refundCents: 100000,
    });
    expect(r).toEqual({ ok: true, cents: 2500 });
  });

  it("proportionalFeeRefund parcial é proporcional e não-negativo", () => {
    // 50% de refund sobre 1000€ com fee 25€ → ~12,50€ de fee devolvida
    const r = proportionalFeeRefund({
      totalCents: 100000,
      totalFeeCents: 2500,
      refundCents: 50000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cents).toBe(1250);
  });

  it("proportionalFeeRefund rejeita refund > total", () => {
    expect(
      proportionalFeeRefund({
        totalCents: 1000,
        totalFeeCents: 10,
        refundCents: 2000,
      }).ok,
    ).toBe(false);
  });

  it("sumCents soma inteiros com segurança", () => {
    expect(sumCents([100, 200, 300])).toEqual({ ok: true, cents: 600 });
    expect(sumCents([NaN]).ok).toBe(false);
    expect(sumCents([-5]).ok).toBe(false);
  });
});
