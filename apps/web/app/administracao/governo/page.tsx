"use client";
let _connCounter = 0;

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GovernmentProviderId,
  GovernmentProviderStatus,
  GovernmentEnvironment,
  GOVERNMENT_PROVIDER_DISPLAY,
  GOVERNMENT_PROVIDER_SCOPES,
  GOVERNMENT_PROVIDER_TYPE_DISPLAY,
  GOVERNMENT_ENVIRONMENT_DISPLAY,
  GOVERNMENT_CONNECTION_STATUS_DISPLAY,
} from "@rpg/core";

interface GovernmentConnection {
  id: string;
  provider_id: GovernmentProviderId;
  environment: GovernmentEnvironment;
  status: string;
  scopes: string[];
  connected_at: string;
  expires_at?: string;
  last_sync_at?: string;
  last_error?: string;
}

interface PageProps {
  initialConnections?: GovernmentConnection[];
}

interface FormData {
  provider_id: GovernmentProviderId;
  environment: GovernmentEnvironment;
  scopes: string[];
}

const initialFormData: FormData = {
  provider_id: "AT",
  environment: "development",
  scopes: [],
};

export default function GovernmentPage({ initialConnections = [] }: PageProps) {
  const router = useRouter();
  const [connections, setConnections] = useState<GovernmentConnection[]>(initialConnections);
  const [showForm, setShowForm] = useState(false);
  const [editingConnection, setEditingConnection] = useState<GovernmentConnection | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const providers = Object.entries(GOVERNMENT_PROVIDER_DISPLAY).map(([id, display]) => ({
    id: id as GovernmentProviderId,
    ...display,
  }));

  const environments: { value: GovernmentEnvironment; label: string; color: string }[] = [
    { value: "development", label: "Desenvolvimento", color: "#6b7280" },
    { value: "sandbox", label: "Sandbox (Testes)", color: "#f59e0b" },
    { value: "production", label: "Produção", color: "#059669" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading("save");

    try {
      const res = await fetch("/api/administracao/governo/connections", {
        method: editingConnection ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          id: editingConnection?.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Erro ao guardar");

      if (editingConnection) {
        setConnections(connections.map(c => c.id === editingConnection.id ? { ...c, ...formData } : c));
      } else {
        const newConn = { id: `conn_${++_connCounter}`, ...formData, status: "DISCONNECTED", connected_at: new Date().toISOString() };
        setConnections([newConn, ...connections]);
      }

      setShowForm(false);
      setEditingConnection(null);
      setFormData({ provider_id: "AT", environment: "development", scopes: [] });
      showToast("success", editingConnection ? "Ligação atualizada" : "Ligação criada");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao guardar");
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async (connectionId: string) => {
    if (!confirm("Tem a certeza que quer eliminar esta ligação?")) return;

    try {
      const res = await fetch(`/api/administracao/governo/connections/${connectionId}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao eliminar");

      setConnections(connections.filter(c => c.id !== connectionId));
      showToast("success", "Ligação eliminada");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao eliminar");
    }
  };

  const handleTest = async (connectionId: string) => {
    setLoading(`test_${connectionId}`);

    try {
      const res = await fetch(`/api/administracao/governo/connections/${connectionId}/test`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao testar");

      // Refresh connections
      const res2 = await fetch("/api/administracao/governo/connections");
      const data2 = await res2.json();
      setConnections(data2);

      showToast(data.success ? "success" : "error", data.message || (data.success ? "Teste bem-sucedido" : "Erro no teste"));
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao testar");
    } finally {
      setLoading(null);
    }
  };

  const handleEdit = (conn: GovernmentConnection) => {
    setEditingConnection(conn);
    setFormData({
      provider_id: conn.provider_id,
      environment: conn.environment,
      scopes: conn.scopes,
    });
    setShowForm(true);
  };

  const handleNew = () => {
    setEditingConnection(null);
    setFormData({ provider_id: "AT", environment: "development", scopes: [] });
    setShowForm(true);
  };

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const getAvailableScopes = (providerId: GovernmentProviderId) => {
    const config = GOVERNMENT_PROVIDER_SCOPES[providerId];
    return config ? [...config.required, ...config.optional] : [];
  };

  const handleScopeChange = (scope: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      scopes: checked ? [...prev.scopes, scope] : prev.scopes.filter(s => s !== scope),
    }));
  };

  const display = GOVERNMENT_PROVIDER_DISPLAY[formData.provider_id];
  const availableScopes = getAvailableScopes(formData.provider_id);
  const requiredScopes = GOVERNMENT_PROVIDER_SCOPES[formData.provider_id]?.required || [];

  return (
    <div className="page">
      <Link href="/administracao" className="button secondary" style={{ marginBottom: 20 }}>
        ← Administração
      </Link>

      <div className="topbar-eyebrow">Integrações Oficiais</div>
      <h1>Ligações Governamentais</h1>
      <p style={{ color: "var(--muted)", marginBottom: 24 }}>
        Gerir ligações a serviços oficiais portugueses: AT, e-Fatura, Segurança Social, Autenticação.gov
      </p>

      {toast && (
        <div
          className={`toast ${toast.type}`}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            padding: "12px 20px",
            borderRadius: 8,
            background: toast.type === "success" ? "#059669" : "#dc2626",
            color: "white",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 1000,
            animation: "slideIn 0.3s ease",
          }}
        >
          {toast.message}
        </div>
      )}

      <div className="grid-2" style={{ gap: 24, marginTop: 24 }}>
        {/* Lista de ligações */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>Ligações Configuradas</h2>
            <button className="button primary" onClick={handleNew}>
              Nova Ligação
            </button>
          </div>

          {connections.length === 0 ? (
            <div className="empty-state" style={{ padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
              <h3 style={{ margin: "0 0 8px" }}>Nenhuma ligação configurada</h3>
              <p style={{ color: "var(--muted)", margin: 0 }}>Crie a sua primeira ligação a um serviço governamental</p>
            </div>
          ) : (
            <div className="list">
{connections.map(conn => {
                const display = GOVERNMENT_PROVIDER_DISPLAY[conn.provider_id as GovernmentProviderId];
                const statusDisplay = GOVERNMENT_CONNECTION_STATUS_DISPLAY[conn.status as GovernmentProviderStatus] || {
                  label: conn.status,
                  color: "#6b7280",
                  icon: "❓",
                };
                const envDisplay = environments.find(e => e.value === conn.environment);

                return (
                  <div key={conn.id} className="list-row" style={{ padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                      <span style={{ fontSize: 24 }}>{display.icon}</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{display.name}</div>
                        <div style={{ fontSize: 13, color: "var(--muted)" }}>
                          {envDisplay?.label} • {conn.scopes.length} scope(s)
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span
                        className="badge"
                        style={{
                          background: statusDisplay.color + "20",
                          color: statusDisplay.color,
                          fontSize: 12,
                        }}
                      >
                        {statusDisplay.icon} {statusDisplay.label}
                      </span>
                      <button
                        className="button secondary"
                        style={{ padding: "6px 12px", fontSize: 13 }}
                        onClick={() => handleTest(conn.id)}
                        disabled={loading === `test_${conn.id}`}
                      >
                        {loading === `test_${conn.id}` ? "A testar..." : "Testar"}
                      </button>
                      <button
                        className="button secondary"
                        style={{ padding: "6px 12px", fontSize: 13 }}
                        onClick={() => handleEdit(conn)}
                      >
                        Editar
                      </button>
                      <button
                        className="button danger"
                        style={{ padding: "6px 12px", fontSize: 13 }}
                        onClick={() => handleDelete(conn.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Formulário / Detalhes do Provider */}
        <div className="card">
          {editingConnection || showForm ? (
            <form onSubmit={handleSubmit}>
              <h2 style={{ margin: "0 0 20px" }}>{editingConnection ? "Editar Ligação" : "Nova Ligação"}</h2>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
                  Fornecedor
                </label>
                <select
                  value={formData.provider_id}
                  onChange={e => setFormData({ ...formData, provider_id: e.target.value as GovernmentProviderId, scopes: [] })}
                  className="input"
                  disabled={editingConnection !== null}
                  style={{ width: "100%" }}
                >
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.icon} {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
                  Ambiente
                </label>
                <select
                  value={formData.environment}
                  onChange={e => setFormData({ ...formData, environment: e.target.value as GovernmentEnvironment })}
                  className="input"
                  style={{ width: "100%" }}
                >
                  {environments.map(e => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
                  Scopes ({availableScopes.length} disponíveis)
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {availableScopes.map(scope => {
                    const isRequired = requiredScopes.includes(scope);
                    const checked = formData.scopes.includes(scope);
                    return (
                      <label key={scope} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => handleScopeChange(scope, e.target.checked)}
                          disabled={isRequired}
                        />
                        <span style={{ fontSize: 13 }}>
                          {scope} {isRequired && <span style={{ color: "var(--accent)", fontSize: 10 }}> (obrigatório)</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button type="button" className="button secondary" onClick={() => { setShowForm(false); setEditingConnection(null); }}>
                  Cancelar
                </button>
                <button type="submit" className="button primary" disabled={loading === "save"}>
                  {loading === "save" ? "A guardar..." : (editingConnection ? "Atualizar" : "Criar")}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>{display?.icon || "🏛️"}</div>
              <h2 style={{ margin: "0 0 8px" }}>{display?.name || "Selecione um fornecedor"}</h2>
              <p style={{ margin: 0, maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
                {display?.description || "Configure uma ligação para ver os detalhes aqui"}
              </p>
{display && (
                <div style={{ marginTop: 16, padding: 16, background: "var(--surface)", borderRadius: 8, textAlign: "left", maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Scopes disponíveis:</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {
                      (() => {
                        const scopesConfig = GOVERNMENT_PROVIDER_SCOPES[formData.provider_id as GovernmentProviderId];
                        return [...(scopesConfig?.required || []), ...(scopesConfig?.optional || [])].map(s => (
                          <span key={s} className="badge" style={{ fontSize: 11 }}>
                            {s} {scopesConfig?.required?.includes(s) && "✓"}
                          </span>
                        ));
                      })()
                    }
                  </div>
                  <div style={{ marginTop: 12, fontSize: 13, color: "var(--muted)" }}>
                    <strong>Documentação:</strong> <a href={display.documentation_url} target="_blank" rel="noopener noreferrer">{display.documentation_url}</a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const environments = [
  { value: "development", label: "Desenvolvimento" },
  { value: "sandbox", label: "Sandbox (Testes)" },
  { value: "production", label: "Produção" },
];

// Estilos inline para toast
const style = document.createElement("style");
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
`;
document.head.appendChild(style);






