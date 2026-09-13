/**
 * RPG-OS — Centro Financeiro (Life Finance).
 *
 * Modelo de dados do domínio financeiro pessoal/empresarial:
 * contas a pagar (bills), dívidas (debts), receitas (incomes) e
 * despesas pontuais (expenses). Todos os registos são escopados por
 * user_id (personal) e, opcionalmente, por company_id (negócio).
 */

export type FinanceRecurrence =
  | "ONE_TIME"
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY";

export type FinanceBillStatus = "PENDING" | "PAID" | "OVERDUE";

export type FinanceBillPriority = "HIGH" | "MEDIUM" | "LOW";

/** Categorias de contas a pagar (obrigações recorrentes e pontuais). */
export type FinanceBillCategory =
  | "RENT"
  | "WATER"
  | "ELECTRICITY"
  | "TELECOM"
  | "FOOD"
  | "TRANSPORT"
  | "INSURANCE"
  | "LOAN"
  | "SUBSCRIPTION"
  | "TAXES"
  | "OTHER";

export type FinanceDebtStatus = "OPEN" | "PAID" | "DEFAULTED";

export type FinanceIncomeCategory =
  | "SALARY"
  | "FREELANCE"
  | "INVESTMENT"
  | "RENTAL"
  | "OTHER";

/** Categorias de despesas pontuais da vida. */
export type FinanceExpenseCategory =
  | "FOOD"
  | "TRANSPORT"
  | "HOUSING"
  | "UTILITIES"
  | "HEALTH"
  | "LEISURE"
  | "EDUCATION"
  | "OTHER";

/** Conta a pagar / obrigação (renda, água, luz, telecom, seguros, etc.). */
export interface FinanceBill {
  id: string;
  userId: string;
  companyId?: string;
  name: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  recurrence: FinanceRecurrence;
  category: FinanceBillCategory;
  status: FinanceBillStatus;
  priority: FinanceBillPriority;
  notes?: string;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Input para criação/edição de uma conta a pagar. */
export interface FinanceBillInput {
  name: string;
  amount: number;
  dueDate: string;
  recurrence?: FinanceRecurrence;
  category?: FinanceBillCategory;
  status?: FinanceBillStatus;
  priority?: FinanceBillPriority;
  notes?: string;
}

/** Dívida (empréstimo, crédito, dívida a terceiros). */
export interface FinanceDebt {
  id: string;
  userId: string;
  companyId?: string;
  creditorName: string;
  initialAmount: number;
  outstandingAmount: number;
  installmentAmount?: number;
  nextDueDate?: string | null;
  interestRate?: number | null;
  status: FinanceDebtStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Input para criação/edição de uma dívida. */
export interface FinanceDebtInput {
  creditorName: string;
  initialAmount: number;
  outstandingAmount: number;
  installmentAmount?: number;
  nextDueDate?: string;
  interestRate?: number;
  status?: FinanceDebtStatus;
  notes?: string;
}

/** Receita prevista/recorrente (salário, trabalhos, outros rendimentos). */
export interface FinanceIncome {
  id: string;
  userId: string;
  companyId?: string;
  source: string;
  category: FinanceIncomeCategory;
  amount: number;
  recurrence: FinanceRecurrence;
  expectedDate: string; // YYYY-MM-DD (âncora da recorrência)
  isActive: boolean;
  lastReceivedAt?: string | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Input para criação/edição de uma receita. */
export interface FinanceIncomeInput {
  source: string;
  category?: FinanceIncomeCategory;
  amount: number;
  recurrence?: FinanceRecurrence;
  expectedDate: string;
  isActive?: boolean;
  notes?: string;
}

/** Despesa pontual da vida quotidiana. */
export interface FinanceExpense {
  id: string;
  userId: string;
  companyId?: string;
  description: string;
  category: FinanceExpenseCategory;
  amount: number;
  expenseDate: string; // YYYY-MM-DD
  paymentMethod?: string;
  notes?: string;
  createdAt: string;
}

/** Input para criação de uma despesa pontual. */
export interface FinanceExpenseInput {
  description: string;
  category?: FinanceExpenseCategory;
  amount: number;
  expenseDate: string;
  paymentMethod?: string;
  notes?: string;
}