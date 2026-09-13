import { describe, it, expect } from "vitest";
import {
  calculateSocialSecurity,
  calculateVatSettlement,
} from "../fiscalCalculations";

describe("Cálculos Fiscais Portugueses (Segurança Social & IVA)", () => {
  describe("Segurança Social / TSU", () => {
    it("deve calcular corretamente a TSU para conta de outrem (23.75% entidade empregadora + 11% trabalhador)", () => {
      const res = calculateSocialSecurity({
        taxpayerType: "EMPLOYER",
        amount: 1000,
      });

      expect(res.employerAmount).toBe(237.5);
      expect(res.employeeAmount).toBe(110.0);
      expect(res.totalSocialSecurityDue).toBe(347.5);
      expect(res.netSalaryCalculated).toBe(890.0);
    });

    it("deve calcular encargos para recibos verdes (70% do rendimento x 21.4%)", () => {
      const res = calculateSocialSecurity({
        taxpayerType: "SOLE_TRADER_RECIBOS_VERDES",
        amount: 1000,
      });

      // 1000 * 0.7 = 700; 700 * 0.214 = 149.80
      expect(res.totalSocialSecurityDue).toBe(149.8);
      expect(res.employerAmount).toBe(0);
      expect(res.employeeAmount).toBe(0);
    });

    it("deve tratar valor zero ou negativo sem crashar", () => {
      const res = calculateSocialSecurity({
        taxpayerType: "EMPLOYER",
        amount: -500,
      });

      expect(res.totalSocialSecurityDue).toBe(0);
    });
  });

  describe("Apuramento Periódico de IVA", () => {
    it("deve calcular IVA liquidado, dedutível e saldo a pagar à AT", () => {
      const res = calculateVatSettlement({
        periodLabel: "1.º Trimestre 2026",
        invoicesIssued: [
          { netAmount: 1000, vatRate: 23 }, // 230 IVA
          { netAmount: 500, vatRate: 6 }, // 30 IVA
        ],
        expensesIncurred: [
          { netAmount: 400, vatRate: 23 }, // 92 IVA
        ],
      });

      expect(res.vatCollected23).toBe(230);
      expect(res.vatCollected6).toBe(30);
      expect(res.totalVatCollected).toBe(260);
      expect(res.vatDeductible23).toBe(92);
      expect(res.totalVatDeductible).toBe(92);
      expect(res.netVatPayable).toBe(168); // 260 - 92 = 168
    });

    it("deve apresentar saldo a crédito quando IVA dedutível excede IVA liquidado", () => {
      const res = calculateVatSettlement({
        periodLabel: "2.º Trimestre 2026",
        invoicesIssued: [{ netAmount: 100, vatRate: 23 }], // 23 IVA
        expensesIncurred: [{ netAmount: 1000, vatRate: 23 }], // 230 IVA
      });

      expect(res.netVatPayable).toBe(-207);
    });
  });
});
