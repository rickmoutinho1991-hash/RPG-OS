import { roundToCurrency } from "./QuoteCalculationService";

export interface WithholdingTaxInput {
  grossAmount: number;
  ratePercentage: number; // e.g. 11.5, 16.5, 25
}

export function calculateWithholdingTax(input: WithholdingTaxInput): {
  withholdingAmount: number;
  payableAmount: number;
} {
  const withholdingAmount = roundToCurrency(
    input.grossAmount * (input.ratePercentage / 100),
  );
  const payableAmount = roundToCurrency(
    Math.max(0, input.grossAmount - withholdingAmount),
  );

  return {
    withholdingAmount,
    payableAmount,
  };
}

export function calculateInvoiceBalance(
  total: number,
  amountPaid: number,
): {
  balanceDue: number;
  isPaid: boolean;
  isPartiallyPaid: boolean;
} {
  const cleanTotal = roundToCurrency(total);
  const cleanPaid = roundToCurrency(amountPaid);
  const balanceDue = roundToCurrency(Math.max(0, cleanTotal - cleanPaid));

  return {
    balanceDue,
    isPaid: balanceDue === 0 && cleanTotal > 0,
    isPartiallyPaid: cleanPaid > 0 && balanceDue > 0,
  };
}
