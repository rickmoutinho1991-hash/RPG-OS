/**
 * RPG-OS — Pagamento + Garantia de Marketplace (P7c).
 *
 * No approve de milestone (owner):
 *  - receita no provider (finance_incomes) + despesa no client
 *    (finance_expenses), valores em EUR (centavos -> euro);
 *  - guard de idempotência por milestone (marketplace_milestone_payments);
 * Em contrato COMPLETED:
 *  - garantia automática a partir dos termos da proposta adjudicada
 *    (service_quotes.warranty_months), uma única vez por contrato.
 * Audit M3 (sem conteúdos) via recordAuditEvent.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/audit";

export interface PaymentContractLike {
  id: string;
  client_id: string;
  provider_id: string;
  adjudicated_quote_id: string | null;
  status: string;
}

export interface PaymentMilestoneLike {
  id: string;
  contract_id: string;
  title: string;
  amount_cents: number;
}

export interface RecordMilestonePaymentResult {
  duplicated: boolean;
  incomeId?: string;
  expenseId?: string;
}

/**
 * Cria os movimentos financeiros do pagamento de um milestone.
 * Idempotente: guard por milestone_id em marketplace_milestone_payments.
 */
export async function recordMilestonePayment(
  contract: PaymentContractLike,
  milestone: PaymentMilestoneLike,
  actorId: string,
): Promise<RecordMilestonePaymentResult> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("marketplace_milestone_payments")
    .select("id")
    .eq("milestone_id", milestone.id)
    .maybeSingle();
  if (existing) {
    return { duplicated: true };
  }

  const amountEuro = milestone.amount_cents / 100;
  const today = new Date().toISOString().slice(0, 10);
  const reference = `milestone=${milestone.id};contrato=${contract.id}`;

  const { data: income, error: incomeError } = await supabase
    .from("finance_incomes")
    .insert({
      user_id: contract.provider_id,
      company_id: null,
      source: `Pagamento de contrato — ${contract.id.slice(0, 8)}`,
      category: "FREELANCE",
      amount: amountEuro,
      recurrence: "ONE_TIME",
      expected_date: today,
      is_active: false,
      notes: reference,
    })
    .select("id")
    .single();
  if (incomeError || !income) throw incomeError ?? new Error("income insert failed");

  const { data: expense, error: expenseError } = await supabase
    .from("finance_expenses")
    .insert({
      user_id: contract.client_id,
      company_id: null,
      description: `Pagamento de milestone — ${milestone.title}`,
      category: "OTHER",
      amount: amountEuro,
      expense_date: today,
      payment_method: "BANK_TRANSFER",
      notes: reference,
    })
    .select("id")
    .single();
  if (expenseError || !expense) throw expenseError ?? new Error("expense insert failed");

  const { error: guardError } = await supabase
    .from("marketplace_milestone_payments")
    .insert({
      contract_id: contract.id,
      milestone_id: milestone.id,
      client_id: contract.client_id,
      provider_id: contract.provider_id,
      amount_cents: milestone.amount_cents,
      currency: "EUR",
      income_id: income.id,
      expense_id: expense.id,
      paid_at: new Date().toISOString(),
    });
  if (guardError) throw guardError;

  try {
    await recordAuditEvent({
      userId: actorId,
      companyId: null,
      action: "MARKETPLACE_MILESTONE_PAID",
      module: "MARKETPLACE",
      entityType: "CONTRACT_MILESTONE",
      entityId: milestone.id,
      metadata: {
        contractId: contract.id,
        milestoneId: milestone.id,
        amountCents: milestone.amount_cents,
        incomeId: String(income.id),
        expenseId: String(expense.id),
      },
    });
  } catch (err) {
    console.error("[Marketplace] Audit de pagamento falhou:", err);
  }

  return { duplicated: false, incomeId: String(income.id), expenseId: String(expense.id) };
}

export interface WarrantableQuoteLike {
  warranty_months: number | null;
  terms: string | null;
}

export interface EmitWarrantyResult {
  emitted: boolean;
  reason?: string;
}

/**
 * Emite a garantia do contrato no COMPLETED, a partir dos termos adjudicados.
 * Idempotente: UNIQUE(order_id) + guard em código.
 */
export async function emitMilestoneWarranty(
  contract: PaymentContractLike,
  quote: WarrantableQuoteLike | null,
  actorId: string,
): Promise<EmitWarrantyResult> {
  if (!quote || !quote.warranty_months || quote.warranty_months <= 0) {
    return { emitted: false, reason: "semgarantia" };
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("warranties")
    .select("id")
    .eq("order_id", contract.id)
    .maybeSingle();
  if (existing) {
    return { emitted: false, reason: "jáemitida" };
  }

  const start = new Date().toISOString().slice(0, 10);
  const end = new Date(new Date(start).getTime() + quote.warranty_months * 30 * 86400000)
    .toISOString()
    .slice(0, 10);

  const { error } = await supabase.from("warranties").insert({
    order_id: contract.id,
    contract_id: contract.id,
    provider_id: contract.provider_id,
    client_id: contract.client_id,
    warranty_period_months: quote.warranty_months,
    start_date: start,
    end_date: end,
    coverage: quote.terms?.trim() || "Garantia do contrato adjudicado",
    status: "ACTIVE",
  });
  if (error) throw error;

  try {
    await recordAuditEvent({
      userId: actorId,
      companyId: null,
      action: "MARKETPLACE_WARRANTY_ISSUED",
      module: "MARKETPLACE",
      entityType: "CONTRACT",
      entityId: contract.id,
      metadata: {
        contractId: contract.id,
        warrantyMonths: quote.warranty_months,
        endDate: end,
      },
    });
  } catch (err) {
    console.error("[Marketplace] Audit de garantia falhou:", err);
  }

  return { emitted: true };
}

/** Lista os movimentos de pagamento de um contrato (vista). */
export async function listContractPayments(contractId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("marketplace_milestone_payments")
    .select("*")
    .eq("contract_id", contractId);
  if (error) throw error;
  return data ?? [];
}

/** Lista as garantias de um contrato (vista). */
export async function listContractWarranties(contractId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("warranties")
    .select("*")
    .eq("order_id", contractId);
  if (error) throw error;
  return data ?? [];
}

/** Mostra os movimentos financeiros do contrato para a vista (idempotente não escreve). */
export async function listMilestonePayments(contractId: string) {
  return listContractPayments(contractId);
}