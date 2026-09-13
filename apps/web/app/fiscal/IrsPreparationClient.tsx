"use client";

import { useEffect, useState } from "react";
import {
  createOrRefreshPersonalIrsPreparation,
  getPersonalIrsPreparationView,
  lockPersonalIrsPreparation,
  unlockPersonalIrsPreparation,
  type IrsPreparationView,
} from "./irsPreparationActions";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  READY_FOR_REVIEW: "Pronto para revisão",
  INCOMPLETE: "Incompleto",
  MANUAL_REVIEW: "Requer revisão manual",
  LOCKED: "Bloqueado",
};

const STATUS_BADGE: Record<string, "success" | "warning" | "info" | "secondary"> = {
  DRAFT: "secondary",
  READY_FOR_REVIEW: "success",
  INCOMPLETE: "warning",
  MANUAL_REVIEW: "warning",
  LOCKED: "info",
};

const SECTION_LABEL: Record<string, string> = {
  RENDIMENTOS: "Rendimentos (A/B/E/F/G/H)",
  RETENCOES: "Retenções na fonte",
  PAGAMENTOS_CONTA: "Pagamentos por conta",
  DEDUCOES_COLETA: "Deduções à coleta",
  AGREGADO_FAMILIAR: "Agregado familiar",
  DEPENDENTES: "Dependentes",
  RESIDENCIA_FISCAL: "Residência fiscal",
  BENEFICIOS_FISCAIS: "Benefícios fiscais",
  SITUACOES_ESPECIAIS: "Situações especiais",
};

const SECTION_STATUS_LABEL: Record<string, string> = {
  COMPLETE: "Completo",
  PARTIAL: "Parcial",
  MANUAL_REVIEW: "Revisão manual",
  UNAVAILABLE: "Indisponível",
};

const INCOME_STATUS_LABEL: Record<string, string> = {
  SUPPORTED: "Suportado",
  PARTIAL: "Parcial",
  MANUAL_REVIEW: "Revisão manual",
  UNAVAILABLE: "Indisponível",
};

function euros(cents: number): string {
  return `${(cents / 100).toFixed(2)} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function IrsPreparationClient() {
  const [prep, setPrep] = useState<IrsPreparationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const taxYear = 2026;
  const declarationYear = 2027;

  async function refresh() {
    setLoading(true);
    try {
      const view = await getPersonalIrsPreparationView(taxYear);
      setPrep(view);
    } catch {
      setMessage("Erro ao carregar preparação IRS.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setActionLoading("generate");
    setMessage(null);
    try {
      const res = await createOrRefreshPersonalIrsPreparation({ taxYear, forceRefresh: true });
      if (res.ok && res.preparation) {
        setPrep({
          id: res.preparation.id,
          taxYear: res.preparation.taxYear,
          declarationYear: res.preparation.declarationYear,
          status: res.preparation.status,
          rulesetVersion: res.preparation.rulesetVersion,
          totals: res.preparation.totals,
          sections: res.preparation.sections,
          incomeStatus: res.preparation.incomeStatus,
          unresolvedItems: res.preparation.unresolvedItems,
          provenance: res.preparation.provenance,
          createdAt: res.preparation.createdAt,
          updatedAt: res.preparation.updatedAt,
        });
        setMessage("Preparação IRS gerada/atualizada (draft local, não submetido à AT).");
      } else {
        setMessage(`Não foi possível gerar: ${res.error}`);
      }
    } catch {
      setMessage("Erro inesperado ao gerar preparação.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleLock() {
    setActionLoading("lock");
    try {
      const res = await lockPersonalIrsPreparation(taxYear);
      if (res.ok && res.preparation) {
        setPrep((p) => p ? { ...p, status: res.preparation!.status, updatedAt: res.preparation!.updatedAt } : null);
        setMessage("Preparação bloqueada. Use 'Desbloquear' para permitir nova geração.");
      } else {
        setMessage(`Não foi possível bloquear: ${res.error}`);
      }
    } catch {
      setMessage("Erro inesperado ao bloquear.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUnlock() {
    setActionLoading("unlock");
    try {
      const res = await unlockPersonalIrsPreparation(taxYear);
      if (res.ok && res.preparation) {
        setPrep((p) => p ? { ...p, status: res.preparation!.status, updatedAt: res.preparation!.updatedAt } : null);
        setMessage("Preparação desbloqueada. Pode gerar nova versão.");
      } else {
        setMessage(`Não foi possível desbloquear: ${res.error}`);
      }
    } catch {
      setMessage("Erro inesperado ao desbloquear.");
    } finally {
      setActionLoading(null);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  if (loading) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
          A carregar preparação IRS…
        </div>
      </div>
    );
  }

  if (!prep) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h3 style={{ margin: "0 0 8px" }}>IRS / Modelo 3 — Preparação Local</h3>
          <p style={{ color: "var(--muted)", fontSize: "13px", marginBottom: 16 }}>
            Ano fiscal: <strong>{taxYear}</strong> → Declaração em <strong>{declarationYear}</strong>
          </p>
          <p style={{ color: "var(--muted)", fontSize: "13px", marginBottom: 16 }}>
            Ainda não existe preparação para este ano fiscal.
          </p>
          <button
            type="button"
            className="button"
            onClick={handleGenerate}
            disabled={actionLoading === "generate"}
          >
            {actionLoading === "generate" ? "A gerar…" : "Gerar preparação IRS"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3 style={{ margin: "0 0 4px" }}>IRS / Modelo 3 — Preparação Local</h3>
          <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0 }}>
            Ano fiscal: <strong>{prep.taxYear}</strong> → Declaração em <strong>{prep.declarationYear}</strong>
            {" • "}
            Regras: <code style={{ fontSize: "11px" }}>{prep.rulesetVersion}</code>
            {" • "}
            Não submetido à AT • Não confirmado pela AT
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`badge ${STATUS_BADGE[prep.status] ?? "secondary"}`}>
            {STATUS_LABEL[prep.status] ?? prep.status}
          </span>
          {prep.status !== "LOCKED" && (
            <button
              type="button"
              className="button secondary"
              onClick={handleLock}
              disabled={actionLoading === "lock"}
            >
              Bloquear
            </button>
          )}
          {prep.status === "LOCKED" && (
            <button
              type="button"
              className="button secondary"
              onClick={handleUnlock}
              disabled={actionLoading === "unlock"}
            >
              Desbloquear
            </button>
          )}
          <button
            type="button"
            className="button"
            onClick={handleGenerate}
            disabled={actionLoading === "generate" || prep.status === "LOCKED"}
          >
            {actionLoading === "generate" ? "A gerar…" : "Regenerar"}
          </button>
        </div>
      </div>

      {message && (
        <div className="card" role="status" style={{ marginBottom: 12, fontSize: "13px" }}>
          {message}
        </div>
      )}

      {/* Totals Summary */}
      <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: "14px" }}>Resumo de Deduções Locais (P1/P1.1/P1.2)</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, fontSize: "13px" }}>
          <div>
            <div style={{ color: "var(--muted)", fontSize: "11px" }}>Total Despesas</div>
            <strong>{euros(prep.totals.totalExpensesCents)}</strong>
          </div>
          <div>
            <div style={{ color: "var(--muted)", fontSize: "11px" }}>Dedutível Confirmado</div>
            <strong style={{ color: "#15803d" }}>{euros(prep.totals.deductibleConfirmedCents)}</strong>
          </div>
          <div>
            <div style={{ color: "var(--muted)", fontSize: "11px" }}>Por Validar (Manual Review)</div>
            <strong style={{ color: "#b45309" }}>{euros(prep.totals.pendingValidationCents)}</strong>
          </div>
        </div>
        {Object.keys(prep.totals.byCategory).length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: "12px" }}>
            <div style={{ color: "var(--muted)", marginBottom: 8 }}>Por categoria:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {Object.entries(prep.totals.byCategory).map(([cat, amount]) => (
                <div key={cat} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span className="tag-badge" style={{ fontSize: "10px", textTransform: "lowercase" }}>
                    {cat.replace(/_/g, " ")}
                  </span>
                  <span>{euros(amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sections Completeness */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: "14px" }}>Completude das Secções do Modelo 3</h4>
        <div className="list">
          {prep.sections.map((s) => (
            <div key={s.section} className="list-row">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="tag-badge">{SECTION_LABEL[s.section] ?? s.section}</span>
                  <span className={`badge ${s.status === "COMPLETE" ? "success" : s.status === "PARTIAL" ? "warning" : "secondary"}`}>
                    {SECTION_STATUS_LABEL[s.status]}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: 4 }}>
                  {s.detail}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Income Categories Status */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: "14px" }}>Categorias de Rendimento (IRS)</h4>
        <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: 12 }}>
          Estado de suporte local. Indisponível = sem modelo de rendimentos implementado no RPG-OS.
        </p>
        <div className="list">
          {prep.incomeStatus.map((s) => (
            <div key={s.category} className="list-row">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong style={{ minWidth: "30px" }}>Categoria {s.category}</strong>
                  <span className={`badge ${s.status === "SUPPORTED" ? "success" : s.status === "PARTIAL" ? "warning" : "secondary"}`}>
                    {INCOME_STATUS_LABEL[s.status]}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: 2 }}>
                  {s.note}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Unresolved Items */}
      {prep.unresolvedItems.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: "14px" }}>Itens para Revisão Humana</h4>
          <div className="list">
            {prep.unresolvedItems.map((u, idx) => (
              <div key={idx} className="list-row">
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="tag-badge">{SECTION_LABEL[u.section] ?? u.section}</span>
                    <span className="badge warning">{u.reason}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: 4 }}>
                    {u.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Provenance */}
      <details style={{ marginBottom: 16 }}>
        <summary style={{ cursor: "pointer", fontSize: "12px", color: "var(--muted)" }}>
          Proveniência e Reprodutibilidade (técnico)
        </summary>
        <div style={{ marginTop: 12, fontSize: "11px", fontFamily: "monospace", background: "#f8fafc", padding: 12, borderRadius: 8, border: "1px solid var(--border)", whiteSpace: "pre-wrap", overflow: "auto" }}>
          {JSON.stringify(prep.provenance, null, 2)}
        </div>
      </details>

      {/* Meta */}
      <div style={{ fontSize: "11px", color: "var(--muted)", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <div>Criado: {formatDate(prep.createdAt)}</div>
        <div>Atualizado: {formatDate(prep.updatedAt)}</div>
        <div>Fingerprint: <code>{prep.provenance.inputFingerprint}</code></div>
      </div>
    </div>
  );
}