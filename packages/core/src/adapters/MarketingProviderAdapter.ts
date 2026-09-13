/**
 * RPG-OS Marketing AI — CONTRATOS de integração com plataformas externas.
 *
 * IMPORTANTE: nesta fase NÃO existe qualquer implementação. Sem Meta Ads API,
 * Google Ads API, TikTok Ads API, Instagram API ou pagamentos de publicidade.
 * Estes contratos definem a fronteira futura:
 *
 *   Marketing AI (recomendação)
 *     → guardrails (canExecuteMarketingAction)
 *     → MarketingProvider (adapter do canal)
 *     → plataforma externa
 *
 * Toda a implementação futura deve ser idempotente, auditada e respeitar os
 * guardrails ANTES de qualquer chamada externa.
 */

import type { MarketingChannel, MarketingObjective } from "../services/MarketingAiService";

export interface MarketingCampaignSpec {
  /** Referência interna da campanha (marketing_campaigns.id). */
  campaignId: string;
  companyId: string;
  name: string;
  objective: MarketingObjective;
  /** Orçamento em cêntimos — adapters NUNCA recebem floats. */
  budgetCents: number;
  channel: MarketingChannel;
  targeting: {
    services: string[];
    zones: string[];
  };
  /** Conteúdo/criativo validado — o adapter não gera conteúdo. */
  creative?: { headline: string; body: string } | null;
}

export type MarketingAdapterResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Operações de campanha num canal externo (implementação futura). */
export interface MarketingCampaignAdapter {
  readonly channel: MarketingChannel;
  createCampaign(
    spec: MarketingCampaignSpec,
  ): Promise<MarketingAdapterResult<{ externalId: string }>>;
  pauseCampaign(externalId: string): Promise<MarketingAdapterResult<void>>;
  resumeCampaign(externalId: string): Promise<MarketingAdapterResult<void>>;
  updateBudget(
    externalId: string,
    budgetCents: number,
  ): Promise<MarketingAdapterResult<void>>;
}

/** Aquisição/leitura de leads de um canal externo (implementação futura). */
export interface MarketingLeadAdapter {
  readonly channel: MarketingChannel;
  /** Devolve leads novos desde o instante indicado (ISO 8601). */
  fetchLeads(
    sinceIso: string,
  ): Promise<
    MarketingAdapterResult<
      Array<{
        externalId: string;
        name: string | null;
        contact: string | null;
        campaignExternalId: string | null;
        receivedAt: string;
      }>
    >
  >;
}

/**
 * Provedor de marketing (um por canal externo). `connected` permite à UI
 * mostrar o estado real — nesta fase TODOS os providers devem reportar
 * `connected: false` e as fábricas devolvem null até existirem drivers.
 */
export interface MarketingProvider {
  readonly id: string;
  readonly channel: MarketingChannel;
  readonly connected: boolean;
  campaigns(): MarketingCampaignAdapter | null;
  leads(): MarketingLeadAdapter | null;
}
