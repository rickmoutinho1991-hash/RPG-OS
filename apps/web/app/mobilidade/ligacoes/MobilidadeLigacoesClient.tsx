"use client";

import { useState, useEffect } from "react";

type MobilityProviderId = "ViaVerde" | "CTTPortagens" | "IMT";
type MobilityEnvironment = "development" | "sandbox" | "production";

interface MobilityConnection {
  id: string;
  provider_id: MobilityProviderId;
  environment: MobilityEnvironment;
  status: string;
  scopes: string[];
}

const providers = [
  { id: "ViaVerde", name: "Via Verde", description: "Portagens, estacionamento, carregamentos el\u00E9tricos", icon: "\uD83D\uDE97" },
  { id: "CTTPortagens", name: "CTT Portagens", description: "P\u00F3s-pagamento, TollCard, pagamentos MB", icon: "\uD83D\uDE9A" },
  { id: "IMT", name: "IMT", description: "Registo nacional, ve\u00EDculos, matr\u00EDculas", icon: "\uD83C\uDDF5\uD83C\uDDF9" },
];

const environments = [
  { value: "development", label: "Desenvolvimento", color: "bg-gray-500" },
  { value: "sandbox", label: "Sandbox (Testes)", color: "bg-yellow-500" },
  { value: "production", label: "Produ\u00E7\u00E3o", color: "bg-green-500" },
];

export function MobilidadeLigacoesClient({ ctx }: { ctx: any }) {
  const [connections, setConnections] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    provider_id: "ViaVerde" as "ViaVerde" | "CTTPortagens" | "IMT",
    environment: "development" as "development" | "sandbox" | "production",
    scopes: [] as string[],
  });

  const loadConnections = async () => {
    try {
      const res = await fetch("/api/mobilidade/connections");
      if (res.ok) {
        const data = await res.json();
        setConnections(data);
      }
    } catch (err) {
      console.error("[Mobilidade] Failed to load connections:", err);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch("/api/mobilidade/connections");
        if (res.ok) {
          const data = await res.json();
          if (!ignore) setConnections(data);
        }
      } catch (err) {
        console.error("[Mobilidade] Failed to load connections:", err);
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/mobilidade/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        const data = await res.json();
        setConnections([data, ...connections]);
        setShowForm(false);
        setFormData({ provider_id: "ViaVerde", environment: "development", scopes: [] });
      } else {
        const error = await res.json();
        alert(error.error || "Erro ao criar liga\u00E7\u00E3o");
      }
    } catch (err) {
      console.error("[Mobilidade] Failed to create connection:", err);
      alert("Erro ao criar liga\u00E7\u00E3o");
    }
  };

  const handleDelete = async (connectionId: string) => {
    if (!confirm("Tem a certeza que quer eliminar esta liga\u00E7\u00E3o?")) return;
    try {
      const res = await fetch(`/api/mobilidade/connections/${connectionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConnections(connections.filter((c) => c.id !== connectionId));
      } else {
        alert("Erro ao eliminar liga\u00E7\u00E3o");
      }
    } catch (err) {
      console.error("[Mobilidade] Failed to delete connection:", err);
      alert("Erro ao eliminar liga\u00E7\u00E3o");
    }
  };

  const handleTest = async (connectionId: string) => {
    try {
      const res = await fetch(`/api/mobilidade/connections/${connectionId}/test`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        alert("Liga\u00E7\u00E3o testada com sucesso!");
        loadConnections();
      } else {
        alert(data.error || "Erro ao testar liga\u00E7\u00E3o");
      }
    } catch (err) {
      console.error("[Mobilidade] Failed to test connection:", err);
      alert("Erro ao testar liga\u00E7\u00E3o");
    }
  };

  const connectionCards = connections.map((conn) => (
    <div key={conn.id} className="card p-4" style={{ border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
        <span style={{ fontSize: 24 }}>{["ViaVerde", "CTTPortagens", "IMT"].includes(conn.provider_id) ? (conn.provider_id === "ViaVerde" ? "\uD83D\uDE97" : conn.provider_id === "CTTPortagens" ? "\uD83D\uDE9A" : "\uD83C\uDDF5\uD83C\uDDF9") : "\uD83D\uDE97"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>
            {conn.provider_id === "ViaVerde" ? "Via Verde" : conn.provider_id === "CTTPortagens" ? "CTT Portagens" : "IMT"}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {["development", "sandbox", "production"].includes(conn.environment) ? (conn.environment === "development" ? "Desenvolvimento" : conn.environment === "sandbox" ? "Sandbox (Testes)" : "Produ\u00E7\u00E3o") : conn.environment} \u2022 {conn.scopes.length} escopo(s)
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`badge ${conn.status === "CONNECTED" ? "bg-green-100 text-green-800" : conn.status === "ERROR" ? "bg-red-100 text-red-800" : conn.status === "PREPARED_ONLY" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}`} style={{ fontSize: 11, padding: "2px 8px" }}>
            {conn.status === "PREPARED_ONLY" ? "Preparado" : conn.status}
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
      <h2 className="text-lg font-medium">Liga\u00E7\u00F5es aos Servi\u00E7os de Mobilidade</h2>

      <p className="text-sm text-muted mb-4">
        Configure as liga\u00E7\u00F5es aos servi\u00E7os oficiais de mobilidade (Via Verde, CTT Portagens, IMT).
        Requer credenciais oficiais e onboarding autorizado.
      </p>

      {/* Connections List */}
      <div className="card p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">Liga\u00E7\u00F5es Configuradas</h3>
          <button className="button primary" onClick={() => { setFormData({ provider_id: "ViaVerde", environment: "development", scopes: [] }); setShowForm(true); }}>
            Nova Liga\u00E7\u00E3o
          </button>
        </div>

        {connections.length === 0 ? (
          <div className="empty-state" style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
            <h3 style={{ margin: "0 0 8px" }}>Nenhuma liga\u00E7\u00E3o configurada</h3>
            <p style={{ color: "var(--muted)", margin: 0 }}>Crie a sua primeira liga\u00E7\u00E3o a um servi\u00E7o de mobilidade</p>
          </div>
        ) : (
          <div className="space-y-3">
            {connectionCards}
          </div>
        )}</div>

      {/* New Connection Form */}
      {showForm && (
        <div className="card p-4" style={{ border: "1px solid var(--border)" }}>
          <h3 style={{ marginBottom: 16, fontWeight: 600 }}>
            {formData.provider_id === "ViaVerde" ? "Nova Liga\u00E7\u00E3o Via Verde" : formData.provider_id === "CTTPortagens" ? "Nova Liga\u00E7\u00E3o CTT Portagens" : "Nova Liga\u00E7\u00E3o IMT"}
          </h3>
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
                  {["ViaVerde", "CTTPortagens", "IMT"].map(p => (
                    <option key={p} value={p}>{p === "ViaVerde" ? "Via Verde" : p === "CTTPortagens" ? "CTT Portagens" : "IMT"}</option>
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
                  {["development", "sandbox", "production"].map(e => (
                    <option key={e} value={e}>{e === "development" ? "Desenvolvimento" : e === "sandbox" ? "Sandbox (Testes)" : "Produ\u00E7\u00E3o"}</option>
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
                  "mobility.read.profile",
                  "mobility.read.vehicles",
                  "mobility.read.tolls",
                  "mobility.read.debts",
                  "mobility.read.payments",
                  "mobility.read.documents",
                  "mobility.read.notifications",
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
              <button type="button" className="button secondary" onClick={() => { setShowForm(false); setFormData({ provider_id: "ViaVerde", environment: "development", scopes: [] }); }}>
                Cancelar
              </button>
              <button type="submit" className="button primary">
                {formData.provider_id === "ViaVerde" ? "Criar Liga\u00E7\u00E3o Via Verde" : formData.provider_id === "CTTPortagens" ? "Criar Liga\u00E7\u00E3o CTT Portagens" : "Criar Liga\u00E7\u00E3o IMT"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}