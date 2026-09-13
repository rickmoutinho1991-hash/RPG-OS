/**
 * RPG-OS — testes da preparação IRS pessoal (P1.3).
 * Lógica pura: anos, estados, secções, proveniência. Sem I/O, sem rede.
 */
import { describe, expect, it } from "vitest";
import {
  calculateDeclarationYear,
  validateTaxYearScope,
  defaultSectionCompleteness,
  defaultIncomeStatus,
  deriveOverallStatus,
  deriveUnresolvedItems,
  generateInputFingerprint,
  isSupportedTaxYear,
  type TaxYearSummary,
} from "../personalIrsPreparation";

describe("P1.3 — anos fiscais", () => {
  it("calculateDeclarationYear: 2026 → 2027", () => {
    expect(calculateDeclarationYear(2026)).toBe(2027);
  });
  it("calculateDeclarationYear: 2025 → 2026", () => {
    expect(calculateDeclarationYear(2025)).toBe(2026);
  });

  it("isSupportedTaxYear: apenas 2026 suportado nesta fase", () => {
    expect(isSupportedTaxYear(2026)).toBe(true);
    expect(isSupportedTaxYear(2025)).toBe(false);
    expect(isSupportedTaxYear(2027)).toBe(false);
  });

  it("validateTaxYearScope: válido para 2026/2027", () => {
    expect(validateTaxYearScope({ taxYear: 2026, declarationYear: 2027 })).toBe(true);
  });
  it("validateTaxYearScope: inválido se declarationYear errado", () => {
    expect(validateTaxYearScope({ taxYear: 2026, declarationYear: 2028 })).toBe(false);
  });
  it("validateTaxYearScope: inválido se taxYear não suportado", () => {
    expect(validateTaxYearScope({ taxYear: 2025, declarationYear: 2026 })).toBe(false);
  });
});

describe("P1.3 — secções e completude", () => {
  it("defaultSectionCompleteness: sem deduções → DEDUCOES_COLETA UNAVAILABLE", () => {
    const sections = defaultSectionCompleteness(false);
    const deduc = sections.find((s) => s.section === "DEDUCOES_COLETA");
    expect(deduc?.status).toBe("UNAVAILABLE");
  });
  it("defaultSectionCompleteness: com deduções → DEDUCOES_COLETA PARTIAL", () => {
    const sections = defaultSectionCompleteness(true);
    const deduc = sections.find((s) => s.section === "DEDUCOES_COLETA");
    expect(deduc?.status).toBe("PARTIAL");
  });
  it("defaultSectionCompleteness: RENDIMENTOS sempre UNAVAILABLE", () => {
    const sections = defaultSectionCompleteness(true);
    const rend = sections.find((s) => s.section === "RENDIMENTOS");
    expect(rend?.status).toBe("UNAVAILABLE");
  });
  it("defaultSectionCompleteness: AGREGADO_FAMILIAR sempre MANUAL_REVIEW", () => {
    const sections = defaultSectionCompleteness(true);
    const agg = sections.find((s) => s.section === "AGREGADO_FAMILIAR");
    expect(agg?.status).toBe("MANUAL_REVIEW");
  });
  it("defaultSectionCompleteness: 9 secções esperadas", () => {
    expect(defaultSectionCompleteness(true).length).toBe(9);
  });
});

describe("P1.3 — categorias de rendimento", () => {
  it("defaultIncomeStatus: 6 categorias (A,B,E,F,G,H) todas UNAVAILABLE", () => {
    const statuses = defaultIncomeStatus();
    expect(statuses.length).toBe(6);
    expect(statuses.map((s) => s.category).sort()).toEqual(["A", "B", "E", "F", "G", "H"]);
    statuses.forEach((s) => {
      expect(s.status).toBe("UNAVAILABLE");
      expect(s.note).toContain("Sem modelo de rendimentos");
    });
  });
});

describe("P1.3 — status geral", () => {
  it("deriveOverallStatus: all COMPLETE → READY_FOR_REVIEW", () => {
    const sections = [
      { section: "RENDIMENTOS" as const, status: "COMPLETE" as const, detail: "" },
      { section: "DEDUCOES_COLETA" as const, status: "COMPLETE" as const, detail: "" },
    ];
    expect(deriveOverallStatus(sections)).toBe("READY_FOR_REVIEW");
  });
  it("deriveOverallStatus: COMPLETE + PARTIAL → READY_FOR_REVIEW", () => {
    const sections = [
      { section: "RENDIMENTOS" as const, status: "COMPLETE" as const, detail: "" },
      { section: "DEDUCOES_COLETA" as const, status: "PARTIAL" as const, detail: "" },
    ];
    expect(deriveOverallStatus(sections)).toBe("READY_FOR_REVIEW");
  });
  it("deriveOverallStatus: com MANUAL_REVIEW → MANUAL_REVIEW", () => {
    const sections = [
      { section: "RENDIMENTOS" as const, status: "COMPLETE" as const, detail: "" },
      { section: "AGREGADO_FAMILIAR" as const, status: "MANUAL_REVIEW" as const, detail: "" },
    ];
    expect(deriveOverallStatus(sections)).toBe("MANUAL_REVIEW");
  });
  it("deriveOverallStatus: com UNAVAILABLE → INCOMPLETE", () => {
    const sections = [
      { section: "RENDIMENTOS" as const, status: "UNAVAILABLE" as const, detail: "" },
      { section: "DEDUCOES_COLETA" as const, status: "PARTIAL" as const, detail: "" },
    ];
    expect(deriveOverallStatus(sections)).toBe("INCOMPLETE");
  });
  it("deriveOverallStatus: misto → MANUAL_REVIEW (prioridade MANUAL_REVIEW > UNAVAILABLE)", () => {
    const sections = [
      { section: "RENDIMENTOS" as const, status: "UNAVAILABLE" as const, detail: "" },
      { section: "AGREGADO_FAMILIAR" as const, status: "MANUAL_REVIEW" as const, detail: "" },
    ];
    expect(deriveOverallStatus(sections)).toBe("MANUAL_REVIEW");
  });
});

describe("P1.3 — unresolved items", () => {
  it("deriveUnresolvedItems: apenas secções não COMPLETE", () => {
    const sections = [
      { section: "RENDIMENTOS" as const, status: "UNAVAILABLE" as const, detail: "sem modelo" },
      { section: "DEDUCOES_COLETA" as const, status: "PARTIAL" as const, detail: "parcial" },
      { section: "AGREGADO_FAMILIAR" as const, status: "MANUAL_REVIEW" as const, detail: "manual" },
      { section: "RESIDENCIA_FISCAL" as const, status: "COMPLETE" as const, detail: "ok" },
    ];
    const items = deriveUnresolvedItems(sections);
    expect(items.length).toBe(3);
    expect(items.map((i) => i.section).sort()).toEqual([
      "AGREGADO_FAMILIAR",
      "DEDUCOES_COLETA",
      "RENDIMENTOS",
    ]);
    expect(items.find((i) => i.section === "RENDIMENTOS")?.reason).toBe("UNAVAILABLE");
  });
});

describe("P1.3 — fingerprint determinístico", () => {
  const baseSummary: TaxYearSummary = {
    taxYear: 2026,
    totalExpensesCents: 100000,
    eligibleCents: 50000,
    pendingValidationCents: 20000,
    manualReviewCents: 10000,
    deductibleTotalCents: 35000,
    byCategory: { GENERAL_FAMILY_EXPENSES: 50000, HEALTH: 50000 },
  };

  it("generateInputFingerprint: mesmo input → mesmo output", () => {
    const fp1 = generateInputFingerprint(baseSummary, 3, "2026.1-cirs-2026-09-09");
    const fp2 = generateInputFingerprint(baseSummary, 3, "2026.1-cirs-2026-09-09");
    expect(fp1).toBe(fp2);
  });
  it("generateInputFingerprint: regraset diferente → fingerprint diferente", () => {
    const fp1 = generateInputFingerprint(baseSummary, 3, "2026.1-cirs-2026-09-09");
    const fp2 = generateInputFingerprint(baseSummary, 3, "2026.0-unverified");
    expect(fp1).not.toBe(fp2);
  });
  it("generateInputFingerprint: obligations count diferente → fingerprint diferente", () => {
    const fp1 = generateInputFingerprint(baseSummary, 3, "2026.1-cirs-2026-09-09");
    const fp2 = generateInputFingerprint(baseSummary, 5, "2026.1-cirs-2026-09-09");
    expect(fp1).not.toBe(fp2);
  });
  it("generateInputFingerprint: totais diferentes → fingerprint diferente", () => {
    const fp1 = generateInputFingerprint(baseSummary, 3, "2026.1-cirs-2026-09-09");
    const fp2 = generateInputFingerprint(
      { ...baseSummary, totalExpensesCents: 200000 },
      3,
      "2026.1-cirs-2026-09-09",
    );
    expect(fp1).not.toBe(fp2);
  });
});