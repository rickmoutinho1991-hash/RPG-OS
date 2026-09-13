/**
 * RPG-OS — Life Finance Service (Centro Financeiro).
 *
 * Cálculos puros e determinísticos sobre o domínio financeiro:
 *   - classificação de estados (pendente/pago/atrasado)
 *   - totais do mês (receitas, despesas, obrigações)
 *   - projeção diária de saldo e deteção de risco de saldo negativo
 *   - frases do dashboard inteligente (insights)
 *   - motor de intenções do assistente financeiro (IA)
 *
 * Sem I/O — tudo é derivável de inputs (dados do tenant já autorizados
 * pela camada server-side). Sem valores reais pré-preenchidos: os testes
 * usam apenas dados fictícios.
 */
import { roundToCurrency } from "./QuoteCalculationService";
import type {
  FinanceBill,
  FinanceBillCategory,
  FinanceDebt,
  FinanceExpense,
  FinanceIncome,
  FinanceRecurrence,
} from "../types/finance";

export const FINANCE_MODULE = "LIFE_FINANCE";

export const BILL_CATEGORY_LABELS: Record<FinanceBillCategory, string> = {
  RENT: "Renda",
  WATER: "Água",
  ELECTRICITY: "Luz",
  TELECOM: "Telecomunicações",
  FOOD: "Alimentação",
  TRANSPORT: "Transportes",
  INSURANCE: "Seguros",
  LOAN: "Empréstimos",
  SUBSCRIPTION: "Subscrições",
  TAXES: "Impostos",
  OTHER: "Outras",
};

// ---------------------------------------------------------------------------
// Helpers de data (chaves ISO "YYYY-MM-DD" e aritmética em UTC)
// ---------------------------------------------------------------------------

export function dateKey(value: Date | string): string {
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return value.slice(0, 10);
}

function parseKey(key: string): Date {
  const [y, m, d] = key.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function daysBetween(fromKey: string, toKey: string): number {
  const from = parseKey(fromKey);
  const to = parseKey(toKey);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() !== day) {
    // Overflow de dias (ex: 31 → fevereiro): fixa no último dia do mês.
    d.setUTCDate(0);
  }
  return d;
}

function addRecurrence(date: Date, recurrence: FinanceRecurrence): Date {
  const d = new Date(date);
  switch (recurrence) {
    case "WEEKLY":
      return addDays(d, 7);
    case "MONTHLY":
      return addMonths(d, 1);
    case "QUARTERLY":
      return addMonths(d, 3);
    case "YEARLY":
      return addMonths(d, 12);
    case "ONE_TIME":
    default:
      return d;
  }
}

/** N.º de ocorrências de uma recorrência (âncora) dentro de um intervalo. */
export function occurrencesBetween(
  anchor: string,
  startKey: string,
  endKey: string,
  recurrence: FinanceRecurrence,
): number {
  const start = dateKey(startKey);
  const end = dateKey(endKey);
  if (start > end) return 0;
  const anchorKey = dateKey(anchor);

  if (recurrence === "ONE_TIME") {
    return anchorKey >= start && anchorKey <= end ? 1 : 0;
  }

  let cursor = parseKey(anchor);
  let count = 0;
  let steps = 0;
  const maxSteps = 300; // proteção contra recorrências infinitas
  while (steps < maxSteps) {
    const key = dateKey(cursor);
    if (key > end) break;
    if (key >= start) count += 1;
    cursor = addRecurrence(cursor, recurrence);
    steps += 1;
  }
  return count;
}

/** Próxima ocorrência >= fromKey (ou null). */
export function nextOccurrenceOnOrAfter(
  anchor: string,
  fromKey: string,
  recurrence: FinanceRecurrence,
): string | null {
  const from = dateKey(fromKey);
  if (recurrence === "ONE_TIME") {
    const k = dateKey(anchor);
    return k >= from ? k : null;
  }
  let cursor = parseKey(anchor);
  let steps = 0;
  const maxSteps = 420;
  while (steps < maxSteps) {
    const key = dateKey(cursor);
    if (key >= from) return key;
    cursor = addRecurrence(cursor, recurrence);
    steps += 1;
  }
  return null;
}

/** Limites (start/end) do mês que contém a referência. */
export function monthRange(reference: string): { start: string; end: string } {
  const ref = parseKey(reference);
  const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  const end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0));
  return { start: dateKey(start), end: dateKey(end) };
}

export function monthLabel(reference: string): string {
  const ref = parseKey(reference);
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1)).toLocaleDateString(
    "pt-PT",
    { month: "long", year: "numeric" },
  );
}

// ---------------------------------------------------------------------------
// Classificação de estados e progresso
// ---------------------------------------------------------------------------

export function classifyBillStatus(
  bill: Pick<FinanceBill, "status" | "dueDate">,
  today = dateKey(new Date()),
): FinanceBill["status"] {
  if (bill.status === "PAID") return "PAID";
  return bill.dueDate < today ? "OVERDUE" : "PENDING";
}

export function computeDebtProgress(debt: Pick<FinanceDebt, "initialAmount" | "outstandingAmount">): number {
  if (debt.initialAmount <= 0) return 0;
  const paid = Math.max(0, debt.initialAmount - debt.outstandingAmount);
  const progress = (paid / debt.initialAmount) * 100;
  return Math.min(100, Math.max(0, Math.round(progress * 10) / 10));
}

/** Converte o valor de uma recorrência para o equivalente mensal. */
export function toMonthlyAmount(amount: number, recurrence: FinanceRecurrence): number {
  switch (recurrence) {
    case "WEEKLY":
      return roundToCurrency(amount * 4.33);
    case "QUARTERLY":
      return roundToCurrency(amount / 3);
    case "YEARLY":
      return roundToCurrency(amount / 12);
    case "MONTHLY":
    case "ONE_TIME":
    default:
      return amount;
  }
}

// ---------------------------------------------------------------------------
// Visão geral / Dashboard Inteligente
// ---------------------------------------------------------------------------

export interface FinanceOverviewInput {
  currentBalance: number;
  bills: FinanceBill[];
  debts: FinanceDebt[];
  incomes: FinanceIncome[];
  expenses: FinanceExpense[];
  today?: string;
  horizonDays?: number;
}

export interface ProjectionPoint {
  date: string;
  balance: number;
}

export interface FinanceOverview {
  today: string;
  month: { label: string; start: string; end: string };
  monthIncomeForecast: number;
  monthExpensesPaid: number;
  monthExpensesForecast: number;
  monthObligationsForecast: number;
  obligationsNext7Days: { count: number; total: number };
  obligationsPendingTotal: number;
  overdueBills: { count: number; total: number };
  availableAfterObligations: number;
  totalDebt: number;
  openDebts: { count: number; total: number };
  negativeDay: string | null;
  minProjectedBalance: number;
  minProjectedDate: string | null;
  projected: ProjectionPoint[];
  hasData: boolean;
}

function billsDueInMonth(bills: FinanceBill[], start: string, end: string): FinanceBill[] {
  return bills.filter((b) => occurrencesBetween(b.dueDate, start, end, b.recurrence) > 0);
}

function billsDueInWindow(bills: FinanceBill[], start: string, end: string): FinanceBill[] {
  return bills.filter((b) => {
    if (b.status === "PAID") return false;
    // Atrasadas são tratadas como devidas hoje (ação imediata).
    if (b.dueDate < start) return true;
    const next = nextOccurrenceOnOrAfter(b.dueDate, start, b.recurrence);
    return next !== null && next <= end;
  });
}

export function buildFinanceOverview(input: FinanceOverviewInput): FinanceOverview {
  const today = dateKey(input.today ?? new Date());
  const { start, end } = monthRange(today);
  const horizon = dateKey(addDays(parseKey(today), input.horizonDays ?? 60));

  const activeIncomes = input.incomes.filter((i) => i.isActive);

  const monthIncomeForecast = activeIncomes.reduce((sum, inc) => {
    const n = occurrencesBetween(inc.expectedDate, start, end, inc.recurrence);
    return sum + n * inc.amount;
  }, 0);

  // Obrigações previstas deste mês (todas as que "vencem" no mês, independentemente do estado).
  const monthBills = billsDueInMonth(input.bills, start, end);
  const monthObligationsForecast = roundToCurrency(
    monthBills.reduce((s, b) => s + b.amount, 0),
  );

  // Despesas efetivamente pagas este mês.
  const billsPaidThisMonth = input.bills.filter(
    (b) =>
      b.status === "PAID" &&
      ((b.paidAt && dateKey(b.paidAt) >= start && dateKey(b.paidAt) <= end) ||
        (b.dueDate >= start && b.dueDate <= end)),
  );
  const expensesThisMonth = input.expenses.filter(
    (e) => e.expenseDate >= start && e.expenseDate <= end,
  );
  const monthExpensesPaid = roundToCurrency(
    billsPaidThisMonth.reduce((s, b) => s + b.amount, 0) +
      expensesThisMonth.reduce((s, e) => s + e.amount, 0),
  );

  // Cenário de despesas totais do mês (pago + obrigações previstas, sem dupla contagem de pagos).
  const monthExpensesForecast = roundToCurrency(
    monthExpensesPaid +
      input.bills.reduce((s, b) => {
        if (b.status === "PAID") return s;
        return s + (occurrencesBetween(b.dueDate, start, end, b.recurrence) > 0 ? b.amount : 0);
      }, 0),
  );

  // Obrigações nos próximos 7 dias (não pagas).
  const weekStart = today;
  const weekEnd = dateKey(addDays(parseKey(today), 7));
  const weekBills = billsDueInWindow(input.bills, weekStart, weekEnd);
  const obligationsNext7Days = {
    count: weekBills.length,
    total: roundToCurrency(weekBills.reduce((s, b) => s + b.amount, 0)),
  };

  const pendingBills = input.bills.filter((b) => b.status !== "PAID");
  const obligationsPendingTotal = roundToCurrency(
    pendingBills.reduce((s, b) => s + b.amount, 0),
  );
  const overdueBills = input.bills.filter((b) => classifyBillStatus(b, today) === "OVERDUE");
  const overdueTotals = {
    count: overdueBills.length,
    total: roundToCurrency(overdueBills.reduce((s, b) => s + b.amount, 0)),
  };

  const availableAfterObligations = roundToCurrency(input.currentBalance - obligationsPendingTotal);

  const openDebts = input.debts.filter((d) => d.status === "OPEN");
  const totalDebt = roundToCurrency(openDebts.reduce((s, d) => s + d.outstandingAmount, 0));

  // Projeção diária de saldo.
  const deltas = new Map<string, number>();
  const bump = (key: string, value: number) => deltas.set(key, (deltas.get(key) ?? 0) + value);

  for (const inc of activeIncomes) {
    let cursor: string | null = nextOccurrenceOnOrAfter(inc.expectedDate, today, inc.recurrence);
    let guard = 0;
    while (cursor && cursor <= horizon && guard < 300) {
      bump(cursor, inc.amount);
      cursor = nextOccurrenceOnOrAfter(cursor, dateKey(addDays(parseKey(cursor), 1)), inc.recurrence);
      guard += 1;
    }
  }

  for (const bill of input.bills) {
    if (bill.status === "PAID") continue;
    const overdue = classifyBillStatus(bill, today) === "OVERDUE";
    if (overdue || bill.recurrence === "ONE_TIME" && bill.dueDate < today) {
      bump(today, -bill.amount);
      continue;
    }
    let cursor = nextOccurrenceOnOrAfter(bill.dueDate, today, bill.recurrence);
    let guard = 0;
    while (cursor && cursor <= horizon && guard < 300) {
      bump(cursor, -bill.amount);
      cursor = nextOccurrenceOnOrAfter(cursor, dateKey(addDays(parseKey(cursor), 1)), bill.recurrence);
      guard += 1;
    }
  }

  // Despesas pontuais futuras.
  for (const exp of input.expenses) {
    if (exp.expenseDate >= today && exp.expenseDate <= horizon) {
      bump(exp.expenseDate, -exp.amount);
    }
  }

  const projected: ProjectionPoint[] = [];
  let running = input.currentBalance;
  let minBalance = input.currentBalance;
  let minDate: string | null = today;
  let negativeDay: string | null = null;
  for (let i = 0; i <= daysBetween(today, horizon); i += 1) {
    const key = dateKey(addDays(parseKey(today), i));
    running = roundToCurrency(running + (deltas.get(key) ?? 0));
    if (running < minBalance) {
      minBalance = running;
      minDate = key;
    }
    if (running < 0 && negativeDay === null) negativeDay = key;
    projected.push({ date: key, balance: running });
  }

  const hasData =
    input.bills.length > 0 ||
    input.debts.length > 0 ||
    input.incomes.length > 0 ||
    input.expenses.length > 0;

  return {
    today,
    month: { label: monthLabel(today), start, end },
    monthIncomeForecast: roundToCurrency(monthIncomeForecast),
    monthExpensesPaid,
    monthExpensesForecast,
    monthObligationsForecast,
    obligationsNext7Days,
    obligationsPendingTotal,
    overdueBills: overdueTotals,
    availableAfterObligations,
    totalDebt,
    openDebts: { count: openDebts.length, total: totalDebt },
    negativeDay,
    minProjectedBalance: minBalance,
    minProjectedDate: minDate,
    projected,
    hasData,
  };
}

// ---------------------------------------------------------------------------
// Insights / frases úteis do dashboard
// ---------------------------------------------------------------------------

export interface FinanceInsight {
  id: string;
  severity: "SUCCESS" | "INFO" | "WARNING" | "CRITICAL";
  message: string;
}

export function formatEuro(value: number): string {
  return `${value.toLocaleString("pt-PT", { maximumFractionDigits: 2 })} €`;
}

export function buildFinanceInsights(
  overview: FinanceOverview,
  debts: FinanceDebt[],
  bills: FinanceBill[],
): FinanceInsight[] {
  const insights: FinanceInsight[] = [];
  const t = overview.today;

  if (overview.obligationsNext7Days.count > 0) {
    insights.push({
      id: "bills-next-7d",
      severity: "WARNING",
      message: `Tens ${overview.obligationsNext7Days.count} conta(s) nos próximos 7 dias (total ≈ ${formatEuro(overview.obligationsNext7Days.total)}).`,
    });
  }

  if (overview.monthExpensesPaid > 0) {
    insights.push({
      id: "month-spent",
      severity: overview.monthExpensesPaid > overview.monthIncomeForecast ? "WARNING" : "SUCCESS",
      message: `Este mês gastaste ${formatEuro(overview.monthExpensesPaid)}.`,
    });
  }

  if (overview.availableAfterObligations >= 0) {
    insights.push({
      id: "available-after-obligations",
      severity: "SUCCESS",
      message: `Tens ${formatEuro(overview.availableAfterObligations)} disponíveis depois das obrigações previstas.`,
    });
  } else {
    insights.push({
      id: "available-negative",
      severity: "CRITICAL",
      message: `As obrigações previstas ultrapassam o teu saldo em ${formatEuro(Math.abs(overview.availableAfterObligations))}.`,
    });
  }

  const openDebts = debts
    .filter((d) => d.status === "OPEN" && d.nextDueDate)
    .sort((a, b) => (a.nextDueDate ?? "").localeCompare(b.nextDueDate ?? ""));
  const nextDebt = openDebts[0];
  if (nextDebt?.nextDueDate) {
    const days = daysBetween(t, nextDebt.nextDueDate);
    if (days <= 0) {
      insights.push({
        id: "debt-overdue",
        severity: "CRITICAL",
        message: `A tua dívida a "${nextDebt.creditorName}" está vencida (${formatEuro(nextDebt.outstandingAmount)}).`,
      });
    } else {
      insights.push({
        id: "next-debt-due",
        severity: days <= 7 ? "WARNING" : "INFO",
        message: `A tua próxima dívida vence em ${days} dia(s) (${nextDebt.creditorName} — ${formatEuro(nextDebt.outstandingAmount)}).`,
      });
    }
  }

  // Despesa recorrente acima da média (mínimo 2 recorrentes mensalizadas).
  const recurring = bills
    .filter((b) => b.recurrence !== "ONE_TIME")
    .map((b) => ({ name: b.name, monthly: toMonthlyAmount(b.amount, b.recurrence) }))
    .filter((r) => r.monthly > 0);
  if (recurring.length >= 2) {
    const avg = recurring.reduce((s, r) => s + r.monthly, 0) / recurring.length;
    const outlier = recurring.find((r) => r.monthly > avg * 1.5);
    if (outlier) {
      insights.push({
        id: "recurring-outlier",
        severity: "WARNING",
        message: `Existe uma despesa recorrente acima da média ("${outlier.name}" — ${formatEuro(outlier.monthly)}/mês).`,
      });
    }
  }

  if (overview.overdueBills.count > 0) {
    insights.push({
      id: "overdue-bills",
      severity: "CRITICAL",
      message: `Tens ${overview.overdueBills.count} conta(s) em atraso (${formatEuro(overview.overdueBills.total)}).`,
    });
  }

  if (overview.negativeDay) {
    insights.push({
      id: "negative-day",
      severity: "CRITICAL",
      message: `Cuidado: o saldo projetado fica negativo no dia ${overview.negativeDay}.`,
    });
  }

  if (!overview.hasData) {
    insights.push({
      id: "empty-state",
      severity: "INFO",
      message: "Regista as tuas contas, dívidas, receitas e despesas para teres um centro financeiro completo.",
    });
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Assistente financeiro (motor de intenções — base para a IA)
// ---------------------------------------------------------------------------

export type FinanceIntent =
  | "SPENDABLE_THIS_MONTH"
  | "SPENDABLE_TODAY"
  | "AVAILABLE_BALANCE"
  | "CAN_SPEND_AMOUNT"
  | "BILLS_THIS_WEEK"
  | "UPCOMING_OBLIGATIONS"
  | "OVERDUE_PAYMENTS"
  | "MONTH_DEBT_DUE"
  | "TOTAL_DEBT"
  | "MOST_URGENT_DEBT"
  | "DEBT_MONTHLY_TOTAL"
  | "DEBT_PAYOFF_MONTHLY_IMPACT"
  | "CAN_PAY_INSTALLMENT"
  | "MONTH_EXPENSES_FORECAST"
  | "AVAILABLE_AFTER_OBLIGATIONS"
  | "TAX_RESERVE"
  | "MONTH_SUMMARY"
  | "MONTH_END_SUFFICIENCY"
  | "END_OF_MONTH_BALANCE"
  | "UNKNOWN";

/** Conjunto estável das intenções financeiras (para roteamento IA server-side). */
export const FINANCE_INTENTS: FinanceIntent[] = [
  "SPENDABLE_THIS_MONTH",
  "SPENDABLE_TODAY",
  "AVAILABLE_BALANCE",
  "CAN_SPEND_AMOUNT",
  "BILLS_THIS_WEEK",
  "UPCOMING_OBLIGATIONS",
  "OVERDUE_PAYMENTS",
  "MONTH_DEBT_DUE",
  "TOTAL_DEBT",
  "MOST_URGENT_DEBT",
  "DEBT_MONTHLY_TOTAL",
  "DEBT_PAYOFF_MONTHLY_IMPACT",
  "CAN_PAY_INSTALLMENT",
  "MONTH_EXPENSES_FORECAST",
  "AVAILABLE_AFTER_OBLIGATIONS",
  "TAX_RESERVE",
  "MONTH_SUMMARY",
  "MONTH_END_SUFFICIENCY",
  "END_OF_MONTH_BALANCE",
];

export interface FinanceAssistantData {
  currentBalance: number;
  bills: FinanceBill[];
  debts: FinanceDebt[];
  incomes: FinanceIncome[];
  expenses: FinanceExpense[];
  today?: string;
}

export interface FinanceAssistantAnswer {
  intent: FinanceIntent;
  answer: string;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const INTENT_KEYWORDS: Array<{ intent: FinanceIntent; keywords: string[] }> = [
  {
    intent: "AVAILABLE_BALANCE",
    keywords: [
      "quanto tenho disponivel", "quanto dinheiro tenho", "qual o meu saldo",
      "saldo disponivel", "quanto tenho em conta", "quanto tenho na conta",
      "valor disponivel em conta",
    ],
  },
  {
    intent: "SPENDABLE_THIS_MONTH",
    keywords: ["quanto posso gastar", "quanto dinheiro posso gastar", "quanto tenho para gastar", "posso gastar este mes", "orcamento pessoal", "budget", "posso gastar"],
  },
  {
    intent: "SPENDABLE_TODAY",
    keywords: ["quanto posso gastar hoje", "posso gastar hoje", "quanto posso gastar este dia", "para gastar hoje", "quanto tenho hoje para gastar"],
  },
  {
    intent: "MONTH_EXPENSES_FORECAST",
    keywords: [
      "quanto vou gastar este mes", "quanto vou gastar", "gastos previstos este mes",
      "despesas deste mes", "quanto gasto este mes", "previsao de despesas",
      "quanto vou gastar no mes",
    ],
  },
  {
    intent: "BILLS_THIS_WEEK",
    keywords: ["contas esta semana", "contas nos proximos dias", "que contas tenho esta semana", "o que tenho a pagar esta semana", "vencimentos esta semana", "proximas contas", "contas para esta semana"],
  },
  {
    intent: "UPCOMING_OBLIGATIONS",
    keywords: [
      "vence nos proximos", "vencem nos proximos", "proximos 30 dias",
      "a pagar nos proximos 30 dias", "o que vence", "dentro de 30 dias",
      "proximos 7 dias",
    ],
  },
  {
    intent: "OVERDUE_PAYMENTS",
    keywords: [
      "pagamentos atrasados", "contas em atraso", "contas atrasadas",
      "tenho algo atrasado", "faturas em atraso", "esta atrasado", "atrasos",
    ],
  },
  {
    intent: "MONTH_DEBT_DUE",
    keywords: ["quanto devo este mes", "devo neste mes", "quanto tenho a pagar este mes", "devo este mes", "contas e prestacoes deste mes", "o que tenho para pagar este mes"],
  },
  {
    intent: "TOTAL_DEBT",
    keywords: ["quanto devo", "divida total", "quanto devo ao banco", "total de dividas", "quanto tenho em divida", "minhas dividas", "quanto devo no total", "valor total em divida"],
  },
  {
    intent: "DEBT_PAYOFF_MONTHLY_IMPACT",
    keywords: ["se pagar esta divida", "se pagar a divida", "quanto fico a pagar", "liquida divida", "pagar divida", "impacto de pagar", "fecho da divida"],
  },
  {
    intent: "DEBT_MONTHLY_TOTAL",
    keywords: [
      "quanto pago por mes em dividas", "quanto pago por mes",
      "total de prestacoes", "quanto pago em prestacoes", "prestacoes mensais",
      "quanto gasto por mes em prestacoes",
    ],
  },
  {
    intent: "CAN_PAY_INSTALLMENT",
    keywords: [
      "consigo pagar esta prestacao", "consigo pagar a prestacao",
      "posso pagar a prestacao", "consigo pagar", "tenho dinheiro para a prestacao",
      "pago a prestacao", "prestacao da divida",
    ],
  },
  {
    intent: "MOST_URGENT_DEBT",
    keywords: ["divida mais urgente", "divida mais importante", "qual divida pago primeiro", "que divida vence primeiro", "divida urgente", "primeiro pagamento de divida"],
  },
  {
    intent: "AVAILABLE_AFTER_OBLIGATIONS",
    keywords: [
      "sobra depois das obrigacoes", "dinheiro que sobra", "quanto sobra",
      "sobra depois de pagar as contas", "saldo depois das obrigacoes",
      "depois das obrigacoes", "dinheiro disponivel apos obrigacoes",
      "quanto sobra depois",
    ],
  },
  {
    intent: "TAX_RESERVE",
    keywords: ["reservar para impostos", "reserva de impostos", "quanto preciso para impostos", "impostos para pagar", "divida fiscal", "obrigacoes fiscais"],
  },
  {
    intent: "MONTH_SUMMARY",
    keywords: [
      "resumo deste mes", "sumario deste mes", "resumo do mes",
      "resumo mensal", "panorama deste mes", "situacao financeira atual",
    ],
  },
  {
    intent: "MONTH_END_SUFFICIENCY",
    keywords: ["tenho dinheiro suficiente", "chego ao fim do mes", "saldo ate ao fim do mes", "dinheiro ate ao final do mes", "vou ter saldo", "aguento ate", "cobertura ate ao fim do mes"],
  },
  {
    intent: "END_OF_MONTH_BALANCE",
    keywords: [
      "quanto vou ter no fim do mes",
      "quanto dinheiro vou ter no fim do mes",
      "saldo no fim do mes", "como fico no fim do mes",
      "quanto tenho no fim do mes", "projecao de fim do mes",
    ],
  },
];

/** Extrai um montante concreto do tipo "posso gastar 50€?" (senão null). */
function parseSpendableAmount(text: string): number | null {
  const m = normalize(text).match(/gastar\D{0,12}?([0-9]+(?:[.,]\s?[0-9]{1,3})?)/);
  if (!m) return null;
  const raw = m[1].replace(/\./g, "").replace(/,/g, ".").replace(/\s/g, "");
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Deteta o padrão "posso gastar X€?" para decidir se há valor concreto na pergunta. */
function hasConcreteSpendAmount(question: string): boolean {
  return parseSpendableAmount(question) !== null;
}

/** Extrai um montante que surgir junto de um marcador, ex.: "consigo pagar 120€ de prestação?". Senão null. */
function parseAmountNear(text: string, pattern: RegExp): number | null {
  const m = normalize(text).match(pattern);
  if (!m) return null;
  const raw = m[1].replace(/\./g, "").replace(/,/g, ".").replace(/\s/g, "");
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function resolveFinanceIntent(question: string): FinanceIntent {
  const q = normalize(question);

  // "Posso gastar 50€?" — pergunta direta com valor concreto.
  if (hasConcreteSpendAmount(question)) {
    return "CAN_SPEND_AMOUNT";
  }

  let best: FinanceIntent = "UNKNOWN";
  let bestScore = 0;
  for (const { intent, keywords } of INTENT_KEYWORDS) {
    const score = keywords.reduce((s, kw) => {
      const words = normalize(kw).split(" ");
      return words.every((w) => q.includes(w)) ? s + words.length : s;
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      best = intent;
    }
  }
  return best;
}

export function answerFinanceAssistant(
  intent: FinanceIntent,
  data: FinanceAssistantData,
  question?: string,
): FinanceAssistantAnswer {
  const today = dateKey(data.today ?? new Date());
  const overview = buildFinanceOverview({
    currentBalance: data.currentBalance,
    bills: data.bills,
    debts: data.debts,
    incomes: data.incomes,
    expenses: data.expenses,
    today,
  });

  switch (intent) {
    case "AVAILABLE_BALANCE": {
      if (!overview.hasData && data.bills.length === 0 && data.debts.length === 0 && data.incomes.length === 0 && data.expenses.length === 0) {
        return {
          intent,
          answer: "Ainda não há dados no Centro Financeiro. Regista as tuas contas, rendimentos e despesas para saber o saldo disponível.",
        };
      }
      return {
        intent,
        answer: `Tens ${formatEuro(data.currentBalance)} disponíveis nas tuas contas (saldo em conta).`,
      };
    }
    case "CAN_SPEND_AMOUNT": {
      const amount = parseSpendableAmount(question ?? "");
      if (amount === null) {
        return { intent, answer: "Indica um valor concreto para avaliar, por exemplo: \"Posso gastar 50€?\"." };
      }
      const livre = overview.availableAfterObligations;
      if (livre <= 0) {
        return {
          intent,
          answer: `Não consegues gastar ${formatEuro(amount)} — depois das obrigações previstas não sobra saldo disponível (${formatEuro(livre)}).`,
        };
      }
      if (amount <= livre) {
        return {
          intent,
          answer: `Sim, podes gastar ${formatEuro(amount)} — depois das obrigações previstas ficam ${formatEuro(livre)} disponíveis.`,
        };
      }
      return {
        intent,
        answer: `Cuidado: ${formatEuro(amount)} excede o que te sobra depois das obrigações (${formatEuro(livre)}). Recomendo gastar no máximo ${formatEuro(livre)} aqui e agora.`,
      };
    }
    case "SPENDABLE_THIS_MONTH": {
      const spendable = roundToCurrency(overview.monthIncomeForecast - overview.monthObligationsForecast);
      const msg =
        spendable >= 0
          ? `Com ${formatEuro(overview.monthIncomeForecast)} de receitas previstas e ${formatEuro(
              overview.monthObligationsForecast,
            )} de obrigações este mês, podes gastar até ${formatEuro(spendable)} mantendo o saldo atual.`
          : `As tuas obrigações deste mês (${formatEuro(
              overview.monthObligationsForecast,
            )}) ultrapassam as receitas previstas (${formatEuro(
              overview.monthIncomeForecast,
            )}) em ${formatEuro(Math.abs(spendable))}. Recomendo rever as despesas.`;
      return { intent, answer: msg };
    }
    case "SPENDABLE_TODAY": {
      const billsToday = data.bills.filter(
        (b) => b.status !== "PAID" && (b.dueDate === today || b.dueDate < today),
      );
      const todayObligations = roundToCurrency(billsToday.reduce((s, b) => s + b.amount, 0));
      const todaysIncomes = roundToCurrency(
        data.incomes
          .filter((i) => i.isActive)
          .filter((i) => nextOccurrenceOnOrAfter(i.expectedDate, today, i.recurrence) === today)
          .reduce((s, i) => s + i.amount, 0),
      );
      const livre = roundToCurrency(data.currentBalance - todayObligations + todaysIncomes);
      const msg =
        livre >= 0
          ? `Hoje tens ${formatEuro(livre)} livres (saldo de ${formatEuro(
              data.currentBalance,
            )} menos ${formatEuro(todayObligations)} em obrigações de hoje).`
          : `As obrigações de hoje (${formatEuro(
              todayObligations,
            )}) ultrapassam o teu saldo em ${formatEuro(Math.abs(livre))}. Procura renegociar ou adiar pagamentos.`;
      return { intent, answer: msg };
    }
    case "BILLS_THIS_WEEK": {
      const windowDays = (question ?? "").includes("30") ? 30 : 7;
      const start = today;
      const end = dateKey(addDays(parseKey(today), windowDays));
      const due = billsDueInWindow(data.bills, start, end)
        .map((b) => b.dueDate < today ? { bill: b, next: today, overdue: true } : { bill: b, next: nextOccurrenceOnOrAfter(b.dueDate, today, b.recurrence) ?? b.dueDate, overdue: false })
        .sort((a, b) => a.next.localeCompare(b.next));
      if (due.length === 0) {
        return { intent, answer: `Não tens contas a pagar nos próximos ${windowDays} dias.` };
      }
      const lines = due
        .map(
          ({ bill, next, overdue }) =>
            `  • ${bill.name} — ${formatEuro(bill.amount)} (${overdue ? "atrasada" : `vence a ${next}`})`,
        )
        .join("\n");
      const total = roundToCurrency(due.reduce((s, x) => s + x.bill.amount, 0));
      return {
        intent,
        answer: `Tens ${due.length} conta(s) a pagar nos próximos ${windowDays} dias (total ${formatEuro(total)}):\n${lines}`,
      };
    }
    case "UPCOMING_OBLIGATIONS": {
      const end = dateKey(addDays(parseKey(today), 30));
      const due = billsDueInWindow(data.bills, today, end);
      if (due.length === 0) {
        return { intent, answer: "Não tens obrigações a vencer nos próximos 30 dias." };
      }
      const total = roundToCurrency(due.reduce((s, b) => s + b.amount, 0));
      const list = due
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .map((b) => `  • ${b.name} — ${formatEuro(b.amount)} (${b.dueDate})`)
        .join("\n");
      return {
        intent,
        answer: `Nos próximos 30 dias vencem ${due.length} obrigação(ões), num total de ${formatEuro(total)}:\n${list}`,
      };
    }
    case "OVERDUE_PAYMENTS": {
      const overdue = data.bills.filter((b) => b.status !== "PAID" && b.dueDate < today);
      if (overdue.length === 0) {
        return { intent, answer: "Não tens pagamentos em atraso. Está tudo em dia." };
      }
      const total = roundToCurrency(overdue.reduce((s, b) => s + b.amount, 0));
      const list = overdue
        .map((b) => `  • ${b.name} — ${formatEuro(b.amount)} (vencida a ${b.dueDate})`)
        .join("\n");
      return {
        intent,
        answer: `Sim, tens ${overdue.length} pagamento(s) em atraso (total ${formatEuro(total)}):\n${list}`,
      };
    }
    case "MONTH_DEBT_DUE": {
      const prestacoes = roundToCurrency(
        data.debts
          .filter(
            (d) =>
              d.status === "OPEN" &&
              d.nextDueDate !== null &&
              d.nextDueDate !== undefined &&
              d.nextDueDate >= overview.month.start &&
              d.nextDueDate <= overview.month.end,
          )
          .reduce((s, d) => s + (d.installmentAmount ?? 0), 0),
      );
      const contas = roundToCurrency(overview.monthObligationsForecast);
      const total = roundToCurrency(contas + prestacoes);
      return {
        intent,
        answer: `Este mês tens ${formatEuro(total)} a pagar: ${formatEuro(contas)} em contas e ${formatEuro(prestacoes)} em prestações de dívidas.`,
      };
    }
    case "MONTH_EXPENSES_FORECAST": {
      const forecast = overview.monthExpensesForecast;
      const monthPart = overview.monthExpensesPaid;
      const obligations = overview.monthObligationsForecast;
      const despesasPontuais = roundToCurrency(Math.max(0, forecast - obligations));
      return {
        intent,
        answer: `Previsão de gastos deste mês: ${formatEuro(forecast)} — ${formatEuro(monthPart)} já pagos em despesas, ${formatEuro(
          despesasPontuais,
        )} em despesas pontuais previstas e ${formatEuro(obligations)} de obrigações (contas) do mês.`,
      };
    }
    case "AVAILABLE_AFTER_OBLIGATIONS": {
      const livre = overview.availableAfterObligations;
      if (livre >= 0) {
        return {
          intent,
          answer: `Depois das obrigações previstas ficam ${formatEuro(livre)} disponíveis (sobra).`,
        };
      }
      return {
        intent,
        answer: `As obrigações previstas ultrapassam o teu saldo em ${formatEuro(Math.abs(livre))}. Precisas de reforçar fundos ou reduzir despesas.`,
      };
    }
    case "MONTH_SUMMARY": {
      const receitas = overview.monthIncomeForecast;
      const despesas = overview.monthExpensesForecast;
      const obrigacoes = overview.monthObligationsForecast;
      const previsto = roundToCurrency(receitas - despesas);
      const finMes = previsto >= 0
        ? `Projeção de saldo no fim do mês: +${formatEuro(previsto)} (mínimo ${formatEuro(overview.minProjectedBalance)} no dia ${overview.minProjectedDate ?? "—"}).`
        : `Projeção de saldo no fim do mês: −${formatEuro(Math.abs(previsto))} (mínimo ${formatEuro(overview.minProjectedBalance)} no dia ${overview.minProjectedDate ?? "—"}).`;
      return {
        intent,
        answer: `Resumo deste mês:\n  • Receitas previstas: ${formatEuro(receitas)}\n  • Despesas previstas: ${formatEuro(despesas)}\n  • Obrigações (contas): ${formatEuro(obrigacoes)}\n  • Dívida em aberto: ${formatEuro(overview.totalDebt)} (${overview.openDebts.count} dívida(s))\n  • Saldo atual: ${formatEuro(data.currentBalance)}\n${finMes}`,
      };
    }
    case "TOTAL_DEBT": {
      if (overview.openDebts.count === 0) {
        return { intent, answer: "Não tens dívidas em aberto registadas." };
      }
      return {
        intent,
        answer: `A tua dívida total em aberto é de ${formatEuro(overview.totalDebt)} (${overview.openDebts.count} dívida(s)).`,
      };
    }
    case "MOST_URGENT_DEBT": {
      const openWithDate = data.debts
        .filter((d) => d.status === "OPEN" && d.nextDueDate)
        .sort((a, b) => (a.nextDueDate ?? "").localeCompare(b.nextDueDate ?? ""));
      if (openWithDate.length === 0) {
        return { intent, answer: "Não tens dívidas em aberto com prazo registado." };
      }
      const d = openWithDate[0];
      const days = daysBetween(today, d.nextDueDate as string);
      const urgency = days <= 0
        ? `está vencida`
        : `vence em ${days} dia(s)`;
      return {
        intent,
        answer: `A tua dívida mais urgente é a "${d.creditorName}" — ${formatEuro(d.outstandingAmount)} restantes (${urgency}).`,
      };
    }
    case "DEBT_PAYOFF_MONTHLY_IMPACT": {
      const open = data.debts.filter((d) => d.status === "OPEN");
      const withInst = open.filter((d) => d.installmentAmount && d.installmentAmount > 0);
      if (open.length === 0) {
        return { intent, answer: "Não tens dívidas em aberto para analisar." };
      }
      const currentMonthly = roundToCurrency(withInst.reduce((s, d) => s + (d.installmentAmount ?? 0), 0));
      const target = (
        open.find((d) => d.installmentAmount && d.installmentAmount > 0) ??
        open[0]
      );
      const installment = target.installmentAmount ?? 0;
      const after = roundToCurrency(Math.max(0, currentMonthly - installment));
      if (installment <= 0) {
        return {
          intent,
          answer: `A dívida "${target.creditorName}" não tem prestação mensal registada. Total em aberto: ${formatEuro(target.outstandingAmount)}.`,
        };
      }
      return {
        intent,
        answer: `Atualmente pagas ${formatEuro(currentMonthly)}/mês em prestações. Se liquidares a dívida "${target.creditorName}" (${formatEuro(
          target.outstandingAmount,
        )}), deixas de pagar ${formatEuro(installment)}/mês — ficas com ${formatEuro(after)}/mês em prestações.`,
      };
    }
    case "CAN_PAY_INSTALLMENT": {
      const amount = parseAmountNear(
        question ?? "",
        /(?:prestacao|pagar)\D{0,12}?([0-9]+(?:[.,]\s?[0-9]{1,3})?)/,
      );
      const livre = overview.availableAfterObligations;
      if (amount === null) {
        const open = data.debts
          .filter((d) => d.status === "OPEN" && d.installmentAmount && d.installmentAmount > 0)
          .sort((a, b) => (a.nextDueDate ?? "").localeCompare(b.nextDueDate ?? ""));
        const ref = open[0];
        if (!ref) {
          return {
            intent,
            answer:
              'Não tens prestações de dívidas registadas para analisar. Indica um valor, ex.: "Consigo pagar 120€ de prestação?".',
          };
        }
        const ok = livre >= (ref.installmentAmount ?? 0);
        return {
          intent,
          answer: `${ok ? "Sim" : "Não"} — depois das obrigações previstas ${
            ok ? "consegues" : "não consegues"
          } cobrir a prestação de ${formatEuro(ref.installmentAmount ?? 0)} da "${ref.creditorName}" (sobram ${formatEuro(livre)}).`,
        };
      }
      const ok = livre >= amount;
      return {
        intent,
        answer: ok
          ? `Sim, consegues — depois das obrigações previstas sobram ${formatEuro(
              livre,
            )}, suficiente para a prestação de ${formatEuro(amount)}.`
          : `Não — depois das obrigações previstas sobram ${formatEuro(
              livre,
            )}, insuficiente para a prestação de ${formatEuro(amount)}.`,
      };
    }
    case "DEBT_MONTHLY_TOTAL": {
      const withInst = data.debts
        .filter((d) => d.status === "OPEN" && d.installmentAmount && d.installmentAmount > 0);
      if (withInst.length === 0) {
        return {
          intent,
          answer: "Não tens prestações mensais de dívidas registadas.",
        };
      }
      const monthly = roundToCurrency(withInst.reduce((s, d) => s + (d.installmentAmount ?? 0), 0));
      const list = withInst
        .map((d) => `  • ${d.creditorName} — ${formatEuro(d.installmentAmount ?? 0)}/mês`)
        .join("\n");
      return {
        intent,
        answer: `Pagas ${formatEuro(monthly)}/mês em prestações de dívidas (${withInst.length} dívida(s)):\n${list}`,
      };
    }
    case "TAX_RESERVE": {
      const taxBills = data.bills.filter(
        (b) => b.category === "TAXES" && b.status !== "PAID",
      );
      if (taxBills.length === 0) {
        return {
          intent,
          answer: "Não tens impostos registados pendentes no Centro Financeiro. Quando registares obrigações de impostos com vencimento, calculo automaticamente o que reservar.",
        };
      }
      const total = roundToCurrency(taxBills.reduce((s, b) => s + b.amount, 0));
      return {
        intent,
        answer: `Tens ${formatEuro(total)} em impostos pendentes registados (${taxBills.length} obrigação(ões)). Reserva pelo menos este valor antes do vencimento.`,
      };
    }
    case "MONTH_END_SUFFICIENCY": {
      if (overview.negativeDay) {
        return {
          intent,
          answer: `Não — a projeção indica saldo negativo no dia ${overview.negativeDay}. Mínimo estimado: ${formatEuro(
            overview.minProjectedBalance,
          )} no dia ${overview.minProjectedDate}.`,
        };
      }
      return {
        intent,
        answer: `Sim — o teu saldo cobre as obrigações projetadas até ao fim do mês. Mínimo estimado: ${formatEuro(
          overview.minProjectedBalance,
        )} no dia ${overview.minProjectedDate} (saldo atual ${formatEuro(data.currentBalance)}).`,
      };
    }
    case "END_OF_MONTH_BALANCE": {
      const point =
        overview.projected.find((p) => p.date === overview.month.end) ??
        overview.projected[overview.projected.length - 1];
      const balEnd = point !== undefined ? point.balance : data.currentBalance;
      const sinal = balEnd >= 0 ? "" : "−";
      return {
        intent,
        answer: `No fim do mês (${overview.month.label}), o teu saldo projetado será ${sinal}${formatEuro(
          Math.abs(balEnd),
        )}. Mínimo estimado: ${formatEuro(overview.minProjectedBalance)} no dia ${overview.minProjectedDate ?? "—"}.`,
      };
    }
    case "UNKNOWN":
    default:
      return {
        intent,
        answer:
          "Ainda não consigo responder a essa pergunta com os dados financeiros disponíveis. Podes perguntar, por exemplo: \"Quanto tenho disponível?\", \"Quanto tenho disponível na conta?\", \"Quanto vou gastar este mês?\", \"Que contas tenho esta semana?\", \"O que vence nos próximos 30 dias?\", \"Tenho pagamentos atrasados?\", \"Quanto devo no total?\", \"Qual é a dívida mais urgente?\", \"Quanto pago por mês em dívidas?\", \"Quanto sobra depois das obrigações?\", \"Posso gastar 50€?\" ou \"Resumo deste mês\".",
      };
  }
}

/** Ponto de entrada do assistente: deteta a intenção e responde com os dados do tenant. */
export function askFinanceAssistant(
  question: string,
  data: FinanceAssistantData,
): FinanceAssistantAnswer {
  const intent = resolveFinanceIntent(question);
  return answerFinanceAssistant(intent, data, question);
}