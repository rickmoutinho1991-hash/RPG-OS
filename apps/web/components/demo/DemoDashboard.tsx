/**
 * RPG-OS — Dashboard do MODO DEMONSTRAÇÃO (?demo=1, ALLOW_DEMO_ACCESS dev-only).
 * Renderiza APENAS dados sintéticos (lib/demo/dashboardStory.ts) — zero Supabase,
 * zero createAdminClient, zero RLS bypass. Banner fixo avisa o visitante.
 */
import Link from "next/link";
import {
  demoAuditLogs,
  demoDashboardBanner,
  demoMetrics,
  demoProjects,
  demoQuotes,
  demoReminders,
  demoUpcomingEvents,
} from "@/lib/demo/dashboardStory";

export function DemoDashboard() {
  return (
    <main>
      <div
        style={{
          background: "#d97706",
          color: "#fff",
          padding: "10px 16px",
          borderRadius: "8px",
          fontWeight: 600,
          marginBottom: "20px",
          textAlign: "center",
          fontSize: "13px",
        }}
      >
        {demoDashboardBanner}
      </div>

      <div
        className="card"
        style={{ padding: "24px", textAlign: "center", marginBottom: "20px" }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: "clamp(22px, 3vw, 30px)" }}>
          Painel de demonstração RPG-OS
        </h1>
        <p style={{ color: "var(--muted)", margin: 0, maxWidth: "560px", marginInline: "auto" }}>
          Veja como o dashboard organiza clientes, obras, orçamentos, faturação,
          agenda e auditoria — com dados fictícios. Crie uma conta para ver os
          seus próprios dados.
        </p>
      </div>

      <div
        className="metrics"
        style={{ marginTop: "20px", display: "grid", gap: "12px" }}
      >
        <div className="card">
          <span className="metric-label">Clientes Registados</span>
          <strong className="metric-value">{demoMetrics.clientes}</strong>
          <span className="metric-change success">Base fictícia</span>
        </div>
        <div className="card">
          <span className="metric-label">Obras e Projetos</span>
          <strong className="metric-value">{demoMetrics.obras}</strong>
          <span className="metric-change success">Em acompanhamento</span>
        </div>
        <div className="card">
          <span className="metric-label">Orçamentos Emitidos</span>
          <strong className="metric-value">{demoMetrics.orcamentos}</strong>
          <span className="metric-change">Propostas ativas</span>
        </div>
        <div className="card">
          <span className="metric-label">Faturação Global</span>
          <strong className="metric-value">
            €{demoMetrics.faturacao.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
          </strong>
          <span className="metric-change success">
            Cobrado: €{demoMetrics.recebido.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: "24px" }}>
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>📅 Próximos Compromissos &amp; Agenda</h3>
          <div className="list">
            {demoUpcomingEvents.map((ev) => (
              <div key={ev.id} className="list-row">
                <div>
                  <div className="list-title"><strong>{ev.title}</strong></div>
                  <div className="list-subtitle">
                    🕒 {new Date(ev.start_time).toLocaleString("pt-PT")}{" "}
                    {ev.location ? `• 📍 ${ev.location}` : ""}
                  </div>
                </div>
                <span className="tag-badge">{ev.event_type}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>⚡ Lembretes &amp; Rotinas Diárias</h3>
          <div className="list">
            {demoReminders.map((r) => (
              <div key={r.id} className="list-row">
                <div>
                  <div className="list-title"><strong>{r.title}</strong></div>
                  <div className="list-subtitle">
                    {r.scheduled_time && `⏰ ${r.scheduled_time} `}
                    {r.dosage && `• Dose: ${r.dosage}`}
                  </div>
                </div>
                <span className={`badge ${r.is_completed_today ? "success" : "warning"}`}>
                  {r.is_completed_today ? "Concluído" : "Pendente"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: "24px" }}>
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Obras Recentes</h3>
          <div className="list">
            {demoProjects.map((p) => (
              <div key={p.id} className="list-row">
                <div>
                  <div className="list-title"><strong>{p.code} — {p.title}</strong></div>
                  <div className="list-subtitle">
                    Progresso: {p.progress_percentage}% • Orçamento: €
                    {Number(p.budget_estimated).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <span className={`badge ${p.status === "IN_PROGRESS" ? "warning" : "success"}`}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Orçamentos Recentes</h3>
          <div className="list">
            {demoQuotes.map((q) => (
              <div key={q.id} className="list-row">
                <div>
                  <div className="list-title"><strong>{q.quote_number} — {q.title}</strong></div>
                  <div className="list-subtitle">
                    Valor Total: €{Number(q.total).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <span className="badge success">{q.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <h3 style={{ margin: "0 0 12px" }}>Atividade do Sistema (fictícia)</h3>
        <div className="list">
          {demoAuditLogs.map((log) => (
            <div key={log.id} className="list-row">
              <div>
                <div className="list-title">{log.action}</div>
                <div className="list-subtitle">
                  Módulo: {log.module} • {new Date(log.timestamp).toLocaleString("pt-PT")}
                </div>
              </div>
              <span className="tag-badge">Auditado</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: "28px" }}>
        <Link href="/registo" className="button">
          Criar conta gratuita
        </Link>
      </div>
    </main>
  );
}