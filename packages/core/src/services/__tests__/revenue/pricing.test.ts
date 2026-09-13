import { describe, it, expect } from "vitest";
import {
  applyPricingChange,
  commissionForGross,
  validateCommissionBps,
  validateMonthlyPriceCents,
  isPricingField,
  type PricingChangeIntent,
} from "../../revenue/pricing";
import { revenuePlanFeeBps, revenuePlanFee, planLimit } from "../../revenue/plans";

describe("Pricing & comissão configurável (FASE 8)", () => {
  it("valida comissão dentro do domínio 1%–3% (100..300 bps)", () => {
    expect(validateCommissionBps(100).ok).toBe(true);
    expect(validateCommissionBps(150).ok).toBe(true);
    expect(validateCommissionBps(300).ok).toBe(true);
    expect(validateCommissionBps(99).ok).toBe(false);
    expect(validateCommissionBps(301).ok).toBe(false);
    expect(validateCommissionBps(250.5).ok).toBe(false);
    expect(validateCommissionBps(NaN).ok).toBe(false);
  });

  it("valida mensalidade em centavos inteiros", () => {
    expect(validateMonthlyPriceCents(0).ok).toBe(true);
    expect(validateMonthlyPriceCents(2490).ok).toBe(true);
    expect(validateMonthlyPriceCents(-1).ok).toBe(false);
    expect(validateMonthlyPriceCents(12.5).ok).toBe(false);
  });

  it("gera registo de histórico para alteração de comissão", () => {
    const intent: PricingChangeIntent = {
      planId: "PRO",
      field: "commission_bps",
      newValue: 180,
      origin: "ADMIN",
      reason: "Promoção trimestral",
    };
    const res = applyPricingChange(
      { monthlyPriceCents: 2490, annualDiscountBps: 2000, platformFeeBps: 200 },
      intent,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.changed).toBe(true);
      expect(res.record).toBeDefined();
      expect(res.record?.planId).toBe("PRO");
      expect(res.record?.field).toBe("commission_bps");
      expect(res.record?.oldValue).toBe(200);
      expect(res.record?.newValue).toBe(180);
      expect(res.record?.origin).toBe("ADMIN");
      expect(res.record?.reason).toBe("Promoção trimestral");
    }
  });

  it("não gera registo quando o valor não muda (sem ruído de auditoria)", () => {
    const res = applyPricingChange(
      { monthlyPriceCents: 2490, annualDiscountBps: 2000, platformFeeBps: 200 },
      { planId: "PRO", field: "commission_bps", newValue: 200 },
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.changed).toBe(false);
  });

  it("rejeita alteração de comissão fora de 1–3%", () => {
    const res = applyPricingChange(
      { monthlyPriceCents: 2490, annualDiscountBps: 2000, platformFeeBps: 200 },
      { planId: "PRO", field: "commission_bps", newValue: 400 },
    );
    expect(res.ok).toBe(false);
  });

  it("calcula comissão em centavos exatos com invariante gross=fee+net", () => {
    // 200 bps = 2%
    const r = commissionForGross({ grossCents: 100000, commissionBps: 200 });
    expect(r.feeCents).toBe(2000);
    expect(r.netCents).toBe(98000);
    expect(r.feeCents + r.netCents).toBe(100000);
    // 1 € = 100 c, 2% = 2c
    expect(commissionForGross({ grossCents: 100, commissionBps: 200 }).feeCents).toBe(2);
  });

  it("comissão de plano nunca excede o bruto (fee <= gross)", () => {
    for (const plan of ["FREE", "STARTER", "PRO", "BUSINESS", "ENTERPRISE"] as const) {
      const fee = revenuePlanFee(1000, plan);
      expect(fee).toBeLessThanOrEqual(1000);
      expect(fee).toBeGreaterThanOrEqual(0);
    }
    // FREE = 3% de 1000c = 30c; ENTERPRISE = 1% = 10c
    expect(revenuePlanFee(1000, "FREE")).toBe(30);
    expect(revenuePlanFee(1000, "ENTERPRISE")).toBe(10);
  });

  it("comissão por plano decresce do FREE para o ENTERPRISE", () => {
    const rates = (["FREE", "STARTER", "PRO", "BUSINESS", "ENTERPRISE"] as const).map(
      (p) => revenuePlanFeeBps(p),
    );
    expect(rates[0]).toBe(300);
    expect(rates[1]).toBe(250);
    expect(rates[2]).toBe(200);
    expect(rates[3]).toBe(150);
    expect(rates[4]).toBe(100);
    // estritamente decrescente
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeLessThan(rates[i - 1]);
  });

  it("expõe limites configuráveis por plano (ilimitado = Infinity)", () => {
    expect(planLimit("FREE", "maxUsers")).toBe(1);
    expect(planLimit("STARTER", "maxCompanies")).toBe(3);
    expect(planLimit("BUSINESS", "maxProjects")).toBe(500);
    expect(planLimit("ENTERPRISE", "maxUsers")).toBe(Infinity);
    expect(planLimit("FREE", "maxCompanies")).toBe(1);
  });

  it("identifica campos de pricing", () => {
    expect(isPricingField("monthly_price")).toBe(true);
    expect(isPricingField("commission_bps")).toBe(true);
    expect(isPricingField("nope")).toBe(false);
  });
});
