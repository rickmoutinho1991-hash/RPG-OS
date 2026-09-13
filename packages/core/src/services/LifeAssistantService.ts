/**
 * RPG-OS — Life Assistant Service (Centro de Vida).
 *
 * Camada pura e determinística do assistente pessoal:
 *   - visão geral do dia (finanças + agenda + tarefas + documentos + lembretes)
 *   - motor de alertas internos (8 tipos de deteção)
 *   - respostas a perguntas naturais com dados reais do tenant
 *
 * Sem I/O — recebe inputs já autorizados pela camada server-side (tenant).
 * As intenções financeiras são delegadas no LifeFinanceService (reutilização,
 * sem duplicação de regras).
 */
import { roundToCurrency } from "./QuoteCalculationService";
import {
  askFinanceAssistant,
  buildFinanceOverview,
  classifyBillStatus,
  dateKey,
  daysBetween,
  formatEuro,
  nextOccurrenceOnOrAfter,
  resolveFinanceIntent,
  type FinanceAssistantData,
  type FinanceIntent,
} from "./LifeFinanceService";
import {
  askReputationAssistant,
  REPUTATION_EXTRA_INTENTS,
  resolveReputationIntent,
  type ReputationIntent,
  type ReputationReviewInput,
} from "./ReputationService";

// ---------------------------------------------------------------------------
// Input (áreas da vida que o assistente agrega)
// ---------------------------------------------------------------------------

export interface LifeEventInput {
  id: string;
  title: string;
  startTime?: string | null; // ISO (ou "-" quando sem hora)
  eventType?: string;
  isCompleted: boolean;
  priority?: string;
}

export interface LifeTaskInput {
  id: string;
  title: string;
  dueDate?: string | null; // ISO
  status?: string;
  priority?: string;
}

export interface LifeDocumentInput {
  id: string;
  fileName: string;
  category?: string;
  status?: string;
  expiresAt?: string | null; // ISO
}

export interface LifePersonalReminderInput {
  id: string;
  title: string;
  category?: string;
  scheduledTime?: string | null;
  isCompletedToday?: boolean;
}

export interface LifeContextInput {
  finance: FinanceAssistantData;
  events?: LifeEventInput[];
  tasks?: LifeTaskInput[];
  documents?: LifeDocumentInput[];
  reminders?: LifePersonalReminderInput[];
  /** Avaliações/reclamações de reputação do tenant (para o assistente responder). */
  reviews?: ReputationReviewInput[];
  today?: string;
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

export type LifeAlertType =
  | "OVERDUE_PAYMENT"
  | "BILL_DUE_SOON"
  | "INSUFFICIENT_BALANCE"
  | "INSTALLMENT_DUE_SOON"
  | "OVERDUE_DEBT"
  | "DOCUMENT_EXPIRING"
  | "TASK_OVERDUE"
  | "EVENT_UPCOMING";

export type LifeAlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface LifeAlert {
  id: string;
  type: LifeAlertType;
  severity: LifeAlertSeverity;
  message: string;
  referenceId?: string;
  referenceLabel?: string;
  date?: string;
}

// ---------------------------------------------------------------------------
// Itens e visão geral
// ---------------------------------------------------------------------------

export interface LifeBillItem {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  recurrence: string;
  category: string;
  isOverdue: boolean;
}

export interface LifeDebtItem {
  id: string;
  creditorName: string;
  outstandingAmount: number;
  installmentAmount?: number;
  nextDueDate?: string | null;
  isOverdue: boolean;
}

export interface LifeTaskItem {
  id: string;
  title: string;
  dueDate?: string | null;
  status: string;
  priority: string;
}

export interface LifeEventItem extends LifeEventInput {}

export interface LifeDocumentItem {
  id: string;
  fileName: string;
  category: string;
  status: string;
  expiresAt?: string | null;
  daysLeft: number;
}

export interface LifeOverview {
  today: string;
  month: { label: string; start: string; end: string };
  finance: {
    hasData: boolean;
    currentBalance: number;
    monthIncomeForecast: number;
    monthExpensesPaid: number;
    monthExpensesForecast: number;
    monthObligationsForecast: number;
    obligationsNext7Days: { count: number; total: number };
    overdueBills: { count: number; total: number };
    totalDebt: number;
    openDebtsCount: number;
    availableAfterObligations: number;
    minProjectedBalance: number;
    minProjectedDate: string | null;
    monthEndProjectedBalance: number | null;
    negativeDay: string | null;
  };
  upcomingBills: LifeBillItem[];
  debts: LifeDebtItem[];
  installmentsMonthly: number;
  todayEvents: LifeEventItem[];
  urgentTasks: LifeTaskItem[];
  todayTasks: LifeTaskItem[];
  overdueTasks: LifeTaskItem[];
  expiringDocuments: LifeDocumentItem[];
  alerts: LifeAlert[];
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dateKey(dt);
}

function dateOf(value: string | null | undefined): string | null {
  return value && value.length > 0 ? dateKey(value) : null;
}

function withinDays(fromKey: string, toKey: string | null, days: number): boolean {
  if (!toKey) return false;
  const delta = daysBetween(fromKey, toKey);
  return delta >= 0 && delta <= days;
}

function isDone(status: string | undefined): boolean {
  return status === "DONE" || status === "CANCELLED" || status === "COMPLETED";
}

function timeOf(iso: string | null | undefined): string | null {
  if (!iso || iso.length < 16) return null;
  return iso.slice(11, 16);
}

const SEVERITY_ORDER: Record<LifeAlertSeverity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

function formatDays(delta: number): string {
  if (delta <= 0) return "hoje";
  return `em ${delta} dia(s)`;
}

// ---------------------------------------------------------------------------
// Motor de alertas
// ---------------------------------------------------------------------------

export function buildLifeAlerts(
  ctx: LifeContextInput,
  overview: Omit<LifeOverview, "alerts">,
): LifeAlert[] {
  const alerts: LifeAlert[] = [];
  const today = overview.today;

  if (overview.finance.hasData) {
    if (overview.finance.overdueBills.count > 0) {
      alerts.push({
        id: "overdue-payment",
        type: "OVERDUE_PAYMENT",
        severity: "CRITICAL",
        message: `Tens ${overview.finance.overdueBills.count} pagamento(s) em atraso (total ${formatEuro(
          overview.finance.overdueBills.total,
        )}). Regulariza o mais cedo possível.`,
        date: today,
      });
    }

    if (overview.finance.obligationsNext7Days.count > 0) {
      alerts.push({
        id: "bill-due-soon",
        type: "BILL_DUE_SOON",
        severity: "WARNING",
        message: `Tens ${overview.finance.obligationsNext7Days.count} conta(s) a vencer nos próximos 7 dias (total ${formatEuro(
          overview.finance.obligationsNext7Days.total,
        )}).`,
      });
    }

    if (overview.finance.negativeDay) {
      alerts.push({
        id: "insufficient-balance",
        type: "INSUFFICIENT_BALANCE",
        severity: "CRITICAL",
        message: `A projeção indica saldo negativo no dia ${overview.finance.negativeDay} (mínimo ${formatEuro(
          overview.finance.minProjectedBalance,
        )}). Evita novas despesas até lá.`,
        referenceLabel: "Finanças",
        date: overview.finance.negativeDay,
      });
    } else if (overview.finance.availableAfterObligations < 0) {
      alerts.push({
        id: "insufficient-balance",
        type: "INSUFFICIENT_BALANCE",
        severity: "CRITICAL",
        message: `As obrigações previstas ultrapassam o teu saldo em ${formatEuro(
          Math.abs(overview.finance.availableAfterObligations),
        )}. Reforça fundos ou reduz despesas.`,
        referenceLabel: "Finanças",
      });
    }
  }

  for (const debt of overview.debts) {
    if (debt.nextDueDate && debt.nextDueDate < today) {
      alerts.push({
        id: `overdue-debt-${debt.id}`,
        type: "OVERDUE_DEBT",
        severity: "CRITICAL",
        message: `A dívida "${debt.creditorName}" está em atraso (${formatEuro(
          debt.outstandingAmount,
        )} restantes).`,
        referenceId: debt.id,
        referenceLabel: debt.creditorName,
        date: debt.nextDueDate,
      });
    } else if (debt.nextDueDate && withinDays(today, debt.nextDueDate, 7)) {
      alerts.push({
        id: `installment-due-${debt.id}`,
        type: "INSTALLMENT_DUE_SOON",
        severity: "WARNING",
        message: `Prestação da "${debt.creditorName}" (${formatEuro(
          debt.installmentAmount ?? 0,
        )}) vence ${formatDays(daysBetween(today, debt.nextDueDate))}.`,
        referenceId: debt.id,
        referenceLabel: debt.creditorName,
        date: debt.nextDueDate,
      });
    }
  }

  if (overview.expiringDocuments.length > 0) {
    const top = overview.expiringDocuments[0];
    alerts.push({
      id: "document-expiring",
      type: "DOCUMENT_EXPIRING",
      severity: "WARNING",
      message: `O documento "${top.fileName}" expira ${formatDays(top.daysLeft)} (${top.expiresAt}). Renova a tempo.`,
      referenceId: top.id,
      referenceLabel: top.fileName,
      date: top.expiresAt ?? undefined,
    });
  }

  if (overview.overdueTasks.length > 0) {
    alerts.push({
      id: "task-overdue",
      type: "TASK_OVERDUE",
      severity: "WARNING",
      message: `Tens ${overview.overdueTasks.length} tarefa(s) atrasada(s). Põe a agenda em dia.`,
      referenceId: overview.overdueTasks[0].id,
      referenceLabel: overview.overdueTasks[0].title,
    });
  }

  if (overview.todayEvents.length > 0) {
    alerts.push({
      id: "event-upcoming",
      type: "EVENT_UPCOMING",
      severity: "INFO",
      message: `Tens ${overview.todayEvents.length} compromisso(s) hoje. Consulta a tua agenda.`,
      referenceId: overview.todayEvents[0].id,
      referenceLabel: overview.todayEvents[0].title,
    });
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// ---------------------------------------------------------------------------
// Visão geral do dia
// ---------------------------------------------------------------------------

export function buildLifeOverview(input: LifeContextInput): LifeOverview {
  const today = input.today ?? dateKey(new Date());
  const finance = buildFinanceOverview({
    ...input.finance,
    today: input.finance.today ?? today,
  });
  const horizon = addDaysKey(today, 30);
  const events: LifeEventInput[] = input.events ?? [];
  const tasks: LifeTaskItem[] = (input.tasks ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate ?? null,
    status: t.status ?? "TODO",
    priority: t.priority ?? "MEDIUM",
  }));
  const documents = input.documents ?? [];
  const openDebts = input.finance.debts.filter((d) => d.status === "OPEN");

  const upcomingBills: LifeBillItem[] = input.finance.bills
    .filter((b) => {
      if (b.status === "PAID") return false;
      if (b.dueDate < today) return true;
      const next = nextOccurrenceOnOrAfter(b.dueDate, today, b.recurrence);
      return next !== null && next <= horizon;
    })
    .map((b) => {
      const isOverdue = classifyBillStatus(b, today) === "OVERDUE";
      const next = nextOccurrenceOnOrAfter(b.dueDate, today, b.recurrence);
      return {
        id: b.id,
        name: b.name,
        amount: b.amount,
        dueDate: isOverdue ? b.dueDate : (next ?? b.dueDate),
        recurrence: b.recurrence,
        category: b.category,
        isOverdue,
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const debts: LifeDebtItem[] = openDebts.map((d) => ({
    id: d.id,
    creditorName: d.creditorName,
    outstandingAmount: d.outstandingAmount,
    installmentAmount: d.installmentAmount,
    nextDueDate: d.nextDueDate ?? null,
    isOverdue: !!d.nextDueDate && d.nextDueDate < today,
  }));

  const todayEvents: LifeEventItem[] = events
    .filter((e) => !e.isCompleted && dateOf(e.startTime) === today)
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  const urgentTasks: LifeTaskItem[] = tasks
    .filter((t) => {
      if (isDone(t.status)) return false;
      return (
        t.priority === "URGENT" ||
        (t.priority === "HIGH" && t.dueDate !== null && t.dueDate !== undefined && withinDays(today, dateOf(t.dueDate), 3))
      );
    })
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  const todayTasks: LifeTaskItem[] = tasks
    .filter((t) => !isDone(t.status) && t.dueDate !== null && t.dueDate !== undefined && dateOf(t.dueDate) === today)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  const overdueTasks: LifeTaskItem[] = tasks
    .filter((t) => !isDone(t.status) && t.dueDate !== null && t.dueDate !== undefined && (dateOf(t.dueDate) as string) < today)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  const expiringDocuments: LifeDocumentItem[] = documents
    .filter((d) => {
      if (["EXPIRED", "ARCHIVED", "REJECTED"].includes(d.status ?? "")) return false;
      const k = dateOf(d.expiresAt);
      return k !== null && withinDays(today, k, 30);
    })
    .map((d) => ({
      id: d.id,
      fileName: d.fileName,
      category: d.category ?? "Documento",
      status: d.status ?? "PENDING",
      expiresAt: d.expiresAt ?? null,
      daysLeft: daysBetween(today, d.expiresAt as string),
    }))
    .sort((a, b) => (a.expiresAt ?? "").localeCompare(b.expiresAt ?? ""));

  const installmentsMonthly = roundToCurrency(
    openDebts.reduce((s, d) => s + (d.installmentAmount ?? 0), 0),
  );

  const monthEndPoint =
    finance.projected.find((p) => p.date === finance.month.end) ??
    finance.projected[finance.projected.length - 1];

  const overview: Omit<LifeOverview, "alerts"> = {
    today,
    month: finance.month,
    finance: {
      hasData: finance.hasData,
      currentBalance: input.finance.currentBalance,
      monthIncomeForecast: finance.monthIncomeForecast,
      monthExpensesPaid: finance.monthExpensesPaid,
      monthExpensesForecast: finance.monthExpensesForecast,
      monthObligationsForecast: finance.monthObligationsForecast,
      obligationsNext7Days: finance.obligationsNext7Days,
      overdueBills: finance.overdueBills,
      totalDebt: finance.totalDebt,
      openDebtsCount: finance.openDebts.count,
      availableAfterObligations: finance.availableAfterObligations,
      minProjectedBalance: finance.minProjectedBalance,
      minProjectedDate: finance.minProjectedDate,
      monthEndProjectedBalance: monthEndPoint !== undefined ? monthEndPoint.balance : null,
      negativeDay: finance.negativeDay,
    },
    upcomingBills,
    debts,
    installmentsMonthly,
    todayEvents,
    urgentTasks,
    todayTasks,
    overdueTasks,
    expiringDocuments,
  };

  return { ...overview, alerts: buildLifeAlerts(input, overview) };
}

// ---------------------------------------------------------------------------
// Assistente (perguntas naturais)
// ---------------------------------------------------------------------------

/** Intenções não financeiras do assistente de vida (para roteamento IA server-side). */
export const LIFE_EXTRA_INTENTS = ["TODAY_TASKS", "PENDING_ITEMS", "EXPIRING_DOCUMENTS"] as const;

export type LifeAssistantIntent =
  | FinanceIntent
  | (typeof LIFE_EXTRA_INTENTS)[number]
  | (typeof REPUTATION_EXTRA_INTENTS)[number]
  | ReputationIntent
  | "UNKNOWN";

export interface LifeAssistantAnswer {
  intent: LifeAssistantIntent;
  answer: string;
}

const LIFE_KEYWORDS: Array<{ intent: LifeAssistantIntent; keywords: string[] }> = [
  {
    intent: "TODAY_TASKS",
    keywords: [
      "o que tenho para fazer hoje", "que tenho para fazer hoje",
      "tenho algo para fazer hoje", "o que tenho hoje", "tarefas para hoje",
      "tenho tarefas hoje", "compromissos de hoje", "o que tenho planeado para hoje",
      "que tenho hoje agendado", "o que tenho de fazer hoje",
    ],
  },
  {
    intent: "PENDING_ITEMS",
    keywords: [
      "o que tenho pendente", "que tenho pendente", "tenho algo pendente",
      "o que esta pendente", "itens pendentes", "coisas pendentes",
      "que pendentes tenho", "tenho coisas em aberto", "o que me falta resolver",
    ],
  },
  {
    intent: "EXPIRING_DOCUMENTS",
    keywords: [
      "documento a expirar", "documentos a expirar", "que documentos expiram",
      "documento que expira", "validade de documentos", "documentos por renovar",
      "vai expirar algum documento", "documentos que expiram",
    ],
  },
];

function resolveLifeIntent(question: string): LifeAssistantIntent {
  const q = normalize(question);
  let best: LifeAssistantIntent = "UNKNOWN";
  let bestScore = 0;
  for (const { intent, keywords } of LIFE_KEYWORDS) {
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

function answerTodayTasks(overview: LifeOverview): LifeAssistantAnswer {
  const events = overview.todayEvents;
  const tasks = overview.todayTasks;
  if (events.length === 0 && tasks.length === 0) {
    return {
      intent: "TODAY_TASKS",
      answer: "Não tens tarefas nem compromissos marcados para hoje. Aproveita para avançar em pendentes.",
    };
  }
  const lines: string[] = [`Tens ${tasks.length} tarefa(s) e ${events.length} compromisso(s) para hoje:`];
  for (const ev of events) {
    const t = timeOf(ev.startTime);
    lines.push(`  • ${t ? `(${t}) ` : ""}${ev.title}`);
  }
  for (const tk of tasks) {
    lines.push(`  • Tarefa: ${tk.title}`);
  }
  return { intent: "TODAY_TASKS", answer: lines.join("\n") };
}

function answerPending(ctx: LifeContextInput, overview: LifeOverview): LifeAssistantAnswer {
  const openTotal = roundToCurrency(
    ctx.finance.debts.filter((d) => d.status === "OPEN").reduce((s, d) => s + d.outstandingAmount, 0),
  );
  const openCount = overview.finance.openDebtsCount;
  const parts: string[] = [];
  if (overview.finance.overdueBills.count > 0) {
    parts.push(`• ${overview.finance.overdueBills.count} pagamento(s) em atraso (${formatEuro(overview.finance.overdueBills.total)})`);
  }
  if (openCount > 0) {
    parts.push(`• ${openCount} dívida(s) em aberto (${formatEuro(openTotal)})`);
  }
  if (overview.overdueTasks.length > 0) {
    parts.push(`• ${overview.overdueTasks.length} tarefa(s) atrasada(s)`);
  }
  if (overview.expiringDocuments.length > 0) {
    parts.push(`• ${overview.expiringDocuments.length} documento(s) a expirar nos próximos 30 dias`);
  }
  if (parts.length === 0) {
    return {
      intent: "PENDING_ITEMS",
      answer: "Não tens nada pendente registado. Está tudo em dia.",
    };
  }
  const hoje = overview.todayEvents.length > 0
    ? `\n\nHoje ainda tens ${overview.todayEvents.length} compromisso(s) marcado(s).`
    : "";
  return {
    intent: "PENDING_ITEMS",
    answer: `Tens pendente:\n${parts.join("\n")}${hoje}`,
  };
}

function answerExpiringDocuments(overview: LifeOverview): LifeAssistantAnswer {
  if (overview.expiringDocuments.length === 0) {
    return {
      intent: "EXPIRING_DOCUMENTS",
      answer: "Não tens documentos a expirar nos próximos 30 dias.",
    };
  }
  const lines = overview.expiringDocuments.map(
    (d) => `  • ${d.fileName} — expira ${formatDays(d.daysLeft)} (${d.expiresAt})`,
  );
  return {
    intent: "EXPIRING_DOCUMENTS",
    answer: `Tens ${overview.expiringDocuments.length} documento(s) a expirar:\n${lines.join("\n")}`,
  };
}

/** Ponto de entrada do assistente de vida: delega finance e reputação nas regras existentes. */
export function askLifeAssistant(question: string, ctx: LifeContextInput): LifeAssistantAnswer {
  const financeIntent = resolveFinanceIntent(question);
  if (financeIntent !== "UNKNOWN") {
    const res = askFinanceAssistant(question, ctx.finance);
    if (res.intent !== "UNKNOWN") return { intent: res.intent, answer: res.answer };
  }

  const reputationIntent = ctx.reviews && ctx.reviews.length > 0 ? resolveReputationIntent(question) : "UNKNOWN";
  if (reputationIntent !== "UNKNOWN") {
    const res = askReputationAssistant(question, { reviews: ctx.reviews ?? [], today: ctx.today });
    if (res.intent !== "UNKNOWN") return { intent: res.intent, answer: res.answer };
  }

  const lifeIntent = resolveLifeIntent(question);
  const overview = buildLifeOverview(ctx);
  switch (lifeIntent) {
    case "TODAY_TASKS":
      return answerTodayTasks(overview);
    case "PENDING_ITEMS":
      return answerPending(ctx, overview);
    case "EXPIRING_DOCUMENTS":
      return answerExpiringDocuments(overview);
    case "UNKNOWN":
    default:
      return {
        intent: "UNKNOWN",
        answer:
          'Ainda não consigo responder a essa pergunta. Tenta, por exemplo: "Quanto dinheiro tenho disponível?", "Quanto posso gastar hoje?", "Tenho contas para pagar esta semana?", "Quanto devo este mês?", "Consigo pagar esta prestação?", "O que tenho para fazer hoje?", "O que tenho pendente?", "Que documentos expiram?", "O que vence nos próximos 30 dias?", "Como está a minha reputação?", "Quem está com pior avaliação?", "Quais clientes reclamaram este mês?", "Mostra as reclamações abertas.", "Quem recebeu mais elogios?", "Qual serviço tem pior reputação?", "Qual funcionário recebeu melhor avaliação?", "Quantas avaliações de 5 estrelas tivemos?", "Temos reclamações sem resposta?" ou "Como evoluiu a nossa reputação?".',
      };
  }
}