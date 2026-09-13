"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  computeDebtProgress,
  classifyBillStatus,
  type FinanceBill,
  type FinanceDebt,
  type FinanceExpense,
  type FinanceIncome,
  type FinanceOverview,
  type FinanceInsight,
} from "@rpg/core";
import {
  createFinanceBillAction,
  createFinanceDebtAction,
  createFinanceExpenseAction,
  createFinanceIncomeAction,
  deleteFinanceBillAction,
  deleteFinanceDebtAction,
  deleteFinanceExpenseAction,
  deleteFinanceIncomeAction,
  registerFinanceDebtPaymentAction,
  setFinanceBillPaidAction,
  toggleFinanceIncomeActiveAction,
  askFinanceAssistantAction,
  type FinanceOverviewResult,
} from "./actions";

type TabKey = "OVERVIEW" | "BILLS" | "DEBTS" | "INCOMES" | "EXPENSES" | "ASSISTANT";

const TAB_LABELS: Record<TabKey, string> = {
  OVERVIEW: "Visão Geral",
  BILLS: "Contas & Obrigações",
  DEBTS: "Dívidas",
  INCOMES: "Receitas",
  EXPENSES: "Despesas",
  ASSISTANT: "Assistente",
};

const BILL_CATEGORY_OPTIONS = [
  ["RENT", "Renda"],
  ["WATER", "Água"],
  ["ELECTRICITY", "Luz"],
  ["TELECOM", "Telecomunicações"],
  ["FOOD", "Alimentação"],
  ["TRANSPORT", "Transportes"],
  ["INSURANCE", "Seguros"],
  ["LOAN", "Empréstimos"],
  ["SUBSCRIPTION", "Subscrições"],
  ["TAXES", "Impostos"],
  ["OTHER", "Outras"],
] as const;

const RECURRENCE_OPTIONS = [
  ["ONE_TIME", "Ocasião única"],
  ["WEEKLY", "Semanal"],
  ["MONTHLY", "Mensal"],
  ["QUARTERLY", "Trimestral"],
  ["YEARLY", "Anual"],
] as const;

const EXPENSE_CATEGORY_OPTIONS = [
  ["FOOD", "Alimentação"],
  ["TRANSPORT", "Transportes"],
  ["HOUSING", "Habitação"],
  ["UTILITIES", "Utilidades"],
  ["HEALTH", "Saúde"],
  ["LEISURE", "Lazer"],
  ["EDUCATION", "Educação"],
  ["OTHER", "Outras"],
] as const;

const INCOME_CATEGORY_OPTIONS = [
  ["SALARY", "Salário"],
  ["FREELANCE", "Trabalhos / Freelance"],
  ["INVESTMENT", "Investimentos"],
  ["RENTAL", "Rendimentos de imóveis"],
  ["OTHER", "Outros"],
] as const;

function formatEuro(value: number): string {
  return `${value.toLocaleString("pt-PT", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} €`;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    PENDING: { label: "Pendente", className: "warning" },
    PAID: { label: "Pago", className: "success" },
    OVERDUE: { label: "Atrasado", className: "danger" },
    OPEN: { label: "Em aberto", className: "warning" },
    DEFAULTED: { label: "Incumprimento", className: "danger" },
  };
  const s = map[status] ?? { label: status, className: "" };
  return <span className={`badge ${s.className}`}>{s.label}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; className: string }> = {
    HIGH: { label: "Prioridade alta", className: "" },
    MEDIUM: { label: "Prioridade média", className: "warning" },
    LOW: { label: "Prioridade baixa", className: "success" },
  };
  const s = map[priority] ?? { label: priority, className: "" };
  return <span className="tag-badge">{s.label}</span>;
}

export function FinancasClient(props: FinanceOverviewResult) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("OVERVIEW");
  const [overview, setOverview] = useState<FinanceOverview | null>(props.data);
  const [insights, setInsights] = useState<FinanceInsight[]>(props.insights);
  const [bills, setBills] = useState<FinanceBill[]>(props.bills);
  const [debts, setDebts] = useState<FinanceDebt[]>(props.debts);
  const [incomes, setIncomes] = useState<FinanceIncome[]>(props.incomes);
  const [expenses, setExpenses] = useState<FinanceExpense[]>(props.expenses);
  const [currentBalance, setCurrentBalance] = useState(props.currentBalance);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState(false);
  const [assistantAnswer, setAssistantAnswer] = useState<string | null>(null);
  const [assistantBusy, setAssistantBusy] = useState(false);

  async function refresh() {
    router.refresh();
  }

  function pushNotice(message: string, isError = false) {
    setNotice(message);
    setNoticeError(isError);
    window.setTimeout(() => setNotice(null), 5000);
  }

  if (!overview) {
    return (
      <div className="card">
        <div className="alert alert-warning">
          As tabelas do Centro Financeiro ainda não existem na base de dados local.
          Aplica a migração <code>20260901000000_life_finance</code> (ex:
          <code> supabase db push</code> local) para começar a usar o módulo.
        </div>
      </div>
    );
  }

  const projectedBalance = currentBalance + overview.monthIncomeForecast - overview.monthExpensesForecast;

  const tabs: TabKey[] = ["OVERVIEW", "BILLS", "DEBTS", "INCOMES", "EXPENSES", "ASSISTANT"];

  return (
    <div>
      {notice && (
        <div
          className={`alert ${noticeError ? "alert-danger" : "alert-success"}`}
          style={{ marginBottom: "16px" }}
        >
          {notice}
        </div>
      )}

      {/* Barra de ações rápidas do módulo */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            className={`button secondary ${activeTab === t ? "active" : ""}`}
            onClick={() => setActiveTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {activeTab === "OVERVIEW" && (
        <OverviewTab
          overview={overview}
          currentBalance={currentBalance}
          projectedBalance={projectedBalance}
          insights={insights}
          bills={bills}
          debts={debts}
          incomes={incomes}
        />
      )}

      {activeTab === "BILLS" && (
        <BillsTab
          bills={bills}
          today={overview.today}
          onUpsert={(list) => setBills(list)}
          onNotice={(m, e) => pushNotice(m, e)}
          onPaidToggle={refresh}
        />
      )}

      {activeTab === "DEBTS" && (
        <DebtsTab
          debts={debts}
          onUpsert={(list) => setDebts(list)}
          onNotice={(m, e) => pushNotice(m, e)}
          onPaidChange={refresh}
        />
      )}

      {activeTab === "INCOMES" && (
        <IncomesTab
          incomes={incomes}
          onUpsert={(list) => setIncomes(list)}
          onNotice={(m, e) => pushNotice(m, e)}
          onToggle={refresh}
        />
      )}

      {activeTab === "EXPENSES" && (
        <ExpensesTab
          expenses={expenses}
          onUpsert={(list) => setExpenses(list)}
          onNotice={(m, e) => pushNotice(m, e)}
        />
      )}

      {activeTab === "ASSISTANT" && (
        <AssistantTab
          answer={assistantAnswer}
          busy={assistantBusy}
          onAnswer={(a, busy) => {
            setAssistantAnswer(a);
            setAssistantBusy(busy);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visão Geral
// ---------------------------------------------------------------------------

function OverviewTab({
  overview,
  currentBalance,
  projectedBalance,
  insights,
  bills,
  debts,
  incomes,
}: {
  overview: FinanceOverview;
  currentBalance: number;
  projectedBalance: number;
  insights: FinanceInsight[];
  bills: FinanceBill[];
  debts: FinanceDebt[];
  incomes: FinanceIncome[];
}) {
  const upcoming = bills
    .filter((b) => b.status !== "PAID")
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);
  const nextIncomes = incomes.filter((i) => i.isActive).slice(0, 4);
  const openDebts = debts
    .filter((d) => d.status === "OPEN")
    .sort((a, b) => (a.nextDueDate ?? "").localeCompare(b.nextDueDate ?? ""))
    .slice(0, 4);

  function categoryLabel(b: FinanceBill): string {
    const labels: Record<string, string> = {
      RENT: "Renda",
      WATER: "Água",
      ELECTRICITY: "Luz",
      TELECOM: "Telecom",
      FOOD: "Alimentação",
      TRANSPORT: "Transportes",
      INSURANCE: "Seguro",
      LOAN: "Empréstimo",
      SUBSCRIPTION: "Subscrição",
      TAXES: "Impostos",
      OTHER: "Outra",
    };
    return labels[b.category] ?? b.category;
  }

  return (
    <div>
      <div className="metrics">
        <div className="card">
          <span className="metric-label">Dinheiro Disponível</span>
          <strong className="metric-value">{formatEuro(currentBalance)}</strong>
          <span className="metric-change success">Saldos bancários agregados</span>
        </div>
        <div className="card">
          <span className="metric-label">Receitas do Mês</span>
          <strong className="metric-value">{formatEuro(overview.monthIncomeForecast)}</strong>
          <span className="metric-change">{overview.month.label}</span>
        </div>
        <div className="card">
          <span className="metric-label">Despesas do Mês</span>
          <strong className="metric-value">{formatEuro(overview.monthExpensesForecast)}</strong>
          <span className="metric-change">
            Pagas: {formatEuro(overview.monthExpensesPaid)} • Obrigações:{" "}
            {formatEuro(overview.monthObligationsForecast)}
          </span>
        </div>
        <div className="card">
          <span className="metric-label">Saldo Previsto</span>
          <strong
            className="metric-value"
            style={projectedBalance < 0 ? { color: "#b91c1c" } : undefined}
          >
            {formatEuro(projectedBalance)}
          </strong>
          <span className={`metric-change ${projectedBalance < 0 ? "danger" : "success"}`}>
            Fim de {overview.month.label}
          </span>
        </div>
      </div>

      {overview.negativeDay && (
        <div className="alert alert-danger" style={{ marginTop: "16px" }}>
          <strong>Cuidado:</strong> projeção de saldo negativo no dia {overview.negativeDay} ({formatEuro(overview.minProjectedBalance)}). Reve as cobranças ou despesas previstas.
        </div>
      )}

      <div style={{ marginTop: "24px" }}>
        <h3 style={{ margin: "0 0 12px" }}>Dashboard Inteligente</h3>
        {insights.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "13px" }}>
            Regista contas, dívidas, receitas e despesas para gerar frases úteis sobre a tua vida financeira.
          </p>
        ) : (
          <div className="list">
            {insights.map((insight) => (
              <div key={insight.id} className="list-row">
                <div>
                  <div className="list-title">
                    <strong>
                      {insight.severity === "CRITICAL"
                        ? "Alerta"
                        : insight.severity === "WARNING"
                          ? "Atenção"
                          : insight.severity === "SUCCESS"
                            ? "Boa notícia"
                            : "Info"}
                    </strong>
                  </div>
                  <div className="list-subtitle">{insight.message}</div>
                </div>
                <span
                  className={`badge ${
                    insight.severity === "CRITICAL"
                      ? ""
                      : insight.severity === "WARNING"
                        ? "warning"
                        : insight.severity === "SUCCESS"
                          ? "success"
                          : "info"
                  }`}
                >
                  {insight.severity}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <ProjectionChart overview={overview} />

      <div className="grid-2" style={{ marginTop: "24px" }}>
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Próximas Contas</h3>
          {upcoming.length === 0 ? (
            <div className="empty-state">Sem contas pendentes.</div>
          ) : (
            <div className="list">
              {upcoming.map((b) => (
                <div key={b.id} className="list-row">
                  <div>
                    <div className="list-title">{b.name}</div>
                    <div className="list-subtitle">
                      Vence a {b.dueDate} • {categoryLabel(b)} •{" "}
                      {classifyBillStatus(b) === "OVERDUE" ? "atrasada" : "pendente"}
                    </div>
                  </div>
                  <strong>{formatEuro(b.amount)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Próximas Receitas</h3>
          {nextIncomes.length === 0 ? (
            <div className="empty-state">Sem receitas previstas.</div>
          ) : (
            <div className="list">
              {nextIncomes.map((i) => (
                <div key={i.id} className="list-row">
                  <div>
                    <div className="list-title">{i.source}</div>
                    <div className="list-subtitle">Prevista a {i.expectedDate}</div>
                  </div>
                  <strong style={{ color: "#15803d" }}>+{formatEuro(i.amount)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {openDebts.length > 0 && (
        <div className="card" style={{ marginTop: "24px" }}>
          <h3 style={{ margin: "0 0 12px" }}>Dívidas em Aberto</h3>
          <div className="list">
            {openDebts.map((d) => (
              <div key={d.id} className="list-row">
                <div>
                  <div className="list-title">{d.creditorName}</div>
                  <div className="list-subtitle">
                    Progresso {computeDebtProgress(d)}% •{" "}
                    {d.nextDueDate ? `próxima prestação a ${d.nextDueDate}` : "sem prazo registado"}
                  </div>
                </div>
                <strong>{formatEuro(d.outstandingAmount)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectionChart({ overview }: { overview: FinanceOverview }) {
  const points = overview.projected;
  if (points.length === 0) return null;

  const balances = points.map((p) => p.balance);
  const min = Math.min(...balances, 0);
  const max = Math.max(...balances, 0);
  const span = Math.max(1, max - min);
  const step = Math.max(1, Math.floor(points.length / 30));

  return (
    <div className="card" style={{ marginTop: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <h3 style={{ margin: 0 }}>Projeção de Saldo (60 dias)</h3>
        <span style={{ fontSize: "12px", color: "var(--muted)" }}>
          Atual: {formatEuro(points[0].balance)} • Mínimo: {formatEuro(overview.minProjectedBalance)}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "72px" }}>
        {points
          .filter((_, i) => i % step === 0)
          .map((p) => {
            const height = Math.max(2, ((p.balance - min) / span) * 64);
            return (
              <div
                key={p.date}
                title={`${p.date}: ${formatEuro(p.balance)}`}
                style={{
                  flex: 1,
                  height: `${height}px`,
                  borderRadius: "2px",
                  background: p.balance < 0 ? "#dc2626" : "#2563eb",
                  opacity: p.balance >= 0 && p.balance < overview.minProjectedBalance ? 0.6 : 1,
                }}
              />
            );
          })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contas & Obrigações
// ---------------------------------------------------------------------------

function BillsTab({
  bills,
  today,
  onUpsert,
  onNotice,
  onPaidToggle,
}: {
  bills: FinanceBill[];
  today: string;
  onUpsert: (list: FinanceBill[]) => void;
  onNotice: (msg: string, isError?: boolean) => void;
  onPaidToggle: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [recurrence, setRecurrence] = useState("MONTHLY");
  const [category, setCategory] = useState("OTHER");
  const [priority, setPriority] = useState("MEDIUM");
  const [busy, setBusy] = useState(false);

  const sorted = bills.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await createFinanceBillAction({
      name,
      amount: parseFloat(amount) || 0,
      dueDate,
      recurrence: recurrence as FinanceBill["recurrence"],
      category: category as FinanceBill["category"],
      priority: priority as FinanceBill["priority"],
      status: "PENDING",
    });
    setBusy(false);
    if (!res.success || !res.id) {
      onNotice(res.error || "Erro ao registar a conta.", true);
      return;
    }
    const created: FinanceBill = {
      id: res.id,
      userId: "",
      name,
      amount: parseFloat(amount) || 0,
      dueDate,
      recurrence: recurrence as FinanceBill["recurrence"],
      category: category as FinanceBill["category"],
      priority: priority as FinanceBill["priority"],
      status: "PENDING",
      paidAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onUpsert([created, ...bills]);
    setName("");
    setAmount("");
    onPaidToggle();
    onNotice("Conta registada.");
  }

  async function togglePaid(bill: FinanceBill) {
    const res = await setFinanceBillPaidAction(bill.id, bill.status !== "PAID");
    if (!res.success) {
      onNotice(res.error || "Erro ao atualizar.", true);
      return;
    }
    onUpsert(
      bills.map((b) =>
        b.id === bill.id
          ? {
              ...b,
              status: bill.status === "PAID" ? "PENDING" : "PAID",
              paidAt: bill.status === "PAID" ? null : new Date().toISOString(),
            }
          : b,
      ),
    );
    onPaidToggle();
    onNotice(bill.status === "PAID" ? "Conta reposta como pendente." : "Conta marcada como paga.");
  }

  async function remove(bill: FinanceBill) {
    if (!window.confirm(`Eliminar "${bill.name}"?`)) return;
    const res = await deleteFinanceBillAction(bill.id);
    if (!res.success) {
      onNotice(res.error || "Erro ao eliminar.", true);
      return;
    }
    onUpsert(bills.filter((b) => b.id !== bill.id));
    onNotice("Conta eliminada.");
  }

  return (
    <div className="grid-2">
      <div className="card">
        <h3 style={{ margin: "0 0 16px" }}>Nova Conta / Obrigação</h3>
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-field full">
            <label>Nome *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Renda do apartamento" required />
          </div>
          <div className="form-field">
            <label>Valor (€) *</label>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="650.00" required />
          </div>
          <div className="form-field">
            <label>Vencimento *</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </div>
          <div className="form-field">
            <label>Periodicidade</label>
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              {RECURRENCE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Categoria</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {BILL_CATEGORY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Prioridade</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Média</option>
              <option value="LOW">Baixa</option>
            </select>
          </div>
          <div className="form-field full">
            <button type="submit" className="button" style={{ width: "100%" }} disabled={busy}>
              {busy ? "A registar..." : "+ Adicionar Conta"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3 style={{ margin: "0 0 16px" }}>Contas Registadas ({bills.length})</h3>
        {sorted.length === 0 ? (
          <div className="empty-state">
            Ainda não registaste contas. Adiciona renda, água, luz, telecomunicações, seguros e outras obrigações.
          </div>
        ) : (
          <div className="list">
            {sorted.map((b) => {
              const status = classifyBillStatus(b, today);
              return (
                <div key={b.id} className="list-row" style={{ padding: "12px 0" }}>
                  <div>
                    <div className="list-title">
                      <strong>{b.name}</strong>
                    </div>
                    <div className="list-subtitle">
                      Vence a {b.dueDate} • {b.category} • {b.recurrence}
                    </div>
                    <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                      <StatusBadge status={status} />
                      <PriorityBadge priority={b.priority} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong style={{ fontSize: 14 }}>{formatEuro(b.amount)}</strong>
                    <div style={{ display: "flex", gap: "6px", marginTop: "6px", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className={b.status === "PAID" ? "button secondary" : "button"}
                        style={{ fontSize: "11px", padding: "4px 8px" }}
                        onClick={() => togglePaid(b)}
                      >
                        {b.status === "PAID" ? "Reabrir" : "Marcar paga"}
                      </button>
                      <button
                        type="button"
                        className="button secondary"
                        style={{ fontSize: "11px", padding: "4px 8px", color: "#b91c1c" }}
                        onClick={() => remove(b)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dívidas
// ---------------------------------------------------------------------------

function DebtsTab({
  debts,
  onUpsert,
  onNotice,
  onPaidChange,
}: {
  debts: FinanceDebt[];
  onUpsert: (list: FinanceDebt[]) => void;
  onNotice: (msg: string, isError?: boolean) => void;
  onPaidChange: () => void;
}) {
  const [creditor, setCreditor] = useState("");
  const [initial, setInitial] = useState("");
  const [outstanding, setOutstanding] = useState("");
  const [installment, setInstallment] = useState("");
  const [nextDue, setNextDue] = useState("");
  const [interest, setInterest] = useState("");
  const [busy, setBusy] = useState(false);
  const [payments, setPayments] = useState<Record<string, string>>({});

  const sorted = debts.slice().sort((a, b) => (a.nextDueDate ?? "9999").localeCompare(b.nextDueDate ?? "9999"));
  const active = sorted.filter((d) => d.status === "OPEN");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await createFinanceDebtAction({
      creditorName: creditor,
      initialAmount: parseFloat(initial) || 0,
      outstandingAmount: parseFloat(outstanding || initial) || 0,
      installmentAmount: installment ? parseFloat(installment) : undefined,
      nextDueDate: nextDue || undefined,
      interestRate: interest ? parseFloat(interest) : undefined,
      status: "OPEN",
    });
    setBusy(false);
    if (!res.success || !res.id) {
      onNotice(res.error || "Erro ao registar a dívida.", true);
      return;
    }
    const created: FinanceDebt = {
      id: res.id,
      userId: "",
      creditorName: creditor,
      initialAmount: parseFloat(initial) || 0,
      outstandingAmount: parseFloat(outstanding || initial) || 0,
      installmentAmount: installment ? parseFloat(installment) : undefined,
      nextDueDate: nextDue || null,
      interestRate: interest ? parseFloat(interest) : undefined,
      status: "OPEN",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onUpsert([created, ...debts]);
    setCreditor("");
    setInitial("");
    setOutstanding("");
    setInstallment("");
    setNextDue("");
    setInterest("");
    onNotice("Dívida registada.");
  }

  async function registerPayment(debt: FinanceDebt) {
    const value = parseFloat(payments[debt.id] || "") || 0;
    if (value <= 0) {
      onNotice("Introduz o valor da prestação paga.", true);
      return;
    }
    const res = await registerFinanceDebtPaymentAction(debt.id, value);
    if (!res.success) {
      onNotice(res.error || "Erro ao registar pagamento.", true);
      return;
    }
    const remaining = Math.max(0, Math.round((debt.outstandingAmount - value) * 100) / 100);
    onUpsert(
      debts.map((d) =>
        d.id === debt.id
          ? { ...d, outstandingAmount: remaining, status: remaining <= 0 ? "PAID" : "OPEN" }
          : d,
      ),
    );
    setPayments((p) => ({ ...p, [debt.id]: "" }));
    onPaidChange();
    onNotice(remaining <= 0 ? "Dívida liquidada." : "Pagamento registado.");
  }

  async function remove(debt: FinanceDebt) {
    if (!window.confirm(`Eliminar a dívida "${debt.creditorName}"?`)) return;
    const res = await deleteFinanceDebtAction(debt.id);
    if (!res.success) {
      onNotice(res.error || "Erro ao eliminar.", true);
      return;
    }
    onUpsert(debts.filter((d) => d.id !== debt.id));
    onNotice("Dívida eliminada.");
  }

  return (
    <div className="grid-2">
      <div className="card">
        <h3 style={{ margin: "0 0 16px" }}>Nova Dívida</h3>
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-field full">
            <label>Credor *</label>
            <input value={creditor} onChange={(e) => setCreditor(e.target.value)} placeholder="Ex: Banco Millennium BCP" required />
          </div>
          <div className="form-field">
            <label>Valor Inicial (€) *</label>
            <input type="number" step="0.01" min="0.01" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="10000.00" required />
          </div>
          <div className="form-field">
            <label>Valor em Dívida (€) *</label>
            <input type="number" step="0.01" min="0" value={outstanding} onChange={(e) => setOutstanding(e.target.value)} placeholder="6200.00" />
          </div>
          <div className="form-field">
            <label>Prestação Mensal (€)</label>
            <input type="number" step="0.01" min="0" value={installment} onChange={(e) => setInstallment(e.target.value)} placeholder="250.00" />
          </div>
          <div className="form-field">
            <label>Próximo Vencimento</label>
            <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
          </div>
          <div className="form-field">
            <label>TAN / Juros (%)</label>
            <input type="number" step="0.001" min="0" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="8.500" />
          </div>
          <div className="form-field full">
            <button type="submit" className="button" style={{ width: "100%" }} disabled={busy}>
              {busy ? "A registar..." : "+ Adicionar Dívida"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3 style={{ margin: "0 0 16px" }}>Dívidas em Aberto ({active.length})</h3>
        {sorted.length === 0 ? (
          <div className="empty-state">
            Ainda não registaste dívidas (empréstimos, créditos, dívidas a terceiros).
          </div>
        ) : (
          <div className="list">
            {active.map((d) => (
              <div key={d.id} className="list-row" style={{ padding: "12px 0", flexDirection: "column", alignItems: "stretch", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <div>
                    <div className="list-title">
                      <strong>{d.creditorName}</strong>
                    </div>
                    <div className="list-subtitle">
                      Inicial {formatEuro(d.initialAmount)} • Juros {d.interestRate ?? 0}% •{" "}
                      {d.installmentAmount ? `prestação ${formatEuro(d.installmentAmount)}` : "sem prestação registada"} •{" "}
                      {d.nextDueDate ? `vence a ${d.nextDueDate}` : "sem prazo"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{formatEuro(d.outstandingAmount)}</div>
                    <StatusBadge status={d.status} />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <div style={{ flex: 1, background: "#e2e8f0", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${computeDebtProgress(d)}%`,
                          height: "100%",
                          background: "#2563eb",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                      {computeDebtProgress(d)}% pago
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Valor pago (€)"
                      style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px", width: "120px" }}
                      value={payments[d.id] ?? ""}
                      onChange={(e) => setPayments((p) => ({ ...p, [d.id]: e.target.value }))}
                    />
                    <button type="button" className="button" style={{ fontSize: "11px", padding: "6px 10px" }} onClick={() => registerPayment(d)}>
                      Registar Pagamento
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      style={{ fontSize: "11px", padding: "6px 10px", color: "#b91c1c" }}
                      onClick={() => remove(d)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {sorted.filter((d) => d.status !== "OPEN").length > 0 && (
              <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--muted)" }}>
                {sorted.filter((d) => d.status !== "OPEN").length} dívida(s) liquidada(s) no histórico.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Receitas
// ---------------------------------------------------------------------------

function IncomesTab({
  incomes,
  onUpsert,
  onNotice,
  onToggle,
}: {
  incomes: FinanceIncome[];
  onUpsert: (list: FinanceIncome[]) => void;
  onNotice: (msg: string, isError?: boolean) => void;
  onToggle: () => void;
}) {
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("SALARY");
  const [amount, setAmount] = useState("");
  const [recurrence, setRecurrence] = useState("MONTHLY");
  const [expectedDate, setExpectedDate] = useState(todayKey());
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await createFinanceIncomeAction({
      source,
      category: category as FinanceIncome["category"],
      amount: parseFloat(amount) || 0,
      recurrence: recurrence as FinanceIncome["recurrence"],
      expectedDate,
      isActive: true,
    });
    setBusy(false);
    if (!res.success || !res.id) {
      onNotice(res.error || "Erro ao registar a receita.", true);
      return;
    }
    const created: FinanceIncome = {
      id: res.id,
      userId: "",
      source,
      category: category as FinanceIncome["category"],
      amount: parseFloat(amount) || 0,
      recurrence: recurrence as FinanceIncome["recurrence"],
      expectedDate,
      isActive: true,
      lastReceivedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onUpsert([created, ...incomes]);
    setSource("");
    setAmount("");
    onToggle();
    onNotice("Receita registada.");
  }

  async function toggleActive(inc: FinanceIncome) {
    const res = await toggleFinanceIncomeActiveAction(inc.id, !inc.isActive);
    if (!res.success) {
      onNotice(res.error || "Erro ao atualizar.", true);
      return;
    }
    onUpsert(incomes.map((i) => (i.id === inc.id ? { ...i, isActive: !inc.isActive } : i)));
    onToggle();
  }

  async function remove(inc: FinanceIncome) {
    if (!window.confirm(`Eliminar a receita "${inc.source}"?`)) return;
    const res = await deleteFinanceIncomeAction(inc.id);
    if (!res.success) {
      onNotice(res.error || "Erro ao eliminar.", true);
      return;
    }
    onUpsert(incomes.filter((i) => i.id !== inc.id));
    onNotice("Receita eliminada.");
  }

  const sorted = incomes.slice().sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));

  return (
    <div className="grid-2">
      <div className="card">
        <h3 style={{ margin: "0 0 16px" }}>Nova Receita</h3>
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-field full">
            <label>Origem *</label>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Ex: Salário, Projeto freelance, Renda de imóvel" required />
          </div>
          <div className="form-field">
            <label>Tipo</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {INCOME_CATEGORY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Valor (€) *</label>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1200.00" required />
          </div>
          <div className="form-field">
            <label>Periodicidade</label>
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              {RECURRENCE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Data Prevista *</label>
            <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} required />
          </div>
          <div className="form-field full">
            <button type="submit" className="button" style={{ width: "100%" }} disabled={busy}>
              {busy ? "A registar..." : "+ Adicionar Receita"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3 style={{ margin: "0 0 16px" }}>Receitas ({incomes.length})</h3>
        {sorted.length === 0 ? (
          <div className="empty-state">
            Regista o teu salário, trabalhos freelance e outros rendimentos para a previsão do mês.
          </div>
        ) : (
          <div className="list">
            {sorted.map((i) => (
              <div key={i.id} className="list-row" style={{ padding: "12px 0" }}>
                <div>
                  <div className="list-title">
                    <strong>{i.source}</strong>
                  </div>
                  <div className="list-subtitle">
                    {i.category} • {i.recurrence} • prevista a {i.expectedDate}
                  </div>
                  <span className={`badge ${i.isActive ? "success" : ""}`}>
                    {i.isActive ? "Ativa" : "Em pausa"}
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong style={{ fontSize: 14, color: "#15803d" }}>+{formatEuro(i.amount)}</strong>
                  <div style={{ display: "flex", gap: "6px", marginTop: "6px", justifyContent: "flex-end" }}>
                    <button type="button" className="button secondary" style={{ fontSize: "11px", padding: "4px 8px" }} onClick={() => toggleActive(i)}>
                      {i.isActive ? "Pausar" : "Ativar"}
                    </button>
                    <button type="button" className="button secondary" style={{ fontSize: "11px", padding: "4px 8px", color: "#b91c1c" }} onClick={() => remove(i)}>
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Despesas pontuais
// ---------------------------------------------------------------------------

function ExpensesTab({
  expenses,
  onUpsert,
  onNotice,
}: {
  expenses: FinanceExpense[];
  onUpsert: (list: FinanceExpense[]) => void;
  onNotice: (msg: string, isError?: boolean) => void;
}) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("FOOD");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayKey());
  const [paymentMethod, setPaymentMethod] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await createFinanceExpenseAction({
      description,
      category: category as FinanceExpense["category"],
      amount: parseFloat(amount) || 0,
      expenseDate,
      paymentMethod: paymentMethod || undefined,
    });
    setBusy(false);
    if (!res.success || !res.id) {
      onNotice(res.error || "Erro ao registar a despesa.", true);
      return;
    }
    const created: FinanceExpense = {
      id: res.id,
      userId: "",
      description,
      category: category as FinanceExpense["category"],
      amount: parseFloat(amount) || 0,
      expenseDate,
      paymentMethod: paymentMethod || undefined,
      createdAt: new Date().toISOString(),
    };
    onUpsert([created, ...expenses]);
    setDescription("");
    setAmount("");
    setPaymentMethod("");
    onNotice("Despesa registada.");
  }

  async function remove(exp: FinanceExpense) {
    if (!window.confirm(`Eliminar "${exp.description}"?`)) return;
    const res = await deleteFinanceExpenseAction(exp.id);
    if (!res.success) {
      onNotice(res.error || "Erro ao eliminar.", true);
      return;
    }
    onUpsert(expenses.filter((x) => x.id !== exp.id));
    onNotice("Despesa eliminada.");
  }

  const sorted = expenses.slice().sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));

  return (
    <div className="grid-2">
      <div className="card">
        <h3 style={{ margin: "0 0 16px" }}>Nova Despesa Pontual</h3>
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-field full">
            <label>Descrição *</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Jantar fora, Gasolina, Farmácia" required />
          </div>
          <div className="form-field">
            <label>Categoria</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Valor (€) *</label>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="35.00" required />
          </div>
          <div className="form-field">
            <label>Data *</label>
            <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
          </div>
          <div className="form-field">
            <label>Método de Pagamento</label>
            <input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="Ex: MBWay, Cartão" />
          </div>
          <div className="form-field full">
            <button type="submit" className="button" style={{ width: "100%" }} disabled={busy}>
              {busy ? "A registar..." : "+ Adicionar Despesa"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3 style={{ margin: "0 0 16px" }}>Despesas ({expenses.length})</h3>
        {sorted.length === 0 ? (
          <div className="empty-state">
            Regista as despesas pontuais do dia-a-dia (alimentação, transportes, saúde, lazer).
          </div>
        ) : (
          <div className="list">
            {sorted.map((exp) => (
              <div key={exp.id} className="list-row" style={{ padding: "12px 0" }}>
                <div>
                  <div className="list-title">
                    <strong>{exp.description}</strong>
                  </div>
                  <div className="list-subtitle">
                    {exp.expenseDate} • {exp.category}
                    {exp.paymentMethod ? ` • ${exp.paymentMethod}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong style={{ fontSize: 14 }}>-{formatEuro(exp.amount)}</strong>
                  <div>
                    <button type="button" className="button secondary" style={{ fontSize: "11px", padding: "4px 8px", color: "#b91c1c", marginTop: "6px" }} onClick={() => remove(exp)}>
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assistente Financeiro
// ---------------------------------------------------------------------------

const QUICK_PROMPTS = [
  "Quanto posso gastar?",
  "Próximas contas",
  "Minhas dívidas",
  "Resumo deste mês",
];

const SAMPLE_QUESTIONS = [
  "Quanto dinheiro posso gastar este mês?",
  "Que contas tenho esta semana?",
  "Quanto devo ao banco?",
  "Qual a minha dívida mais urgente?",
  "Se pagar esta dívida, quanto fico a pagar por mês?",
  "Quanto preciso reservar para impostos?",
  "Tenho dinheiro suficiente até ao fim do mês?",
];

function AssistantTab({
  answer,
  busy,
  onAnswer,
}: {
  answer: string | null;
  busy: boolean;
  onAnswer: (answer: string | null, busy: boolean) => void;
}) {
  const [question, setQuestion] = useState("");

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    onAnswer(null, true);
    const res = await askFinanceAssistantAction(text);
    onAnswer(res.answer, false);
    setQuestion("");
  }

  return (
    <div>
      <div className="card" style={{ maxWidth: "720px" }}>
        <h3 style={{ margin: "0 0 8px" }}>Assistente Financeiro</h3>
        <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "16px" }}>
          Pergunta sobre a tua vida financeira em português. As respostas são calculadas com os
          teus dados reais (sem inventar valores) dentro do teu espaço.
        </p>

        <div style={{ display: "flex", gap: "8px" }}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(question)}
            placeholder="Ex: Quanto posso gastar este mês?"
            style={{ flex: 1 }}
          />
          <button type="button" className="button" onClick={() => ask(question)} disabled={busy}>
            {busy ? "A pensar..." : "Perguntar"}
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "8px",
            margin: "14px 0",
          }}
        >
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              type="button"
              className="button secondary"
              style={{ fontSize: "13px", padding: "8px 10px", textAlign: "left" }}
              onClick={() => ask(q)}
            >
              {q}
            </button>
          ))}
        </div>

        <details style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
          <summary style={{ cursor: "pointer" }}>Mais perguntas de exemplo</summary>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
            {SAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                className="button secondary"
                style={{ fontSize: "11px", padding: "4px 8px" }}
                onClick={() => ask(q)}
              >
                {q}
              </button>
            ))}
          </div>
        </details>

        {answer && (
          <div
            style={{
              whiteSpace: "pre-line",
              marginTop: "12px",
              background: "#f8fafc",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "14px 16px",
              fontSize: "14px",
            }}
          >
            {answer}
          </div>
        )}
      </div>
    </div>
  );
}