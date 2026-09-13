import { describe, it, expect } from "vitest";
import {
  calculateQuoteItemAmounts,
  calculateQuoteTotals,
  roundToCurrency,
} from "../QuoteCalculationService";

describe("Serviço de Cálculo de Orçamentos e IVA", () => {
  it("deve calcular valores de linha com desconto e IVA arredondados", () => {
    const item = calculateQuoteItemAmounts({
      position: 1,
      itemType: "SERVICE",
      description: "Pintura de Interiores",
      unit: "m2",
      quantity: 50,
      unitPrice: 12.5,
      discountPercentage: 10,
      vatRate: 23,
    });

    // 50 * 12.5 = 625. Desconto 10% = 62.5. Net = 562.50
    expect(item.netAmount).toBe(562.5);
    // IVA 23% de 562.5 = 129.375 -> 129.38
    expect(item.vatAmount).toBe(129.38);
    // Total = 562.5 + 129.38 = 691.88
    expect(item.totalAmount).toBe(691.88);
  });

  it("deve calcular o resumo total do orçamento com múltiplas taxas de IVA", () => {
    const quote = calculateQuoteTotals({
      items: [
        {
          position: 1,
          itemType: "MATERIAL",
          description: "Cimento e Areia",
          unit: "sc",
          quantity: 10,
          unitPrice: 5.0,
          vatRate: 23,
        },
        {
          position: 2,
          itemType: "SERVICE",
          description: "Mão-de-Obra de Reabilitação",
          unit: "h",
          quantity: 20,
          unitPrice: 25.0,
          vatRate: 6,
        },
      ],
      globalDiscountPercentage: 0,
    });

    expect(quote.subtotal).toBe(550.0); // 50 + 500
    expect(quote.vatSummary).toHaveLength(2);
    expect(quote.totalVat).toBe(41.5); // 11.50 (23% de 50) + 30.00 (6% de 500)
    expect(quote.total).toBe(591.5);
  });

  it("deve lidar com arredondamento monetário preciso", () => {
    expect(roundToCurrency(10.555)).toBe(10.56);
    expect(roundToCurrency(10.554)).toBe(10.55);
    expect(roundToCurrency(0)).toBe(0);
  });
});
