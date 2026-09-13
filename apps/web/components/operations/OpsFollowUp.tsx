"use client";

/**
 * Centro de Operações — criação de follow-up a partir de um alerta.
 * Server action org-scoped; sucesso → router.refresh() para o servidor recalcular.
 */
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { OperationAlert } from "@rpg/core";
import { createOperationsFollowUpAction } from "@/app/operacoes/actions";

const PRIORITY_LABELS: Record<string, string> = {
  URGENT: "Urgente",
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
};

export function OpsFollowUp({
  alert,
  canCreate,
}: {
  alert: OperationAlert;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [title, setTitle] = useState(
    `Follow-up: ${alert.target?.label ?? alert.title}`,
  );
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await createOperationsFollowUpAction({
      alertKind: alert.kind,
      targetLabel: alert.target?.label ?? null,
      title,
      priority,
      dueDate: dueDate || null,
      note: note || null,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? "Não foi possível criar o follow-up.");
      return;
    }
    setSuccess(true);
    router.refresh();
  }, [alert.kind, alert.target?.label, title, priority, dueDate, note, router]);

  if (success) {
    return (
      <span className="badge success" style={{ fontSize: 12 }}>
        Follow-up criado
      </span>
    );
  }

  return (
    <div style={{ maxWidth: 320 }}>
      {!open ? (
        <button
          type="button"
          className="button secondary"
          onClick={() => setOpen(true)}
          disabled={!canCreate}
          title={
            canCreate
              ? "Criar uma tarefa de follow-up"
              : "Sem permissão para criar tarefas"
          }
        >
          + Criar follow-up
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título do follow-up"
            aria-label="Título do follow-up"
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              aria-label="Prioridade"
              style={{ flex: 1 }}
            >
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Prazo"
            />
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota (opcional)"
            aria-label="Nota do follow-up"
            rows={2}
          />
          {error && (
            <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="button"
              onClick={submit}
              disabled={busy || !title.trim()}
            >
              {busy ? "A criar..." : "Criar follow-up"}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}