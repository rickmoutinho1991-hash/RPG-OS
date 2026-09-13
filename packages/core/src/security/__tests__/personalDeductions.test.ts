/**
 * RPG-OS — testes do motor de deduções pessoais (P1).
 * Motor puro: 18 casos obrigatórios. Sem I/O, sem rede, sem regras reais.
 * Ruleset de teste claramente marcado TEST-ONLY (nunca fiscal real).
 */
import { describe, expect, it } from "vitest";
import {
  evaluatePersonalExpense,
  parseContextFlag,
  PT_2026_CIRS_RULES,
  PT_2026_UNVERIFIED_RULES,
  summarizeTaxYear,
  type PersonalExpenseInput,
  type TaxDeductionRuleSet,
} from "../personalDeductions";

const FULL_CONTEXT = {
  faturaComunicada: true,
  nifAdquirente: true,
  caeElegivel: true,
};

const TEST_RULES: TaxDeductionRuleSet = {
  taxYear: 2026,
  jurisdiction: "TEST-ONLY",
  version: "test-only-v1",
  source: "unit-test-fixture",
  verifiedAt: "2026-09-09T00:00:00.000Z",
  rules: {
    HEALTH: { rateBps: 5000, capCents: null },
    EDUCATION: { rateBps: 10000, capCents: 3000 },
    OTHER: { rateBps: 0, capCents: null },
  },
};

function expense(over: Partial<PersonalExpenseInput> = {}): PersonalExpenseInput {
  return {
    amountCents: 10000,
    currency: "EUR",
    category: "HEALTH",
    expenseDate: "2026-03-15",
    ...over,
  };
}

describe("P1 motor — entradas inválidas", () => {
  it("1. categoria desconhecida → NOT_ELIGIBLE", () => {
    const r = evaluatePersonalExpense(expense({ category: "NOPE" }), TEST_RULES);
    expect(r.status).toBe("NOT_ELIGIBLE");
    expect(r.reasonCode).toBe("UNKNOWN_CATEGORY");
    expect(r.deductibleCents).toBe(0);
  });
  it("2. categoria UNKNOWN → NOT_ELIGIBLE", () => {
    expect(evaluatePersonalExpense(expense({ category: "UNKNOWN" }), TEST_RULES).status).toBe("NOT_ELIGIBLE");
  });
  it("3. amount=0 → INVALID_INPUT", () => {
    const r = evaluatePersonalExpense(expense({ amountCents: 0 }), TEST_RULES);
    expect(r.reasonCode).toBe("INVALID_INPUT");
    expect(r.deductibleCents).toBe(0);
  });
  it("4. amount negativo → INVALID_INPUT", () => {
    expect(evaluatePersonalExpense(expense({ amountCents: -5 }), TEST_RULES).reasonCode).toBe("INVALID_INPUT");
  });
  it("5. moeda inválida → INVALID_INPUT", () => {
    expect(evaluatePersonalExpense(expense({ currency: "USD" }), TEST_RULES).reasonCode).toBe("INVALID_INPUT");
  });
  it("data malformada → INVALID_INPUT", () => {
    expect(evaluatePersonalExpense(expense({ expenseDate: "15/03/2026" }), TEST_RULES).reasonCode).toBe("INVALID_INPUT");
  });
});

describe("P1 motor — regras", () => {
  it("6. regra inexistente → MANUAL_REVIEW", () => {
    const r = evaluatePersonalExpense(expense({ category: "HOUSING" }), TEST_RULES, FULL_CONTEXT);
    expect(r.status).toBe("MANUAL_REVIEW");
    expect(r.requiresManualReview).toBe(true);
  });
  it("7. regra não verificada (ruleset real 2026.0) → MANUAL_REVIEW + RULE_UNVERIFIED", () => {
    const r = evaluatePersonalExpense(expense(), PT_2026_UNVERIFIED_RULES, FULL_CONTEXT);
    expect(r.status).toBe("MANUAL_REVIEW");
    expect(r.reasonCode).toBe("RULE_UNVERIFIED");
    expect(r.ruleVersion).toBe("2026.0-unverified");
    expect(r.deductibleCents).toBe(0);
  });
  it("7b. regra verificada mas sem contexto → MANUAL_REVIEW + MISSING_CONTEXT", () => {
    const r = evaluatePersonalExpense(expense(), TEST_RULES);
    expect(r.status).toBe("MANUAL_REVIEW");
    expect(r.reasonCode).toBe("MISSING_CONTEXT");
    expect(r.deductibleCents).toBe(0);
  });
  it("7c. contexto parcial → MISSING_CONTEXT", () => {
    const r = evaluatePersonalExpense(expense(), TEST_RULES, { faturaComunicada: true });
    expect(r.reasonCode).toBe("MISSING_CONTEXT");
  });
  it("7d. fora do ano do ruleset → OUT_OF_YEAR", () => {
    const r = evaluatePersonalExpense(expense({ expenseDate: "2025-03-15" }), TEST_RULES, FULL_CONTEXT);
    expect(r.status).toBe("MANUAL_REVIEW");
    expect(r.reasonCode).toBe("OUT_OF_YEAR");
  });
  it("8. elegível parcial (50%) → PARTIALLY_ELIGIBLE + cents exatos", () => {
    const r = evaluatePersonalExpense(expense(), TEST_RULES, FULL_CONTEXT);
    expect(r.status).toBe("PARTIALLY_ELIGIBLE");
    expect(r.deductibleCents).toBe(5000);
    expect(r.reasonCode).toBe("RULE_APPLIED");
  });
  it("9. teto aplicado → RULE_CAPPED", () => {
    const r = evaluatePersonalExpense(expense({ category: "EDUCATION" }), TEST_RULES, FULL_CONTEXT);
    expect(r.deductibleCents).toBe(3000);
    expect(r.reasonCode).toBe("RULE_CAPPED");
  });
  it("10. taxa zero → NOT_ELIGIBLE", () => {
    const r = evaluatePersonalExpense(expense({ category: "OTHER" }), TEST_RULES, FULL_CONTEXT);
    expect(r.status).toBe("NOT_ELIGIBLE");
    expect(r.reasonCode).toBe("CATEGORY_INELIGIBLE");
  });
  it("11. manual review nunca declara dedutível", () => {
    const r = evaluatePersonalExpense(expense({ category: "DONATION" }), TEST_RULES, FULL_CONTEXT);
    expect(r.status).toBe("MANUAL_REVIEW");
    expect(r.deductibleCents).toBe(0);
  });
  it("12. deterministicidade: mesma entrada → mesmo output", () => {
    const a = evaluatePersonalExpense(expense(), TEST_RULES, FULL_CONTEXT);
    const b = evaluatePersonalExpense(expense(), TEST_RULES, FULL_CONTEXT);
    expect(a).toEqual(b);
  });
  it("13. aritmética em cents (sem float): 999×15% = 149", () => {
    const rules: TaxDeductionRuleSet = { ...TEST_RULES, rules: { HEALTH: { rateBps: 1500, capCents: null } } };
    const r = evaluatePersonalExpense(expense({ amountCents: 999 }), rules, FULL_CONTEXT);
    expect(r.deductibleCents).toBe(149);
  });
  it("13b. limites: 1/99/10000 cents a 15% sem teto", () => {
    const rules: TaxDeductionRuleSet = { ...TEST_RULES, rules: { HEALTH: { rateBps: 1500, capCents: null } } };
    expect(evaluatePersonalExpense(expense({ amountCents: 1 }), rules, FULL_CONTEXT).deductibleCents).toBe(0);
    expect(evaluatePersonalExpense(expense({ amountCents: 99 }), rules, FULL_CONTEXT).deductibleCents).toBe(14);
    expect(evaluatePersonalExpense(expense({ amountCents: 10000 }), rules, FULL_CONTEXT).deductibleCents).toBe(1500);
  });
  it("13c. cap boundary: cap-1/cap/cap+1", () => {
    const rules: TaxDeductionRuleSet = { ...TEST_RULES, rules: { HEALTH: { rateBps: 10000, capCents: 1000 } } };
    const below = evaluatePersonalExpense(expense({ amountCents: 999 }), rules, FULL_CONTEXT);
    const equal = evaluatePersonalExpense(expense({ amountCents: 1000 }), rules, FULL_CONTEXT);
    const above = evaluatePersonalExpense(expense({ amountCents: 1001 }), rules, FULL_CONTEXT);
    expect(below.deductibleCents).toBe(999);
    expect(below.reasonCode).toBe("RULE_APPLIED");
    expect(equal.deductibleCents).toBe(1000);
    expect(above.deductibleCents).toBe(1000);
    expect(above.reasonCode).toBe("RULE_CAPPED");
  });
});

describe("P1.2 — parseContextFlag estrito", () => {
  it("só booleanos passam; strings/números → null", () => {
    expect(parseContextFlag(true)).toBe(true);
    expect(parseContextFlag(false)).toBe(false);
    expect(parseContextFlag("true")).toBeNull();
    expect(parseContextFlag(1)).toBeNull();
    expect(parseContextFlag(undefined)).toBeNull();
    expect(parseContextFlag(null)).toBeNull();
  });
});

describe("P1 motor — resumo anual", () => {
  it("17+18. provenance (ruleVersion) + totais em cents", () => {
    const s = summarizeTaxYear(2026, [
      { amountCents: 10000, category: "HEALTH", evaluation: evaluatePersonalExpense(expense(), TEST_RULES, FULL_CONTEXT) },
      { amountCents: 20000, category: "HOUSING", evaluation: evaluatePersonalExpense(expense({ category: "HOUSING" }), TEST_RULES, FULL_CONTEXT) },
    ]);
    expect(s.totalExpensesCents).toBe(30000);
    expect(s.deductibleTotalCents).toBe(5000);
    expect(s.eligibleCents).toBe(10000);
    expect(s.manualReviewCents).toBe(20000);
    expect(s.byCategory.HEALTH).toBe(10000);
  });
});

describe("P1.1 — regras CIRS 2026 verificadas", () => {
  it("gerais 35% cap €250: 100000c → 25000c (teto)", () => {
    const r = evaluatePersonalExpense(
      expense({ category: "GENERAL_FAMILY_EXPENSES", amountCents: 100000 }),
      PT_2026_CIRS_RULES,
      FULL_CONTEXT,
    );
    expect(r.deductibleCents).toBe(25000);
    expect(r.reasonCode).toBe("RULE_CAPPED");
    expect(r.ruleVersion).toBe("2026.1-cirs-2026-09-09");
  });
  it("saúde 15%: 10000c → 1500c", () => {
    const r = evaluatePersonalExpense(expense(), PT_2026_CIRS_RULES, FULL_CONTEXT);
    expect(r.deductibleCents).toBe(1500);
  });
  it("educação 30% cap €800: teto em 80000c", () => {
    const r = evaluatePersonalExpense(
      expense({ category: "EDUCATION", amountCents: 300000 }),
      PT_2026_CIRS_RULES,
      FULL_CONTEXT,
    );
    expect(r.deductibleCents).toBe(80000);
    expect(r.reasonCode).toBe("RULE_CAPPED");
  });
  it("sem contexto → MISSING_CONTEXT mesmo com regra verificada", () => {
    const r = evaluatePersonalExpense(expense(), PT_2026_CIRS_RULES);
    expect(r.status).toBe("MANUAL_REVIEW");
    expect(r.reasonCode).toBe("MISSING_CONTEXT");
  });
});
