import Link from "next/link";
import type { WorkflowStepHistoryEntry, WorkflowStepView } from "@rpg/core";
import { buildWorkflowProgress, buildWorkflowStepHistory } from "@rpg/core";
import { getSessionContext } from "@/lib/session";
import {
  getWorkflowOverview,
  loadDefinitionMap,
  loadWorkflowDecisionHistories,
  WORKFLOW_ENTITY_LABELS,
  type WorkflowApprovalItem,
} from "@/lib/workflows";
import { AprovaButtons } from "./AprovaButtons";
import { WorkflowProgress } from "./WorkflowProgress";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  CANCELLED: "Cancelado",
};

export default async function AprovacoesPage() {
  const ctx = await getSessionContext();
  if (!ctx) {
    return (
      <main>
        <div className="card">Inicie sessão para ver as suas aprovações.</div>
      </main>
    );
  }

  const overview = await getWorkflowOverview(
    ctx.user.id,
    ctx.organization?.id ?? null,
  );

  // Definições de workflow carregadas server-side (em lote, por ID distinto).
  // Workflows sem definitionId (legados) não têm progresso por passos.
  const definitions = await loadDefinitionMap(
    [...overview.pendingForMe, ...overview.myPending, ...overview.recent]
      .map((item) => item.definitionId)
      .filter((v): v is string => Boolean(v)),
  );

  // Histórico auditado das decisões: recolhe os IDs visíveis na página e
  // carrega os audit_logs relevantes em UMA query (nomes resolvidos em batch).
  const visibleIds = [
    ...overview.pendingForMe,
    ...overview.myPending,
    ...overview.recent,
  ].map((item) => item.id);
  const histories = await loadWorkflowDecisionHistories(visibleIds);

  // userId → nome (resolvido server-side pelo loader; sem N+1).
  const nameById = new Map<string, string>();
  for (const events of histories.values()) {
    for (const e of events) {
      if (e.userId && !nameById.has(e.userId)) nameById.set(e.userId, e.actorName);
    }
  }

  /** Associa eventos→passos só para instâncias com definição real. */
  const historyFor = (
    item: WorkflowApprovalItem,
  ): Record<string, WorkflowStepHistoryEntry[]> | undefined => {
    const def = item.definitionId
      ? definitions.get(item.definitionId)
      : undefined;
    const events = histories.get(item.id);
    if (!def || !events || events.length === 0) return undefined;
    return buildWorkflowStepHistory({
      instanceId: item.id,
      steps: def.steps.map((s) => ({ key: s.key })),
      events: events.map((e) => ({
        instanceId: item.id,
        action: e.action,
        userId: e.userId,
        decidedStep: e.decidedStep,
        timestamp: e.timestamp,
      })),
      resolveName: (uid) => nameById.get(uid ?? "") ?? "Utilizador",
    });
  };

  const progressFor = (item: WorkflowApprovalItem): WorkflowStepView[] => {
    const def = item.definitionId
      ? definitions.get(item.definitionId)
      : undefined;
    if (!def) return [];
    return buildWorkflowProgress(def.steps, item.currentStep, item.status);
  };

  const pendingTotal = overview.pendingForMe.length + overview.myPending.length;

  return (
    <main>
      <div className="page-header">
        <div>
          <span className="topbar-eyebrow">Workflows & Aprovações</span>
          <h1>Centro de Aprovações</h1>
          <p style={{ color: "var(--muted)" }}>
            Pedidos que precisam da sua decisão e histórico dos seus pedidos. As
            decisões são registadas em auditoria e notificam as partes.
          </p>
        </div>
      </div>

      <div className="metrics" style={{ marginTop: "20px" }}>
        <div className="card">
          <span className="metric-label">À sua espera de decisão</span>
          <strong className="metric-value">{overview.pendingForMe.length}</strong>
          <span className="metric-change warning">Aguardam resposta</span>
        </div>
        <div className="card">
          <span className="metric-label">Os seus pedidos pendentes</span>
          <strong className="metric-value">{overview.myPending.length}</strong>
          <span className="metric-change">{pendingTotal > 0 ? "Em análise" : "Sem atividade"}</span>
        </div>
        <div className="card">
          <span className="metric-label">Decisões recentes</span>
          <strong className="metric-value">{overview.recent.length}</strong>
          <span className="metric-change success">Registadas em auditoria</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <h3 style={{ marginTop: 0 }}>✔ À sua espera de decisão</h3>
        {overview.pendingForMe.length === 0 ? (
          <EmptyState text="Sem pedidos pendentes para si." />
        ) : (
          <div className="list">
            {overview.pendingForMe.map((item) => (
              <WorkflowRow key={item.id} item={item} isApprover isRequester={false} progress={progressFor(item)} history={historyFor(item)} />
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: "20px" }}>
        <h2 style={{ marginTop: 0 }}>📤 Os seus pedidos (pendentes)</h2>
        {overview.myPending.length === 0 ? (
          <EmptyState text="Não tem pedidos de aprovação por sua conta." />
        ) : (
          <div className="list">
            {overview.myPending.map((item) => (
              <WorkflowRow key={item.id} item={item} isApprover={false} isRequester progress={progressFor(item)} history={historyFor(item)} />
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: "20px" }}>
        <h2 style={{ marginTop: 0 }}>🕘 Decisões recentes</h2>
        {overview.recent.length === 0 ? (
          <EmptyState text="Ainda não existem decisões registadas." />
        ) : (
          <div className="list">
            {overview.recent.map((item) => (
              <WorkflowRow key={item.id} item={item} isApprover={false} isRequester={false} progress={progressFor(item)} history={historyFor(item)} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function WorkflowRow({
  item,
  isApprover,
  isRequester,
  progress = [],
  history,
}: {
  item: WorkflowApprovalItem;
  isApprover: boolean;
  isRequester: boolean;
  /** Vista de passos calculada server-side; vazia nos fluxos legados. */
  progress?: WorkflowStepView[];
  /** Histórico auditado por passo; ausente nos fluxos legados. */
  history?: Record<string, WorkflowStepHistoryEntry[]>;
}) {
  const entityLabel = WORKFLOW_ENTITY_LABELS[item.entityType] ?? item.entityType;
  const canAct = item.status === "PENDING" && (isApprover || isRequester);

  return (
    <div className="list-row" style={{ alignItems: "flex-start", gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div className="list-title">
          {item.title}
          {item.status === "PENDING" && <span aria-label="pendente"> • </span>}
          {(item.status === "PENDING" ? <span className="badge warning">Pendente</span> : null)}
        </div>
        <div className="list-subtitle">
          {entityLabel} • Pedido por {item.requestedByName}
          {item.approverId ? ` → aprovador: ${item.approverName}` : " • sem aprovador designado"}
        </div>
        {item.summary && <div className="list-subtitle">{item.summary}</div>}
        <div className="list-subtitle">
          {new Date(item.createdAt).toLocaleString("pt-PT")}
        </div>
        {progress.length > 0 && (
          <WorkflowProgress steps={progress} history={history} />
        )}
        {item.decisionNote && item.status !== "PENDING" && (
          <div
            className="list-subtitle"
            style={{ color: item.status === "REJECTED" ? "#b91c1c" : "var(--muted)" }}
          >
            Nota: {item.decisionNote}
          </div>
        )}
      </div>

      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
        <span className={`badge ${STATUS_STYLE[item.status] ?? ""}`}>
          {STATUS_LABEL[item.status] ?? item.status}
        </span>
        {item.status === "PENDING" && item.approverId === null && (
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            Fluxo organizacional
          </span>
        )}
        {canAct ? (
          <AprovaButtons instanceId={item.id} isApprover={isApprover} isRequester={isRequester} />
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}