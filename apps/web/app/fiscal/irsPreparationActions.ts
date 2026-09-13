"use server";

/**
 * RPG-OS — IRS Preparation Server Actions (P1.3).
 *
 * Prepara draft local de IRS Modelo 3 para pessoa singular.
 * Consome deduções P1/P1.1/P1.2 certificadas. Sem rede, sem AT, sem submissão.
 * user_id sempre da sessão server-side. taxYear validado (2026 apenas).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { getCurrentUser } from "@/lib/supabase/auth";
import { hasPermission } from "@rpg/core";
import {
  type PersonalIrsPreparation,
  type IrsPreparationActionResult,
  type CreateIrsPreparationInput,
  type TaxYearScope,
  type IrsPreparationTotals,
  type SectionCompleteness,
  type IncomeCategoryStatus,
  type PreparationProvenance,
  calculateDeclarationYear,
  validateTaxYearScope,
  defaultSectionCompleteness,
  defaultIncomeStatus,
  deriveOverallStatus,
  deriveUnresolvedItems,
  generateInputFingerprint,
} from "@rpg/core";
import {
  listPersonalDeductions,
  getPersonalDeductionSummary,
  type PersonalDeductionView,
  type TaxYearSummaryView,
} from "./expenseActions";

const SUPPORTED_TAX_YEAR = 2026;
const DECLARATION_YEAR = 2027;
const RULESET_VERSION = "2026.1-cirs-2026-09-09";
const RULESET_SOURCE = "CIRS art. 78-B/C/D (info.portaldasfinancas.gov.pt)";
const RULESET_VERIFIED_AT = "2026-09-09";

async function authorizedReader() {
  const session = await getSessionContext();
  if (!session || !hasPermission(session.permissions, "fiscal.view")) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  return { user };
}

async function authorizedWriter() {
  const session = await getSessionContext();
  if (!session || !hasPermission(session.permissions, "fiscal.manage")) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  return { user };
}

/**
 * Busca obrigações fiscais do utilizador para o ano (para snapshot de proveniência).
 */
async function fetchObligationsSnapshot(userId: string, taxYear: number): Promise<{
  count: number;
  categories: string[];
}> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("fiscal_obligations")
    .select("category")
    .eq("user_id", userId)
    .gte("due_date", `${taxYear}-01-01`)
    .lte("due_date", `${taxYear}-12-31`);
  const categories = [...new Set((data ?? []).map((d) => d.category))];
  return { count: data?.length ?? 0, categories };
}

/**
 * Constrói os totais da preparação a partir do resumo de deduções.
 */
function buildTotals(summary: TaxYearSummaryView | null): IrsPreparationTotals {
  if (!summary) {
    return {
      totalExpensesCents: 0,
      deductibleConfirmedCents: 0,
      deductibleManualReviewCents: 0,
      pendingValidationCents: 0,
      byCategory: {},
    };
  }
  // Separar dedutível confirmado (ELIGIBLE/PARTIALLY_ELIGIBLE) do manual_review
  // O summary já tem deductibleTotalCents (soma de todo deductible_cents)
  // e manualReviewCents (total de despesas em MANUAL_REVIEW)
  // Precisamos recalcular deductibleConfirmedCents = deductibleTotalCents - (dedutível de MANUAL_REVIEW que é 0)
  // Como MANUAL_REVIEW tem deductible_cents = 0, deductibleConfirmedCents = deductibleTotalCents
  return {
    totalExpensesCents: summary.totalExpensesCents,
    deductibleConfirmedCents: summary.deductibleTotalCents,
    deductibleManualReviewCents: 0, // MANUAL_REVIEW não tem valor dedutível
    pendingValidationCents: summary.manualReviewCents, // despesas por validar
    byCategory: summary.byCategory,
  };
}

/**
 * Gera ou atualiza a preparação IRS para o utilizador e ano fiscal.
 * Idempotente: mesmo user + taxYear → mesmo draft (salvo forceRefresh).
 */
export async function createOrRefreshPersonalIrsPreparation(
  input: CreateIrsPreparationInput,
): Promise<IrsPreparationActionResult> {
  const auth = await authorizedWriter();
  if (!auth) return { ok: false, error: "FORBIDDEN" };

  const { taxYear, forceRefresh = false } = input;

  if (!validateTaxYearScope({ taxYear, declarationYear: calculateDeclarationYear(taxYear) })) {
    return { ok: false, error: "INVALID_TAX_YEAR" };
  }

  const supabase = createAdminClient();

  // Verificar se já existe
  const { data: existing } = await supabase
    .from("personal_irs_preparation")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("tax_year", taxYear)
    .maybeSingle();

  if (existing && !forceRefresh) {
    return { ok: true, preparation: existing as PersonalIrsPreparation };
  }

  // Buscar deduções e resumo
  const [deductions, summary] = await Promise.all([
    listPersonalDeductions(taxYear),
    getPersonalDeductionSummary(taxYear),
  ]);

  const obligationsSnapshot = await fetchObligationsSnapshot(auth.user.id, taxYear);
  const totals = buildTotals(summary);
  const sections = defaultSectionCompleteness(deductions.length > 0);
  const incomeStatus = defaultIncomeStatus();
  const unresolvedItems = deriveUnresolvedItems(sections);
  const overallStatus = deriveOverallStatus(sections);

  const fingerprint = generateInputFingerprint(
    summary ?? {
      taxYear,
      totalExpensesCents: 0,
      eligibleCents: 0,
      pendingValidationCents: 0,
      manualReviewCents: 0,
      deductibleTotalCents: 0,
      byCategory: {},
    },
    obligationsSnapshot.count,
    RULESET_VERSION,
  );

  const provenance: PreparationProvenance = {
    rulesetVersion: RULESET_VERSION,
    rulesetSource: RULESET_SOURCE,
    rulesetVerifiedAt: RULESET_VERIFIED_AT,
    deductionsSnapshot: {
      count: deductions.length,
      totalCents: summary?.totalExpensesCents ?? 0,
      deductibleCents: summary?.deductibleTotalCents ?? 0,
      ruleVersions: [...new Set(deductions.map((d) => d.ruleVersion).filter(Boolean))],
    },
    obligationsSnapshot,
    inputFingerprint: fingerprint,
  };

  const preparation: PersonalIrsPreparation = {
    id: existing?.id ?? crypto.randomUUID(),
    userId: auth.user.id,
    taxYear,
    declarationYear: DECLARATION_YEAR,
    status: overallStatus,
    rulesetVersion: RULESET_VERSION,
    totals,
    sections,
    incomeStatus,
    unresolvedItems,
    provenance,
    createdAt: existing?.created_at ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const { error } = existing
    ? await supabase
        .from("personal_irs_preparation")
        .update({
          status: preparation.status,
          ruleset_version: preparation.rulesetVersion,
          totals: preparation.totals,
          sections: preparation.sections,
          income_status: preparation.incomeStatus,
          unresolved_items: preparation.unresolvedItems,
          provenance: preparation.provenance,
          updated_at: preparation.updatedAt,
        })
        .eq("id", existing.id)
        .eq("user_id", auth.user.id)
    : await supabase.from("personal_irs_preparation").insert({
        id: preparation.id,
        user_id: preparation.userId,
        tax_year: preparation.taxYear,
        declaration_year: preparation.declarationYear,
        status: preparation.status,
        ruleset_version: preparation.rulesetVersion,
        totals: preparation.totals,
        sections: preparation.sections,
        income_status: preparation.incomeStatus,
        unresolved_items: preparation.unresolvedItems,
        provenance: preparation.provenance,
        created_at: preparation.createdAt,
        updated_at: preparation.updatedAt,
      });

  if (error) {
    return { ok: false, error: error.code === "23505" ? "DUPLICATE" : "STORE_FAILED" };
  }

  return { ok: true, preparation };
}

/**
 * Obtém a preparação IRS existente para o utilizador e ano fiscal.
 */
export async function getPersonalIrsPreparation(
  taxYear: number = SUPPORTED_TAX_YEAR,
): Promise<PersonalIrsPreparation | null> {
  const auth = await authorizedReader();
  if (!auth) return null;

  if (!validateTaxYearScope({ taxYear, declarationYear: calculateDeclarationYear(taxYear) })) {
    return null;
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("personal_irs_preparation")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("tax_year", taxYear)
    .maybeSingle();

  return (data as PersonalIrsPreparation) ?? null;
}

/**
 * Bloqueia a preparação (LOCKED) — impede regeneração automática.
 * Útil quando o utilizador quer revisar manualmente antes de nova geração.
 */
export async function lockPersonalIrsPreparation(
  taxYear: number = SUPPORTED_TAX_YEAR,
): Promise<IrsPreparationActionResult> {
  const auth = await authorizedWriter();
  if (!auth) return { ok: false, error: "FORBIDDEN" };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("personal_irs_preparation")
    .update({ status: "LOCKED", updated_at: new Date().toISOString() })
    .eq("user_id", auth.user.id)
    .eq("tax_year", taxYear)
    .select()
    .maybeSingle();

  if (error) return { ok: false, error: "UPDATE_FAILED" };
  if (!data) return { ok: false, error: "NOT_FOUND" };

  return { ok: true, preparation: data as PersonalIrsPreparation };
}

/**
 * Desbloqueia a preparação (volta a DRAFT para permitir refresh).
 */
export async function unlockPersonalIrsPreparation(
  taxYear: number = SUPPORTED_TAX_YEAR,
): Promise<IrsPreparationActionResult> {
  const auth = await authorizedWriter();
  if (!auth) return { ok: false, error: "FORBIDDEN" };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("personal_irs_preparation")
    .update({ status: "DRAFT", updated_at: new Date().toISOString() })
    .eq("user_id", auth.user.id)
    .eq("tax_year", taxYear)
    .select()
    .maybeSingle();

  if (error) return { ok: false, error: "UPDATE_FAILED" };
  if (!data) return { ok: false, error: "NOT_FOUND" };

  return { ok: true, preparation: data as PersonalIrsPreparation };
}

/**
 * View simplificada para a UI.
 */
export interface IrsPreparationView {
  id: string;
  taxYear: number;
  declarationYear: number;
  status: string;
  rulesetVersion: string;
  totals: IrsPreparationTotals;
  sections: SectionCompleteness[];
  incomeStatus: IncomeCategoryStatus[];
  unresolvedItems: PersonalIrsPreparation["unresolvedItems"];
  provenance: PreparationProvenance;
  createdAt: string;
  updatedAt: string;
}

export async function getPersonalIrsPreparationView(
  taxYear: number = SUPPORTED_TAX_YEAR,
): Promise<IrsPreparationView | null> {
  const prep = await getPersonalIrsPreparation(taxYear);
  if (!prep) return null;
  return {
    id: prep.id,
    taxYear: prep.taxYear,
    declarationYear: prep.declarationYear,
    status: prep.status,
    rulesetVersion: prep.rulesetVersion,
    totals: prep.totals,
    sections: prep.sections,
    incomeStatus: prep.incomeStatus,
    unresolvedItems: prep.unresolvedItems,
    provenance: prep.provenance,
    createdAt: prep.createdAt,
    updatedAt: prep.updatedAt,
  };
}

// Re-export types from @rpg/core for testing
export type {
  PersonalIrsPreparation,
  IrsPreparationActionResult,
  CreateIrsPreparationInput,
  TaxYearScope,
  IrsPreparationTotals,
  SectionCompleteness,
  IncomeCategoryStatus,
  PreparationProvenance,
} from "@rpg/core";