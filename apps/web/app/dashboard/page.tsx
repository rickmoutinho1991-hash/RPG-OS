import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import { SectionHeader } from "@/components/ui/SectionHeader";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const supabase = createAdminClient();

  const userId = user?.id || "00000000-0000-0000-0000-000000000000";
  const companyId = user?.companyId;

  let projectsQuery = supabase
    .from("projects")
    .select("id, title, code, status, budget_estimated, progress_percentage")
    .order("created_at", { ascending: false })
    .limit(5);

  let quotesQuery = supabase
    .from("quotes")
    .select("id, title, quote_number, status, total")
    .order("created_at", { ascending: false })
    .limit(5);

  let invoicesQuery = supabase.from("invoices").select("total, amount_paid");

  let auditQuery = supabase
    .from("audit_logs")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(6);

  let profilesQuery = supabase.from("profiles").select("id", { count: "exact", head: true });

  if (companyId) {
    projectsQuery = projectsQuery.eq("company_id", companyId);
    quotesQuery = quotesQuery.eq("company_id", companyId);
    invoicesQuery = invoicesQuery.eq("company_id", companyId);
    auditQuery = auditQuery.eq("company_id", companyId);
    profilesQuery = profilesQuery.eq("company_id", companyId);
  }

  // Contadores e métricas em tempo real
  const [clientsRes, projectsRes, quotesRes, invoicesRes, recentAuditRes, eventsRes, remindersRes] = await Promise.all([
    profilesQuery,
    projectsQuery,
    quotesQuery,
    invoicesQuery,
    auditQuery,
    supabase.from("calendar_events").select("*").eq("user_id", userId).eq("is_completed", false).order("start_time", { ascending: true }).limit(4),
    supabase.from("personal_reminders").select("*").eq("user_id", userId).limit(4),
  ]);

  const totalClientes = clientsRes.count || 0;
  const recentProjects = projectsRes.data || [];
  const recentQuotes = quotesRes.data || [];
  const auditLogs = recentAuditRes.data || [];
  const upcomingEvents = eventsRes.data || [];
  const activeReminders = remindersRes.data || [];

  const totalFaturacao = (invoicesRes.data || []).reduce((sum, inv) => sum + Number(inv.total || 0), 0);
  const totalRecebido = (invoicesRes.data || []).reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0);

  return (
    <main>
      <SectionHeader
        title="Dashboard Geral"
        description="Visão estratégica e operacional integrada da sua empresa no RPG-OS."
        action={
          <div style={{ display: "flex", gap: "10px" }}>
            <Link href="/registo" className="button">
              + Novo Registo
            </Link>
            <Link href="/orcamentos/novo" className="button secondary">
              + Novo Orçamento
            </Link>
          </div>
        }
      />

      <div className="metrics" style={{ marginTop: "20px" }}>
        <div className="card">
          <span className="metric-label">Clientes Registados</span>
          <strong className="metric-value">{totalClientes}</strong>
          <span className="metric-change success">Base de clientes ativa</span>
        </div>

        <div className="card">
          <span className="metric-label">Obras e Projetos</span>
          <strong className="metric-value">{recentProjects.length}</strong>
          <span className="metric-change success">Em acompanhamento</span>
        </div>

        <div className="card">
          <span className="metric-label">Orçamentos Emitidos</span>
          <strong className="metric-value">{recentQuotes.length}</strong>
          <span className="metric-change">Propostas ativas</span>
        </div>

        <div className="card">
          <span className="metric-label">Faturação Global</span>
          <strong className="metric-value">€{totalFaturacao.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</strong>
          <span className="metric-change success">Cobrado: €{totalRecebido.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: "24px" }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0 }}>📅 Próximos Compromissos & Agenda</h3>
            <Link href="/agenda" className="button secondary" style={{ fontSize: "11px", padding: "4px 8px" }}>
              Ver agenda →
            </Link>
          </div>

          {upcomingEvents.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--border)", borderRadius: "8px" }}>
              Nenhum compromisso marcado. <Link href="/agenda" style={{ color: "#2563eb", textDecoration: "underline" }}>Agendar novo</Link>
            </div>
          ) : (
            <div className="list">
              {upcomingEvents.map((ev: any) => (
                <div key={ev.id} className="list-row">
                  <div>
                    <div className="list-title"><strong>{ev.title}</strong></div>
                    <div className="list-subtitle">
                      🕒 {new Date(ev.start_time).toLocaleString("pt-PT")} {ev.location && `• 📍 ${ev.location}`}
                    </div>
                  </div>
                  <span className="tag-badge">{ev.event_type}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0 }}>💊 Medicação & Rotinas Diárias</h3>
            <Link href="/agenda?tab=saude" className="button secondary" style={{ fontSize: "11px", padding: "4px 8px" }}>
              Gerir rotinas →
            </Link>
          </div>

          {activeReminders.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--border)", borderRadius: "8px" }}>
              Nenhuma medicação ou rotina ativa. <Link href="/agenda?tab=saude" style={{ color: "#2563eb", textDecoration: "underline" }}>Configurar toma</Link>
            </div>
          ) : (
            <div className="list">
              {activeReminders.map((r: any) => (
                <div key={r.id} className="list-row">
                  <div>
                    <div className="list-title"><strong>{r.title}</strong></div>
                    <div className="list-subtitle">
                      {r.scheduled_time && `⏰ ${r.scheduled_time.slice(0, 5)} `}
                      {r.dosage && `• Dose: ${r.dosage}`}
                    </div>
                  </div>
                  <span className={`badge ${r.is_completed_today ? "success" : "warning"}`}>
                    {r.is_completed_today ? "Tomado" : "Pendente"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: "24px" }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0 }}>Obras Recentes</h3>
            <Link href="/obras" className="button secondary" style={{ fontSize: "11px", padding: "4px 8px" }}>
              Ver todas →
            </Link>
          </div>

          {recentProjects.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--border)", borderRadius: "8px" }}>
              Ainda não existem obras registadas. <Link href="/obras/nova" style={{ color: "#2563eb", textDecoration: "underline" }}>Criar primeira obra</Link>
            </div>
          ) : (
            <div className="list">
              {recentProjects.map((p) => (
                <div key={p.id} className="list-row">
                  <div>
                    <Link href={`/obras/${p.id}`} className="list-title" style={{ color: "#111827" }}>
                      {p.code} — {p.title}
                    </Link>
                    <div className="list-subtitle">
                      Progresso: {p.progress_percentage}% • Orçamento: €{Number(p.budget_estimated).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <span className={`badge ${p.status === "IN_PROGRESS" ? "warning" : p.status === "COMPLETED" ? "success" : ""}`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0 }}>Orçamentos Recentes</h3>
            <Link href="/orcamentos" className="button secondary" style={{ fontSize: "11px", padding: "4px 8px" }}>
              Ver todos →
            </Link>
          </div>

          {recentQuotes.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--border)", borderRadius: "8px" }}>
              Ainda não existem orçamentos criados. <Link href="/orcamentos/novo" style={{ color: "#2563eb", textDecoration: "underline" }}>Criar orçamento</Link>
            </div>
          ) : (
            <div className="list">
              {recentQuotes.map((q) => (
                <div key={q.id} className="list-row">
                  <div>
                    <Link href={`/orcamentos/${q.id}`} className="list-title" style={{ color: "#111827" }}>
                      {q.quote_number} — {q.title}
                    </Link>
                    <div className="list-subtitle">
                      Valor Total: €{Number(q.total).toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <span className={`badge ${q.status === "CONVERTED_TO_PROJECT" || q.status === "ACCEPTED" ? "success" : "warning"}`}>
                    {q.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ margin: 0 }}>Atividade e Eventos do Sistema</h3>
          <Link href="/auditoria" className="button secondary" style={{ fontSize: "11px", padding: "4px 8px" }}>
            Registo completo →
          </Link>
        </div>

        {auditLogs.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "13px" }}>Sem atividade recente registada.</p>
        ) : (
          <div className="list">
            {auditLogs.map((log: any) => (
              <div key={log.id} className="list-row">
                <div>
                  <div className="list-title">{log.action}</div>
                  <div className="list-subtitle">Módulo: {log.module} • {new Date(log.timestamp).toLocaleString("pt-PT")}</div>
                </div>
                <span className="tag-badge">Auditado</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
