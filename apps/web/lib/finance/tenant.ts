import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import {
  askFinanceAssistant,
  type FinanceBill,
  type FinanceDebt,
  type FinanceExpense,
  type FinanceIncome,
} from "@rpg/core";

// ---------------------------------------------------------------------------
// Camada segura de acesso aos dados do Centro Financeiro.
// O tenant (utilizador/empresa) é SEMPRE resolvido no servidor a partir da
// sessão — nunca confiar em organization_id ou user_id vindos do cliente.
// As consultas usam o client admin (server-side); o scope por tenant é aplicado
// explicitamente (applyTenantScope) a TODAS as tabelas, incluindo bank_accounts
// para o cálculo do saldo — nunca há SELECT global de saldo. RLS + RBAC mantidos.
// ---------------------------------------------------------------------------

export interface FinanceTenantContext {
  userId: string;
  companyId: string | null;
}

export async function resolveFinanceTenant(): Promise<FinanceTenantContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return { userId: user.id, companyId: user.companyId ?? null };
}

export function applyTenantScope(
  query: any,
  ctx: FinanceTenantContext,
) {
  if (ctx.companyId) {
    return query.or(`company_id.eq.${ctx.companyId},user_id.eq.${ctx.userId}`);
  }
  return query.eq("user_id", ctx.userId);
}

function toBill(row: Record<string, unknown>): FinanceBill {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companyId: row.company_id ? String(row.company_id) : undefined,
    name: String(row.name),
    amount: Number(row.amount ?? 0),
    dueDate: String(row.due_date),
    recurrence: row.recurrence as FinanceBill["recurrence"],
    category: row.category as FinanceBill["category"],
    status: row.status as FinanceBill["status"],
    priority: row.priority as FinanceBill["priority"],
    notes: row.notes ? String(row.notes) : undefined,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toDebt(row: Record<string, unknown>): FinanceDebt {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companyId: row.company_id ? String(row.company_id) : undefined,
    creditorName: String(row.creditor_name),
    initialAmount: Number(row.initial_amount ?? 0),
    outstandingAmount: Number(row.outstanding_amount ?? 0),
    installmentAmount: row.installment_amount != null ? Number(row.installment_amount) : undefined,
    nextDueDate: row.next_due_date ? String(row.next_due_date) : null,
    interestRate: row.interest_rate != null ? Number(row.interest_rate) : undefined,
    status: row.status as FinanceDebt["status"],
    notes: row.notes ? String(row.notes) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toIncome(row: Record<string, unknown>): FinanceIncome {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companyId: row.company_id ? String(row.company_id) : undefined,
    source: String(row.source),
    category: row.category as FinanceIncome["category"],
    amount: Number(row.amount ?? 0),
    recurrence: row.recurrence as FinanceIncome["recurrence"],
    expectedDate: String(row.expected_date),
    isActive: row.is_active === true,
    lastReceivedAt: row.last_received_at ? String(row.last_received_at) : null,
    notes: row.notes ? String(row.notes) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toExpense(row: Record<string, unknown>): FinanceExpense {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companyId: row.company_id ? String(row.company_id) : undefined,
    description: String(row.description),
    category: row.category as FinanceExpense["category"],
    amount: Number(row.amount ?? 0),
    expenseDate: String(row.expense_date),
    paymentMethod: row.payment_method ? String(row.payment_method) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    createdAt: String(row.created_at),
  };
}

export interface FinanceTenantData {
  currentBalance: number;
  bills: FinanceBill[];
  debts: FinanceDebt[];
  incomes: FinanceIncome[];
  expenses: FinanceExpense[];
}

/** Carrega todos os dados financeiros do tenant da sessão (server-side, escopado). */
export async function loadFinanceTenantData(
  ctx: FinanceTenantContext,
): Promise<FinanceTenantData> {
  const supabase = createAdminClient();

  const [balRes, billsRes, debtsRes, incomesRes, expensesRes] = await Promise.all([
    applyTenantScope(
      supabase.from("bank_accounts").select("balance"),
      ctx,
    ),
    applyTenantScope(
      supabase.from("finance_bills").select("*").order("due_date", { ascending: true }),
      ctx,
    ),
    applyTenantScope(
      supabase.from("finance_debts").select("*").order("created_at", { ascending: false }),
      ctx,
    ),
    applyTenantScope(
      supabase.from("finance_incomes").select("*").order("expected_date", { ascending: true }),
      ctx,
    ),
    applyTenantScope(
      supabase.from("finance_expenses").select("*").order("expense_date", { ascending: false }),
      ctx,
    ),
  ]);

  const currentBalance =
    ((balRes.data ?? []) as { balance?: number | string }[]).reduce(
      (sum, a) => sum + Number(a.balance ?? 0),
      0,
    ) || 0;

  return {
    currentBalance,
    bills: (billsRes.data ?? []).map(toBill),
    debts: (debtsRes.data ?? []).map(toDebt),
    incomes: (incomesRes.data ?? []).map(toIncome),
    expenses: (expensesRes.data ?? []).map(toExpense),
  };
}

/** Entrada segura do assistente financeiro: sessão → tenant → dados escopados → resposta. */
export async function provideFinanceAssistantAnswer(
  question: string,
): Promise<{ answer: string; intent: string }> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) {
    return {
      answer: "Inicia sessão para consultar o teu centro financeiro.",
      intent: "UNAUTHENTICATED",
    };
  }

  try {
    const data = await loadFinanceTenantData(ctx);
    const res = askFinanceAssistant(question, data);
    return { answer: res.answer, intent: res.intent };
  } catch (err) {
    console.error("[Finanças] Erro no assistente:", err);
    return {
      answer: "Ocorreu um erro ao consultar os teus dados financeiros. Tenta novamente.",
      intent: "ERROR",
    };
  }
}