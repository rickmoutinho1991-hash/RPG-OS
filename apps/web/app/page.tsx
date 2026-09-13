import Link from "next/link";
import { getSessionContext } from "@/lib/session";
import { getCurrentUser } from "@/lib/supabase/auth";
import { BriefingDemo } from "@/components/public/BriefingDemo";
import { MarketCycleStepper } from "@/components/public/MarketCycleStepper";
import { MultiActorTabs } from "@/components/public/MultiActorTabs";
import { MemoryControlPreview } from "@/components/public/MemoryControlPreview";
import { PublicCTA } from "@/components/public/PublicCTA";
import {
  resolveMode,
  getHeadline,
  getQuickActions,
  collectCommandCenterKPIs,
} from "@/lib/commandCenter";
import {
  collectActionAlerts,
  composeBriefingLines,
  loadMutedCategories,
  type ActionAlert,
} from "@/lib/actionCenter";
import { FactLine } from "@/components/public/FactBadge";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SEVERITY_STYLE: Record<ActionAlert["severity"], string> = {
  URGENT: "#dc2626",
  WARNING: "#d97706",
  INFO: "#2563eb",
  SUCCESS: "#16a34a",
};

export default async function CommandCenterPage() {
  const ctx = await getSessionContext();

  // Visitante não autenticado → apresentação do produto
  if (!ctx) {
    return (
      <main>
        <div
          className="card"
          style={{ textAlign: "center", padding: "48px 24px" }}
        >
          <h1
            style={{ fontSize: "clamp(26px, 4vw, 40px)", margin: "0 0 12px" }}
          >
            Um único lugar para a sua vida e o seu trabalho.
          </h1>
          <p
            style={{
              color: "var(--muted)",
              maxWidth: "640px",
              margin: "0 auto 24px",
            }}
          >
            O RPG-OS organiza tarefas, agenda, documentos, finanças e
            comunicação — para si, para a sua família ou para toda a
            organização. Começa simples e cresce consigo.
          </p>
          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link href="/login" className="button">
              Entrar no RPG-OS
            </Link>
            <Link href="/registo" className="button secondary">
              Criar conta gratuita
            </Link>
          </div>
        </div>

        <div style={{ marginTop: "32px", display: "grid", gap: "24px" }}>
          <BriefingDemo />
          <MarketCycleStepper />
          <MultiActorTabs />
          <MemoryControlPreview />
          <PublicCTA />
        </div>
      </main>
    );
  }

  const mode = resolveMode(ctx);
  // companyId do perfil (eixo company) para scopes company/user.
  // NUNCA organization.id aqui: company_id !== organization_id.
  const currentUser = await getCurrentUser();
  const companyId = currentUser?.companyId ?? null;
  const [alerts, mutedCategories] = await Promise.all([
    collectActionAlerts(ctx, companyId),
    loadMutedCategories(ctx),
  ]);
  const briefing = composeBriefingLines(alerts, { mutedCategories });
  const briefingLines = briefing.lines;
  const quickActions = getQuickActions(ctx);
  const kpis = await collectCommandCenterKPIs(ctx, companyId);
  const supabase = createAdminClient();
  const userId = ctx.user.id;

  const [myTasksRes, todayEventsRes, notifsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_date")
      .eq("assignee_id", userId)
      .not("status", "in", "(DONE,CANCELLED)")
      .order("priority", { ascending: false })
      .limit(6),
    supabase
      .from("calendar_events")
      .select("id, title, start_time, location")
      .eq("user_id", userId)
      .eq("is_completed", false)
      .gte(
        "start_time",
        new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
      )
      .lt("start_time", new Date(new Date().setHours(23, 59, 59)).toISOString())
      .order("start_time", { ascending: true })
      .limit(5),
    supabase
      .from("notifications")
      .select("id, title, category, created_at")
      .eq("user_id", userId)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const myTasks = myTasksRes.data ?? [];
  const todayEvents = todayEventsRes.data ?? [];
  const notifications = notifsRes.data ?? [];
  const openTasksCount = myTasks.length;

  return (
    <main>
      <SectionGreeting
        name={ctx.user.name}
        mode={mode}
        orgName={ctx.organization?.name}
      />

      {/* Action Center */}
      <section aria-label="Centro de ações" style={{ marginTop: "16px" }}>
        <div
          className="card"
          style={{
            borderLeft: `4px solid ${alerts.length > 0 ? SEVERITY_STYLE[alerts[0].severity] : "#16a34a"}`,
          }}
        >
          <h3 style={{ margin: "0 0 8px" }}>
            {briefingLines.length === 0
              ? "✅ Está tudo em ordem — nada precisa da sua atenção."
              : `⚠️ Há ${briefingLines.length} ${briefingLines.length === 1 ? "coisa que precisa" : "coisas que precisam"} da sua atenção.`}
          </h3>
          {briefing.summary && (
            <FactLine kind="INFERENCIA">{briefing.summary}</FactLine>
          )}
          {briefingLines.length > 0 && (
            <div className="list">
              {briefingLines.map((line) => (
                <div key={line.id} style={{ padding: "4px 0" }}>
                  <FactLine kind="FACT">{line.fact}</FactLine>
                  {line.inference && (
                    <FactLine kind="INFERENCIA">{line.inference}</FactLine>
                  )}
                  {line.recommendation && (
                    <FactLine kind="RECOMENDACAO">
                      {line.recommendation}{" "}
                      <Link
                        href={line.href}
                        style={{ color: "#2563eb", textDecoration: "underline" }}
                      >
                        Abrir →
                      </Link>
                    </FactLine>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Quick Actions */}
      <section aria-label="Ações rápidas" style={{ marginTop: "16px" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {quickActions.map((qa) => (
            <Link
              key={qa.label}
              href={qa.href}
              className="button secondary"
              style={{ fontSize: "13px" }}
            >
              {qa.icon} {qa.label}
            </Link>
          ))}
        </div>
      </section>

      {/* KPIs cross-module */}
      {kpis.length > 0 && (
        <section aria-label="Indicadores" style={{ marginTop: "20px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "12px",
            }}
          >
            {kpis.map((kpi) => (
              <Link
                key={kpi.id}
                href={kpi.href}
                className="card"
                style={{
                  textDecoration: "none",
                  padding: "16px",
                  borderLeft: `4px solid ${
                    kpi.severity === "critical"
                      ? "#dc2626"
                      : kpi.severity === "warning"
                        ? "#d97706"
                        : "transparent"
                  }`,
                }}
              >
                <div style={{ fontSize: "20px", marginBottom: "4px" }}>
                  {kpi.icon}
                </div>
                <div
                  style={{
                    fontSize: "22px",
                    fontWeight: 700,
                    lineHeight: 1.2,
                  }}
                >
                  {kpi.value}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--muted)",
                    marginTop: "2px",
                  }}
                >
                  {kpi.label}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Hoje + Tarefas */}
      <div className="grid-2" style={{ marginTop: "20px" }}>
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <h3 style={{ margin: 0 }}>📅 Hoje</h3>
            <Link
              href="/agenda"
              className="button secondary"
              style={{ fontSize: "11px", padding: "4px 8px" }}
            >
              Agenda →
            </Link>
          </div>
          {todayEvents.length === 0 ? (
            <EmptyState
              text="Sem compromissos hoje."
              href="/agenda"
              linkLabel="Agendar algo"
            />
          ) : (
            <div className="list">
              {todayEvents.map((ev) => (
                <div key={ev.id} className="list-row">
                  <div>
                    <div className="list-title">
                      <strong>{ev.title}</strong>
                    </div>
                    <div className="list-subtitle">
                      🕒{" "}
                      {new Date(ev.start_time).toLocaleTimeString("pt-PT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {ev.location ? ` • 📍 ${ev.location}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <h3 style={{ margin: 0 }}>
              ✓ As minhas tarefas ({openTasksCount})
            </h3>
            <Link
              href="/tarefas"
              className="button secondary"
              style={{ fontSize: "11px", padding: "4px 8px" }}
            >
              Todas →
            </Link>
          </div>
          {myTasks.length === 0 ? (
            <EmptyState
              text="Sem tarefas pendentes."
              href="/tarefas"
              linkLabel="Criar tarefa"
            />
          ) : (
            <div className="list">
              {myTasks.map((t) => (
                <div key={t.id} className="list-row">
                  <div>
                    <div className="list-title">{t.title}</div>
                    <div className="list-subtitle">
                      {t.due_date
                        ? `Prazo: ${new Date(t.due_date).toLocaleDateString("pt-PT")}`
                        : "Sem prazo"}
                    </div>
                  </div>
                  <span
                    className={`badge ${t.priority === "URGENT" || t.priority === "HIGH" ? "warning" : ""}`}
                  >
                    {t.priority}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notificações */}
      <div className="card" style={{ marginTop: "20px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          <h3 style={{ margin: 0 }}>🔔 Notificações não lidas</h3>
          <Link
            href="/notificacoes"
            className="button secondary"
            style={{ fontSize: "11px", padding: "4px 8px" }}
          >
            Centro de notificações →
          </Link>
        </div>
        {notifications.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "13px" }}>
            Sem notificações novas.
          </p>
        ) : (
          <div className="list">
            {notifications.map((n) => (
              <div key={n.id} className="list-row">
                <div>
                  <div className="list-title">{n.title}</div>
                  <div className="list-subtitle">{n.category}</div>
                </div>
                <span className="tag-badge">
                  {new Date(n.created_at).toLocaleDateString("pt-PT")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function SectionGreeting({
  name,
  mode,
  orgName,
}: {
  name: string;
  mode: ReturnType<typeof resolveMode>;
  orgName?: string;
}) {
  const headline = getHeadline(mode);
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Bom dia" : hour < 20 ? "Boa tarde" : "Boa noite";
  return (
    <div>
      <span className="topbar-eyebrow">
        {orgName ? `${orgName} • Modo ${modeLabel(mode)}` : "Espaço pessoal"}
      </span>
      <h1 style={{ margin: "4px 0 2px" }}>
        {greeting}, {name}.
      </h1>
      <p style={{ color: "var(--muted)", margin: 0 }}>{headline}</p>
    </div>
  );
}

function modeLabel(mode: string): string {
  const labels: Record<string, string> = {
    INDIVIDUAL: "Individual",
    PROFESSIONAL: "Profissional",
    MANAGER: "Gestão",
    EXECUTIVE: "Executivo",
    ACCOUNTANT: "Contabilidade",
    EMPLOYEE: "Colaborador",
  };
  return labels[mode] ?? mode;
}

function EmptyState({
  text,
  href,
  linkLabel,
}: {
  text: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div
      style={{
        padding: "20px 12px",
        textAlign: "center",
        color: "var(--muted)",
        border: "1px dashed var(--border)",
        borderRadius: "8px",
      }}
    >
      {text}{" "}
      <Link
        href={href}
        style={{ color: "#2563eb", textDecoration: "underline" }}
      >
        {linkLabel}
      </Link>
    </div>
  );
}
