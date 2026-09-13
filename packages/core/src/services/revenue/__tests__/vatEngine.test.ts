import { describe, it, expect } from "vitest";
import {
  getVatRateInfo,
  calculateLineVat,
  calculateVat,
  calculateNetFromGross,
  calculateGrossFromNet,
  validateVatInvariants,
  calculateReverseChargeVat,
  calculateIntraCommunityVat,
  formatVatRate,
  isVatExempt,
  getAvailableVatRates,
  type VatLineItem,
  type VatRateCode,
  type VatRegion,
} from "../../revenue";

describe("Portuguese VAT/IVA Engine - Phase 10I-D", () => {
  describe("getVatRateInfo", () => {
    it("returns correct rates for CONTINENT", () => {
      expect(getVatRateInfo("NOR", "CONTINENT")).toEqual({
        code: "NOR",
        name: "Normal",
        percentage: 23,
        region: "CONTINENT",
      });
      expect(getVatRateInfo("INT", "CONTINENT")).toEqual({
        code: "INT",
        name: "Intermédia",
        percentage: 13,
        region: "CONTINENT",
      });
      expect(getVatRateInfo("RED", "CONTINENT")).toEqual({
        code: "RED",
        name: "Reduzida",
        percentage: 6,
        region: "CONTINENT",
      });
      expect(getVatRateInfo("ISE", "CONTINENT")).toEqual({
        code: "ISE",
        name: "Isento",
        percentage: 0,
        region: "CONTINENT",
      });
    });

    it("returns correct rates for AZORES", () => {
      expect(getVatRateInfo("NOR", "AZORES")).toEqual({
        code: "NOR",
        name: "Normal",
        percentage: 16,
        region: "AZORES",
      });
      expect(getVatRateInfo("INT", "AZORES")).toEqual({
        code: "INT",
        name: "Intermédia",
        percentage: 9,
        region: "AZORES",
      });
      expect(getVatRateInfo("RED", "AZORES")).toEqual({
        code: "RED",
        name: "Reduzida",
        percentage: 4,
        region: "AZORES",
      });
    });

    it("returns correct rates for MADEIRA", () => {
      expect(getVatRateInfo("NOR", "MADEIRA")).toEqual({
        code: "NOR",
        name: "Normal",
        percentage: 22,
        region: "MADEIRA",
      });
      expect(getVatRateInfo("INT", "MADEIRA")).toEqual({
        code: "INT",
        name: "Intermédia",
        percentage: 12,
        region: "MADEIRA",
      });
      expect(getVatRateInfo("RED", "MADEIRA")).toEqual({
        code: "RED",
        name: "Reduzida",
        percentage: 5,
        region: "MADEIRA",
      });
    });
  });

  describe("calculateLineVat", () => {
    it("calculates VAT for normal rate (23%) in continent", () => {
      const item: VatLineItem = {
        lineId: "line-1",
        description: "Serviço",
        quantity: 1,
        unitPriceCents: 10000, // €100
        vatRateCode: "NOR",
        vatRegion: "CONTINENT",
      };

      const result = calculateLineVat(item);

      expect(result.netAmountCents).toBe(10000);
      expect(result.vatRatePercentage).toBe(23);
      expect(result.vatAmountCents).toBe(2300); // 10000 * 23% = 2300
      expect(result.grossAmountCents).toBe(12300);
      expect(result.vatRegion).toBe("CONTINENT");
    });

    it("calculates VAT with quantity", () => {
      const item: VatLineItem = {
        lineId: "line-1",
        description: "Produto",
        quantity: 2,
        unitPriceCents: 5000, // €50 each
        vatRateCode: "NOR",
        vatRegion: "CONTINENT",
      };

      const result = calculateLineVat(item);

      expect(result.netAmountCents).toBe(10000);
      expect(result.vatAmountCents).toBe(2300);
      expect(result.grossAmountCents).toBe(12300);
    });

    it("calculates VAT with discount", () => {
      const item: VatLineItem = {
        lineId: "line-1",
        description: "Produto com desconto",
        quantity: 1,
        unitPriceCents: 10000,
        discountCents: 1000, // €10 discount
        vatRateCode: "NOR",
        vatRegion: "CONTINENT",
      };

      const result = calculateLineVat(item);

      expect(result.netAmountCents).toBe(9000);
      expect(result.vatAmountCents).toBe(2070); // 9000 * 23% = 2070
      expect(result.grossAmountCents).toBe(11070);
    });

    it("calculates VAT for reduced rate (6%)", () => {
      const item: VatLineItem = {
        lineId: "line-1",
        description: "Livro",
        quantity: 1,
        unitPriceCents: 2000,
        vatRateCode: "RED",
        vatRegion: "CONTINENT",
      };

      const result = calculateLineVat(item);

      expect(result.vatRatePercentage).toBe(6);
      expect(result.vatAmountCents).toBe(120); // 2000 * 6% = 120
      expect(result.grossAmountCents).toBe(2120);
    });

    it("calculates VAT for exempt (0%)", () => {
      const item: VatLineItem = {
        lineId: "line-1",
        description: "Serviço isento",
        quantity: 1,
        unitPriceCents: 5000,
        vatRateCode: "ISE",
        vatRegion: "CONTINENT",
        exemptionReason: "Artigo 9.º CIVA",
      };

      const result = calculateLineVat(item);

      expect(result.vatRatePercentage).toBe(0);
      expect(result.vatAmountCents).toBe(0);
      expect(result.grossAmountCents).toBe(5000);
      expect(result.exemptionReason).toBe("Artigo 9.º CIVA");
    });

    it("uses different rates for Azores", () => {
      const item: VatLineItem = {
        lineId: "line-1",
        description: "Serviço nos Açores",
        quantity: 1,
        unitPriceCents: 10000,
        vatRateCode: "NOR",
        vatRegion: "AZORES",
      };

      const result = calculateLineVat(item);

      expect(result.vatRatePercentage).toBe(16);
      expect(result.vatAmountCents).toBe(1600);
      expect(result.grossAmountCents).toBe(11600);
      expect(result.vatRegion).toBe("AZORES");
    });

    it("uses different rates for Madeira", () => {
      const item: VatLineItem = {
        lineId: "line-1",
        description: "Serviço na Madeira",
        quantity: 1,
        unitPriceCents: 10000,
        vatRateCode: "NOR",
        vatRegion: "MADEIRA",
      };

      const result = calculateLineVat(item);

      expect(result.vatRatePercentage).toBe(22);
      expect(result.vatAmountCents).toBe(2200);
      expect(result.grossAmountCents).toBe(12200);
      expect(result.vatRegion).toBe("MADEIRA");
    });

    it("defaults to CONTINENT if region not specified", () => {
      const item: VatLineItem = {
        lineId: "line-1",
        description: "Serviço",
        quantity: 1,
        unitPriceCents: 10000,
        vatRateCode: "NOR",
      };

      const result = calculateLineVat(item);

      expect(result.vatRegion).toBe("CONTINENT");
      expect(result.vatRatePercentage).toBe(23);
    });

    it("rounds VAT amounts correctly", () => {
      // 10000 * 13% = 1300 exactly
      const item1: VatLineItem = {
        lineId: "line-1",
        description: "Teste 13%",
        quantity: 1,
        unitPriceCents: 10000,
        vatRateCode: "INT",
        vatRegion: "CONTINENT",
      };
      expect(calculateLineVat(item1).vatAmountCents).toBe(1300);

      // 3333 * 23% = 766.59 -> 767
      const item2: VatLineItem = {
        lineId: "line-2",
        description: "Teste arredondamento",
        quantity: 1,
        unitPriceCents: 3333,
        vatRateCode: "NOR",
        vatRegion: "CONTINENT",
      };
      expect(calculateLineVat(item2).vatAmountCents).toBe(767);
    });

    it("never produces negative amounts", () => {
      const item: VatLineItem = {
        lineId: "line-1",
        description: "Teste",
        quantity: 1,
        unitPriceCents: -100, // invalid, should be clamped to 0
        vatRateCode: "NOR",
      };

      const result = calculateLineVat(item);

      expect(result.unitPriceCents).toBe(0);
      expect(result.netAmountCents).toBe(0);
      expect(result.vatAmountCents).toBe(0);
      expect(result.grossAmountCents).toBe(0);
    });
  });

  describe("calculateVat", () => {
    it("calculates VAT for multiple lines with different rates", () => {
      const items: VatLineItem[] = [
        {
          lineId: "line-1",
          description: "Serviço 23%",
          quantity: 1,
          unitPriceCents: 10000,
          vatRateCode: "NOR",
        },
        {
          lineId: "line-2",
          description: "Produto 6%",
          quantity: 2,
          unitPriceCents: 5000,
          vatRateCode: "RED",
        },
        {
          lineId: "line-3",
          description: "Serviço isento",
          quantity: 1,
          unitPriceCents: 3000,
          vatRateCode: "ISE",
        },
      ];

      const result = calculateVat(items);

      expect(result.lines.length).toBe(3);
      expect(result.totalNetAmountCents).toBe(23000); // 10000 + 10000 + 3000
      expect(result.totalVatAmountCents).toBe(2300 + 600); // 2300 + (10000 * 6%)
      expect(result.totalGrossAmountCents).toBe(25900);

      // Check breakdown
      expect(result.vatBreakdown.length).toBe(3);
      const norBreakdown = result.vatBreakdown.find((b) => b.vatRateCode === "NOR");
      const redBreakdown = result.vatBreakdown.find((b) => b.vatRateCode === "RED");
      const iseBreakdown = result.vatBreakdown.find((b) => b.vatRateCode === "ISE");

      expect(norBreakdown?.baseAmountCents).toBe(10000);
      expect(norBreakdown?.vatAmountCents).toBe(2300);
      expect(redBreakdown?.baseAmountCents).toBe(10000);
      expect(redBreakdown?.vatAmountCents).toBe(600);
      expect(iseBreakdown?.baseAmountCents).toBe(3000);
      expect(iseBreakdown?.vatAmountCents).toBe(0);
    });

    it("groups breakdown by rate and region", () => {
      const items: VatLineItem[] = [
        {
          lineId: "line-1",
          description: "Serviço continente",
          quantity: 1,
          unitPriceCents: 10000,
          vatRateCode: "NOR",
          vatRegion: "CONTINENT",
        },
        {
          lineId: "line-2",
          description: "Serviço Açores",
          quantity: 1,
          unitPriceCents: 10000,
          vatRateCode: "NOR",
          vatRegion: "AZORES",
        },
      ];

      const result = calculateVat(items);

      expect(result.vatBreakdown.length).toBe(2);
      const continentNor = result.vatBreakdown.find(
        (b) => b.vatRateCode === "NOR" && b.vatRegion === "CONTINENT",
      );
      const azoresNor = result.vatBreakdown.find(
        (b) => b.vatRateCode === "NOR" && b.vatRegion === "AZORES",
      );

      expect(continentNor?.vatRatePercentage).toBe(23);
      expect(azoresNor?.vatRatePercentage).toBe(16);
    });

    it("returns correct currency", () => {
      const items: VatLineItem[] = [
        { lineId: "line-1", description: "Teste", quantity: 1, unitPriceCents: 10000, vatRateCode: "NOR" },
      ];

      const result = calculateVat(items, { currency: "EUR" });
      expect(result.currency).toBe("EUR");

      const result2 = calculateVat(items); // default
      expect(result2.currency).toBe("EUR");
    });
  });

  describe("calculateNetFromGross", () => {
    it("calculates net from gross for 23%", () => {
      const gross = 12300; // €123
      const net = calculateNetFromGross(gross, "NOR", "CONTINENT");
      // 12300 / 1.23 = 10000
      expect(net).toBe(10000);
    });

    it("calculates net from gross for 6%", () => {
      const gross = 2120;
      const net = calculateNetFromGross(gross, "RED", "CONTINENT");
      // 2120 / 1.06 = 2000
      expect(net).toBe(2000);
    });

    it("returns gross for exempt", () => {
      const gross = 5000;
      const net = calculateNetFromGross(gross, "ISE", "CONTINENT");
      expect(net).toBe(5000);
    });

    it("works with regional rates", () => {
      const gross = 11600; // 10000 * 1.16
      const net = calculateNetFromGross(gross, "NOR", "AZORES");
      expect(net).toBe(10000);
    });
  });

  describe("calculateGrossFromNet", () => {
    it("calculates gross from net for 23%", () => {
      const net = 10000;
      const gross = calculateGrossFromNet(net, "NOR", "CONTINENT");
      // 10000 * 1.23 = 12300
      expect(gross).toBe(12300);
    });

    it("calculates gross from net for 6%", () => {
      const net = 2000;
      const gross = calculateGrossFromNet(net, "RED", "CONTINENT");
      // 2000 * 1.06 = 2120
      expect(gross).toBe(2120);
    });

    it("returns net for exempt", () => {
      const net = 5000;
      const gross = calculateGrossFromNet(net, "ISE", "CONTINENT");
      expect(gross).toBe(5000);
    });
  });

  describe("validateVatInvariants", () => {
    it("validates correct calculation", () => {
      const items: VatLineItem[] = [
        { lineId: "line-1", description: "Teste", quantity: 1, unitPriceCents: 10000, vatRateCode: "NOR" },
      ];
      const result = calculateVat(items);
      const validation = validateVatInvariants(result);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it("detects gross mismatch", () => {
      const invalidResult = {
        lines: [],
        vatBreakdown: [],
        totalNetAmountCents: 10000,
        totalVatAmountCents: 2300,
        totalGrossAmountCents: 13000, // wrong, should be 12300
        currency: "EUR",
      };
      const validation = validateVatInvariants(invalidResult);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toContain("Gross mismatch");
    });

    it("detects VAT breakdown mismatch", () => {
      const invalidResult = {
        lines: [],
        vatBreakdown: [{ vatRateCode: "NOR" as VatRateCode, vatRatePercentage: 23, vatRegion: "CONTINENT" as VatRegion, baseAmountCents: 10000, vatAmountCents: 2000 }],
        totalNetAmountCents: 10000,
        totalVatAmountCents: 2300,
        totalGrossAmountCents: 12300,
        currency: "EUR",
      };
      const validation = validateVatInvariants(invalidResult);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toContain("VAT breakdown total");
    });

    it("detects negative amounts", () => {
      const invalidResult = {
        lines: [{ 
          lineId: "line-1", 
          description: "Test", 
          quantity: 1, 
          unitPriceCents: 100, 
          discountCents: 0, 
          netAmountCents: -100, 
          vatRateCode: "NOR" as "NOR",
          vatRatePercentage: 23,
          vatAmountCents: 0, 
          grossAmountCents: -100,
          vatRegion: "CONTINENT" as "CONTINENT",
        }],
        vatBreakdown: [],
        totalNetAmountCents: -100,
        totalVatAmountCents: 0,
        totalGrossAmountCents: -100,
        currency: "EUR",
      };
      const validation = validateVatInvariants(invalidResult);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("negative"))).toBe(true);
    });
  });

  describe("calculateReverseChargeVat", () => {
    it("calculates reverse charge VAT for intra-community", () => {
      const result = calculateReverseChargeVat(10000, "NOR", "CONTINENT");
      expect(result.vatAmountCents).toBe(2300);
      expect(result.vatRatePercentage).toBe(23);
      expect(result.vatRegion).toBe("CONTINENT");
    });

    it("calculates reverse charge VAT for different regions", () => {
      const result = calculateReverseChargeVat(10000, "NOR", "MADEIRA");
      expect(result.vatAmountCents).toBe(2200);
      expect(result.vatRatePercentage).toBe(22);
    });
  });

  describe("calculateIntraCommunityVat", () => {
    it("calculates reportable VAT for intra-community", () => {
      const result = calculateIntraCommunityVat(10000, "NOR", "CONTINENT");
      expect(result.vatReportableCents).toBe(2300);
      expect(result.vatRatePercentage).toBe(23);
    });
  });

  describe("formatVatRate", () => {
    it("formats rates correctly", () => {
      expect(formatVatRate("NOR", "CONTINENT")).toBe("23%");
      expect(formatVatRate("INT", "CONTINENT")).toBe("13%");
      expect(formatVatRate("RED", "CONTINENT")).toBe("6%");
      expect(formatVatRate("ISE", "CONTINENT")).toBe("Isento");
      expect(formatVatRate("NOR", "MADEIRA")).toBe("22%");
    });
  });

  describe("isVatExempt", () => {
    it("identifies exempt rates", () => {
      expect(isVatExempt("ISE")).toBe(true);
      expect(isVatExempt("NOR")).toBe(false);
      expect(isVatExempt("INT")).toBe(false);
      expect(isVatExempt("RED")).toBe(false);
    });
  });

  describe("getAvailableVatRates", () => {
    it("returns all rates for a region", () => {
      const continentRates = getAvailableVatRates("CONTINENT");
      expect(continentRates.length).toBe(4);
      expect(continentRates.map((r) => r.code)).toEqual(["NOR", "INT", "RED", "ISE"]);
    });
  });

  describe("Integer-only arithmetic", () => {
    it("never uses float for monetary calculations", () => {
      const items: VatLineItem[] = [
        { lineId: "line-1", description: "Teste", quantity: 3, unitPriceCents: 3333, vatRateCode: "NOR" },
      ];
      const result = calculateVat(items);

      // 3333 * 3 = 9999
      // 9999 * 23% = 2299.77 -> 2300 (rounded)
      expect(result.totalNetAmountCents).toBe(9999);
      expect(result.totalVatAmountCents).toBe(2300);
      expect(result.totalGrossAmountCents).toBe(12299);

      // All amounts are integers
      expect(Number.isInteger(result.totalNetAmountCents)).toBe(true);
      expect(Number.isInteger(result.totalVatAmountCents)).toBe(true);
      expect(Number.isInteger(result.totalGrossAmountCents)).toBe(true);
    });

    it("gross = net + VAT invariant holds", () => {
      const items: VatLineItem[] = [
        { lineId: "line-1", description: "A", quantity: 1, unitPriceCents: 10000, vatRateCode: "NOR" },
        { lineId: "line-2", description: "B", quantity: 2, unitPriceCents: 5000, vatRateCode: "RED" },
        { lineId: "line-3", description: "C", quantity: 1, unitPriceCents: 3000, vatRateCode: "ISE" },
      ];
      const result = calculateVat(items);

      expect(result.totalGrossAmountCents).toBe(result.totalNetAmountCents + result.totalVatAmountCents);
    });
  });

  describe("Edge cases", () => {
    it("handles zero quantity (clamped to 1)", () => {
      const item: VatLineItem = {
        lineId: "line-1",
        description: "Teste",
        quantity: 0,
        unitPriceCents: 10000,
        vatRateCode: "NOR",
      };
      const result = calculateLineVat(item);
      expect(result.quantity).toBe(1);
    });

    it("handles negative discount (clamped to 0)", () => {
      const item: VatLineItem = {
        lineId: "line-1",
        description: "Teste",
        quantity: 1,
        unitPriceCents: 10000,
        discountCents: -500,
        vatRateCode: "NOR",
      };
      const result = calculateLineVat(item);
      expect(result.discountCents).toBe(0);
    });

    it("handles very large amounts", () => {
      const item: VatLineItem = {
        lineId: "line-1",
        description: "Teste grande",
        quantity: 10000,
        unitPriceCents: 99999999, // ~€1M
        vatRateCode: "NOR",
      };
      const result = calculateLineVat(item);
      expect(result.netAmountCents).toBe(999999990000);
      expect(result.vatAmountCents).toBe(229999997700); // rounded
      expect(result.grossAmountCents).toBe(1229999987700);
    });
  });
});