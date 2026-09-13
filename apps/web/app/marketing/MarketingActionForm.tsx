"use client";

import { useState } from "react";
import { proposeMarketingActionAction, decideMarketingActionAction } from "./actions";
import { MARKETING_CHANNELS } from "@rpg/core";

/**
 * Simulador da pipeline de decisão: recomendação → guardrails → resultado.
 * Nada é publicado/executado externamente — a decisão é apenas registada
 * e auditada, com a mensagem determinística do core.
 */

interface Props {
  companyId: string;
  channels: string[];
  pendingActions: Array<{
    id: string;
    actionType: string;
    channel: string;
    estimatedCostCents: number | null;
    reasonCode: string;
  }>;
}

type Outcome = {
  decision?: string;
  reason?: string;
  message?: string;
  error?: string;
};

const ACTION_TYPE_OPTIONS = [
  "CREATE_CAMPAIGN",
  "PAUSE_CAMPAIGN",
  "RESUME_CAMPAIGN",
  "ADJUST_BUDGET",
  "GENERATE_CONTENT",
  "SUGGEST_TARGETING",
];
const OBJECTIVE_OPTIONS = ["LEADS", "QUOTES", "JOBS", "AWARENESS"];

export default function MarketingActionForm({ companyId, channels, pendingActions }: Props) {
  const [actionType, setActionType] = useState("CREATE_CAMPAIGN");
  const [objective, setObjective] = useState("LEADS");
  const [channel, setChannel] = useState(channels[0] ?? "META");
  const [estimatedCost, setEstimatedCost] = useState("50");
  const [campaignBudget, setCampaignBudget] = useState("200");
  const [estimatedCostPerLead, setEstimatedCostPerLead] = useState("4");
  const [estimatedLeads, setEstimatedLeads] = useState("10");
  const [service, setService] = useState("");
  const [zone, setZone] = useState("");
  const [jobValue, setJobValue] = useState("300");
  const [estimatedMarginPercent, setEstimatedMarginPercent] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setOutcome(null);
    const r = await proposeMarketingActionAction({
      companyId,
      actionType,
      objective,
      channel,
      estimatedCost,
      campaignBudget,
      estimatedCostPerLead,
      estimatedLeads,
      service,
      zone,
      jobValue,
      estimatedMarginPercent,
    });
    setOutcome(
      r.success
        ? { decision: r.decision, reason: r.reason, message: r.message }
        : { error: r.error },
    );
    setLoading(false);
  }

  async function decide(actionId: string, approve: boolean) {
    setLoading(true);
    await decideMarketingActionAction(actionId, approve);
    setLoading(false);
  }

  const decisionColor =
    outcome?.decision === "ALLOWED"
      ? "text-emerald-700"
      : outcome?.decision === "REQUIRES_APPROVAL"
        ? "text-amber-700"
        : "text-destructive";

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium">Tipo de ação</label>
            <select className="input" value={actionType}
              onChange={(e) => setActionType(e.target.value)}>
              {ACTION_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Objetivo</label>
            <select className="input" value={objective}
              onChange={(e) => setObjective(e.target.value)}>
              {OBJECTIVE_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Canal</label>
            <select className="input" value={channel}
              onChange={(e) => setChannel(e.target.value)}>
              {MARKETING_CHANNELS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Custo estimado (€)</label>
            <input className="input" type="number" min={0} step="0.01"
              value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium">Orçamento de campanha (€)</label>
            <input className="input" type="number" min={0} step="0.01"
              value={campaignBudget} onChange={(e) => setCampaignBudget(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium">Custo por lead (€)</label>
            <input className="input" type="number" min={0} step="0.01"
              value={estimatedCostPerLead} onChange={(e) => setEstimatedCostPerLead(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium">Leads estimados</label>
            <input className="input" type="number" min={0} step="1"
              value={estimatedLeads} onChange={(e) => setEstimatedLeads(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium">Serviço (opcional)</label>
            <input className="input" value={service}
              onChange={(e) => setService(e.target.value)} placeholder="ex: PINTURA" />
          </div>
          <div>
            <label className="block text-sm font-medium">Zona (opcional)</label>
            <input className="input" value={zone}
              onChange={(e) => setZone(e.target.value)} placeholder="ex: LISBOA" />
          </div>
          <div>
            <label className="block text-sm font-medium">Valor de trabalho (€)</label>
            <input className="input" type="number" min={0} step="0.01"
              value={jobValue} onChange={(e) => setJobValue(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium">Margem estimada (% opcional)</label>
            <input className="input" type="number" min={0} max={100} step="0.01"
              value={estimatedMarginPercent}
              onChange={(e) => setEstimatedMarginPercent(e.target.value)} />
          </div>
        </div>

        <button type="submit" className="button" disabled={loading}>
          {loading ? "A processar…" : "Submeter recomendação aos guardrails"}
        </button>
      </form>

      {outcome && (
        <div className="card" role="status">
          {outcome.error ? (
            <p className="text-sm text-destructive">{outcome.error}</p>
          ) : (
            <>
              <p className={`text-lg font-semibold ${decisionColor}`}>
                {outcome.decision}
              </p>
              <p className="text-sm">
                <strong>Motivo:</strong> {outcome.reason}
              </p>
              <p className="text-sm text-muted">{outcome.message}</p>
              <p className="text-xs text-muted mt-1">
                {outcome.decision === "ALLOWED"
                  ? "Autonomia permitida: a ação é executada no sandbox (FakeMarketingProvider) e auditada. Sem gasto real — nenhuma API externa é contactada."
                  : "Nada foi publicado: nesta fase as plataformas externas não estão ligadas — a decisão fica registada e auditada."}
              </p>
            </>
          )}
        </div>
      )}

      {pendingActions.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">
            Ações pendentes de aprovação humana
          </h3>
          <ul className="space-y-2">
            {pendingActions.map((a) => (
              <li key={a.id} className="card flex items-center justify-between gap-3">
                <div className="text-sm">
                  <strong>{a.actionType}</strong> · {a.channel}
                  {a.estimatedCostCents !== null && (
                    <> · {(a.estimatedCostCents / 100).toFixed(2)} €</>
                  )}
                  <div className="text-xs text-muted">Motivo: {a.reasonCode}</div>
                </div>
                <div className="flex gap-2">
                  <button className="button" disabled={loading}
                    onClick={() => decide(a.id, true)}>
                    Aprovar
                  </button>
                  <button className="button secondary" disabled={loading}
                    onClick={() => decide(a.id, false)}>
                    Rejeitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
