"use client";

import { useState } from "react";

type HealthProviderId = "SNS24" | "SPMS" | "SNS";
type HealthEnvironment = "development" | "sandbox" | "production";

interface HealthConnection {
  id: string;
  provider_id: HealthProviderId;
  environment: HealthEnvironment;
  status: string;
  scopes: string[];
}

const providers = [
  { id: "SNS24", name: "SNS 24", description: "Portal do SNS 24 - Receitas, vacinas, consultas", icon: "🏥" },
  { id: "SPMS", name: "SPMS", description: "Serviços Partilhados do Ministério da Saúde", icon: "🏛️" },
  { id: "SNS", name: "SNS", description: "Serviço Nacional de Saúde - Portal central", icon: "🏥" },
];

const environments = [
  { value: "development", label: "Desenvolvimento", color: "bg-gray-500" },
  { value: "sandbox", label: "Sandbox (Testes)", color: "bg-yellow-500" },
  { value: "production", label: "Produção", color: "bg-green-500" },
];

export function SaudeLigacoesClient() {
  const [connections, setConnections] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    provider_id: "SNS24" as "SNS24" | "SPMS" | "SNS",
    environment: "development" as "development" | "sandbox" | "production",
    scopes: [] as string[],
  });

  const loadConnections = async () => {
    try {
      const res = await fetch("/api/saude/connections");
      if (res.ok) {
        const data = await res.json();
        setConnections(data);
      }
    } catch (err) {
      console.error("[Saúde] Failed to load connections:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    try {
      const res = await fetch("/api/saude/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        const data = await res.json();
        setConnections([data, ...connections]);
        setShowForm(false);
        setFormData({ provider_id: "SNS24", environment: "development", scopes: [] });
      } else {
        const error = await res.json();
        alert(error.error || "Erro ao criar ligação");
      }
    } catch (err) {
      console.error("[Saúde] Failed to create connection:", err);
      alert("Erro ao criar ligação");
    }
  };

  const handleDelete = async (connectionId: string) => {
    if (!confirm("Tem a certeza que quer eliminar esta ligação?")) return;
    try {
      const res = await fetch(`/api/saude/connections/${connectionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConnections(connections.filter((c) => c.id !== connectionId));
      } else {
        alert("Erro ao eliminar ligação");
      }
    } catch (err) {
      console.error("[Saúde] Failed to delete connection:", err);
      alert("Erro ao eliminar ligação");
    }
  };

  const handleTest = async (connectionId: string) => {
    try {
      const res = await fetch(`/api/saude/connections/${connectionId}/test`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        alert("Ligação testada com sucesso!");
        loadConnections();
      } else {
        alert(data.error || "Erro ao testar ligação");
      }
    } catch (err) {
      console.error("[Saúde] Failed to test connection:", err);
      alert("Erro ao testar ligação");
    }
  };

  const connectionCards = connections.map((conn) => (
    <div key={conn.id} className="card p-4" style={{ border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
        <span style={{ fontSize: 24 }}>{providers.find(p => p.id === conn.provider_id)?.icon || "🏥"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{providers.find(p => p.id === conn.provider_id)?.name || conn.provider_id}</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {environments.find(e => e.value === conn.environment)?.label} • {conn.scopes.length} scope(s)
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`badge ${conn.status === "CONNECTED" ? "bg-green-100 text-green-800" : conn.status === "ERROR" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"}`} style={{ fontSize: 11, padding: "2px 8px" }}>
            {conn.status}
          </span>
          <button className="button secondary" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => handleTest(conn.id)}>
            Testar
          </button>
          <button className="button secondary" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => handleDelete(conn.id)}>
            Eliminar
          </button>
        </div>
      </div>
    </div>
  ));

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Ligações aos Serviços de Saúde</h2>

      <p className="text-sm text-muted mb-4">
        Configure as ligações aos serviços oficiais de saúde (SNS 24, SPMS, SNS).
        Requer credenciais oficiais e onboarding autorizado.
      </p>

      {/* Connections List */}
      <div className="card p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">Ligações Configuradas</h3>
          <button className="button primary" onClick={() => { setFormData({ provider_id: "SNS24", environment: "development", scopes: [] }); setShowForm(true); }}>
            Nova Ligação
          </button>
        </div>

        {connections.length === 0 ? (
          <div className="empty-state" style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
            <h3 style={{ margin: "0 0 8px" }}>Nenhuma ligação configurada</h3>
            <p style={{ color: "var(--muted)", margin: 0 }}>Crie a sua primeira ligação a um serviço de saúde</p>
          </div>
        ) : (
          <div className="space-y-3">
            {connectionCards}
          </div>
        )}</div>

      {/* New Connection Form */}
      {showForm && (
        <div className="card p-4" style={{ border: "1px solid var(--border)" }}>
          <h3 style={{ marginBottom: 16, fontWeight: 600 }}>{formData.provider_id === "SNS24" ? "Nova Ligação SNS 24" : "Nova Ligação"}</h3>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Fornecedor</label>
                <select
                  value={formData.provider_id}
                  onChange={(e) => setFormData({ ...formData, provider_id: e.target.value as any })}
                  className="input"
                  style={{ width: "100%", padding: "8px 12px" }}
                >
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Ambiente</label>
                <select
                  value={formData.environment}
                  onChange={(e) => setFormData({ ...formData, environment: e.target.value as any })}
                  className="input"
                  style={{ width: "100%", padding: "8px 12px" }}
                >
                  {environments.map(e => (
                    <option key={e.value} value={e.value}>{e.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 500 }}>
                Scopes ({formData.scopes.length} selecionados)
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[
                  "health.read.profile",
                  "health.read.prescriptions",
                  "health.read.medications",
                  "health.read.vaccinations",
                  "health.read.appointments",
                  "health.read.exams",
                  "health.read.documents",
                  "health.read.notifications",
                ].map((scope) => (
                  <label key={scope} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={formData.scopes.includes(scope)}
                      onChange={(e) => setFormData({
                        ...formData,
                        scopes: e.target.checked
                          ? [...formData.scopes, scope]
                          : formData.scopes.filter(s => s !== scope)
                      })}
                    />
                    <span style={{ fontSize: 13 }}>{scope}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
              <button type="button" className="button secondary" onClick={() => { setShowForm(false); setFormData({ provider_id: "SNS24", environment: "development", scopes: [] }); }}>
                Cancelar
              </button>
              <button type="submit" className="button primary">
                {formData.provider_id === "SNS24" ? "Criar Ligação SNS 24" : "Criar Ligação"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}