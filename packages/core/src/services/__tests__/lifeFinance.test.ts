import { describe, it, expect } from "vitest";
import {
  buildFinanceOverview,
  buildFinanceInsights,
  computeDebtProgress,
  classifyBillStatus,
  occurrencesBetween,
  nextOccurrenceOnOrAfter,
  askFinanceAssistant,
  resolveFinanceIntent,
  type FinanceOverview,
} from "../LifeFinanceService";
import type {
  FinanceBill,
  FinanceDebt,
  FinanceExpense,
  FinanceIncome,
} from "../../types/finance";

// ---------------------------------------------------------------------------
// Dados FICTÍCIOS — nunca dados reais. Cenário: utilizador "Ana Testes".
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

const BILLS: FinanceBill[] = [
  bill({ name: "Renda", amount: 900, dueDate: "2026-08-05", recurrence: "MONTHLY", category: "RENT", status: "PAID", paidAt: "2026-08-05T08:00:00.000Z", priority: "HIGH" }),
  bill({ name: "Eletricidade", amount: 120, dueDate: "2026-08-10", recurrence: "MONTHLY", category: "ELECTRICITY", priority: "HIGH" }),
  bill({ name: "Internet", amount: 40, dueDate: "2026-08-18", recurrence: "MONTHLY", category: "TELECOM" }),
  bill({ name: "Seguro Casa", amount: 150, dueDate: "2026-09-01", recurrence: "QUARTERLY", category: "INSURANCE" }),
  bill({ name: "Multa de Estacionamento", amount: 50, dueDate: "2026-08-01", recurrence: "ONE_TIME", category: "OTHER", priority: "LOW" }),
  bill({ name: "IRS Categoria B", amount: 300, dueDate: "2026-08-30", recurrence: "ONE_TIME", category: "TAXES" }),
];

const EXPENSES: FinanceExpense[] = [
  { id: "exp-1", userId: "00000000-0000-4000-8000-000000000001", description: "Supermercado", category: "FOOD", amount: 85.5, expenseDate: "2026-08-02", createdAt: "2026-08-02T00:00:00.000Z" },
  { id: "exp-2", userId: "00000000-0000-4000-8000-000000000001", description: "Passe mensal", category: "TRANSPORT", amount: 20, expenseDate: "2026-08-10", createdAt: "2026-08-10T00:00:00.000Z" },
];

const INCOMES: FinanceIncome[] = [
  { id: "inc-1", userId: "00000000-0000-4000-8000-000000000001", source: "Salário", category: "SALARY", amount: 2000, recurrence: "MONTHLY", expectedDate: "2026-08-05", isActive: true, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
  { id: "inc-2", userId: "00000000-0000-4000-8000-000000000001", source: "Projeto Freelance", category: "FREELANCE", amount: 800, recurrence: "ONE_TIME", expectedDate: "2026-08-20", isActive: true, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
];

const DEBTS: FinanceDebt[] = [
  { id: "debt-1", userId: "00000000-0000-4000-8000-000000000001", creditorName: "Banco CGD — Crédito Pessoal", initialAmount: 10000, outstandingAmount: 6200, installmentAmount: 250, nextDueDate: "2026-08-28", interestRate: 8.5, status: "OPEN", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
  { id: "debt-2", userId: "00000000-0000-4000-8000-000000000001", creditorName: "Amigo João", initialAmount: 500, outstandingAmount: 300, installmentAmount: 100, nextDueDate: "2026-09-05", status: "OPEN", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
  { id: "debt-3", userId: "00000000-0000-4000-8000-000000000001", creditorName: "Dívida Liquidada", initialAmount: 1000, outstandingAmount: 0, status: "PAID", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
];

function buildOverview(): FinanceOverview {
  return buildFinanceOverview({
    currentBalance: 5000,
    bills: BILLS,
    debts: DEBTS,
    incomes: INCOMES,
    expenses: EXPENSES,
    today: TODAY,
  });
}

/** Remove separadores de milhar para asserções determinísticas (ICU variável). */
function digits(message: string): string {
  return message.replace(/[\s\u00a0\u202f\u2009]/g, "");
}

describe("LifeFinanceService — datas e recorrências", () => {
  it("conta ocorrências mensais dentro do mês", () => {
    expect(occurrencesBetween("2026-08-05", "2026-08-01", "2026-08-31", "MONTHLY")).toBe(1);
  });

  it("conta ocorrências semanais no intervalo", () => {
    expect(occurrencesBetween("2026-08-01", "2026-08-01", "2026-08-31", "WEEKLY")).toBe(5);
  });

  it("não conta one-time fora da janela", () => {
    expect(occurrencesBetween("2026-09-01", "2026-08-01", "2026-08-31", "ONE_TIME")).toBe(0);
  });

  it("calcula a próxima ocorrência a partir de uma âncora", () => {
    expect(nextOccurrenceOnOrAfter("2026-08-05", "2026-08-15", "MONTHLY")).toBe("2026-09-05");
    expect(nextOccurrenceOnOrAfter("2026-09-01", "2026-08-15", "ONE_TIME")).toBe("2026-09-01");
  });
});

describe("LifeFinanceService — estados e progresso", () => {
  it("classifica PENDING, PAID e OVERDUE", () => {
    expect(classifyBillStatus({ status: "PAID", dueDate: "2026-08-10" }, TODAY)).toBe("PAID");
    expect(classifyBillStatus({ status: "PENDING", dueDate: "2026-08-20" }, TODAY)).toBe("PENDING");
    expect(classifyBillStatus({ status: "PENDING", dueDate: "2026-08-01" }, TODAY)).toBe("OVERDUE");
  });

  it("calcula o progresso de pagamento da dívida", () => {
    expect(computeDebtProgress({ initialAmount: 10000, outstandingAmount: 6200 })).toBeCloseTo(38, 1);
    expect(computeDebtProgress({ initialAmount: 1000, outstandingAmount: 1000 })).toBe(0);
    expect(computeDebtProgress({ initialAmount: 1000, outstandingAmount: 0 })).toBe(100);
  });
});

describe("LifeFinanceService — visão geral do mês", () => {
  const o = buildOverview();

  it("calcula as receitas previstas do mês (salário + one-time)", () => {
    expect(o.monthIncomeForecast).toBe(2800);
  });

  it("calcula despesas pagas e cenário de despesas do mês", () => {
    expect(o.monthExpensesPaid).toBe(1005.5);
    expect(o.monthExpensesForecast).toBe(1515.5);
    expect(o.monthObligationsForecast).toBe(1410);
  });

  it("identifica obrigações nos próximos 7 dias e em atraso", () => {
    expect(o.obligationsNext7Days.count).toBe(3);
    expect(o.obligationsNext7Days.total).toBe(210);
    expect(o.overdueBills.count).toBe(2);
    expect(o.overdueBills.total).toBe(170);
  });

  it("calcula saldo disponível depois das obrigações", () => {
    expect(o.availableAfterObligations).toBe(4340);
    expect(o.obligationsPendingTotal).toBe(660);
  });

  it("resume dívidas em aberto", () => {
    expect(o.openDebts.count).toBe(2);
    expect(o.totalDebt).toBe(6500);
  });

  it("projeta saldo sem dias negativos no cenário ficcional", () => {
    expect(o.negativeDay).toBeNull();
    expect(o.minProjectedBalance).toBe(4790);
    expect(o.minProjectedDate).toBe("2026-08-18");
    expect(o.projected.length).toBeGreaterThan(30);
  });
});

describe("LifeFinanceService — insights do dashboard", () => {
  const insights = buildFinanceInsights(buildOverview(), DEBTS, BILLS);
  const byId = new Map(insights.map((i) => [i.id, i.message]));

  it("avisa sobre contas nos próximos 7 dias", () => {
    expect(byId.get("bills-next-7d")).toContain("3 conta");
  });

  it("reporta despesa do mês", () => {
    expect(digits(byId.get("month-spent") ?? "")).toContain("1005,5");
  });

  it("reporta saldo disponível após obrigações", () => {
    expect(digits(byId.get("available-after-obligations") ?? "")).toContain("4340");
  });

  it("avisa sobre a próxima dívida por vencer", () => {
    expect(byId.get("next-debt-due")).toContain("13 dia");
  });

  it("deteta despesa recorrente acima da média (renda)", () => {
    expect(byId.get("recurring-outlier")).toContain("Renda");
  });

  it("avisa sobre contas em atraso", () => {
    expect(byId.get("overdue-bills")).toContain("2 conta");
  });
});

describe("LifeFinanceService — assistente financeiro (IA)", () => {
  function ask(question: string) {
    return askFinanceAssistant(question, {
      currentBalance: 5000,
      bills: BILLS,
      debts: DEBTS,
      incomes: INCOMES,
      expenses: EXPENSES,
      today: TODAY,
    });
  }

  it("resolve intenções em português", () => {
    expect(resolveFinanceIntent("Quanto posso gastar este mês?")).toBe("SPENDABLE_THIS_MONTH");
    expect(resolveFinanceIntent("Que contas tenho esta semana?")).toBe("BILLS_THIS_WEEK");
    expect(resolveFinanceIntent("Quanto devo ao banco?")).toBe("TOTAL_DEBT");
    expect(resolveFinanceIntent("Qual a minha dívida mais urgente?")).toBe("MOST_URGENT_DEBT");
    expect(resolveFinanceIntent("Quanto preciso reservar para impostos?")).toBe("TAX_RESERVE");
    expect(resolveFinanceIntent("Tenho dinheiro suficiente até ao fim do mês?")).toBe("MONTH_END_SUFFICIENCY");
    expect(resolveFinanceIntent("cor amarela do céu")).toBe("UNKNOWN");
  });

  it("responde quanto podes gastar", () => {
    const res = ask("Quanto dinheiro posso gastar este mês?");
    expect(res.intent).toBe("SPENDABLE_THIS_MONTH");
    expect(digits(res.answer)).toContain("1390");
  });

  it("lista contas da semana", () => {
    const res = ask("Que contas tenho esta semana?");
    expect(res.intent).toBe("BILLS_THIS_WEEK");
    expect(res.answer).toContain("Internet");
    expect(res.answer).toContain("Eletricidade");
    expect(res.answer).toContain("atrasada");
  });

  it("soma a dívida total", () => {
    const res = ask("Quanto devo ao banco?");
    expect(digits(res.answer)).toContain("6500");
  });

  it("identifica a dívida mais urgente", () => {
    const res = ask("Qual a minha dívida mais urgente?");
    expect(res.answer).toContain("Crédito Pessoal");
  });

  it("calcula o impacto de liquidar uma dívida", () => {
    const res = ask("Se pagar esta dívida, quanto fico a pagar por mês?");
    expect(res.answer).toContain("100");
  });

  it("calcula reserva de impostos", () => {
    const res = ask("Quanto preciso reservar para impostos?");
    expect(res.answer).toContain("300");
  });

  it("valida cobertura até ao fim do mês", () => {
    const res = ask("Tenho dinheiro suficiente até ao fim do mês?");
    expect(res.answer).toContain("Sim");
  });

  it("responde graciosamente a perguntas desconhecidas", () => {
    const res = ask("Qual a cor do meu futuro?");
    expect(res.intent).toBe("UNKNOWN");
    expect(res.answer).toContain("não consigo responder");
  });

  it("resolve as novas intenções pedidas", () => {
    expect(resolveFinanceIntent("Quanto tenho disponível?")).toBe("AVAILABLE_BALANCE");
    expect(resolveFinanceIntent("Quanto vou gastar este mês?")).toBe("MONTH_EXPENSES_FORECAST");
    expect(resolveFinanceIntent("Tenho pagamentos atrasados?")).toBe("OVERDUE_PAYMENTS");
    expect(resolveFinanceIntent("Quanto devo no total?")).toBe("TOTAL_DEBT");
    expect(resolveFinanceIntent("Quanto pago por mês em dívidas?")).toBe("DEBT_MONTHLY_TOTAL");
    expect(resolveFinanceIntent("Quanto dinheiro sobra depois das obrigações?")).toBe("AVAILABLE_AFTER_OBLIGATIONS");
    expect(resolveFinanceIntent("O que vence nos próximos 30 dias?")).toBe("UPCOMING_OBLIGATIONS");
    expect(resolveFinanceIntent("O que vence nos próximos 7 dias?")).toBe("UPCOMING_OBLIGATIONS");
    expect(resolveFinanceIntent("Posso gastar 50€?")).toBe("CAN_SPEND_AMOUNT");
    expect(resolveFinanceIntent("Resumo deste mês")).toBe("MONTH_SUMMARY");
    expect(resolveFinanceIntent("Próximas contas")).toBe("BILLS_THIS_WEEK");
    expect(resolveFinanceIntent("Minhas dívidas")).toBe("TOTAL_DEBT");
    expect(resolveFinanceIntent("Quanto posso gastar hoje?")).toBe("SPENDABLE_TODAY");
    expect(resolveFinanceIntent("Quanto devo este mês?")).toBe("MONTH_DEBT_DUE");
    expect(resolveFinanceIntent("Consigo pagar esta prestação?")).toBe("CAN_PAY_INSTALLMENT");
    expect(resolveFinanceIntent("Quanto vou ter no fim do mês?")).toBe("END_OF_MONTH_BALANCE");
    expect(resolveFinanceIntent("Quanto dinheiro vou ter no fim do mês?")).toBe("END_OF_MONTH_BALANCE");
  });

  it("responde qual é o saldo disponível", () => {
    const res = ask("Quanto tenho disponível?");
    expect(res.intent).toBe("AVAILABLE_BALANCE");
    expect(digits(res.answer)).toContain("5000");
  });

  it("responde a previsão de gastos do mês", () => {
    const res = ask("Quanto vou gastar este mês?");
    expect(res.intent).toBe("MONTH_EXPENSES_FORECAST");
    expect(digits(res.answer)).toContain("1515,5");
    expect(res.answer).toContain("obrigações");
  });

  it("reporta pagamentos em atraso", () => {
    const res = ask("Tenho pagamentos atrasados?");
    expect(res.intent).toBe("OVERDUE_PAYMENTS");
    expect(res.answer).toContain("2 pagamento");
    expect(digits(res.answer)).toContain("170");
  });

  it("soma o total pago mensalmente em dívidas", () => {
    const res = ask("Quanto pago por mês em dívidas?");
    expect(res.intent).toBe("DEBT_MONTHLY_TOTAL");
    expect(digits(res.answer)).toContain("350");
    expect(res.answer).toContain("Crédito Pessoal");
  });

  it("reporta o que sobra depois das obrigações", () => {
    const res = ask("Quanto dinheiro sobra depois das obrigações?");
    expect(res.intent).toBe("AVAILABLE_AFTER_OBLIGATIONS");
    expect(digits(res.answer)).toContain("4340");
  });

  it("lista obrigações que vencem nos próximos 30 dias", () => {
    const res = ask("O que vence nos próximos 30 dias?");
    expect(res.intent).toBe("UPCOMING_OBLIGATIONS");
    expect(res.answer).toContain("30 dias");
    expect(res.answer).toContain("Internet");
    expect(res.answer).toContain("IRS");
    expect(digits(res.answer)).toContain("660");
  });

  it("responde se podes gastar um valor concreto", () => {
    const ok = ask("Posso gastar 50€?");
    expect(ok.intent).toBe("CAN_SPEND_AMOUNT");
    expect(ok.answer).toContain("Sim");
    const alto = ask("Posso gastar 5000€?");
    expect(alto.answer).toContain("Cuidado");
  });

  it("resolve o atalho Próximas contas como a semana", () => {
    const res = ask("Próximas contas");
    expect(res.intent).toBe("BILLS_THIS_WEEK");
    expect(res.answer).toContain("Internet");
    expect(digits(res.answer)).toContain("210");
  });

  it("resolve o atalho Minhas dívidas", () => {
    const res = ask("Minhas dívidas");
    expect(res.intent).toBe("TOTAL_DEBT");
    expect(digits(res.answer)).toContain("6500");
  });

  it("resume o mês", () => {
    const res = ask("Resumo deste mês");
    expect(res.intent).toBe("MONTH_SUMMARY");
    expect(res.answer).toContain("Receitas");
    expect(digits(res.answer)).toContain("2800");
    expect(res.answer).toContain("Dívida em aberto");
  });

  it("sabe quanto podes gastar hoje (obrigações do dia + atrasos)", () => {
    const res = ask("Quanto posso gastar hoje?");
    expect(res.intent).toBe("SPENDABLE_TODAY");
    expect(digits(res.answer)).toContain("4830");
    expect(res.answer).toContain("obrigações de hoje");
  });

  it("soma o que deves este mês (contas + prestações)", () => {
    const res = ask("Quanto devo este mês?");
    expect(res.intent).toBe("MONTH_DEBT_DUE");
    expect(digits(res.answer)).toContain("1660");
    expect(res.answer).toContain("contas");
    expect(digits(res.answer)).toContain("250");
  });

  it("avalia se consegues cobrir uma prestação", () => {
    const ok = ask("Consigo pagar 250€ de prestação?");
    expect(ok.intent).toBe("CAN_PAY_INSTALLMENT");
    expect(ok.answer).toContain("Sim");
    expect(digits(ok.answer)).toContain("4340");
    const semValor = ask("Consigo pagar esta prestação?");
    expect(semValor.intent).toBe("CAN_PAY_INSTALLMENT");
    expect(semValor.answer).toContain("Crédito Pessoal");
    const alto = ask("Consigo pagar 5000€?");
    expect(alto.answer).toContain("Não");
  });

  it("projeta o saldo esperado no fim do mês", () => {
    const res = ask("Quanto vou ter no fim do mês?");
    expect(res.intent).toBe("END_OF_MONTH_BALANCE");
    expect(digits(res.answer)).toContain("5290");
    expect(res.answer).toContain("Mínimo estimado");
  });
});