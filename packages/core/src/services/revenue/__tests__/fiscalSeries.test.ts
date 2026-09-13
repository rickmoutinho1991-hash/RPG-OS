import { describe, it, expect } from "vitest";
import {
  createFiscalSeries,
  allocateDocumentNumber,
  incrementSeriesCounter,
  validateFiscalSeries,
  seriesConflict,
  formatDocumentNumber,
  parseDocumentNumber,
  type FiscalSeries,
  type CreateFiscalSeriesInput,
  type InvoiceType,
} from "../../revenue";

describe("Fiscal Document Series - Phase 10I-B", () => {
  const baseInput: CreateFiscalSeriesInput = {
    organizationId: "org-123",
    documentType: "FT",
    seriesCode: "2025",
    fiscalYear: 2025,
    startingNumber: 1,
  };

  describe("createFiscalSeries", () => {
    it("creates a new active series with default starting number 1", () => {
      const series = createFiscalSeries(baseInput);

      expect(series.seriesId).toBeDefined();
      expect(series.organizationId).toBe("org-123");
      expect(series.documentType).toBe("FT");
      expect(series.seriesCode).toBe("2025");
      expect(series.nextDocumentNumber).toBe(1);
      expect(series.status).toBe("active");
      expect(series.fiscalYear).toBe(2025);
      expect(series.createdAt).toBeDefined();
      expect(series.updatedAt).toBeDefined();
    });

    it("creates a series with custom starting number", () => {
      const input = { ...baseInput, startingNumber: 100 };
      const series = createFiscalSeries(input);

      expect(series.nextDocumentNumber).toBe(100);
    });

    it("creates series with custom status", () => {
      const input = { ...baseInput, status: "inactive" as const };
      const series = createFiscalSeries(input);

      expect(series.status).toBe("inactive");
    });

    it("creates series for all document types", () => {
      const types: InvoiceType[] = ["FT", "FS", "FR", "NC", "ND"];

      for (const type of types) {
        const series = createFiscalSeries({ ...baseInput, documentType: type });
        expect(series.documentType).toBe(type);
      }
    });
  });

  describe("allocateDocumentNumber", () => {
    it("allocates the next sequential number", () => {
      const series = createFiscalSeries(baseInput);
      const allocation = allocateDocumentNumber(series);

      expect(allocation.documentNumber).toBe(1);
      expect(allocation.seriesCode).toBe("2025");
      expect(allocation.formattedNumber).toBe("2025/001");
      expect(allocation.seriesId).toBe(series.seriesId);
    });

    it("allocates with custom starting number", () => {
      const series = createFiscalSeries({ ...baseInput, startingNumber: 50 });
      const allocation = allocateDocumentNumber(series);

      expect(allocation.documentNumber).toBe(50);
      expect(allocation.formattedNumber).toBe("2025/050");
    });

    it("formats numbers with leading zeros", () => {
      const series = createFiscalSeries({ ...baseInput, startingNumber: 9 });
      let allocation = allocateDocumentNumber(series);
      expect(allocation.formattedNumber).toBe("2025/009");

      allocation = allocateDocumentNumber({ ...series, nextDocumentNumber: 10 });
      expect(allocation.formattedNumber).toBe("2025/010");

      allocation = allocateDocumentNumber({ ...series, nextDocumentNumber: 100 });
      expect(allocation.formattedNumber).toBe("2025/100");
    });

    it("throws error for inactive series", () => {
      const series = createFiscalSeries({ ...baseInput, status: "inactive" });

      expect(() => allocateDocumentNumber(series)).toThrow(
        "Cannot allocate number from inactive series",
      );
    });

    it("throws error for invalid next document number", () => {
      const series = { ...createFiscalSeries(baseInput), nextDocumentNumber: 0 };

      expect(() => allocateDocumentNumber(series)).toThrow(
        "Invalid next document number: 0",
      );
    });

    it("throws error for negative next document number", () => {
      const series = { ...createFiscalSeries(baseInput), nextDocumentNumber: -5 };

      expect(() => allocateDocumentNumber(series)).toThrow(
        "Invalid next document number: -5",
      );
    });
  });

  describe("incrementSeriesCounter", () => {
    it("increments the next document number", () => {
      const series = createFiscalSeries(baseInput);
      const updated = incrementSeriesCounter(series);

      expect(updated.nextDocumentNumber).toBe(2);
      // updatedAt should be updated (may be same timestamp if fast)
      expect(updated.updatedAt).toBeDefined();
      expect(updated.seriesId).toBe(series.seriesId);
      expect(updated.organizationId).toBe(series.organizationId);
    });

    it("preserves all other fields", () => {
      const series = createFiscalSeries(baseInput);
      const updated = incrementSeriesCounter(series);

      expect(updated.documentType).toBe(series.documentType);
      expect(updated.seriesCode).toBe(series.seriesCode);
      expect(updated.fiscalYear).toBe(series.fiscalYear);
      expect(updated.status).toBe(series.status);
      expect(updated.createdAt).toBe(series.createdAt);
    });
  });

  describe("validateFiscalSeries", () => {
    it("validates a correct series", () => {
      const series = createFiscalSeries(baseInput);
      const result = validateFiscalSeries(series);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("rejects series with missing seriesId", () => {
      const series = createFiscalSeries(baseInput);
      const invalid = { ...series, seriesId: "" };
      const result = validateFiscalSeries(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Series ID is required");
    });

    it("rejects series with missing organizationId", () => {
      const series = createFiscalSeries(baseInput);
      const invalid = { ...series, organizationId: "" };
      const result = validateFiscalSeries(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Organization ID is required");
    });

    it("rejects series with missing documentType", () => {
      const series = createFiscalSeries(baseInput);
      const invalid = { ...series, documentType: "" as InvoiceType };
      const result = validateFiscalSeries(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Document type is required");
    });

    it("rejects series with missing seriesCode", () => {
      const series = createFiscalSeries(baseInput);
      const invalid = { ...series, seriesCode: "" };
      const result = validateFiscalSeries(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Series code is required");
    });

    it("rejects series with nextDocumentNumber < 1", () => {
      const series = createFiscalSeries(baseInput);
      const invalid = { ...series, nextDocumentNumber: 0 };
      const result = validateFiscalSeries(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Next document number must be >= 1");
    });

    it("rejects series with invalid fiscal year", () => {
      const series = createFiscalSeries(baseInput);
      const invalid = { ...series, fiscalYear: 1999 };
      const result = validateFiscalSeries(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Fiscal year must be between 2000 and 2100");
    });

    it("rejects series with future fiscal year too far", () => {
      const series = createFiscalSeries(baseInput);
      const invalid = { ...series, fiscalYear: 2101 };
      const result = validateFiscalSeries(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Fiscal year must be between 2000 and 2100");
    });

    it("rejects series with invalid status", () => {
      const series = createFiscalSeries(baseInput);
      const invalid = { ...series, status: "invalid" as any };
      const result = validateFiscalSeries(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid series status: invalid");
    });

    it("rejects series with invalid document type", () => {
      const series = createFiscalSeries(baseInput);
      const invalid = { ...series, documentType: "XX" as InvoiceType };
      const result = validateFiscalSeries(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid document type: XX");
    });
  });

  describe("seriesConflict", () => {
    it("detects conflict when org, type, code, and year match", () => {
      const seriesA = createFiscalSeries(baseInput);
      const seriesB = createFiscalSeries({
        ...baseInput,
        organizationId: "org-123",
        documentType: "FT",
        seriesCode: "2025",
        fiscalYear: 2025,
      });

      expect(seriesConflict(seriesA, seriesB)).toBe(true);
    });

    it("no conflict when organization differs", () => {
      const seriesA = createFiscalSeries({ ...baseInput, organizationId: "org-1" });
      const seriesB = createFiscalSeries({ ...baseInput, organizationId: "org-2" });

      expect(seriesConflict(seriesA, seriesB)).toBe(false);
    });

    it("no conflict when document type differs", () => {
      const seriesA = createFiscalSeries({ ...baseInput, documentType: "FT" });
      const seriesB = createFiscalSeries({ ...baseInput, documentType: "FS" });

      expect(seriesConflict(seriesA, seriesB)).toBe(false);
    });

    it("no conflict when series code differs", () => {
      const seriesA = createFiscalSeries({ ...baseInput, seriesCode: "2025" });
      const seriesB = createFiscalSeries({ ...baseInput, seriesCode: "2026" });

      expect(seriesConflict(seriesA, seriesB)).toBe(false);
    });

    it("no conflict when fiscal year differs", () => {
      const seriesA = createFiscalSeries({ ...baseInput, fiscalYear: 2025 });
      const seriesB = createFiscalSeries({ ...baseInput, fiscalYear: 2026 });

      expect(seriesConflict(seriesA, seriesB)).toBe(false);
    });
  });

  describe("formatDocumentNumber", () => {
    it("formats with leading zeros", () => {
      expect(formatDocumentNumber("2025", 1)).toBe("2025/001");
      expect(formatDocumentNumber("2025", 9)).toBe("2025/009");
      expect(formatDocumentNumber("2025", 10)).toBe("2025/010");
      expect(formatDocumentNumber("2025", 100)).toBe("2025/100");
      expect(formatDocumentNumber("2025", 999)).toBe("2025/999");
    });

    it("handles custom series codes", () => {
      expect(formatDocumentNumber("FT-2025", 1)).toBe("FT-2025/001");
      expect(formatDocumentNumber("A", 1)).toBe("A/001");
    });
  });

  describe("parseDocumentNumber", () => {
    it("parses formatted document numbers", () => {
      expect(parseDocumentNumber("2025/001")).toEqual({
        seriesCode: "2025",
        documentNumber: 1,
      });
      expect(parseDocumentNumber("2025/100")).toEqual({
        seriesCode: "2025",
        documentNumber: 100,
      });
      expect(parseDocumentNumber("FT-2025/050")).toEqual({
        seriesCode: "FT-2025",
        documentNumber: 50,
      });
    });

    it("returns null for invalid format", () => {
      expect(parseDocumentNumber("invalid")).toBeNull();
      expect(parseDocumentNumber("2025")).toBeNull();
      expect(parseDocumentNumber("2025/")).toBeNull();
      expect(parseDocumentNumber("/001")).toBeNull();
    });
  });

  describe("Tenant Isolation", () => {
    it("ensures series are organization-scoped", () => {
      const seriesA = createFiscalSeries({
        ...baseInput,
        organizationId: "org-A",
      });
      const seriesB = createFiscalSeries({
        ...baseInput,
        organizationId: "org-B",
      });

      expect(seriesA.organizationId).not.toBe(seriesB.organizationId);
      expect(seriesConflict(seriesA, seriesB)).toBe(false);
    });

    it("prevents duplicate numbers within same org/type/series/year", () => {
      let series = createFiscalSeries(baseInput);
      const allocation1 = allocateDocumentNumber(series);
      series = incrementSeriesCounter(series);
      const allocation2 = allocateDocumentNumber(series);

      expect(allocation1.documentNumber).not.toBe(allocation2.documentNumber);
      expect(allocation1.formattedNumber).not.toBe(allocation2.formattedNumber);
    });

    it("never reuses issued numbers", () => {
      let series = createFiscalSeries(baseInput);
      const usedNumbers = new Set<number>();

      for (let i = 0; i < 10; i++) {
        const allocation = allocateDocumentNumber(series);
        expect(usedNumbers.has(allocation.documentNumber)).toBe(false);
        usedNumbers.add(allocation.documentNumber);
        series = incrementSeriesCounter(series);
      }
    });
  });
});