/**
 * RPG-OS — IRS Personal Preparation Model (P1.3).
 *
 * Preparação local de IRS Modelo 3 para pessoa singular.
 * NÃO é submissão. NÃO é integração AT. NÃO calcula reembolso/imposto final.
 * Consome deduções certificadas P1/P1.1/P1.2. Determinístico, sem rede, cents.
 */

import type { PersonalExpenseCategory, TaxYearSummary } from "./personalDeductions";
export type { TaxYearSummary } from "./personalDeductions";

/** Ano fiscal (despesas) vs ano de declaração (entrega). */
export interface TaxYearScope {
  /** Ano das despesas/rendimentos (ex: 2026). */
  taxYear: number;
  /** Ano de entrega da declaração (ex: 2027). */
  declarationYear: number;
}

/** Estados fechados do draft de preparação. */
export type IrsPreparationStatus =
  | "DRAFT"
  | "READY_FOR_REVIEW"
  | "INCOMPLETE"
  | "MANUAL_REVIEW"
  | "LOCKED";

/** Categorias de rendimento suportadas (estado por categoria). */
export type IncomeCategory =
  | "A" // trabalho dependente
  | "B" // empresariais/profissionais
  | "E" // capitais
  | "F" // prediais
  | "G" // incrementos patrimoniais
  | "H"; // pensões

export type IncomeSupportStatus =
  | "SUPPORTED"
  | "PARTIAL"
  | "MANUAL_REVIEW"
  | "UNAVAILABLE";

export interface IncomeCategoryStatus {
  category: IncomeCategory;
  status: IncomeSupportStatus;
  note: string;
}

/** Secções do Modelo 3 relevantes para preparação local. */
export type Model3Section =
  | "RENDIMENTOS"
  | "RETENCOES"
  | "PAGAMENTOS_CONTA"
  | "DEDUCOES_COLETA"
  | "AGREGADO_FAMILIAR"
  | "DEPENDENTES"
  | "RESIDENCIA_FISCAL"
  | "BENEFICIOS_FISCAIS"
  | "SITUACOES_ESPECIAIS";

export interface SectionCompleteness {
  section: Model3Section;
  status: "COMPLETE" | "PARTIAL" | "MANUAL_REVIEW" | "UNAVAILABLE";
  detail: string;
}

/** Provenance de cada valor calculado. */
export interface ValueProvenance {
  source: "personal_deductions" | "fiscal_obligations" | "profiles" | "manual" | "derived";
  ruleVersion?: string;
  calculatedAt: string;
  inputRef?: string;
}

/** Totais agregados da preparação. */
export interface IrsPreparationTotals {
  /** Despesas totais registadas (cents). */
  totalExpensesCents: number;
  /** Dedutível local confirmado (cents). */
  deductibleConfirmedCents: number;
  /** Dedutível com revisão manual necessária (cents). */
  deductibleManualReviewCents: number;
  /** Despesas por validar (cents). */
  pendingValidationCents: number;
  /** Por categoria fiscal. */
  byCategory: Partial<Record<PersonalExpenseCategory, number>>;
  /** Rendimentos (se disponíveis). */
  income?: {
    totalDeclaredCents: number;
    byCategory: Partial<Record<IncomeCategory, number>>;
  };
  /** Retenções na fonte (se disponíveis). */
  withholdings?: {
    totalCents: number;
  };
  /** Pagamentos por conta (se disponíveis). */
  paymentsOnAccount?: {
    totalCents: number;
  };
}

/** Snapshot de proveniência para reprodutibilidade. */
export interface PreparationProvenance {
  rulesetVersion: string;
  rulesetSource: string;
  rulesetVerifiedAt: string | null;
  deductionsSnapshot: {
    count: number;
    totalCents: number;
    deductibleCents: number;
    ruleVersions: string[];
  };
  obligationsSnapshot?: {
    count: number;
    categories: string[];
  };
  inputFingerprint: string;
}

/** Modelo principal de preparação IRS pessoal. */
export interface PersonalIrsPreparation {
  id: string;
  userId: string;
  taxYear: number;
  declarationYear: number;
  status: IrsPreparationStatus;
  rulesetVersion: string;
  totals: IrsPreparationTotals;
  sections: SectionCompleteness[];
  incomeStatus: IncomeCategoryStatus[];
  unresolvedItems: Array<{
    section: Model3Section;
    reason: string;
    detail: string;
  }>;
  provenance: PreparationProvenance;
  createdAt: string;
  updatedAt: string;
}

/** Input para criar/atualizar preparação. */
export interface CreateIrsPreparationInput {
  taxYear: number;
  /** Opcional: forçar regeneração se já existir. */
  forceRefresh?: boolean;
}

/** Resultado da ação de preparação. */
export interface IrsPreparationActionResult {
  ok: boolean;
  preparation?: PersonalIrsPreparation;
  error?: string;
}

/**
 * Valida se o taxYear é suportado (apenas 2026 nesta fase).
 */
export function isSupportedTaxYear(taxYear: number): boolean {
  return taxYear === 2026;
}

/**
 * Calcula o ano de declaração a partir do ano fiscal.
 * Despesas de 2026 → declaração em 2027.
 */
export function calculateDeclarationYear(taxYear: number): number {
  return taxYear + 1;
}

/**
 * Valida se o escopo de ano é consistente.
 */
export function validateTaxYearScope(scope: TaxYearScope): boolean {
  return scope.declarationYear === scope.taxYear + 1 && isSupportedTaxYear(scope.taxYear);
}

/**
 * Estado padrão de secções do Modelo 3 (tudo MANUAL_REVIEW/UNAVAILABLE exceto deduções).
 */
export function defaultSectionCompleteness(hasDeductions: boolean): SectionCompleteness[] {
  return [
    {
      section: "RENDIMENTOS",
      status: "UNAVAILABLE",
      detail: "Sem modelo de rendimentos pessoais implementado. Requer inserção manual ou importação.",
    },
    {
      section: "RETENCOES",
      status: "UNAVAILABLE",
      detail: "Sem dados de retenções na fonte. Requer inserção manual.",
    },
    {
      section: "PAGAMENTOS_CONTA",
      status: "UNAVAILABLE",
      detail: "Sem dados de pagamentos por conta. Requer inserção manual.",
    },
    {
      section: "DEDUCOES_COLETA",
      status: hasDeductions ? "PARTIAL" : "UNAVAILABLE",
      detail: hasDeductions
        ? "Deduções locais calculadas (Geral/Saúde/Educação). Limite global art. 78.º n.º 7 não aplicado (exige agregado/rendimento)."
        : "Sem despesas registadas.",
    },
    {
      section: "AGREGADO_FAMILIAR",
      status: "MANUAL_REVIEW",
      detail: "Estado civil, união de facto, residência fiscal não recolhidos. Requer preenchimento manual.",
    },
    {
      section: "DEPENDENTES",
      status: "MANUAL_REVIEW",
      detail: "Dependentes não modelados. Requer preenchimento manual se aplicável.",
    },
    {
      section: "RESIDENCIA_FISCAL",
      status: "MANUAL_REVIEW",
      detail: "Residência fiscal não inferida. Requer confirmação explícita.",
    },
    {
      section: "BENEFICIOS_FISCAIS",
      status: "UNAVAILABLE",
      detail: "Benefícios fiscais não modelados.",
    },
    {
      section: "SITUACOES_ESPECIAIS",
      status: "UNAVAILABLE",
      detail: "Situações especiais (não residente, NHR, etc.) não modeladas.",
    },
  ];
}

/**
 * Estado padrão de categorias de rendimento (todas UNAVAILABLE nesta fase).
 */
export function defaultIncomeStatus(): IncomeCategoryStatus[] {
  const categories: IncomeCategory[] = ["A", "B", "E", "F", "G", "H"];
  return categories.map((cat) => ({
    category: cat,
    status: "UNAVAILABLE" as IncomeSupportStatus,
    note: "Sem modelo de rendimentos pessoais. Requer inserção manual no Modelo 3 oficial.",
  }));
}

/**
 * Gera fingerprint determinístico dos inputs para reprodutibilidade.
 */
export function generateInputFingerprint(
  deductionsSummary: TaxYearSummary,
  obligationsCount: number,
  rulesetVersion: string,
): string {
  const parts = [
    `deductions:${deductionsSummary.totalExpensesCents}:${deductionsSummary.deductibleTotalCents}`,
    `obligations:${obligationsCount}`,
    `ruleset:${rulesetVersion}`,
  ];
  return parts.join("|");
}

/**
 * Determina o status geral da preparação baseado nas secções.
 */
export function deriveOverallStatus(sections: SectionCompleteness[]): IrsPreparationStatus {
  const hasUnavailable = sections.some((s) => s.status === "UNAVAILABLE");
  const hasManualReview = sections.some((s) => s.status === "MANUAL_REVIEW");
  const allComplete = sections.every((s) => s.status === "COMPLETE");
  const allCompleteOrPartial = sections.every(
    (s) => s.status === "COMPLETE" || s.status === "PARTIAL",
  );

  if (allComplete) return "READY_FOR_REVIEW";
  if (allCompleteOrPartial && !hasUnavailable && !hasManualReview) return "READY_FOR_REVIEW";
  if (hasManualReview) return "MANUAL_REVIEW";
  if (hasUnavailable) return "INCOMPLETE";
  return "DRAFT";
}

/**
 * Unresolved items padrão baseados nas secções incompletas.
 */
export function deriveUnresolvedItems(sections: SectionCompleteness[]): PersonalIrsPreparation["unresolvedItems"] {
  return sections
    .filter((s) => s.status !== "COMPLETE")
    .map((s) => ({
      section: s.section,
      reason: s.status,
      detail: s.detail,
    }));
}