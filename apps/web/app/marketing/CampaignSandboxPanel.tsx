"use client";

import { useState } from "react";
import { simulateMetricsAction, simulateLeadAction } from "./actions";

interface Campaign {
  id: string;
  name: string;
  objective: string;
  status: string;
  channels: string[];
  providerId: string | null;
  providerExternalId: string | null;
  budgetCents: number;
}

/**
 * Painel de simulação sandbox por campanha. Nada é publicado/comprado de
 * verdade: chamadas ao provider fake, auditadas e limitadas ao orçamento.
 */
export default function CampaignSandboxPanel({ campaign }: { campaign: Campaign }) {
  const [met, setMet] = useState({
    impressions: "1000",
    clicks: "50",
    leads: "5",
    cost: "10",
  });
  const [lead, setLead] = useState({
    name: "",
    contact: "",
    service: "",
    zone: "",
    jobValue: "",
  });
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const published = Boolean(campaign.providerExternalId);
  const channel = campaign.channels[0] ?? "";

  async function simulateMetrics(e: React.FormEvent) {
    e.preventDefault();
    if (!campaign.providerExternalId) return;
    setLoading(true);
    setMsg(null);
    const r = await simulateMetricsAction({
      campaignId: campaign.id,
      channel,
      providerExternalId: campaign.providerExternalId,
      impressions: Number(met.impressions) || 0,
      clicks: Number(met.clicks) || 0,
      leads: Number(met.leads) || 0,
      cost: met.cost,
    });
    setMsg(
      r.success
        ? { type: "ok", text: "Métricas simuladas (sandbox) e auditadas." }
        : { type: "err", text: r.error ?? "Erro." },
    );
    setLoading(false);
  }

  async function simulateLead(e: React.FormEvent) {
    e.preventDefault();
    if (!campaign.providerExternalId) return;
    setLoading(true);
    setMsg(null);
    const r = await simulateLeadAction({
      campaignId: campaign.id,
      channel,
      providerExternalId: campaign.providerExternalId,
      name: lead.name,
      contact: lead.contact,
      service: lead.service,
      zone: lead.zone,
      jobValue: lead.jobValue,
    });
    setMsg(
      r.success && r.leadId
        ? {
            type: "ok",
            text: `Lead simulado criado (${r.leadId}). Etapa LEAD — conversão para orçamento/obra é humana e futura.`,
          }
        : { type: "err", text: r.error ?? "Erro." },
    );
    setLoading(false);
  }

  if (!campaign.providerExternalId) return null;

  return (
    <div className="border-t pt-3 mt-3">
      <p className="text-xs text-muted mb-2">
        Sandbox {campaign.providerId ?? "FAKE_SANDBOX"} · external id:{" "}
        <code className="text-[11px]">{campaign.providerExternalId}</code> — simulações
        sem gasto real (respeitam o orçamento).
      </p>

      <form onSubmit={simulateMetrics} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
        <div>
          <label className="block text-[11px] text-muted">Impressions</label>
          <input className="input" type="number" min={0} value={met.impressions}
            onChange={(e) => setMet({ ...met, impressions: e.target.value })} />
        </div>
        <div>
          <label className="block text-[11px] text-muted">Clicks</label>
          <input className="input" type="number" min={0} value={met.clicks}
            onChange={(e) => setMet({ ...met, clicks: e.target.value })} />
        </div>
        <div>
          <label className="block text-[11px] text-muted">Leads</label>
          <input className="input" type="number" min={0} value={met.leads}
            onChange={(e) => setMet({ ...met, leads: e.target.value })} />
        </div>
        <div>
          <label className="block text-[11px] text-muted">Custo (€)</label>
          <input className="input" type="number" min={0} step="0.01" value={met.cost}
            onChange={(e) => setMet({ ...met, cost: e.target.value })} />
        </div>
        <div className="flex items-end">
          <button type="submit" className="button secondary" disabled={loading}>
            Simular métricas
          </button>
        </div>
      </form>

      <form onSubmit={simulateLead} className="grid grid-cols-1 md:grid-cols-6 gap-2 mt-2">
        <div>
          <label className="block text-[11px] text-muted">Nome</label>
          <input className="input" value={lead.name}
            onChange={(e) => setLead({ ...lead, name: e.target.value })} />
        </div>
        <div>
          <label className="block text-[11px] text-muted">Contacto</label>
          <input className="input" value={lead.contact}
            onChange={(e) => setLead({ ...lead, contact: e.target.value })} />
        </div>
        <div>
          <label className="block text-[11px] text-muted">Serviço</label>
          <input className="input" value={lead.service}
            onChange={(e) => setLead({ ...lead, service: e.target.value })} />
        </div>
        <div>
          <label className="block text-[11px] text-muted">Zona</label>
          <input className="input" value={lead.zone}
            onChange={(e) => setLead({ ...lead, zone: e.target.value })} />
        </div>
        <div>
          <label className="block text-[11px] text-muted">Valor trabal. (€)</label>
          <input className="input" type="number" min={0} step="0.01" value={lead.jobValue}
            onChange={(e) => setLead({ ...lead, jobValue: e.target.value })} />
        </div>
        <div className="flex items-end">
          <button type="submit" className="button" disabled={loading}>
            Simular lead
          </button>
        </div>
      </form>

      <p className="text-[11px] text-muted mt-2">
        Trilho futuro: lead → orçamento aceite → obra → fatura → pagamento → platform fee.
      </p>
      {msg && (
        <p className={`text-sm mt-1 ${msg.type === "ok" ? "text-emerald-700" : "text-destructive"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}