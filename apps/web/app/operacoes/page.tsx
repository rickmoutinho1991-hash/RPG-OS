import Link from "next/link";
import type { ReactNode } from "react";
import { hasPermission, type OperationAlert, type OrgTimelineEntry } from "@rpg/core";
import { getSessionContext } from "@/lib/session";
import { loadOperationsPageData } from "@/lib/operations/service";
import { OpsFollowUp } from "@/components/operations/OpsFollowUp";

export const dynamic = "force-dynamic";

const TONE_STYLE: Record<string, { color: string; bg: string }> = {
  CRITICAL: { color: "#b91c1c", bg: "#fef2f2" },
  ATTENTION: { color: "#b45309", bg: "#fffbeb" },
  CALM: { color: "#15803d", bg: "#f0fdf4" },
};

const SEVERITY_LABEL: Record<string, string> = {
  URGENT: "Critico",
  WARNING: "Atenção",
  INFO: "Info",
};

function euro(n: number): string {
  return n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

export default async function OperacoesPage() {
  const ctx = await getSessionContext();
  if (!ctx) {
    return (
      <main>
        <div className="page-header">
          <span className="topbar-eyebrow">Operações</span>
          <h1>Centro de Operações</h1>
        </div>
        <div className="card">Inicie sessão para ver as operações da sua organização.</div>
      </main>
    );
  }

  if (!hasPermission(ctx.permissions, "operations.view")) {
    return (
      <main>
        <div className="page-header">
          <span className="topbar-eyebrow">Operações</span>
          <h1>Centro de Operações</h1>
        </div>
        <div className="card">
          Sem permissão para aceder ao Centro de Operações. Contacte a administração
          da organização.
        </div>
      </main>
    );
  }

  const data = await loadOperationsPageData(ctx);
  if (!data) {
    return (
      <main>
        <div className="page-header">
          <span className="topbar-eyebrow">Operações</span>
          <h1>Centro de Operações</h1>
        </div>
        <div className="card">Não foi possível carregar as operações.</div>
      </main>
    );
  }

  const { overview, alerts, timeline, flags } = data;
  const tone = TONE_STYLE[overview.tone] ?? TONE_STYLE.ATTENTION;
  const kpi = overview.kpi;

  return (
    <main>
      <div className="page-header">
        <div>
          <span className="topbar-eyebrow">Operações</span>
          <h1>Centro de Operações</h1>
          <p style={{ color: "var(--muted)" }}>
            Painel operacional da organização — indicadores, alertas e atividade,
            calculados a partir dos dados reais. Os follow-ups criados aqui são
            tarefas org-scoped, auditadas e notificadas.
          </p>
        </div>
      </div>

      <div
        className="card"
        style={{
          marginTop: "20px",
          borderLeft: `4px solid ${tone.color}`,
          background: tone.bg,
        }}
      >
        <strong style={{ color: tone.color }}>{overview.statusLabel}</strong>
        <p style={{ margin: "6px 0 0", color: tone.color }}>{overview.summary}</p>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
          Gerado a {new Date(overview.generatedAt).toLocaleString("pt-PT")}
        </p>
      </div>

      <div className="metrics" style={{ marginTop: "24px" }}>
        <Metric label="Tarefas abertas" value={kpi.openTasks} hint={kpi.overdueTasks > 0 ? `${kpi.overdueTasks} atrasadas` : "Em curso"} tone={kpi.overdueTasks > 0 ? "warning" : "success"} />
        <Metric label="Tarefas concluídas (7d)" value={kpi.completedTasks7d} hint="Últimos 7 dias" />
        <Metric label="Aprovações pendentes" value={kpi.pendingApprovals} hint={kpi.staleApprovals > 0 ? `${kpi.staleApprovals} paradas` : "Em análise"} tone={kpi.staleApprovals > 0 ? "warning" : ""} />
        <Metric label="Reclamações sem resposta" value={kpi.unansweredComplaints} hint="A aguardar resposta" tone={kpi.unansweredComplaints > 0 ? "danger" : "success"} />
        <Metric label="Documentos a expirar (14d)" value={kpi.expiringDocuments14d} hint={`${data.documentsTotal} documentos no total`} tone={kpi.expiringDocuments14d > 0 ? "warning" : ""} />
        <Metric label="Contas vencidas" value={kpi.overdueBills} hint={kpi.overdueBills > 0 ? "Regularizar" : "Em dia"} tone={kpi.overdueBills > 0 ? "danger" : "success"} />
        <Metric label="Contas a vencer (7d)" value={kpi.billsDue7d} hint="Próximos 7 dias" tone={kpi.billsDue7d > 0 ? "warning" : ""} />
        <Metric label="Saldo disponível" value={euro(kpi.currentBalance)} hint={kpi.currentBalance < 0 ? "Saldo negativo" : "Saldos agregados"} tone={kpi.currentBalance < 0 ? "danger" : "success"} />
        <Metric label="Membros ativos" value={kpi.activeMembers} hint="Na organização" />
      </div>

      <div className="card" style={{ marginTop: "4px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ marginTop: 0 }}>⚠️ Alertas operacionais</h2>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {data.organizationName ?? "Pessoal"}
          </span>
        </div>
        {alerts.length === 0 ? (
          <p className="empty-state">Sem alertas operacionais de momento.</p>
        ) : (
          <div className="list">
            {alerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} canCreate={flags.canCreateFollowUp} />
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: "20px" }}>
        <h2 style={{ marginTop: 0 }}>🕘 Atividade recente da organização</h2>
        {timeline.length === 0 ? (
          <p className="empty-state">
            Ainda não há atividade registada. As ações operacionais (tarefas,
            aprovações, respostas, auditoria) aparecem aqui.
          </p>
        ) : (
          <div className="list">
            {timeline.map((entry) => (
              <TimelineRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = "",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {hint && <span className={`metric-change ${tone}`}>{hint}</span>}
    </div>
  );
}

function AlertRow({
  alert,
  canCreate,
}: {
  alert: OperationAlert;
  canCreate: boolean;
}) {
  return (
    <div className="list-row" style={{ alignItems: "flex-start", gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div className="list-title">
          {alert.title}
          <span className={`badge ${SEVERITY_STYLE[alert.severity] ?? ""}`}>
            {SEVERITY_LABEL[alert.severity] ?? alert.severity}
          </span>
        </div>
        {alert.detail && <div className="list-subtitle">{alert.detail}</div>}
        {alert.target?.href && (
          <Link className="list-subtitle" href={alert.target.href} style={{ textDecoration: "underline" }}>
            Ver em {alert.target.label}
          </Link>
        )}
      </div>
      <OpsFollowUp alert={alert} canCreate={canCreate} />
    </div>
  );
}

const SEVERITY_STYLE: Record<string, string> = {
  URGENT: "danger",
  WARNING: "warning",
  INFO: "",
};

function TimelineRow({ entry }: { entry: OrgTimelineEntry }) {
  return (
    <div className="list-row" style={{ alignItems: "flex-start", gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div className="list-title">
          {entry.label}
          {entry.kind !== "SYSTEM" && (
            <span className="list-subtitle"> · {entry.kind}</span>
          )}
        </div>
        {entry.detail && <div className="list-subtitle">{entry.detail}</div>}
      </div>
      <div style={{ textAlign: "right" }}>
        <span className="list-subtitle">
          {entry.actorName ? `${entry.actorName} · ` : ""}
          {new Date(entry.timestamp).toLocaleString("pt-PT")}
        </span>
      </div>
    </div>
  );
}