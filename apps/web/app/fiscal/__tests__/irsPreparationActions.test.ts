/**
 * RPG-OS — testes de tipos/higiene das actions IRS preparation (P1.3).
 * Sem I/O real; verifica imports, tipos e estrutura.
 */
import { describe, expect, it } from "vitest";
import type {
  CreateIrsPreparationInput,
  IrsPreparationActionResult,
  PersonalIrsPreparation,
  IrsPreparationView,
  IrsPreparationTotals,
  SectionCompleteness,
  IncomeCategoryStatus,
  PreparationProvenance,
} from "../irsPreparationActions";

describe("P1.3 — IRS preparation actions types", () => {
  it("CreateIrsPreparationInput aceita taxYear e forceRefresh", () => {
    const input: CreateIrsPreparationInput = { taxYear: 2026, forceRefresh: true };
    expect(input.taxYear).toBe(2026);
    expect(input.forceRefresh).toBe(true);
  });

  it("CreateIrsPreparationInput forceRefresh opcional", () => {
    const input: CreateIrsPreparationInput = { taxYear: 2026 };
    expect(input.taxYear).toBe(2026);
    expect(input.forceRefresh).toBeUndefined();
  });

  it("IrsPreparationActionResult ok com preparation", () => {
    const result: IrsPreparationActionResult = {
      ok: true,
      preparation: {} as PersonalIrsPreparation,
    };
    expect(result.ok).toBe(true);
    expect(result.preparation).toBeDefined();
  });

  it("IrsPreparationActionResult erro sem preparation", () => {
    const result: IrsPreparationActionResult = {
      ok: false,
      error: "FORBIDDEN",
    };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("FORBIDDEN");
  });

  it("PersonalIrsPreparation estrutura completa", () => {
    const prep: PersonalIrsPreparation = {
      id: "uuid",
      userId: "user-uuid",
      taxYear: 2026,
      declarationYear: 2027,
      status: "DRAFT",
      rulesetVersion: "2026.1-cirs-2026-09-09",
      totals: {
        totalExpensesCents: 0,
        deductibleConfirmedCents: 0,
        deductibleManualReviewCents: 0,
        pendingValidationCents: 0,
        byCategory: {},
      },
      sections: [],
      incomeStatus: [],
      unresolvedItems: [],
      provenance: {
        rulesetVersion: "2026.1-cirs-2026-09-09",
        rulesetSource: "CIRS",
        rulesetVerifiedAt: "2026-09-09",
        deductionsSnapshot: { count: 0, totalCents: 0, deductibleCents: 0, ruleVersions: [] },
        inputFingerprint: "fp",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(prep.taxYear).toBe(2026);
    expect(prep.declarationYear).toBe(2027);
    expect(prep.status).toBe("DRAFT");
  });

  it("IrsPreparationView para UI", () => {
    const view: IrsPreparationView = {
      id: "uuid",
      taxYear: 2026,
      declarationYear: 2027,
      status: "READY_FOR_REVIEW",
      rulesetVersion: "2026.1-cirs-2026-09-09",
      totals: {
        totalExpensesCents: 10000,
        deductibleConfirmedCents: 3500,
        deductibleManualReviewCents: 0,
        pendingValidationCents: 2000,
        byCategory: { GENERAL_FAMILY_EXPENSES: 10000 },
      },
      sections: [
        { section: "DEDUCOES_COLETA", status: "PARTIAL", detail: "ok" },
      ],
      incomeStatus: [
        { category: "A", status: "UNAVAILABLE", note: "sem modelo" },
      ],
      unresolvedItems: [
        { section: "RENDIMENTOS", reason: "UNAVAILABLE", detail: "sem modelo" },
      ],
      provenance: {
        rulesetVersion: "2026.1-cirs-2026-09-09",
        rulesetSource: "CIRS",
        rulesetVerifiedAt: "2026-09-09",
        deductionsSnapshot: { count: 1, totalCents: 10000, deductibleCents: 3500, ruleVersions: ["2026.1"] },
        inputFingerprint: "fp",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(view.taxYear).toBe(2026);
    expect(view.declarationYear).toBe(2027);
  });

  it("IrsPreparationTotals com rendimentos e retenções opcionais", () => {
    const totals: IrsPreparationTotals = {
      totalExpensesCents: 50000,
      deductibleConfirmedCents: 15000,
      deductibleManualReviewCents: 0,
      pendingValidationCents: 10000,
      byCategory: { HEALTH: 20000, EDUCATION: 30000 },
      income: {
        totalDeclaredCents: 2000000,
        byCategory: { A: 1800000, E: 200000 },
      },
      withholdings: { totalCents: 300000 },
      paymentsOnAccount: { totalCents: 50000 },
    };
    expect(totals.income?.totalDeclaredCents).toBe(2000000);
    expect(totals.withholdings?.totalCents).toBe(300000);
    expect(totals.paymentsOnAccount?.totalCents).toBe(50000);
  });

  it("SectionCompleteness estados válidos", () => {
    const section: SectionCompleteness = {
      section: "RENDIMENTOS",
      status: "UNAVAILABLE",
      detail: "Sem modelo de rendimentos",
    };
    expect(["COMPLETE", "PARTIAL", "MANUAL_REVIEW", "UNAVAILABLE"]).toContain(section.status);
  });

  it("IncomeCategoryStatus categorias A/B/E/F/G/H", () => {
    const statuses: IncomeCategoryStatus[] = [
      { category: "A", status: "UNAVAILABLE", note: "" },
      { category: "B", status: "UNAVAILABLE", note: "" },
      { category: "E", status: "UNAVAILABLE", note: "" },
      { category: "F", status: "UNAVAILABLE", note: "" },
      { category: "G", status: "UNAVAILABLE", note: "" },
      { category: "H", status: "UNAVAILABLE", note: "" },
    ];
    expect(statuses.length).toBe(6);
  });

  it("PreparationProvenance fingerprint", () => {
    const prov: PreparationProvenance = {
      rulesetVersion: "2026.1-cirs-2026-09-09",
      rulesetSource: "CIRS art. 78-B/C/D",
      rulesetVerifiedAt: "2026-09-09",
      deductionsSnapshot: {
        count: 5,
        totalCents: 50000,
        deductibleCents: 15000,
        ruleVersions: ["2026.1-cirs-2026-09-09"],
      },
      obligationsSnapshot: { count: 3, categories: ["IVA", "IRS", "SEG_SOCIAL"] },
      inputFingerprint: "deductions:50000:15000:2026.1|obligations:3|ruleset:2026.1-cirs-2026-09-09",
    };
    expect(prov.inputFingerprint).toContain("deductions:");
    expect(prov.inputFingerprint).toContain("obligations:");
    expect(prov.inputFingerprint).toContain("ruleset:");
  });
});