import { describe, it, expect } from "vitest";
import {
  buildLifeOverview,
  buildLifeAlerts,
  askLifeAssistant,
  type LifeContextInput,
  type LifeAlertType,
} from "../LifeAssistantService";
import type {
  FinanceBill,
  FinanceDebt,
  FinanceExpense,
  FinanceIncome,
} from "../../types/finance";

// ---------------------------------------------------------------------------
// Dados FICTÍCIOS — utilizador "Ana Testes" (nunca dados reais).
// ---------------------------------------------------------------------------
const TODAY = "2026-08-15";

function bill(overrides: Partial<FinanceBill> & Pick<FinanceBill, "name" | "amount" | "dueDate" | "recurrence">): FinanceBill {
  return {
    id: "bill-" + overrides.name.toLowerCase().replace(/\s+/g, "-"),
    userId: "00000000-0000-4000-8000-000000000001",
    category: "OTHER",
    status: "PENDING",
    priority: "MEDIUM",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

// Cenário com IDENTIFICADORES para todos os 8 tipos de alerta.
function triggersContext(): LifeContextInput {
  const finance: LifeContextInput["finance"] = {
    currentBalance: 100,
    bills: [
      bill({ name: "Luz", amount: 120, dueDate: "2026-08-05", recurrence: "MONTHLY", category: "ELECTRICITY" }),
      bill({ name: "Internet", amount: 40, dueDate: "2026-08-20", recurrence: "MONTHLY", category: "TELECOM" }),
    ],
    debts: [
      { id: "debt-over", userId: "00000000-0000-4000-8000-000000000001", creditorName: "Banco Ouro", initialAmount: 2000, outstandingAmount: 1500, installmentAmount: 200, nextDueDate: "2026-08-10", status: "OPEN", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
      { id: "debt-soon", userId: "00000000-0000-4000-8000-000000000001", creditorName: "Loja Eletro", initialAmount: 1000, outstandingAmount: 900, installmentAmount: 120, nextDueDate: "2026-08-18", status: "OPEN", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
    ] as FinanceDebt[],
    incomes: [] as FinanceIncome[],
    expenses: [] as FinanceExpense[],
    today: TODAY,
  };

  return {
    finance,
    events: [
      { id: "ev-1", title: "Consulta médica", startTime: "2026-08-15T09:00:00.000Z", eventType: "CONSULTA", isCompleted: false, priority: "HIGH" },
    ],
    tasks: [
      { id: "tk-over", title: "Rever contrato", dueDate: "2026-08-12T10:00:00.000Z", status: "TODO", priority: "HIGH" },
      { id: "tk-today", title: "Enviar relatório", dueDate: "2026-08-15T14:00:00.000Z", status: "TODO", priority: "URGENT" },
    ],
    documents: [
      { id: "doc-1", fileName: "B.I. (bic)", category: "IDENTITY_CARD", status: "PENDING", expiresAt: "2026-08-25T00:00:00.000Z" },
    ],
    reminders: [],
    today: TODAY,
  };
}

// Cenário vazio — sem dados, sem alertas.
function cleanContext(): LifeContextInput {
  return {
    finance: {
      currentBalance: 0,
      bills: [],
      debts: [],
      incomes: [],
      expenses: [],
      today: TODAY,
    },
    events: [],
    tasks: [],
    documents: [],
    reminders: [],
    today: TODAY,
  };
}

describe("LifeAssistantService — visão geral", () => {
  it("agrega dinheiro, agenda, tarefas e documentos do dia", () => {
    const o = buildLifeOverview(triggersContext());
    expect(o.today).toBe(TODAY);
    expect(o.finance.hasData).toBe(true);
    expect(o.finance.overdueBills.count).toBe(1);
    expect(o.todayEvents).toHaveLength(1);
    expect(o.todayTasks).toHaveLength(1);
    expect(o.urgentTasks.map((t) => t.title)).toContain("Enviar relatório");
    expect(o.expiringDocuments).toHaveLength(1);
    expect(o.expiringDocuments[0].daysLeft).toBe(10);
    expect(o.debts).toHaveLength(2);
    expect(o.finance.availableAfterObligations).toBeLessThan(0);
  });

  it("devolve visão vazia sem dados e sem alertas", () => {
    const o = buildLifeOverview(cleanContext());
    expect(o.finance.hasData).toBe(false);
    expect(o.upcomingBills).toHaveLength(0);
    expect(o.todayEvents).toHaveLength(0);
    expect(o.todayTasks).toHaveLength(0);
    expect(o.expiringDocuments).toHaveLength(0);
    expect(o.alerts).toHaveLength(0);
  });
});

describe("LifeAssistantService — motor de alertas", () => {
  it("deteta os 8 tipos de alerta no cenário disparador", () => {
    const o = buildLifeOverview(triggersContext());
    const types = new Set<LifeAlertType>(o.alerts.map((a) => a.type));
    expect(types.has("OVERDUE_PAYMENT")).toBe(true);
    expect(types.has("BILL_DUE_SOON")).toBe(true);
    expect(types.has("INSUFFICIENT_BALANCE")).toBe(true);
    expect(types.has("INSTALLMENT_DUE_SOON")).toBe(true);
    expect(types.has("OVERDUE_DEBT")).toBe(true);
    expect(types.has("DOCUMENT_EXPIRING")).toBe(true);
    expect(types.has("TASK_OVERDUE")).toBe(true);
    expect(types.has("EVENT_UPCOMING")).toBe(true);
  });

  it("ordena alertas por severidade (criticos primeiro)", () => {
    const o = buildLifeOverview(triggersContext());
    expect(o.alerts[0].severity).toBe("CRITICAL");
    // Criticos existem: pagamento atrasado, saldo negativo e dívida em atraso.
    const criticos = o.alerts.filter((a) => a.severity === "CRITICAL");
    expect(criticos.length).toBeGreaterThanOrEqual(3);
  });

  it("não dispara alertas num cenário limpo", () => {
    expect(buildLifeAlerts(cleanContext(), buildLifeOverview(cleanContext()))).toHaveLength(0);
  });
});

describe("LifeAssistantService — perguntas naturais", () => {
  function ask(question: string, ctx = triggersContext()) {
    return askLifeAssistant(question, ctx);
  }

  it("delega perguntas financeiras nas regras existentes", () => {
    const res = ask("Quanto tenho disponível?");
    expect(res.intent).toBe("AVAILABLE_BALANCE");
    expect(res.answer.length).toBeGreaterThan(0);
  });

  it("responde o que há para fazer hoje", () => {
    const res = ask("O que tenho para fazer hoje?");
    expect(res.intent).toBe("TODAY_TASKS");
    expect(res.answer).toContain("Consulta médica");
    expect(res.answer).toContain("Enviar relatório");
    expect(res.answer).toContain("09:00");
  });

  it("responde o que está pendente com contagens reais", () => {
    const res = ask("O que tenho pendente?");
    expect(res.intent).toBe("PENDING_ITEMS");
    expect(res.answer).toContain("pagamento");
    expect(res.answer).toContain("dívida");
    expect(res.answer).toContain("tarefa");
    expect(res.answer).toContain("documento");
  });

  it("responde a lista de documentos a expirar", () => {
    const res = ask("Que documentos expiram?");
    expect(res.intent).toBe("EXPIRING_DOCUMENTS");
    expect(res.answer).toContain("B.I.");
    expect(res.answer).toContain("10 dia");
  });

  it("mantém graça no desconhecido", () => {
    const res = ask("Qual a cor do meu futuro?");
    expect(res.intent).toBe("UNKNOWN");
    expect(res.answer).toContain("não consigo responder");
  });

  it("mantém respostas de pendentes vazias num cenário limpo", () => {
    const res = ask("O que tenho pendente?", cleanContext());
    expect(res.intent).toBe("PENDING_ITEMS");
    expect(res.answer).toContain("nada pendente");
  });
});