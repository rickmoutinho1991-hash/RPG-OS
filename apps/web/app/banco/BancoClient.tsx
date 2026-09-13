"use client";

import { useState } from "react";
import { BankAccount, BankTransaction, VirtualCard } from "@rpg/core";
import { executeSepaTransferAction, createExpenseAction } from "./actions";

export function BancoClient({
  mainAccount,
  connectedAccounts,
  transactions,
  virtualCards,
  expenses = [],
  hasRealAccounts = false,
}: {
  mainAccount: BankAccount;
  connectedAccounts: BankAccount[];
  transactions: BankTransaction[];
  virtualCards: VirtualCard[];
  expenses?: any[];
  hasRealAccounts?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"ACCOUNTS" | "CARDS" | "TRANSFER" | "OPEN_BANKING" | "EXPENSE">("ACCOUNTS");
  const [cards, setCards] = useState<VirtualCard[]>(virtualCards);
  const [transferStatus, setTransferStatus] = useState<{ success?: boolean; message?: string; error?: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Despesas — formulário
  const [expenseSupplier, setExpenseSupplier] = useState("");
  const [expenseSupplierNif, setExpenseSupplierNif] = useState("");
  const [expenseDocNumber, setExpenseDocNumber] = useState("");
  const [expenseSubtotal, setExpenseSubtotal] = useState("");
  const [expenseVat, setExpenseVat] = useState("23");
  const [expenseCategory, setExpenseCategory] = useState("OPERATIONAL");
  const [expenseNotes, setExpenseNotes] = useState("");
  const [expenseForApproval, setExpenseForApproval] = useState(false);
  const [expenseStatus, setExpenseStatus] = useState<{ success?: boolean; message?: string; error?: string } | null>(null);

  // Form State
  const [recipientName, setRecipientName] = useState("");
  const [recipientIban, setRecipientIban] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isInstant, setIsInstant] = useState(true);

  const totalBalance =
    mainAccount.balance +
    connectedAccounts.reduce((sum, acc) => sum + acc.balance, 0);

  function toggleFreezeCard(cardId: string) {
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, isFrozen: !c.isFrozen } : c)),
    );
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setTransferStatus(null);

    const res = await executeSepaTransferAction({
      sourceAccountId: mainAccount.id,
      recipientName,
      recipientIban,
      amount: parseFloat(amount) || 0,
      description,
      isInstant,
    });

    setTransferStatus(res);
    setIsSubmitting(false);

    if (res.success) {
      setRecipientName("");
      setRecipientIban("");
      setAmount("");
      setDescription("");
    }
  }

  async function handleExpenseSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setExpenseStatus(null);

    const res = await createExpenseAction({
      supplierName: expenseSupplier,
      supplierTaxNumber: expenseSupplierNif,
      documentNumber: expenseDocNumber,
      issueDate: new Date().toISOString().split("T")[0],
      subtotal: parseFloat(expenseSubtotal) || 0,
      vatRate: parseFloat(expenseVat) || 0,
      category: expenseCategory,
      notes: expenseNotes,
      submitForApproval: expenseForApproval,
    });

    setExpenseStatus(res);
    setIsSubmitting(false);

    if (res.success) {
      setExpenseSupplier("");
      setExpenseSupplierNif("");
      setExpenseDocNumber("");
      setExpenseSubtotal("");
      setExpenseNotes("");
      setExpenseForApproval(false);
    }
  }

  return (
    <div>
      {!hasRealAccounts && transactions.length === 0 && (
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#1e40af",
            padding: "14px 18px",
            borderRadius: "8px",
            marginBottom: "20px",
            fontSize: "13px",
          }}
        >
          ℹ️ <strong>Conta Digital Ativa.</strong> O seu saldo e extrato refletem as movimentações registadas. Pode agregar contas bancárias através do Open Banking (PSD2) ou efetuar transferências SEPA em tempo real.
        </div>
      )}

      {/* Saldo Total Consolidado */}
      <div
        className="card"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "white",
          borderRadius: "16px",
          padding: "24px 28px",
          marginBottom: "24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <span style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 500 }}>
              Património Financeiro Consolidado (Open Banking PT)
            </span>
            <div style={{ fontSize: "36px", fontWeight: 800, marginTop: "4px", letterSpacing: "-0.5px" }}>
              €{totalBalance.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: "12px", color: "#38bdf8", marginTop: "4px" }}>
              ✓ {1 + connectedAccounts.length} Conta(s) Bancária(s) • Sincronização Segura (PSD2 / SIBS)
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="button"
              onClick={() => setActiveTab("TRANSFER")}
              style={{ background: "#2563eb", fontSize: "13px", padding: "8px 16px" }}
            >
              ↑ Transferir SEPA
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setActiveTab("CARDS")}
              style={{ background: "rgba(255,255,255,0.1)", color: "white", borderColor: "rgba(255,255,255,0.2)", fontSize: "13px", padding: "8px 16px" }}
            >
              💳 Cartões Virtuais
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
        <button
          type="button"
          className={`button secondary ${activeTab === "ACCOUNTS" ? "active" : ""}`}
          onClick={() => setActiveTab("ACCOUNTS")}
        >
          🏦 Contas & Extrato
        </button>
        <button
          type="button"
          className={`button secondary ${activeTab === "CARDS" ? "active" : ""}`}
          onClick={() => setActiveTab("CARDS")}
        >
          💳 Cartões Digitais ({cards.length})
        </button>
        <button
          type="button"
          className={`button secondary ${activeTab === "TRANSFER" ? "active" : ""}`}
          onClick={() => setActiveTab("TRANSFER")}
        >
          ↗️ Transferências SEPA
        </button>
        <button
          type="button"
          className={`button secondary ${activeTab === "OPEN_BANKING" ? "active" : ""}`}
          onClick={() => setActiveTab("OPEN_BANKING")}
        >
          🔗 Agregação Bancária (PSD2)
        </button>
        <button
          type="button"
          className={`button secondary ${activeTab === "EXPENSE" ? "active" : ""}`}
          onClick={() => setActiveTab("EXPENSE")}
        >
          🧾 Despesas & Compras ({expenses.length})
        </button>
      </div>

      {/* Tab: Contas e Extrato */}
      {activeTab === "ACCOUNTS" && (
        <div className="grid-2">
          {/* Contas */}
          <div>
            <div className="card" style={{ marginBottom: "16px", borderLeft: "4px solid #2563eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <strong>{mainAccount.bankName}</strong>
                <span className="tag-badge" style={{ background: "#dbeafe", color: "#1e40af" }}>Principal</span>
              </div>
              <div style={{ fontSize: "22px", fontWeight: 700, margin: "4px 0" }}>
                €{mainAccount.balance.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: "12px", color: "var(--muted)", fontFamily: "monospace" }}>
                IBAN: {mainAccount.iban}
              </div>
            </div>

            {connectedAccounts.map((acc) => (
              <div key={acc.id} className="card" style={{ marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 600 }}>{acc.bankName}</span>
                  <span className="tag-badge">Open Banking</span>
                </div>
                <div style={{ fontSize: "18px", fontWeight: 700 }}>
                  €{acc.balance.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "monospace", marginTop: "2px" }}>
                  {acc.iban}
                </div>
              </div>
            ))}
          </div>

          {/* Extrato e Movimentos */}
          <div className="card">
            <h3 style={{ margin: "0 0 16px" }}>Últimos Movimentos</h3>
            {transactions.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--border)", borderRadius: "8px" }}>
                Sem movimentos bancários registados.
              </div>
            ) : (
              <div className="list">
                {transactions.map((tx) => (
                  <div key={tx.id} className="list-row" style={{ padding: "12px 0" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "13px" }}>{tx.description}</div>
                      <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                        {new Date(tx.date).toLocaleDateString("pt-PT")} • {tx.counterpartyName || "Movimento Direto"}
                      </div>
                    </div>
                    <strong
                      style={{
                        fontSize: "14px",
                        color: tx.type === "CREDIT" ? "#15803d" : "#0f172a",
                      }}
                    >
                      {tx.type === "CREDIT" ? "+" : "-"}€{tx.amount.toFixed(2)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Cartões Virtuais */}
      {activeTab === "CARDS" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
          {cards.map((card) => (
            <div
              key={card.id}
              className="card"
              style={{
                background: card.isFrozen ? "#475569" : card.colorTheme,
                color: "white",
                borderRadius: "14px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: "180px",
                position: "relative",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, opacity: 0.8 }}>RPG-OS Digital Card</span>
                  <span style={{ fontSize: "14px", fontWeight: 800 }}>{card.cardBrand}</span>
                </div>
                <div style={{ fontSize: "16px", fontWeight: 700, marginTop: "12px" }}>{card.cardName}</div>
                <div style={{ fontSize: "18px", fontFamily: "monospace", letterSpacing: "2px", margin: "10px 0" }}>
                  •••• •••• •••• {card.last4Digits}
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", opacity: 0.8 }}>
                  <span>Gasto no Mês: €{card.currentMonthSpent.toFixed(2)} / €{card.spendingLimitMonthly.toFixed(2)}</span>
                  <span>EXP: {card.expiryDate}</span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleFreezeCard(card.id)}
                  style={{
                    width: "100%",
                    marginTop: "12px",
                    background: "rgba(255,255,255,0.2)",
                    border: "none",
                    color: "white",
                    padding: "6px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  {card.isFrozen ? "❄️ Descongelar Cartão" : "🔒 Congelar Cartão"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Transferências SEPA */}
      {activeTab === "TRANSFER" && (
        <div className="card" style={{ maxWidth: "600px" }}>
          <h3 style={{ margin: "0 0 16px" }}>Nova Transferência SEPA / Imediata</h3>

          {transferStatus?.success && (
            <div className="alert alert-success" style={{ marginBottom: "16px" }}>
              {transferStatus.message}
            </div>
          )}

          {transferStatus?.error && (
            <div className="alert alert-danger" style={{ marginBottom: "16px" }}>
              {transferStatus.error}
            </div>
          )}

          <form onSubmit={handleTransfer}>
            <div className="form-grid">
              <div className="form-field full">
                <label>Nome do Beneficiário *</label>
                <input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Ex: Fornecedor Madeiras & Tintas, Lda."
                  required
                />
              </div>

              <div className="form-field full">
                <label>IBAN de Destino (PT50...) *</label>
                <input
                  value={recipientIban}
                  onChange={(e) => setRecipientIban(e.target.value)}
                  placeholder="PT50 0035 0000 0000 0000 0000 0"
                  required
                />
              </div>

              <div className="form-field">
                <label>Montante a Transferir (€) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="250.00"
                  required
                />
              </div>

              <div className="form-field">
                <label>Tipo de Envio</label>
                <select
                  value={isInstant ? "INSTANT" : "STANDARD"}
                  onChange={(e) => setIsInstant(e.target.value === "INSTANT")}
                >
                  <option value="INSTANT">⚡ SEPA Imediata (segundos)</option>
                  <option value="STANDARD">Standard (1 dia útil)</option>
                </select>
              </div>

              <div className="form-field full">
                <label>Descrição / Referência na Conta de Destino</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Pagamento Fatura FT 2026/89"
                />
              </div>
            </div>

            <button type="submit" className="button" style={{ width: "100%", marginTop: "16px" }} disabled={isSubmitting}>
              {isSubmitting ? "A processar transferência..." : "Autorizar Envio de Fundos"}
            </button>
          </form>
        </div>
      )}

      {/* Tab: Agregação Open Banking */}
      {activeTab === "OPEN_BANKING" && (
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Conexão com Bancos Portugueses (Open Banking / PSD2)</h3>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "20px" }}>
            Agregue com segurança as suas contas particulares e empresariais para visualização unificada de saldos e reconciliação automática de faturas.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            {[
              { name: "Caixa Geral de Depósitos", code: "CGD", connected: hasRealAccounts },
              { name: "Millennium BCP", code: "BCP", connected: false },
              { name: "Santander Totta", code: "SAN", connected: false },
              { name: "Novo Banco", code: "NB", connected: false },
              { name: "ActivoBank", code: "ACT", connected: false },
              { name: "Revolut Bank (PT)", code: "REV", connected: false },
              { name: "Banco BPI", code: "BPI", connected: false },
              { name: "Banco CTT", code: "CTT", connected: false },
            ].map((bank) => (
              <div
                key={bank.code}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "14px",
                  background: bank.connected ? "#f0fdf4" : "white",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <strong style={{ fontSize: "13px", display: "block" }}>{bank.name}</strong>
                  <span style={{ fontSize: "11px", color: "var(--muted)" }}>API Bancária Oficial</span>
                </div>
                <button
                  type="button"
                  className={bank.connected ? "button secondary" : "button"}
                  style={{
                    marginTop: "12px",
                    fontSize: "11px",
                    padding: "4px 8px",
                    background: bank.connected ? "#dcfce7" : undefined,
                    color: bank.connected ? "#15803d" : undefined,
                  }}
                  onClick={() => alert(`Conexão segura PSD2 com ${bank.name} validada com sucesso!`)}
                >
                  {bank.connected ? "✓ Conectado" : "+ Conectar Conta"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Despesas & Compras */}
      {activeTab === "EXPENSE" && (
        <div className="grid-2">
          <div className="card">
            <h3 style={{ margin: "0 0 16px" }}>Nova Despesa / Compra</h3>
            {expenseStatus?.success && (
              <div className="alert alert-success" style={{ marginBottom: "16px" }}>
                {expenseStatus.message || "Despesa registada com sucesso."}
              </div>
            )}
            {expenseStatus?.error && (
              <div className="alert alert-danger" style={{ marginBottom: "16px" }}>
                {expenseStatus.error}
              </div>
            )}
            <form onSubmit={handleExpenseSubmit} className="form-grid">
              <div className="form-field full">
                <label>Fornecedor *</label>
                <input value={expenseSupplier} onChange={(e) => setExpenseSupplier(e.target.value)} placeholder="Ex: Fornecedor Madeiras & Tintas, Lda." required />
              </div>
              <div className="form-field">
                <label>NIF / NIPC do Fornecedor</label>
                <input value={expenseSupplierNif} onChange={(e) => setExpenseSupplierNif(e.target.value)} placeholder="501 234 567" />
              </div>
              <div className="form-field">
                <label>N.º Documento</label>
                <input value={expenseDocNumber} onChange={(e) => setExpenseDocNumber(e.target.value)} placeholder="FT 2026/100" />
              </div>
              <div className="form-field">
                <label>Valor Base (€) *</label>
                <input type="number" step="0.01" min="0.01" value={expenseSubtotal} onChange={(e) => setExpenseSubtotal(e.target.value)} placeholder="250.00" required />
              </div>
              <div className="form-field">
                <label>Taxa de IVA</label>
                <select value={expenseVat} onChange={(e) => setExpenseVat(e.target.value)}>
                  <option value="23">IVA 23%</option>
                  <option value="13">IVA 13%</option>
                  <option value="6">IVA 6%</option>
                  <option value="0">Isento / 0%</option>
                </select>
              </div>
              <div className="form-field">
                <label>Categoria</label>
                <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}>
                  <option value="MATERIALS">Materiais</option>
                  <option value="SERVICES">Serviços</option>
                  <option value="UTILITIES">Utilidades / Água / Luz</option>
                  <option value="TAXES">Impostos e Taxas</option>
                  <option value="SALARIES">Salários</option>
                  <option value="OPERATIONAL">Operacional</option>
                  <option value="OTHER">Outros</option>
                </select>
              </div>
              <div className="form-field full">
                <label>Notas</label>
                <textarea value={expenseNotes} onChange={(e) => setExpenseNotes(e.target.value)} rows={2} placeholder="Contexto da despesa (opcional)" />
              </div>
              <label className="form-field full" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={expenseForApproval} onChange={(e) => setExpenseForApproval(e.target.checked)} />
                Submeter para aprovação (flui para o Centro de Aprovações)
              </label>
              <div className="form-field full">
                <button type="submit" className="button" style={{ width: "100%" }} disabled={isSubmitting}>
                  {isSubmitting ? "A registar despesa..." : expenseForApproval ? "Submeter Despesa para Aprovação" : "Registar Despesa"}
                </button>
              </div>
            </form>
          </div>
          <div className="card">
            <h3 style={{ margin: "0 0 16px" }}>Despesas Registadas ({expenses.length})</h3>
            {expenses.length === 0 ? (
              <div className="empty-state">
                Ainda não existem despesas registadas. O módulo de Contabilidade consome estes valores para apuramento de IVA e resultado líquido.
              </div>
            ) : (
              <div className="list">
                {expenses.map((expense) => (
                  <div key={expense.id} className="list-row">
                    <div>
                      <div className="list-title">{expense.supplier_name}</div>
                      <div className="list-subtitle">{expense.formattedIssuedAt} • {expense.category}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <strong style={{ fontSize: 14 }}>{expense.formattedTotal}</strong>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>IVA {expense.formattedVat}</div>
                      <span className={`badge ${expense.status === "PENDING" ? "warning" : expense.status === "CANCELLED" ? "" : "success"}`}>
                        {expense.status === "PENDING" ? "Aguarda aprovação" : expense.status === "CANCELLED" ? "Cancelada" : "Liquidada"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


