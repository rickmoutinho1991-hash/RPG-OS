"use server";

/**
 * RPG-OS — despesas/deduções pessoais (P1, server-side only, sem AT).
 *
 * user_id sempre da sessão (nunca do browser). Avaliação pelo motor puro
 * com ruleset PT 2026 não verificado → elegibilidade fiscal cai em
 * MANUAL_REVIEW. Sem rede, sem Vault, sem submissão.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { getCurrentUser } from "@/lib/supabase/auth";
import {
  evaluatePersonalExpense,
  parseContextFlag,
  PERSONAL_EXPENSE_CATEGORIES,
  PT_2026_CIRS_RULES,
  summarizeTaxYear,
  type DeductionFiscalContext,
  type DeductionStatus,
  type PersonalExpenseCategory,
} from "@rpg/core";
import { hasPermission } from "@rpg/core";

export interface PersonalDeductionInput {
  expenseDate: string;
  description: string;
  amountCents: number;
  category: string;
  sourceType?: string | null;
  sourceReference?: string | null;
  /** Flags de contexto (booleanos estritos; ausente = não informado). */
  faturaComunicada?: unknown;
  buyerNifMatch?: unknown;
  caeElegivel?: unknown;
}

export interface PersonalDeductionView {
  id: string;
  expenseDate: string;
  description: string;
  amountCents: number;
  category: string;
  fiscalStatus: string;
  deductibleCents: number;
  reasonCode: string;
  ruleVersion: string;
  faturaComunicada: boolean | null;
  buyerNifMatch: boolean | null;
  caeElegivel: boolean | null;
}

export interface DeductionActionResult {
  ok: boolean;
  error?: string;
}

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

function isCategory(value: string): value is PersonalExpenseCategory {
  return (PERSONAL_EXPENSE_CATEGORIES as ReadonlyArray<string>).includes(value);
}

/**
 * Normaliza flags de contexto do browser: só booleanos reais passam;
 * qualquer outro tipo → INVALID_CONTEXT (fail-closed, sem persistir).
 */
function readContextFlags(input: PersonalDeductionInput): {
  ok: boolean;
  flags: { faturaComunicada: boolean | null; buyerNifMatch: boolean | null; caeElegivel: boolean | null };
} {
  for (const key of ["faturaComunicada", "buyerNifMatch", "caeElegivel"] as const) {
    const v = input[key];
    if (v !== undefined && typeof v !== "boolean") return { ok: false, flags: { faturaComunicada: null, buyerNifMatch: null, caeElegivel: null } };
  }
  return {
    ok: true,
    flags: {
      faturaComunicada: parseContextFlag(input.faturaComunicada),
      buyerNifMatch: parseContextFlag(input.buyerNifMatch),
      caeElegivel: parseContextFlag(input.caeElegivel),
    },
  };
}

function toEngineContext(flags: {
  faturaComunicada: boolean | null;
  buyerNifMatch: boolean | null;
  caeElegivel: boolean | null;
}): DeductionFiscalContext | undefined {
  if (flags.faturaComunicada === null && flags.buyerNifMatch === null && flags.caeElegivel === null) {
    return undefined;
  }
  return {
    faturaComunicada: flags.faturaComunicada ?? undefined,
    nifAdquirente: flags.buyerNifMatch ?? undefined,
    caeElegivel: flags.caeElegivel ?? undefined,
  };
}

export async function createPersonalDeduction(
  input: PersonalDeductionInput,
): Promise<DeductionActionResult> {
  const auth = await authorizedWriter();
  if (!auth) return { ok: false, error: "FORBIDDEN" };
  const description = input.description.trim().slice(0, 200);
  if (!description || !Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: "INVALID_INPUT" };
  }
  if (!isCategory(input.category)) return { ok: false, error: "INVALID_CATEGORY" };
  const ctx = readContextFlags(input);
  if (!ctx.ok) return { ok: false, error: "INVALID_CONTEXT" };
  const evaluation = evaluatePersonalExpense(
    {
      amountCents: input.amountCents,
      currency: "EUR",
      category: input.category,
      expenseDate: input.expenseDate,
    },
    PT_2026_CIRS_RULES,
    toEngineContext(ctx.flags),
  );
  if (evaluation.status === "NOT_ELIGIBLE" && evaluation.reasonCode === "INVALID_INPUT") {
    return { ok: false, error: "INVALID_INPUT" };
  }
  const supabase = createAdminClient();
  const { error } = await supabase.from("personal_deductions").insert({
    user_id: auth.user.id,
    expense_date: input.expenseDate,
    description,
    amount_cents: input.amountCents,
    currency: "EUR",
    category: input.category,
    fiscal_status: evaluation.status,
    deductible_cents: evaluation.deductibleCents,
    reason_code: evaluation.reasonCode,
    rule_version: evaluation.ruleVersion,
    fatura_comunicada: ctx.flags.faturaComunicada,
    buyer_nif_match: ctx.flags.buyerNifMatch,
    cae_elegivel: ctx.flags.caeElegivel,
    source_type: input.sourceType?.trim() || null,
    source_reference: input.sourceReference?.trim() || null,
  });
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "DUPLICATE" : "STORE_FAILED",
    };
  }
  return { ok: true };
}

export async function listPersonalDeductions(
  taxYear?: number,
): Promise<PersonalDeductionView[]> {
  const auth = await authorizedReader();
  if (!auth) return [];
  const supabase = createAdminClient();
  let query = supabase
    .from("personal_deductions")
    .select(
      "id,expense_date,description,amount_cents,category,fiscal_status,deductible_cents,reason_code,rule_version,fatura_comunicada,buyer_nif_match,cae_elegivel",
    )
    .eq("user_id", auth.user.id)
    .order("expense_date", { ascending: false })
    .limit(200);
  if (taxYear) {
    query = query
      .gte("expense_date", `${taxYear}-01-01`)
      .lte("expense_date", `${taxYear}-12-31`);
  }
  const { data } = await query;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    expenseDate: String(r.expense_date),
    description: String(r.description),
    amountCents: Number(r.amount_cents),
    category: String(r.category),
    fiscalStatus: String(r.fiscal_status),
    deductibleCents: Number(r.deductible_cents),
    reasonCode: String(r.reason_code),
    ruleVersion: String(r.rule_version),
    faturaComunicada: typeof r.fatura_comunicada === "boolean" ? (r.fatura_comunicada as boolean) : null,
    buyerNifMatch: typeof r.buyer_nif_match === "boolean" ? (r.buyer_nif_match as boolean) : null,
    caeElegivel: typeof r.cae_elegivel === "boolean" ? (r.cae_elegivel as boolean) : null,
  }));
}

/**
 * Atualiza o contexto fiscal de uma despesa (recalcula server-side).
 * Idempotente: repetir os mesmos flags não cria nada novo. Nunca aceita
 * resultados (status/dedutível) do browser.
 */
export async function updateDeductionContext(
  id: string,
  flags: { faturaComunicada?: unknown; buyerNifMatch?: unknown; caeElegivel?: unknown },
): Promise<DeductionActionResult> {
  const auth = await authorizedWriter();
  if (!auth) return { ok: false, error: "FORBIDDEN" };
  const parsed = readContextFlags({
    expenseDate: "",
    description: "",
    amountCents: 0,
    category: "",
    ...flags,
  });
  if (!parsed.ok) return { ok: false, error: "INVALID_CONTEXT" };
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("personal_deductions")
    .select("amount_cents,category,expense_date")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const row = data as unknown as {
    amount_cents: number;
    category: string;
    expense_date: string;
  } | null;
  if (!row) return { ok: false, error: "NOT_FOUND" };
  const evaluation = evaluatePersonalExpense(
    {
      amountCents: Number(row.amount_cents),
      currency: "EUR",
      category: String(row.category),
      expenseDate: String(row.expense_date),
    },
    PT_2026_CIRS_RULES,
    toEngineContext(parsed.flags),
  );
  const { error } = await supabase
    .from("personal_deductions")
    .update({
      fatura_comunicada: parsed.flags.faturaComunicada,
      buyer_nif_match: parsed.flags.buyerNifMatch,
      cae_elegivel: parsed.flags.caeElegivel,
      fiscal_status: evaluation.status,
      deductible_cents: evaluation.deductibleCents,
      reason_code: evaluation.reasonCode,
      rule_version: evaluation.ruleVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", auth.user.id);
  if (error) return { ok: false, error: "UPDATE_FAILED" };
  return { ok: true };
}

export async function deletePersonalDeduction(id: string): Promise<DeductionActionResult> {
  const auth = await authorizedWriter();
  if (!auth) return { ok: false, error: "FORBIDDEN" };
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("personal_deductions")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);
  if (error) return { ok: false, error: "DELETE_FAILED" };
  return { ok: true };
}

export interface TaxYearSummaryView {
  taxYear: number;
  totalExpensesCents: number;
  eligibleCents: number;
  pendingValidationCents: number;
  manualReviewCents: number;
  deductibleTotalCents: number;
  byCategory: Partial<Record<string, number>>;
}

export async function getPersonalDeductionSummary(
  taxYear: number,
): Promise<TaxYearSummaryView | null> {
  const items = await listPersonalDeductions(taxYear);
  if (items.length === 0 && !(await authorizedReader())) return null;
  const summary = summarizeTaxYear(
    taxYear,
    items.map((i) => ({
      amountCents: i.amountCents,
      category: i.category as PersonalExpenseCategory,
      evaluation: {
        status: i.fiscalStatus as DeductionStatus,
        deductibleCents: i.deductibleCents,
        reasonCode: i.reasonCode as never,
        ruleVersion: i.ruleVersion,
        requiresManualReview: i.fiscalStatus === "MANUAL_REVIEW",
      },
    })),
  );
  return {
    taxYear: summary.taxYear,
    totalExpensesCents: summary.totalExpensesCents,
    eligibleCents: summary.eligibleCents,
    pendingValidationCents: summary.pendingValidationCents,
    manualReviewCents: summary.manualReviewCents,
    deductibleTotalCents: summary.deductibleTotalCents,
    byCategory: summary.byCategory,
  };
}
