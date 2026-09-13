"use client";

import { useState } from "react";
import { proposeFeeConfigChangeAction } from "./actions";
import { formatBasisPoints } from "@rpg/core";

interface Props {
  effectiveBps: number;
  managedCompanies: Array<{ id: string; name: string }>;
  pendingInstanceId: string | null;
}

export default function FeeConfigForm({
  effectiveBps,
  managedCompanies,
  pendingInstanceId,
}: Props) {
  const [scope, setScope] = useState<"GLOBAL" | "COMPANY">("GLOBAL");
  const [companyId, setCompanyId] = useState("");
  const [percent, setPercent] = useState("");
  const [reason, setReason] = useState("");
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    ok?: string;
  }>({ loading: false });

  const proposedBps = Math.round(Number(percent) * 100);
  const currentLabel = formatBasisPoints(effectiveBps);
  const proposedLabel = Number.isFinite(proposedBps)
    ? formatBasisPoints(proposedBps)
    : "—";
  const selectedCompanyName =
    managedCompanies.find((c) => c.id === companyId)?.name ?? "";

  async function submitProposal() {
    setState({ loading: true });
    const r = await proposeFeeConfigChangeAction({
      scope,
      companyId: scope === "COMPANY" ? companyId || undefined : null,
      newBasisPoints: proposedBps,
      reason,
    });
    if (r.success) {
      setState({ loading: false, ok: "Pedido de alteração criado e enviado para aprovação." });
      setAwaitingConfirm(false);
      setPercent("");
      setReason("");
    } else {
      setState({ loading: false, error: r.error });
      setAwaitingConfirm(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Passo de confirmação: nenhuma proposta é enviada sem revisão explícita.
    setAwaitingConfirm(true);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <fieldset className="space-y-1">
        <label className="block text-sm font-medium">Âmbito</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              checked={scope === "GLOBAL"}
              onChange={() => setScope("GLOBAL")}
            />
            <span>Taxa global</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              checked={scope === "COMPANY"}
              onChange={() => setScope("COMPANY")}
              disabled={managedCompanies.length === 0}
            />
            <span>Por empresa</span>
          </label>
        </div>
      </fieldset>

      {scope === "COMPANY" && (
        <div>
          <label className="block text-sm font-medium">Empresa</label>
          <select
            className="input"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            required
          >
            <option value="">Selecione uma empresa</option>
            {managedCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-sm font-medium">Taxa atual</label>
          <input className="input" value={currentLabel} readOnly />
        </div>
        <div>
          <label className="block text-sm font-medium">Nova taxa (%)</label>
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            step={0.01}
            placeholder="ex: 2.75"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Proposta</label>
          <input className="input" value={proposedLabel} readOnly />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">Motivo da alteração *</label>
        <textarea
          className="input"
          rows={3}
          placeholder="Justifique a alteração da taxa..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={3}
        />
      </div>

      {pendingInstanceId && (
        <p className="text-sm text-amber-700">
          Já existe um pedido pendente de alteração (ID: {pendingInstanceId}).
          Aguarde a decisão antes de criar outro.
        </p>
      )}

      <div className="text-xs text-muted">
        <strong>Impacto:</strong> aplica-se apenas a novos pagamentos. As fees
        já registadas não são alteradas. A taxa vigora apenas após aprovação.
      </div>

      {awaitingConfirm && (
        <div className="card border-amber-500" role="alertdialog" aria-label="Confirmar alteração de taxa">
          <h3 className="font-semibold mb-2">Confirmar alteração de taxa</h3>
          <dl className="text-sm space-y-1 mb-2">
            <div>
              <strong>Âmbito:</strong>{" "}
              {scope === "GLOBAL"
                ? "Taxa global"
                : `Override — ${selectedCompanyName || "Empresa"}`}
            </div>
            <div>
              <strong>Taxa atual:</strong> {currentLabel}
            </div>
            <div>
              <strong>Nova taxa:</strong> {proposedLabel}
            </div>
            <div>
              <strong>Motivo:</strong> {reason.trim() || "—"}
            </div>
          </dl>
          <p className="text-xs text-amber-700 mb-3">
            <strong>Aviso:</strong> esta alteração aplica-se{" "}
            <strong>apenas a novos pagamentos</strong>. Fees já registadas
            (snapshots imutáveis) não serão recalculadas. A nova taxa só passa
            a vigorar após <strong>APROVAÇÃO</strong> no Centro de Aprovações.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="button"
              onClick={submitProposal}
              disabled={state.loading}
            >
              {state.loading ? "A enviar…" : "Confirmar e enviar para aprovação"}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setAwaitingConfirm(false)}
              disabled={state.loading}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}

      <button
        type="submit"
        className="button"
        disabled={state.loading || !percent || !reason.trim()}
      >
        Alterar taxa (revisar e confirmar)
      </button>
    </form>
  );
}
