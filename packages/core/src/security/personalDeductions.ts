/**
 * RPG-OS — Motor pessoal de despesas/deduções (P1, 100% local).
 *
 * Puro, determinístico, sem I/O, sem rede, sem AT. Dinheiro em cents
 * (inteiros, nunca float). Elegibilidade fiscal só com regras versionadas
 * e verificadas; sem regra verificada → MANUAL_REVIEW + RULE_UNVERIFIED.
 * Nunca declara aceitação pela AT.
 */

/** Categorias fiscais fechadas (categoria comercial ≠ fiscal). */
export type PersonalExpenseCategory =
  | "GENERAL_FAMILY_EXPENSES"
  | "HEALTH"
  | "EDUCATION"
  | "HOUSING"
  | "ELDERLY_CARE"
  | "ALIMONY"
  | "PENSION"
  | "DONATION"
  | "INSURANCE"
  | "OTHER"
  | "UNKNOWN";

export const PERSONAL_EXPENSE_CATEGORIES: ReadonlyArray<PersonalExpenseCategory> = [
  "GENERAL_FAMILY_EXPENSES",
  "HEALTH",
  "EDUCATION",
  "HOUSING",
  "ELDERLY_CARE",
  "ALIMONY",
  "PENSION",
  "DONATION",
  "INSURANCE",
  "OTHER",
  "UNKNOWN",
];

/** Estados honestos — nunca "aprovado pela AT". */
export type DeductionStatus =
  | "UNKNOWN"
  | "PENDING_VALIDATION"
  | "ELIGIBLE"
  | "PARTIALLY_ELIGIBLE"
  | "NOT_ELIGIBLE"
  | "MANUAL_REVIEW";

export type DeductionReasonCode =
  | "RULE_UNVERIFIED"
  | "INVALID_INPUT"
  | "UNKNOWN_CATEGORY"
  | "CATEGORY_INELIGIBLE"
  | "RULE_APPLIED"
  | "RULE_CAPPED"
  | "NEEDS_DOCUMENT"
  | "MISSING_CONTEXT"
  | "OUT_OF_YEAR";

export interface PersonalExpenseInput {
  amountCents: number;
  currency: string;
  category: string;
  /** ISO date (YYYY-MM-DD). Só validade estrutural. */
  expenseDate: string;
}

export interface DeductionEvaluation {
  status: DeductionStatus;
  deductibleCents: number;
  reasonCode: DeductionReasonCode;
  ruleVersion: string;
  requiresManualReview: boolean;
}

/** Regra por categoria: só taxa (bps) + teto verificados entram aqui. */
export interface DeductionRule {
  rateBps: number;
  capCents: number | null;
}

export interface TaxDeductionRuleSet {
  taxYear: number;
  jurisdiction: string;
  version: string;
  /** Fonte oficial ou "none-verified". */
  source: string;
  verifiedAt: string | null;
  rules: Partial<Record<PersonalExpenseCategory, DeductionRule>>;
}

const SUPPORTED_CURRENCIES: ReadonlySet<string> = new Set(["EUR"]);

function isCategory(value: string): value is PersonalExpenseCategory {
  return (PERSONAL_EXPENSE_CATEGORIES as ReadonlyArray<string>).includes(value);
}

/**
 * Contexto fiscal mínimo exigido pelos artigos 78.º-B/C/D para confirmar
 * elegibilidade: fatura comunicada à AT + NIF do adquirente + CAE elegível.
 * O P1 não recolhe estes dados por defeito → contexto ausente → MANUAL_REVIEW.
 */
export interface DeductionFiscalContext {
  faturaComunicada?: boolean;
  nifAdquirente?: boolean;
  caeElegivel?: boolean;
}

/**
 * Validador estrito de flags de contexto vindas do browser.
 * Só aceita booleanos reais; strings como "true" são rejeitadas (null =
 * não informado). Nunca recebe nem devolve NIF.
 */
export function parseContextFlag(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

/**
 * Avalia despesa contra o ruleset. Determinística: mesmos inputs → mesmo
 * output; sem relógio, sem random, sem I/O.
 */
export function evaluatePersonalExpense(
  input: PersonalExpenseInput,
  rules: TaxDeductionRuleSet,
  context?: DeductionFiscalContext,
): DeductionEvaluation {
  const manual = (reasonCode: DeductionReasonCode): DeductionEvaluation => ({
    status: "MANUAL_REVIEW",
    deductibleCents: 0,
    reasonCode,
    ruleVersion: rules.version,
    requiresManualReview: true,
  });
  const blocked = (reasonCode: DeductionReasonCode): DeductionEvaluation => ({
    status: "NOT_ELIGIBLE",
    deductibleCents: 0,
    reasonCode,
    ruleVersion: rules.version,
    requiresManualReview: false,
  });
  if (
    !Number.isInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    !SUPPORTED_CURRENCIES.has(input.currency) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate)
  ) {
    return blocked("INVALID_INPUT");
  }
  if (Number(input.expenseDate.slice(0, 4)) !== rules.taxYear) {
    return manual("OUT_OF_YEAR");
  }
  if (!isCategory(input.category) || input.category === "UNKNOWN") {
    return blocked("UNKNOWN_CATEGORY");
  }
  const rule = rules.rules[input.category];
  if (!rule || !rules.verifiedAt) {
    return manual("RULE_UNVERIFIED");
  }
  if (
    context?.faturaComunicada !== true ||
    context?.nifAdquirente !== true ||
    context?.caeElegivel !== true
  ) {
    return manual("MISSING_CONTEXT");
  }
  const raw = Math.floor((input.amountCents * rule.rateBps) / 10000);
  if (raw <= 0) {
    return {
      status: "NOT_ELIGIBLE",
      deductibleCents: 0,
      reasonCode: "CATEGORY_INELIGIBLE",
      ruleVersion: rules.version,
      requiresManualReview: false,
    };
  }
  const capped =
    rule.capCents !== null && rule.capCents !== undefined
      ? Math.min(raw, rule.capCents)
      : raw;
  const full = capped === input.amountCents;
  return {
    status: full ? "ELIGIBLE" : "PARTIALLY_ELIGIBLE",
    deductibleCents: capped,
    reasonCode: capped < raw ? "RULE_CAPPED" : "RULE_APPLIED",
    ruleVersion: rules.version,
    requiresManualReview: false,
  };
}

/**
 * Ruleset PT 2026 distribuído: SEM taxas fiscais verificadas.
 * Toda a elegibilidade fiscal cai em MANUAL_REVIEW + RULE_UNVERIFIED.
 * Taxas só entram aqui com fonte oficial comprovada.
 */
export const PT_2026_UNVERIFIED_RULES: TaxDeductionRuleSet = {
  taxYear: 2026,
  jurisdiction: "PT",
  version: "2026.0-unverified",
  source: "none-verified",
  verifiedAt: null,
  rules: {},
};

/**
 * Ruleset PT 2026 com taxas verificadas no CIRS republicado (AT, 2026-09-09).
 * Despesas de 2026 → declaração 2027. Taxas/caps:
 * - GENERAL_FAMILY_EXPENSES: 35%, €250/sujeito passivo (art. 78.º-B;
 *   variante monoparental 45%/€335 exige contexto → não aplicada aqui).
 * - HEALTH: 15%, €1000 global (art. 78.º-C; taxa normal exige receita
 *   médica, comparticipações excluídas → contexto).
 * - EDUCATION: 30%, €800 global (art. 78.º-D; rendas estudante deslocado
 *   e refeições têm condições próprias → contexto).
 * A elegibilidade seMPRE exige contexto fiscal (fatura comunicada + NIF +
 * CAE); sem ele → MANUAL_REVIEW + MISSING_CONTEXT. Limite global do
 * art. 78.º n.º 7 (rendimento coletável/dependentes) exige agregado →
 * nunca calculado aqui.
 */
export const PT_2026_CIRS_RULES: TaxDeductionRuleSet = {
  taxYear: 2026,
  jurisdiction: "PT",
  version: "2026.1-cirs-2026-09-09",
  source: "CIRS art. 78-B/C/D (info.portaldasfinancas.gov.pt)",
  verifiedAt: "2026-09-09",
  rules: {
    GENERAL_FAMILY_EXPENSES: { rateBps: 3500, capCents: 25000 },
    HEALTH: { rateBps: 1500, capCents: 100000 },
    EDUCATION: { rateBps: 3000, capCents: 80000 },
  },
};

export interface TaxYearSummary {
  taxYear: number;
  totalExpensesCents: number;
  eligibleCents: number;
  pendingValidationCents: number;
  manualReviewCents: number;
  deductibleTotalCents: number;
  byCategory: Partial<Record<PersonalExpenseCategory, number>>;
}

/** Resumo anual local ("Resumo fiscal pessoal", nunca "IRS final"). */
export function summarizeTaxYear(
  taxYear: number,
  items: Array<{ amountCents: number; category: PersonalExpenseCategory; evaluation: DeductionEvaluation }>,
): TaxYearSummary {
  const summary: TaxYearSummary = {
    taxYear,
    totalExpensesCents: 0,
    eligibleCents: 0,
    pendingValidationCents: 0,
    manualReviewCents: 0,
    deductibleTotalCents: 0,
    byCategory: {},
  };
  for (const item of items) {
    summary.totalExpensesCents += item.amountCents;
    summary.deductibleTotalCents += item.evaluation.deductibleCents;
    summary.byCategory[item.category] =
      (summary.byCategory[item.category] ?? 0) + item.amountCents;
    if (item.evaluation.status === "ELIGIBLE" || item.evaluation.status === "PARTIALLY_ELIGIBLE") {
      summary.eligibleCents += item.amountCents;
    } else if (item.evaluation.status === "MANUAL_REVIEW") {
      summary.manualReviewCents += item.amountCents;
    } else if (item.evaluation.status === "PENDING_VALIDATION") {
      summary.pendingValidationCents += item.amountCents;
    }
  }
  return summary;
}
