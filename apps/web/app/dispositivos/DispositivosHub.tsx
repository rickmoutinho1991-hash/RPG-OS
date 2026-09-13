"use client";

import { useState } from "react";

export function DispositivosHub() {
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [smsStatus, setSmsStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [syncData, setSyncData] = useState<any>(null);

  const [testPhone, setTestPhone] = useState("912345678");
  const [testMessage, setTestMessage] = useState(
    "RPG-OS: Lembrete de consulta / visita técnica agendada para hoje às 15:30.",
  );

  async function handleTriggerSync(platform: string) {
    setIsLoading(true);
    setSyncStatus("A sincronizar com o servidor RPG-OS...");
    try {
      const res = await fetch("/api/devices/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "device_current", platform }),
      });
      const data = await res.json();
      setSyncData(data);
      setSyncStatus(
        `Sincronização concluída com sucesso às ${new Date().toLocaleTimeString("pt-PT")}!`,
      );
    } catch {
      setSyncStatus("Erro ao sincronizar dispositivo.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSendPush() {
    setIsLoading(true);
    setPushStatus("A emitir notificação Web Push...");
    try {
      const res = await fetch("/api/devices/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "RPG-OS Notificação",
          message:
            "A sua fatura e agenda foram sincronizadas em tempo real com todos os seus dispositivos.",
          url: "/dashboard",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPushStatus(
          "Notificação emitida e entregue com sucesso aos dispositivos emparelhados!",
        );
      } else {
        setPushStatus(data.error || "Erro no envio.");
      }
    } catch {
      setPushStatus("Erro ao comunicar com gateway de push.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <div className="grid-2">
        {/* Apple Watch & Wear OS */}
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h3 style={{ margin: 0 }}>
              ⌚ Smartwatches (Apple Watch / Wear OS)
            </h3>
            <span className="badge success">Pronto / Ativo</span>
          </div>
          <p
            style={{
              fontSize: "13px",
              color: "var(--muted)",
              marginBottom: "16px",
            }}
          >
            Mostradores com complicações em tempo real para próximas marcações
            de agenda, alertas de medicação e tarefas urgentes.
          </p>
          <div
            style={{
              background: "#f8fafc",
              padding: "12px",
              borderRadius: "8px",
              marginBottom: "16px",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: "#64748b",
                marginBottom: "4px",
              }}
            >
              Visualização da Complicação do Relógio:
            </div>
            <strong style={{ fontSize: "14px", color: "#0f172a" }}>
              {syncData?.smartwatchView?.complications?.modularLarge ||
                "Reunião de Obra às 14:00 (Cascais)"}
            </strong>
            <div
              style={{ fontSize: "12px", color: "#2563eb", marginTop: "4px" }}
            >
              Alerta de Saúde:{" "}
              {syncData?.smartwatchView?.complications?.circularSmall === "✓"
                ? "Rotinas do dia cumpridas"
                : "Medicação agendada pendente"}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="button"
              disabled={isLoading}
              onClick={() => handleTriggerSync("APPLE_WATCH_OS")}
              style={{ fontSize: "12px", padding: "8px 12px" }}
            >
              Testar Sincronização Apple Watch
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={isLoading}
              onClick={() => handleTriggerSync("WEAR_OS")}
              style={{ fontSize: "12px", padding: "8px 12px" }}
            >
              Testar Wear OS (Samsung/Pixel)
            </button>
          </div>
        </div>

        {/* Telemóveis & PWA */}
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h3 style={{ margin: 0 }}>📱 Telemóveis (Android / iOS / PWA)</h3>
            <span className="badge success">PWA Instalável</span>
          </div>
          <p
            style={{
              fontSize: "13px",
              color: "var(--muted)",
              marginBottom: "16px",
            }}
          >
            Aplicação Web Progressiva com suporte offline, cache inteligente de
            orçamentos e sincronização bidirecional.
          </p>
          <div
            style={{
              background: "#f8fafc",
              padding: "12px",
              borderRadius: "8px",
              marginBottom: "16px",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ fontSize: "13px", color: "#334155" }}>
              ✓ <strong>Service Worker:</strong> Ativo para navegação offline.
              <br />✓ <strong>Web Push:</strong> Notificações de novos
              orçamentos, faturas e lembretes.
              <br />✓ <strong>Manifest:</strong> Compatível com instalação
              direta no ecrã inicial.
            </div>
          </div>
          <button
            type="button"
            className="button"
            disabled={isLoading}
            onClick={handleSendPush}
            style={{ fontSize: "12px", padding: "8px 12px" }}
          >
            🔔 Disparar Teste de Notificação Push
          </button>
        </div>
      </div>

      {syncStatus && (
        <div className="alert alert-success" style={{ marginTop: "16px" }}>
          {syncStatus}
        </div>
      )}

      {pushStatus && (
        <div className="alert alert-success" style={{ marginTop: "16px" }}>
          {pushStatus}
        </div>
      )}

      {/* Gateway de Notificações SMS & Chamadas */}
      <div className="card" style={{ marginTop: "24px" }}>
        <h3>📩 Gateway SMS & Notificações Telefónicas</h3>
        <p
          style={{
            fontSize: "13px",
            color: "var(--muted)",
            marginBottom: "16px",
          }}
        >
          Envio de SMS com referências Multibanco, confirmações de marcação de
          agenda e avisos de deslocação.
        </p>

        <div className="form-grid" style={{ maxWidth: "600px" }}>
          <div className="form-field">
            <label>Número de Telemóvel (+351)</label>
            <input
              type="text"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="912345678"
            />
          </div>
          <div className="form-field full">
            <label>Mensagem SMS</label>
            <textarea
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <button
          type="button"
          className="button secondary"
          style={{ marginTop: "12px" }}
          onClick={() => {
            setSmsStatus(
              `SMS simulado e transmitido para o número ${testPhone} com remetente "RPG-OS"!`,
            );
          }}
        >
          Enviar SMS de Teste
        </button>

        {smsStatus && (
          <div className="alert alert-success" style={{ marginTop: "16px" }}>
            {smsStatus}
          </div>
        )}
      </div>
    </div>
  );
}
