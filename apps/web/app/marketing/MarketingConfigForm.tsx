"use client";

import { useState } from "react";
import { saveMarketingConfigAction } from "./actions";
import { MARKETING_CHANNELS, MARKETING_AUTONOMY_LEVELS } from "@rpg/core";

interface Props {
  companyId: string;
  initial: {
    isActive: boolean;
    autonomyLevel: string;
    dailyBudget: string;
    monthlyBudget: string;
    maxCampaignBudget: string;
    maxCostPerLead: string;
    maxLeadsPerMonth: string;
    minJobValue: string;
    minMarginPercent: string;
    allowedChannels: string[];
    allowedServices: string;
    allowedZones: string;
    requiresHumanApproval: boolean;
  };
  pendingInstanceId: string | null;
}

const AUTONOMY_LABELS: Record<string, string> = {
  COPILOT: "Copilot — a IA só sugere; aprovação humana obrigatória",
  SEMI_AUTONOMOUS: "Semi-autónomo — executa dentro dos limites; fora deles pede aprovação",
  AUTOPILOT: "Autopilot — executa automaticamente dentro dos limites (requer aprovação para ativar)",
};

export default function MarketingConfigForm({
  companyId,
  initial,
  pendingInstanceId,
}: Props) {
  const [isActive, setIsActive] = useState(initial.isActive);
  const [autonomyLevel, setAutonomyLevel] = useState(initial.autonomyLevel);
  const [dailyBudget, setDailyBudget] = useState(initial.dailyBudget);
  const [monthlyBudget, setMonthlyBudget] = useState(initial.monthlyBudget);
  const [maxCampaignBudget, setMaxCampaignBudget] = useState(initial.maxCampaignBudget);
  const [maxCostPerLead, setMaxCostPerLead] = useState(initial.maxCostPerLead);
  const [maxLeadsPerMonth, setMaxLeadsPerMonth] = useState(initial.maxLeadsPerMonth);
  const [minJobValue, setMinJobValue] = useState(initial.minJobValue);
  const [minMarginPercent, setMinMarginPercent] = useState(initial.minMarginPercent);
  const [channels, setChannels] = useState<string[]>(initial.allowedChannels);
  const [allowedServices, setAllowedServices] = useState(initial.allowedServices);
  const [allowedZones, setAllowedZones] = useState(initial.allowedZones);
  const [requiresHumanApproval, setRequiresHumanApproval] = useState(
    initial.requiresHumanApproval,
  );
  const [state, setState] = useState<{ loading: boolean; error?: string; ok?: string }>(
    { loading: false },
  );

  const autopilotActivating =
    autonomyLevel === "AUTOPILOT" &&
    (!initial.isActive || initial.autonomyLevel !== "AUTOPILOT");

  function toggleChannel(c: string) {
    setChannels((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ loading: true });
    const r = await saveMarketingConfigAction({
      companyId,
      isActive,
      autonomyLevel,
      dailyBudget,
      monthlyBudget,
      maxCampaignBudget,
      maxCostPerLead,
      maxLeadsPerMonth,
      minJobValue,
      minMarginPercent,
      allowedChannels: channels,
      allowedServices,
      allowedZones,
      requiresHumanApproval,
    });
    if (r.success) {
      setState({
        loading: false,
        ok: r.approvalRequired
          ? "Pedido criado: a ativação do AUTOPILOT aguarda aprovação no Centro de Aprovações."
          : "Configuração guardada e auditada.",
      });
    } else {
      setState({ loading: false, error: r.error });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <fieldset className="space-y-1">
        <label className="block text-sm font-medium">Estado do Marketing AI</label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span>
            Ativo (desligado = <strong>OFF</strong>: nenhuma ação é decidida)
          </span>
        </label>
      </fieldset>

      <div>
        <label className="block text-sm font-medium">Nível de autonomia</label>
        <select
          className="input"
          value={autonomyLevel}
          onChange={(e) => setAutonomyLevel(e.target.value)}
        >
          {MARKETING_AUTONOMY_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted mt-1">{AUTONOMY_LABELS[autonomyLevel]}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium">Orçamento diário (€)</label>
          <input className="input" type="number" min={0} step="0.01"
            value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Orçamento mensal (€)</label>
          <input className="input" type="number" min={0} step="0.01"
            value={monthlyBudget} onChange={(e) => setMonthlyBudget(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Máx. por campanha (€)</label>
          <input className="input" type="number" min={0} step="0.01"
            value={maxCampaignBudget} onChange={(e) => setMaxCampaignBudget(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Custo máx. por lead (€)</label>
          <input className="input" type="number" min={0} step="0.01"
            value={maxCostPerLead} onChange={(e) => setMaxCostPerLead(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Máx. leads/mês</label>
          <input className="input" type="number" min={0} step="1"
            value={maxLeadsPerMonth} onChange={(e) => setMaxLeadsPerMonth(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Valor mín. de trabalho (€)</label>
          <input className="input" type="number" min={0} step="0.01"
            value={minJobValue} onChange={(e) => setMinJobValue(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Margem mínima (% — opcional)</label>
          <input className="input" type="number" min={0} max={100} step="0.01"
            value={minMarginPercent} onChange={(e) => setMinMarginPercent(e.target.value)} />
        </div>
      </div>

      <fieldset className="space-y-1">
        <label className="block text-sm font-medium">Canais autorizados</label>
        <div className="flex flex-wrap gap-3">
          {MARKETING_CHANNELS.map((c) => (
            <label key={c} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={channels.includes(c)}
                onChange={() => toggleChannel(c)}
              />
              {c}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium">
            Serviços autorizados (separados por vírgula)
          </label>
          <input className="input" value={allowedServices}
            onChange={(e) => setAllowedServices(e.target.value)}
            placeholder="ex: CANALIZACAO, PINTURA" />
        </div>
        <div>
          <label className="block text-sm font-medium">
            Zonas autorizadas (separadas por vírgula)
          </label>
          <input className="input" value={allowedZones}
            onChange={(e) => setAllowedZones(e.target.value)}
            placeholder="ex: LISBOA, SINTRA" />
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={requiresHumanApproval}
          onChange={(e) => setRequiresHumanApproval(e.target.checked)}
        />
        <span className="text-sm">
          Exigir aprovação humana para TODAS as ações (kill-switch)
        </span>
      </label>

      {pendingInstanceId && (
        <p className="text-sm text-amber-700">
          Já existe um pedido pendente de ativação de autonomia (ID:{" "}
          {pendingInstanceId}). Aguarde a decisão antes de criar outro.
        </p>
      )}

      {autopilotActivating && (
        <p className="text-xs text-amber-700">
          <strong>Nota:</strong> ativar AUTOPILOT cria um pedido de aprovação —
          só vigorará após decisão no Centro de Aprovações.
        </p>
      )}

      <div className="text-xs text-muted">
        <strong>Segurança:</strong> a IA nunca pode ultrapassar os limites
        definidos. Nesta fase as integrações externas (Meta, Google, TikTok,
        Instagram) ainda não estão ligadas — nenhuma campanha é publicada.
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}

      <button type="submit" className="button" disabled={state.loading}>
        {state.loading ? "A guardar…" : "Guardar configuração"}
      </button>
    </form>
  );
}
