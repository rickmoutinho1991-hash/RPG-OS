import { QuoteItem, QuoteVatSummary } from "../types/quote";

export interface CalculateQuoteTotalsInput {
  items: Array<Omit<QuoteItem, "netAmount" | "vatAmount" | "totalAmount">>;
  globalDiscountPercentage?: number;
}

export interface CalculatedQuoteTotals {
  items: QuoteItem[];
  subtotal: number;
  discountPercentage: number;
  discountAmount: number;
  vatSummary: QuoteVatSummary[];
  totalVat: number;
  total: number;
}

export function roundToCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function calculateQuoteItemAmounts(
  item: Omit<QuoteItem, "netAmount" | "vatAmount" | "totalAmount">,
): QuoteItem {
  const basePrice = item.quantity * item.unitPrice;
  const itemDiscount = basePrice * ((item.discountPercentage || 0) / 100);
  const netAmount = roundToCurrency(Math.max(0, basePrice - itemDiscount));
  const vatAmount = roundToCurrency(netAmount * ((item.vatRate || 0) / 100));
  const totalAmount = roundToCurrency(netAmount + vatAmount);

  return {
    ...item,
    netAmount,
    vatAmount,
    totalAmount,
  };
}

export function calculateQuoteTotals(
  input: CalculateQuoteTotalsInput,
): CalculatedQuoteTotals {
  const calculatedItems = input.items.map(calculateQuoteItemAmounts);

  const subtotal = roundToCurrency(
    calculatedItems.reduce((sum, item) => sum + item.netAmount, 0),
  );

  const discountPercentage = input.globalDiscountPercentage || 0;
  const discountAmount = roundToCurrency(subtotal * (discountPercentage / 100));
  const discountedSubtotal = Math.max(0, subtotal - discountAmount);

  // Agrupamento de IVA por taxa
  const vatMap = new Map<number, { base: number; vat: number }>();

  for (const item of calculatedItems) {
    const rate = item.vatRate || 0;
    const current = vatMap.get(rate) || { base: 0, vat: 0 };
    
    // Se houver desconto global, aplica proporcionalmente à base
    const itemRatio = subtotal > 0 ? item.netAmount / subtotal : 0;
    const adjustedBase = discountPercentage > 0 ? discountedSubtotal * itemRatio : item.netAmount;
    const adjustedVat = roundToCurrency(adjustedBase * (rate / 100));

    current.base += adjustedBase;
    current.vat += adjustedVat;
    vatMap.set(rate, current);
  }

  const vatSummary: QuoteVatSummary[] = Array.from(vatMap.entries())
    .map(([rate, values]) => {
      const baseAmount = roundToCurrency(values.base);
      const vatAmount = roundToCurrency(values.vat);
      return {
        vatRate: rate,
        baseAmount,
        vatAmount,
        totalAmount: roundToCurrency(baseAmount + vatAmount),
      };
    })
    .sort((a, b) => b.vatRate - a.vatRate);

  const totalVat = roundToCurrency(
    vatSummary.reduce((sum, v) => sum + v.vatAmount, 0),
  );

  const total = roundToCurrency(discountedSubtotal + totalVat);

  return {
    items: calculatedItems,
    subtotal,
    discountPercentage,
    discountAmount,
    vatSummary,
    totalVat,
    total,
  };
}
