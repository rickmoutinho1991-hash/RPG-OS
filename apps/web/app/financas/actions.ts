"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/audit";
import {
  applyTenantScope,
  loadFinanceTenantData,
  provideFinanceAssistantAnswer,
  resolveFinanceTenant,
} from "@/lib/finance/tenant";
import {
  buildFinanceOverview,
  buildFinanceInsights,
  BILL_CATEGORY_LABELS,
  type FinanceBill,
  type FinanceBillInput,
  type FinanceDebt,
  type FinanceDebtInput,
  type FinanceExpense,
  type FinanceExpenseInput,
  type FinanceIncome,
  type FinanceIncomeInput,
  type FinanceOverview,
  type FinanceInsight,
} from "@rpg/core";

const moduleName = "LIFE_FINANCE";

// ---------------------------------------------------------------------------
// Leituras (server-side, sempre escopadas ao utilizador/empresa da sessão)
// ---------------------------------------------------------------------------

export interface FinanceOverviewResult {
  data: FinanceOverview | null;
  insights: FinanceInsight[];
  bills: FinanceBill[];
  debts: FinanceDebt[];
  incomes: FinanceIncome[];
  expenses: FinanceExpense[];
  currentBalance: number;
  categoryLabels: Record<string, string>;
}

export async function getFinanceOverview(): Promise<FinanceOverviewResult> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) {
    return {
      data: null,
      insights: [],
      bills: [],
      debts: [],
      incomes: [],
      expenses: [],
      currentBalance: 0,
      categoryLabels: BILL_CATEGORY_LABELS,
    };
  }

  try {
    const { currentBalance, bills, debts, incomes, expenses } =
      await loadFinanceTenantData(ctx);

    const data = buildFinanceOverview({
      currentBalance,
      bills,
      debts,
      incomes,
      expenses,
    });
    const insights = buildFinanceInsights(data, debts, bills);

    return {
      data,
      insights,
      bills,
      debts,
      incomes,
      expenses,
      currentBalance,
      categoryLabels: BILL_CATEGORY_LABELS,
    };
  } catch (err) {
    console.error("[Finanças] Erro ao obter visão geral:", err);
    return {
      data: null,
      insights: [],
      bills: [],
      debts: [],
      incomes: [],
      expenses: [],
      currentBalance: 0,
      categoryLabels: BILL_CATEGORY_LABELS,
    };
  }
}

// ---------------------------------------------------------------------------
// Ajudante de validação de inputs recebidos do cliente
// ---------------------------------------------------------------------------

const BILL_STATUSES = ["PENDING", "PAID", "OVERDUE"] as const;
const BILL_RECURRENCES = ["ONE_TIME", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
const BILL_CATEGORIES = ["RENT", "WATER", "ELECTRICITY", "TELECOM", "FOOD", "TRANSPORT", "INSURANCE", "LOAN", "SUBSCRIPTION", "TAXES", "OTHER"] as const;
const BILL_PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
const INCOME_CATEGORIES = ["SALARY", "FREELANCE", "INVESTMENT", "RENTAL", "OTHER"] as const;
const EXPENSE_CATEGORIES = ["FOOD", "TRANSPORT", "HOUSING", "UTILITIES", "HEALTH", "LEISURE", "EDUCATION", "OTHER"] as const;
const DEBT_STATUSES = ["OPEN", "PAID", "DEFAULTED"] as const;

// ---------------------------------------------------------------------------
// Contas a pagar (bills)
// ---------------------------------------------------------------------------

export async function createFinanceBillAction(
  input: FinanceBillInput,
): Promise<{ success: boolean; error?: string; id?: string }> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) return { success: false, error: "Sessão não iniciada." };

  const name = input.name.trim();
  const amount = Number(input.amount) || 0;
  if (!name) return { success: false, error: "O nome da conta é obrigatório." };
  if (amount <= 0) return { success: false, error: "O valor tem de ser superior a zero." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
    return { success: false, error: "Data de vencimento inválida." };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("finance_bills")
    .insert({
      user_id: ctx.userId,
      company_id: ctx.companyId,
      name,
      amount,
      due_date: input.dueDate,
      recurrence: BILL_RECURRENCES.includes(input.recurrence as never)
        ? input.recurrence
        : "MONTHLY",
      category: BILL_CATEGORIES.includes(input.category as never) ? input.category : "OTHER",
      status: BILL_STATUSES.includes(input.status as never) ? input.status : "PENDING",
      priority: BILL_PRIORITIES.includes(input.priority as never) ? input.priority : "MEDIUM",
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || "Erro ao registar a conta." };
  }

  await recordAuditEvent({
    userId: ctx.userId,
    companyId: ctx.companyId,
    action: "FINANCE_BILL_CREATED",
    module: moduleName,
    entityType: "FINANCE_BILL",
    entityId: data.id,
    metadata: { name, amount, dueDate: input.dueDate, category: input.category },
  });

  revalidatePath("/financas");
  return { success: true, id: data.id };
}

export async function updateFinanceBillAction(
  id: string,
  input: FinanceBillInput,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) return { success: false, error: "Sessão não iniciada." };

  const name = input.name.trim();
  const amount = Number(input.amount) || 0;
  if (!name) return { success: false, error: "O nome da conta é obrigatório." };
  if (amount <= 0) return { success: false, error: "O valor tem de ser superior a zero." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
    return { success: false, error: "Data de vencimento inválida." };
  }

  const supabase = createAdminClient();
  let query = supabase.from("finance_bills").select("id").eq("id", id);
  query = applyTenantScope(query, ctx);
  const { data: existing } = await query.maybeSingle();
  if (!existing) {
    return { success: false, error: "Conta não encontrada ou sem permissão." };
  }

  const { error } = await supabase
    .from("finance_bills")
    .update({
      name,
      amount,
      due_date: input.dueDate,
      recurrence: BILL_RECURRENCES.includes(input.recurrence as never)
        ? input.recurrence
        : "MONTHLY",
      category: BILL_CATEGORIES.includes(input.category as never) ? input.category : "OTHER",
      priority: BILL_PRIORITIES.includes(input.priority as never) ? input.priority : "MEDIUM",
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await recordAuditEvent({
    userId: ctx.userId,
    companyId: ctx.companyId,
    action: "FINANCE_BILL_UPDATED",
    module: moduleName,
    entityType: "FINANCE_BILL",
    entityId: id,
    metadata: { name, amount, dueDate: input.dueDate, category: input.category },
  });

  revalidatePath("/financas");
  return { success: true };
}

export async function setFinanceBillPaidAction(
  id: string,
  paid: boolean,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) return { success: false, error: "Sessão não iniciada." };

  const supabase = createAdminClient();
  let query = supabase.from("finance_bills").select("id, name, amount").eq("id", id);
  query = applyTenantScope(query, ctx);
  const { data: existing } = await query.maybeSingle();
  if (!existing) {
    return { success: false, error: "Conta não encontrada ou sem permissão." };
  }

  const { error } = await supabase
    .from("finance_bills")
    .update({
      status: paid ? "PAID" : "PENDING",
      paid_at: paid ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await recordAuditEvent({
    userId: ctx.userId,
    companyId: ctx.companyId,
    action: paid ? "FINANCE_BILL_PAID" : "FINANCE_BILL_REOPENED",
    module: moduleName,
    entityType: "FINANCE_BILL",
    entityId: id,
    metadata: { name: existing.name, amount: Number(existing.amount) },
  });

  revalidatePath("/financas");
  return { success: true };
}

export async function deleteFinanceBillAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) return { success: false, error: "Sessão não iniciada." };

  const supabase = createAdminClient();
  let query = supabase.from("finance_bills").select("id, name").eq("id", id);
  query = applyTenantScope(query, ctx);
  const { data: existing } = await query.maybeSingle();
  if (!existing) {
    return { success: false, error: "Conta não encontrada ou sem permissão." };
  }

  const { error } = await supabase.from("finance_bills").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  await recordAuditEvent({
    userId: ctx.userId,
    companyId: ctx.companyId,
    action: "FINANCE_BILL_DELETED",
    module: moduleName,
    entityType: "FINANCE_BILL",
    entityId: id,
    metadata: { name: existing.name },
  });

  revalidatePath("/financas");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Dívidas (debts)
// ---------------------------------------------------------------------------

export async function createFinanceDebtAction(
  input: FinanceDebtInput,
): Promise<{ success: boolean; error?: string; id?: string }> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) return { success: false, error: "Sessão não iniciada." };

  const creditorName = input.creditorName.trim();
  const initialAmount = Number(input.initialAmount) || 0;
  const outstandingAmount =
    Number(input.outstandingAmount) >= 0 ? Number(input.outstandingAmount) : initialAmount;
  if (!creditorName) return { success: false, error: "O credor é obrigatório." };
  if (initialAmount <= 0) {
    return { success: false, error: "O valor inicial tem de ser superior a zero." };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("finance_debts")
    .insert({
      user_id: ctx.userId,
      company_id: ctx.companyId,
      creditor_name: creditorName,
      initial_amount: initialAmount,
      outstanding_amount: outstandingAmount,
      installment_amount: input.installmentAmount ? Number(input.installmentAmount) : null,
      next_due_date: input.nextDueDate || null,
      interest_rate: input.interestRate !== undefined ? Number(input.interestRate) : null,
      status: DEBT_STATUSES.includes(input.status as never) ? input.status : "OPEN",
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || "Erro ao registar a dívida." };
  }

  await recordAuditEvent({
    userId: ctx.userId,
    companyId: ctx.companyId,
    action: "FINANCE_DEBT_CREATED",
    module: moduleName,
    entityType: "FINANCE_DEBT",
    entityId: data.id,
    metadata: { creditorName, initialAmount, outstandingAmount },
  });

  revalidatePath("/financas");
  return { success: true, id: data.id };
}

export async function registerFinanceDebtPaymentAction(
  id: string,
  amount: number,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) return { success: false, error: "Sessão não iniciada." };

  const payment = Number(amount) || 0;
  if (payment <= 0) return { success: false, error: "Valor do pagamento inválido." };

  const supabase = createAdminClient();
  let query = supabase
    .from("finance_debts")
    .select("id, creditor_name, outstanding_amount, initial_amount")
    .eq("id", id);
  query = applyTenantScope(query, ctx);
  const { data: existing } = await query.maybeSingle();
  if (!existing) {
    return { success: false, error: "Dívida não encontrada ou sem permissão." };
  }

  const outstanding = Number(existing.outstanding_amount);
  if (payment > outstanding) {
    return { success: false, error: "O pagamento não pode exceder o valor em dívida." };
  }
  const remaining = Math.round((outstanding - payment) * 100) / 100;
  const status = remaining <= 0 ? "PAID" : "OPEN";

  const { error } = await supabase
    .from("finance_debts")
    .update({
      outstanding_amount: remaining,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await recordAuditEvent({
    userId: ctx.userId,
    companyId: ctx.companyId,
    action: "FINANCE_DEBT_PAYMENT_REGISTERED",
    module: moduleName,
    entityType: "FINANCE_DEBT",
    entityId: id,
    metadata: { creditorName: existing.creditor_name, payment, remaining },
  });

  revalidatePath("/financas");
  return { success: true };
}

export async function updateFinanceDebtAction(
  id: string,
  input: FinanceDebtInput,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) return { success: false, error: "Sessão não iniciada." };

  const creditorName = input.creditorName.trim();
  const initialAmount = Number(input.initialAmount) || 0;
  const outstandingAmount = Number(input.outstandingAmount) || 0;
  if (!creditorName) return { success: false, error: "O credor é obrigatório." };
  if (initialAmount <= 0) {
    return { success: false, error: "O valor inicial tem de ser superior a zero." };
  }

  const supabase = createAdminClient();
  let query = supabase.from("finance_debts").select("id").eq("id", id);
  query = applyTenantScope(query, ctx);
  const { data: existing } = await query.maybeSingle();
  if (!existing) {
    return { success: false, error: "Dívida não encontrada ou sem permissão." };
  }

  const { error } = await supabase
    .from("finance_debts")
    .update({
      creditor_name: creditorName,
      initial_amount: initialAmount,
      outstanding_amount: outstandingAmount,
      installment_amount: input.installmentAmount ? Number(input.installmentAmount) : null,
      next_due_date: input.nextDueDate || null,
      interest_rate: input.interestRate !== undefined ? Number(input.interestRate) : null,
      status: DEBT_STATUSES.includes(input.status as never) ? input.status : "OPEN",
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await recordAuditEvent({
    userId: ctx.userId,
    companyId: ctx.companyId,
    action: "FINANCE_DEBT_UPDATED",
    module: moduleName,
    entityType: "FINANCE_DEBT",
    entityId: id,
    metadata: { creditorName, initialAmount, outstandingAmount },
  });

  revalidatePath("/financas");
  return { success: true };
}

export async function deleteFinanceDebtAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) return { success: false, error: "Sessão não iniciada." };

  const supabase = createAdminClient();
  let query = supabase.from("finance_debts").select("id, creditor_name").eq("id", id);
  query = applyTenantScope(query, ctx);
  const { data: existing } = await query.maybeSingle();
  if (!existing) {
    return { success: false, error: "Dívida não encontrada ou sem permissão." };
  }

  const { error } = await supabase.from("finance_debts").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  await recordAuditEvent({
    userId: ctx.userId,
    companyId: ctx.companyId,
    action: "FINANCE_DEBT_DELETED",
    module: moduleName,
    entityType: "FINANCE_DEBT",
    entityId: id,
    metadata: { creditorName: existing.creditor_name },
  });

  revalidatePath("/financas");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Receitas (incomes)
// ---------------------------------------------------------------------------

export async function createFinanceIncomeAction(
  input: FinanceIncomeInput,
): Promise<{ success: boolean; error?: string; id?: string }> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) return { success: false, error: "Sessão não iniciada." };

  const source = input.source.trim();
  const amount = Number(input.amount) || 0;
  if (!source) return { success: false, error: "A origem da receita é obrigatória." };
  if (amount <= 0) return { success: false, error: "O valor tem de ser superior a zero." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expectedDate)) {
    return { success: false, error: "Data prevista inválida." };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("finance_incomes")
    .insert({
      user_id: ctx.userId,
      company_id: ctx.companyId,
      source,
      category: INCOME_CATEGORIES.includes(input.category as never) ? input.category : "OTHER",
      amount,
      recurrence: BILL_RECURRENCES.includes(input.recurrence as never)
        ? input.recurrence
        : "MONTHLY",
      expected_date: input.expectedDate,
      is_active: input.isActive !== false,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || "Erro ao registar a receita." };
  }

  await recordAuditEvent({
    userId: ctx.userId,
    companyId: ctx.companyId,
    action: "FINANCE_INCOME_CREATED",
    module: moduleName,
    entityType: "FINANCE_INCOME",
    entityId: data.id,
    metadata: { source, amount, expectedDate: input.expectedDate },
  });

  revalidatePath("/financas");
  return { success: true, id: data.id };
}

export async function updateFinanceIncomeAction(
  id: string,
  input: FinanceIncomeInput,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) return { success: false, error: "Sessão não iniciada." };

  const source = input.source.trim();
  const amount = Number(input.amount) || 0;
  if (!source) return { success: false, error: "A origem da receita é obrigatória." };
  if (amount <= 0) return { success: false, error: "O valor tem de ser superior a zero." };

  const supabase = createAdminClient();
  let query = supabase.from("finance_incomes").select("id").eq("id", id);
  query = applyTenantScope(query, ctx);
  const { data: existing } = await query.maybeSingle();
  if (!existing) {
    return { success: false, error: "Receita não encontrada ou sem permissão." };
  }

  const { error } = await supabase
    .from("finance_incomes")
    .update({
      source,
      category: INCOME_CATEGORIES.includes(input.category as never) ? input.category : "OTHER",
      amount,
      recurrence: BILL_RECURRENCES.includes(input.recurrence as never)
        ? input.recurrence
        : "MONTHLY",
      expected_date: input.expectedDate,
      is_active: input.isActive !== false,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await recordAuditEvent({
    userId: ctx.userId,
    companyId: ctx.companyId,
    action: "FINANCE_INCOME_UPDATED",
    module: moduleName,
    entityType: "FINANCE_INCOME",
    entityId: id,
    metadata: { source, amount },
  });

  revalidatePath("/financas");
  return { success: true };
}

export async function toggleFinanceIncomeActiveAction(
  id: string,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) return { success: false, error: "Sessão não iniciada." };

  const supabase = createAdminClient();
  let query = supabase.from("finance_incomes").select("id, source").eq("id", id);
  query = applyTenantScope(query, ctx);
  const { data: existing } = await query.maybeSingle();
  if (!existing) {
    return { success: false, error: "Receita não encontrada ou sem permissão." };
  }

  const { error } = await supabase
    .from("finance_incomes")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await recordAuditEvent({
    userId: ctx.userId,
    companyId: ctx.companyId,
    action: isActive ? "FINANCE_INCOME_REACTIVATED" : "FINANCE_INCOME_PAUSED",
    module: moduleName,
    entityType: "FINANCE_INCOME",
    entityId: id,
    metadata: { source: existing.source },
  });

  revalidatePath("/financas");
  return { success: true };
}

export async function deleteFinanceIncomeAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) return { success: false, error: "Sessão não iniciada." };

  const supabase = createAdminClient();
  let query = supabase.from("finance_incomes").select("id, source").eq("id", id);
  query = applyTenantScope(query, ctx);
  const { data: existing } = await query.maybeSingle();
  if (!existing) {
    return { success: false, error: "Receita não encontrada ou sem permissão." };
  }

  const { error } = await supabase.from("finance_incomes").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  await recordAuditEvent({
    userId: ctx.userId,
    companyId: ctx.companyId,
    action: "FINANCE_INCOME_DELETED",
    module: moduleName,
    entityType: "FINANCE_INCOME",
    entityId: id,
    metadata: { source: existing.source },
  });

  revalidatePath("/financas");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Despesas pontuais (expenses)
// ---------------------------------------------------------------------------

export async function createFinanceExpenseAction(
  input: FinanceExpenseInput,
): Promise<{ success: boolean; error?: string; id?: string }> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) return { success: false, error: "Sessão não iniciada." };

  const description = input.description.trim();
  const amount = Number(input.amount) || 0;
  if (!description) return { success: false, error: "A descrição é obrigatória." };
  if (amount <= 0) return { success: false, error: "O valor tem de ser superior a zero." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate)) {
    return { success: false, error: "Data da despesa inválida." };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("finance_expenses")
    .insert({
      user_id: ctx.userId,
      company_id: ctx.companyId,
      description,
      category: EXPENSE_CATEGORIES.includes(input.category as never) ? input.category : "OTHER",
      amount,
      expense_date: input.expenseDate,
      payment_method: input.paymentMethod?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || "Erro ao registar a despesa." };
  }

  await recordAuditEvent({
    userId: ctx.userId,
    companyId: ctx.companyId,
    action: "FINANCE_EXPENSE_CREATED",
    module: moduleName,
    entityType: "FINANCE_EXPENSE",
    entityId: data.id,
    metadata: { description, amount, expenseDate: input.expenseDate, category: input.category },
  });

  revalidatePath("/financas");
  return { success: true, id: data.id };
}

export async function deleteFinanceExpenseAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) return { success: false, error: "Sessão não iniciada." };

  const supabase = createAdminClient();
  let query = supabase.from("finance_expenses").select("id, description").eq("id", id);
  query = applyTenantScope(query, ctx);
  const { data: existing } = await query.maybeSingle();
  if (!existing) {
    return { success: false, error: "Despesa não encontrada ou sem permissão." };
  }

  const { error } = await supabase.from("finance_expenses").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  await recordAuditEvent({
    userId: ctx.userId,
    companyId: ctx.companyId,
    action: "FINANCE_EXPENSE_DELETED",
    module: moduleName,
    entityType: "FINANCE_EXPENSE",
    entityId: id,
    metadata: { description: existing.description },
  });

  revalidatePath("/financas");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Assistente Financeiro (IA) — base para o assistente conversacional
// ---------------------------------------------------------------------------

export async function askFinanceAssistantAction(
  question: string,
): Promise<{ answer: string; intent: string }> {
  return provideFinanceAssistantAnswer(question);
}