import { describe, it, expect } from "vitest";
import {
  calculateWithholdingTax,
  calculateInvoiceBalance,
} from "../FinancialCalculationService";

describe("Cálculos Financeiros e Saldos de Faturas", () => {
  it("deve calcular retenção na fonte (IRS / IRC)", () => {
    const res = calculateWithholdingTax({
      grossAmount: 1000,
      ratePercentage: 25, // Taxa liberatória standard
    });

    expect(res.withholdingAmount).toBe(250);
    expect(res.payableAmount).toBe(750);
  });

  it("deve calcular saldo pendente e estados de liquidação de fatura", () => {
    const unpaid = calculateInvoiceBalance(500, 0);
    expect(unpaid.balanceDue).toBe(500);
    expect(unpaid.isPaid).toBe(false);
    expect(unpaid.isPartiallyPaid).toBe(false);

    const partial = calculateInvoiceBalance(500, 200);
    expect(partial.balanceDue).toBe(300);
    expect(partial.isPaid).toBe(false);
    expect(partial.isPartiallyPaid).toBe(true);

    const fullyPaid = calculateInvoiceBalance(500, 500);
    expect(fullyPaid.balanceDue).toBe(0);
    expect(fullyPaid.isPaid).toBe(true);
    expect(fullyPaid.isPartiallyPaid).toBe(false);
  });
});
