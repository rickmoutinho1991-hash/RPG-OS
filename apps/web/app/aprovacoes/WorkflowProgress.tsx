import {
  WORKFLOW_STEP_VISUAL_LABELS,
  type WorkflowStepHistoryEntry,
  type WorkflowStepVisualState,
  type WorkflowStepView,
} from "@rpg/core";

const dateTimeFmt = new Intl.DateTimeFormat("pt-PT", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDecision(entry: WorkflowStepHistoryEntry): string {
  const verb = entry.decision === "APPROVED" ? "Aprovado" : "Rejeitado";
  const when = entry.timestamp
    ? dateTimeFmt.format(new Date(entry.timestamp))
    : "";
  return `${verb} por ${entry.displayName}${when ? ` · ${when}` : ""}`;
}

const STEP_STYLES: Record<
  WorkflowStepVisualState,
  { color: string; border: string; background: string }
> = {
  done: {
    color: "#15803d",
    border: "rgba(21,128,61,0.45)",
    background: "rgba(21,128,61,0.08)",
  },
  completed: {
    color: "#15803d",
    border: "rgba(21,128,61,0.45)",
    background: "rgba(21,128,61,0.08)",
  },
  current: {
    color: "#b45309",
    border: "rgba(180,83,9,0.55)",
    background: "rgba(245,158,11,0.14)",
  },
  rejected: {
    color: "#b91c1c",
    border: "rgba(185,28,28,0.5)",
    background: "rgba(185,28,28,0.08)",
  },
  cancelled: {
    color: "#6b7280",
    border: "rgba(107,114,128,0.4)",
    background: "transparent",
  },
  future: {
    color: "#6b7280",
    border: "rgba(107,114,128,0.3)",
    background: "transparent",
  },
};

/**
 * Barra de progresso por passos do workflow. Recebe SEMPRE a vista calculada
 * server-side (`buildWorkflowProgress`) e o histórico auditado
 * (`buildWorkflowStepHistory` a partir dos audit_logs) — nunca dados do cliente.
 */
export function WorkflowProgress({
  steps,
  history,
}: {
  steps: WorkflowStepView[];
  /** Histórico real por chave de passo; ausente nos fluxos legados. */
  history?: Record<string, WorkflowStepHistoryEntry[]>;
}) {
  if (!Array.isArray(steps) || steps.length === 0) return null;

  // Factos comprováveis: apenas passos concluídos com evento auditado real.
  const concluded = steps.filter(
    (s) =>
      (s.state === "done" ||
        s.state === "completed" ||
        s.state === "rejected") &&
      history?.[String(s.key).toUpperCase()]?.length,
  );

  return (
    <div
      aria-label="Progresso do fluxo de aprovação"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 4,
        marginTop: 6,
      }}
    >
      {steps.map((step, index) => {
        const meta = WORKFLOW_STEP_VISUAL_LABELS[step.state];
        const style = STEP_STYLES[step.state];
        const permHint = step.requiredPermission
          ? ` · requer "${step.requiredPermission}"`
          : "";
        // Só factos auditados entram no tooltip; passo atual nunca é concluído.
        const events = history?.[String(step.key).toUpperCase()] ?? [];
        const historyHint = events.length
          ? ` · ${events.map(formatDecision).join("; ")}`
          : "";
        return (
          <span
            key={step.key}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <span
              title={`${step.name} — ${meta.label}${permHint}${historyHint}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                lineHeight: "18px",
                padding: "1px 8px",
                borderRadius: 999,
                border: `1px solid ${style.border}`,
                background: style.background,
                color: style.color,
                fontWeight: step.state === "current" ? 600 : 400,
                whiteSpace: "nowrap",
              }}
            >
              <span aria-hidden="true">{meta.icon}</span>
              {step.name}
            </span>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                style={{ color: "var(--muted)", fontSize: 10 }}
              >
                →
              </span>
            )}
          </span>
        );
      })}
      {concluded.length > 0 && (
        <div
          style={{
            width: "100%",
            display: "flex",
            flexWrap: "wrap",
            gap: "2px 12px",
          }}
        >
          {concluded.map((step) => {
            const events =
              history?.[String(step.key).toUpperCase()] ?? [];
            const last = events[events.length - 1];
            if (!last) return null;
            return (
              <span
                key={`hist-${step.key}`}
                style={{
                  fontSize: 10,
                  color: "var(--muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {step.name}: {formatDecision(last)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}