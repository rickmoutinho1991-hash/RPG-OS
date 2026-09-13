"use client";

import { useEffect, useState } from "react";
import { FiscalInboxItemType, FiscalInboxPriority, FiscalInboxStatus, FiscalInboxItem } from "@rpg/core";
import { useOrganizationContext } from "@/lib/organization-context";
import Link from "next/link";
import { getFiscalInboxItems, updateFiscalInboxItemStatus } from "./actions";

interface FiscalInboxItemClient extends FiscalInboxItem {
  type: FiscalInboxItemType;
  priority: FiscalInboxPriority;
  status: FiscalInboxStatus;
}

export default function FiscalInboxClient() {
  const { organization } = useOrganizationContext();
  const [items, setItems] = useState<FiscalInboxItemClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: "" as string,
    priority: "" as string,
    type: "" as string,
    search: "",
  });
  const [activeTab, setActiveTab] = useState("inbox");

  // Load items via server loader (sessão + fiscal.admin + organization
  // scope resolvidos server-side; sem queries anon no browser).
  // Carga inicial no mount com guarda de cancelamento (loading começa
  // true e só é limpo em callbacks de promise).
  useEffect(() => {
    let cancelled = false;
    getFiscalInboxItems()
      .then((data) => {
        if (!cancelled) setItems((data || []) as FiscalInboxItemClient[]);
      })
      .catch((err) => {
        console.error("[Fiscal] Error loading items:", err);
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organization?.id]);

  async function handleTransition(itemId: string, action: "mark_read" | "resolve") {
    const res = await updateFiscalInboxItemStatus(itemId, action);
    if (!res.ok || !res.item) return;
    const next: Pick<FiscalInboxItemClient, "status" | "read_at" | "resolved_at"> = {
      status: res.item.status as FiscalInboxStatus,
      read_at: res.item.read_at ?? undefined,
      resolved_at: res.item.resolved_at ?? undefined,
    };
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...next } : it)));
  }

  const priorityOrder: Record<FiscalInboxPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const priorityColors: Record<FiscalInboxPriority, string> = { CRITICAL: "#dc2626", HIGH: "#ea580c", MEDIUM: "#f59e0b", LOW: "#6b7280" };
  const statusColors: Record<FiscalInboxStatus, string> = { UNREAD: "#3b82f6", READ: "#6b7280", ACTION_REQUIRED: "#dc2626", IN_PROGRESS: "#f59e0b", RESOLVED: "#059669", DISMISSED: "#6b7280" };

  const filteredItems = items.filter(item => {
    if (filters.status && item.status !== filters.status) return false;
    if (filters.priority && item.priority !== filters.priority) return false;
    if (filters.type && item.type !== filters.type) return false;
    if (filters.search) {
      const search = filters.search.toLowerCase();
      return item.title.toLowerCase().includes(search) ||
        item.description.toLowerCase().includes(search) ||
        item.counterparty_nif?.includes(search) ||
        item.counterparty_name?.toLowerCase().includes(search) ||
        item.document_number?.includes(search);
    }
    return true;
  }).sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const stats = {
    total: items.length,
    unread: items.filter(i => i.status === "UNREAD").length,
    actionRequired: items.filter(i => i.status === "ACTION_REQUIRED").length,
    critical: items.filter(i => i.priority === "CRITICAL").length,
  };

  return (
    <div className="page">
      <div className="topbar-eyebrow">Administração Fiscal</div>
      <h1>Caixa Fiscal</h1>
      <p style={{ color: "var(--muted)", marginBottom: 24 }}>
        Centro unificado de comunicações fiscais: faturas, submissões, reconciliações, prazos e notificações governamentais
      </p>

      {/* Organization selector hint */}
      {organization && (
        <div style={{ marginBottom: 20, padding: 12, background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
          <strong style={{ marginRight: 8 }}>Organização:</strong>
          <span style={{ color: "var(--muted)" }}>{organization.name}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="card">
          <strong>Total</strong>
          <div style={{ fontSize: 28, marginTop: 8 }}>{stats.total}</div>
        </div>
        <div className="card" style={{ borderLeft: `4px solid ${priorityColors.CRITICAL}` }}>
          <strong style={{ color: priorityColors.CRITICAL }}>Críticas</strong>
          <div style={{ fontSize: 28, marginTop: 8, color: priorityColors.CRITICAL }}>{stats.critical}</div>
        </div>
        <div className="card" style={{ borderLeft: "4px solid #dc2626" }}>
          <strong style={{ color: "#dc2626" }}>Ação Necessária</strong>
          <div style={{ fontSize: 28, marginTop: 8, color: "#dc2626" }}>{stats.actionRequired}</div>
        </div>
        <div className="card" style={{ borderLeft: "4px solid #3b82f6" }}>
          <strong style={{ color: "#3b82f6" }}>Não Lidas</strong>
          <div style={{ fontSize: 28, marginTop: 8, color: "#3b82f6" }}>{stats.unread}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
        {["inbox", "prazos", "reconciliacao", "auditoria"].map(tab => (
          <button
            key={tab}
            className={`button ${activeTab === tab ? "primary" : "secondary"}`}
            onClick={() => setActiveTab(tab)}
            style={{ textTransform: "capitalize" }}
          >
            {tab === "inbox" && "Caixa Fiscal"}
            {tab === "prazos" && "Prazos Fiscais"}
            {tab === "reconciliacao" && "Reconciliação"}
            {tab === "auditoria" && "Auditoria Gov"}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "end" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              Pesquisar
            </label>
            <input
              type="text"
              placeholder="NIF, número, descrição..."
              value={filters.search}
              onChange={e => setFilters({ ...filters, search: e.target.value })}
              className="input"
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ minWidth: 150 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              Status
            </label>
            <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} className="input">
              <option value="">Todos</option>
              <option value="UNREAD">Não lidas</option>
              <option value="ACTION_REQUIRED">Ação necessária</option>
              <option value="IN_PROGRESS">Em progresso</option>
              <option value="RESOLVED">Resolvidas</option>
              <option value="DISMISSED">Descartadas</option>
            </select>
          </div>
          <div style={{ minWidth: 150 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              Prioridade
            </label>
            <select value={filters.priority} onChange={e => setFilters({ ...filters, priority: e.target.value })} className="input">
              <option value="">Todas</option>
              <option value="CRITICAL">Crítica</option>
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Média</option>
              <option value="LOW">Baixa</option>
            </select>
          </div>
          <div style={{ minWidth: 180 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              Tipo
            </label>
            <select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })} className="input">
              <option value="">Todos</option>
              <option value="REJECTED_SUBMISSION">Submissão rejeitada</option>
              <option value="PENDING_SUBMISSION">Submissão pendente</option>
              <option value="RECONCILIATION_ISSUE">Divergência reconciliação</option>
              <option value="DEADLINE">Prazo fiscal</option>
              <option value="INVOICE_ISSUED">Fatura emitida</option>
              <option value="CONSENT_EXPIRING">Consentimento a expirar</option>
            </select>
          </div>
        </div>
      </div>

      {/* Items List */}
      <div className="card">
        {filteredItems.length === 0 ? (
          <div className="empty-state" style={{ padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
            <h3 style={{ margin: "0 0 8px" }}>Nenhum item encontrado</h3>
            <p style={{ color: "var(--muted)", margin: 0 }}>Tente ajustar os filtros</p>
          </div>
        ) : (
          <div className="list">
            {filteredItems.map(item => (
              <div key={item.id} className="list-row" style={{ padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flex: 1 }}>
                  <span
                    className="badge"
                    style={{
                      background: priorityColors[item.priority] + "20",
                      color: priorityColors[item.priority],
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {item.priority}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</span>
                      <span
                        className="badge"
                        style={{
                          background: statusColors[item.status] + "20",
                          color: statusColors[item.status],
                          fontSize: 11,
                        }}
                      >
                        {item.status.replace("_", " ")}
                      </span>
                      {item.provider && (
                        <span className="badge" style={{ background: "var(--accent)20", color: "var(--accent)", fontSize: 11 }}>
                          {item.provider}
                        </span>
                      )}
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 4 }}>{item.description}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "var(--muted)" }}>
                      {item.document_type && item.series && item.document_number && (
                        <span>{item.document_type} {item.series}/{item.document_number}</span>
                      )}
                      {item.counterparty_name && item.counterparty_nif && (
                        <span>{item.counterparty_name} ({item.counterparty_nif})</span>
                      )}
                      {item.amount_cents && (
                        <span>{(item.amount_cents / 100).toFixed(2)} EUR</span>
                      )}
                      {item.due_date && (
                        <span style={{ color: new Date(item.due_date) < new Date() ? "#dc2626" : "var(--muted)" }}>
                          📅 {new Date(item.due_date).toLocaleDateString("pt-PT")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {item.status === "UNREAD" && (
                    <button
                      className="button secondary"
                      style={{ padding: "6px 12px", fontSize: 12 }}
                      onClick={() => handleTransition(item.id, "mark_read")}
                    >
                      Marcar lida
                    </button>
                  )}
                  {item.status === "ACTION_REQUIRED" && (
                    <button
                      className="button primary"
                      style={{ padding: "6px 12px", fontSize: 12 }}
                      onClick={() => handleTransition(item.id, "resolve")}
                    >
                      Resolver
                    </button>
                  )}
                  {item.action_url && (
                    <Link href={item.action_url} className="button secondary" style={{ padding: "6px 12px", fontSize: 12 }}>
                      Ver detalhes
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const environments = [
  { value: "development", label: "Desenvolvimento" },
  { value: "sandbox", label: "Sandbox (Testes)" },
  { value: "production", label: "Produção" },
];

// Estilos inline para toast (apenas no browser; módulo também é avaliado em SSR)
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
`;
  document.head.appendChild(style);
}