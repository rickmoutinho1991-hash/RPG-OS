"use client";

/**
 * Cartões de ações do Assistente de Vida (shared /vida e /ia).
 * Ações financeiras (requiresConfirmation) obrigam a "Confirmar" antes de
 * "Executar"; as restantes têm passo único a partir da proposta.
 * As transições chamam server actions com autorização + RLS do lado do servidor.
 */
import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";
import {
  cancelActionAction,
  confirmActionAction,
  executeActionAction,
} from "@/lib/actionPlans/actions";

export interface ActionCardItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  reason: string;
  impact: string;
  priority: string;
  status: string;
  requiresConfirmation: boolean;
  failedReason?: string | null;
}

const PRIORITY_BADGE: Record<string, { color: string; bg: string }> = {
  CRITICAL: { color: "#b91c1c", bg: "#fee2e2" },
  HIGH: { color: "#b45309", bg: "#fef3c7" },
  NORMAL: { color: "#1d4ed8", bg: "#dbeafe" },
  INFO: { color: "#475569", bg: "#e2e8f0" },
};

const STATUS_LABEL: Record<string, string> = {
  PROPOSED: "Proposta",
  CONFIRMED: "Confirmada",
  EXECUTED: "Executada",
  CANCELLED: "Cancelada",
  FAILED: "Falhou",
};

function ActionButtons({
  item,
  onChanged,
}: {
  item: ActionCardItem;
  onChanged?: (id: string, status: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(kind: "confirm" | "execute" | "cancel") {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    let res: { ok: boolean; error?: string };
    try {
      if (kind === "confirm") res = await confirmActionAction(item.id);
      else if (kind === "execute") res = await executeActionAction(item.id);
      else res = await cancelActionAction(item.id);
    } catch (err) {
      res = { ok: false, error: err instanceof Error ? err.message : "ERRO" };
    }
    setBusy(false);
    if (!res.ok) {
      setNotice(res.error ?? "Não foi possível concluir esta operação.");
      return;
    }
    const newStatus = kind === "cancel" ? "CANCELLED" : kind === "confirm" ? "CONFIRMED" : "EXECUTED";
    onChanged?.(item.id, newStatus);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {item.status === "PROPOSED" && item.requiresConfirmation && (
          <button type="button" className="button secondary" style={{ padding: "5px 10px", fontSize: "12px" }} disabled={busy} onClick={() => run("confirm")}>
            ✅ Confirmar
          </button>
        )}
        {item.status === "CONFIRMED" && (
          <button type="button" className="button" style={{ padding: "5px 10px", fontSize: "12px" }} disabled={busy} onClick={() => run("execute")}>
            ⚙️ Executar
          </button>
        )}
        {item.status === "PROPOSED" && !item.requiresConfirmation && (
          <button type="button" className="button" style={{ padding: "5px 10px", fontSize: "12px" }} disabled={busy} onClick={() => run("execute")}>
            ⚙️ Executar
          </button>
        )}
        {(item.status === "PROPOSED" || item.status === "CONFIRMED") && (
          <button type="button" className="button secondary" style={{ padding: "5px 10px", fontSize: "12px" }} disabled={busy} onClick={() => run("cancel")}>
            ✕ Cancelar
          </button>
        )}
      </div>
      {notice && (
        <span style={{ fontSize: "11px", color: "#b91c1c", maxWidth: "220px", textAlign: "right" }}>
          {notice}
        </span>
      )}
    </div>
  );
}

export function ActionCardsSection({
  actions,
  title = "⚡ Ações recomendadas pelo assistente",
  emptyText = "Sem ações pendentes. Está tudo em dia.",
  max,
  onChanged,
}: {
  actions: ActionCardItem[];
  title?: string;
  emptyText?: string;
  max?: number;
  onChanged?: (id: string, status: string) => void;
}) {
  const active = useMemo(
    () => actions.filter((a) => a.status === "PROPOSED" || a.status === "CONFIRMED"),
    [actions],
  );
  const history = useMemo(
    () => actions.filter((a) => !(a.status === "PROPOSED" || a.status === "CONFIRMED")),
    [actions],
  );

  const critical = active.filter((a) => a.priority === "CRITICAL" || a.priority === "HIGH");
  const others = active.filter((a) => !(a.priority === "CRITICAL" || a.priority === "HIGH"));
  const confirmedAll = active.filter((a) => a.status === "CONFIRMED");
  const visible = typeof max === "number" ? active.slice(0, max) : active;

  return (
    <div className="card" style={{ marginBottom: "24px" }}>
      <h3 style={{ margin: "0 0 6px", fontSize: "15px" }}>{title}</h3>
      <p style={{ fontSize: "12px", color: "var(--muted)", margin: "0 0 14px" }}>
        O assistente analisa dinheiro, vida e empresa e propõe ações concretas. As
        ações financeiras exigem confirmação explícita antes de executar.
      </p>

      {active.length === 0 ? (
        <div style={{ fontSize: "13px", color: "var(--muted)", padding: "6px 2px" }}>{emptyText}</div>
      ) : (
        <div className="list">
          {visible.map((a) => {
            const badge = PRIORITY_BADGE[a.priority] ?? PRIORITY_BADGE.NORMAL;
            return (
              <div key={a.id} className="list-row" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: "14px" }}>{a.title}</strong>
                    <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "999px", color: badge.color, background: badge.bg, whiteSpace: "nowrap" }}>
                      {a.priority}
                    </span>
                    <span className="tag-badge">{STATUS_LABEL[a.status] ?? a.status}</span>
                  </div>
                  {a.description && (
                    <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "3px" }}>{a.description}</div>
                  )}
                  <div style={{ fontSize: "12px", marginTop: "6px" }}>
                    <span style={{ color: "var(--muted)" }}>Porquê: </span>
                    {a.reason}
                  </div>
                  <div style={{ fontSize: "12px", marginTop: "3px" }}>
                    <span style={{ color: "var(--muted)" }}>Impacto previsto: </span>
                    {a.impact}
                  </div>
                  {a.requiresConfirmation && (
                    <div style={{ fontSize: "11px", marginTop: "4px", color: "#b45309" }}>
                      🔒 Ação financeira — requer confirmação explícita.
                    </div>
                  )}
                </div>
                <ActionButtons item={a} onChanged={onChanged} />
              </div>
            );
          })}
        </div>
      )}

      {critical.length > 0 && (
        <div style={{ fontSize: "12px", marginTop: "12px", color: "var(--muted)" }}>
          ⚠️ {critical.length} com prioridade crítica/alta requerem a tua atenção.
        </div>
      )}
      {others.length > 0 && (
        <div style={{ fontSize: "12px", marginTop: "4px", color: "var(--muted)" }}>
          💡 {others.length} recomendação(ões) adicionais para planeares com calma.
        </div>
      )}
      {confirmedAll.length > 0 && (
        <div style={{ fontSize: "12px", marginTop: "4px", color: "var(--muted)" }}>
          ⏳ {confirmedAll.length} ação(ões) confirmadas aguardam execução.
        </div>
      )}

      {history.length > 0 && (
        <details style={{ marginTop: "14px" }}>
          <summary style={{ fontSize: "12px", color: "var(--muted)", cursor: "pointer" }}>
            Histórico ({history.length})
          </summary>
          <div className="list" style={{ marginTop: "8px" }}>
            {history.map((a) => (
              <div key={a.id} className="list-row" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div className="list-title" style={{ fontSize: "13px" }}>{a.title}</div>
                  <div className="list-subtitle">{STATUS_LABEL[a.status] ?? a.status}{a.failedReason ? ` — ${a.failedReason}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}