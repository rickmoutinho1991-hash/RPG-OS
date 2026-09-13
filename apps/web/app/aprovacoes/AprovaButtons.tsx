"use client";

import { useState, useTransition } from "react";
import { decideWorkflowAction, cancelWorkflowAction } from "./actions";

interface Props {
  instanceId: string;
  isApprover: boolean;
  isRequester: boolean;
}

export function AprovaButtons({ instanceId, isApprover, isRequester }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showRejectNote, setShowRejectNote] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setFeedback(null);
    startTransition(async () => {
      const res = await action();
      if (!res.success) {
        setFeedback({ type: "error", text: res.error ?? "Operação falhou." });
      }
    });
  }

  return (
    <div className="list-actions">
      {isApprover && (
        <>
          <button
            type="button"
            className="button"
            style={{ padding: "5px 10px", fontSize: "12px", background: "#15803d" }}
            disabled={isPending}
            onClick={() => run(() => decideWorkflowAction(instanceId, "APPROVED"))}
          >
            ✓ Aprovar
          </button>

          {showRejectNote ? (
            <div className="reject-box">
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Motivo da rejeição (obrigatório)"
                rows={2}
                style={{ fontSize: 12 }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="button"
                  style={{ padding: "4px 8px", fontSize: "11px", background: "#b91c1c" }}
                  disabled={isPending || rejectNote.trim().length === 0}
                  onClick={() => {
                    const note = rejectNote.trim();
                    run(() => decideWorkflowAction(instanceId, "REJECTED", note));
                  }}
                >
                  Confirmar rejeição
                </button>
                <button
                  type="button"
                  className="button secondary"
                  style={{ padding: "4px 8px", fontSize: "11px" }}
                  onClick={() => {
                    setShowRejectNote(false);
                    setRejectNote("");
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="button secondary"
              style={{ padding: "5px 8px", fontSize: "12px", color: "#b91c1c" }}
              disabled={isPending}
              onClick={() => setShowRejectNote(true)}
            >
              ✕ Rejeitar
            </button>
          )}
        </>
      )}

      {isRequester && (
        <button
          type="button"
          className="button secondary"
          style={{ padding: "5px 8px", fontSize: "12px" }}
          disabled={isPending}
          onClick={() => run(() => cancelWorkflowAction(instanceId))}
        >
          Cancelar pedido
        </button>
      )}

      {isPending && <span style={{ fontSize: 11, color: "var(--muted)" }}>A processar…</span>}
      {feedback && (
        <span
          role="alert"
          style={{
            fontSize: 11,
            color: feedback.type === "error" ? "#b91c1c" : "#15803d",
          }}
        >
          {feedback.text}
        </span>
      )}
    </div>
  );
}