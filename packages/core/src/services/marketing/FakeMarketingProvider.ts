/**
 * RPG-OS Fake Marketing Provider (SANDBOX)
 *
 * Provider SIMULADO de marketing — segue o padrão do FakePaymentProvider.
 * - NÃO contacta nenhuma API externa (Meta/Google/TikTok/Instagram);
 * - NÃO gasta dinheiro real; tudo vive num store em memória;
 * - Simula: criação/publicação de campanhas, pausa/retoma, orçamento,
 *   métricas (impressions/clicks/leads/cost) e leads simulados;
 * - Idempotente por campaignId+channel (como o provider de pagamentos).
 */

import type {
  MarketingCampaignAdapter,
  MarketingCampaignSpec,
  MarketingAdapterResult,
  MarketingLeadAdapter,
  MarketingProvider,
} from "../../adapters/MarketingProviderAdapter";
import type {
  MarketingChannel,
  MarketingObjective,
} from "../../services/MarketingAiService";

export interface FakeMarketingMetrics {
  impressions: number;
  clicks: number;
  leads: number;
  costCents: number;
}

export interface FakeMarketingMetricsSnapshot extends FakeMarketingMetrics {
  externalId: string;
  channel: MarketingChannel;
  status: "ACTIVE" | "PAUSED" | "COMPLETED";
  budgetCents: number;
  /** CPL derivado (cêntimos) — null sem leads. */
  costPerLeadCents: number | null;
  ctr: number | null;
}

export interface FakeMarketingLead {
  externalId: string;
  name: string | null;
  contact: string | null;
  campaignExternalId: string | null;
  channel: MarketingChannel;
  receivedAt: string;
  service: string | null;
  zone: string | null;
  estimatedJobValueCents: number | null;
}

export interface FakeCampaignRecord {
  externalId: string;
  campaignId: string;
  companyId: string;
  name: string;
  objective: MarketingObjective;
  channel: MarketingChannel;
  budgetCents: number;
  status: "ACTIVE" | "PAUSED" | "COMPLETED";
  metrics: FakeMarketingMetrics;
  leads: FakeMarketingLead[];
  createdAt: string;
  updatedAt: string;
}

export interface FakeEvent {
  id: string;
  type:
    | "CAMPAIGN_CREATED"
    | "CAMPAIGN_PAUSED"
    | "CAMPAIGN_RESUMED"
    | "CAMPAIGN_BUDGET_UPDATED"
    | "LEAD_RECEIVED"
    | "METRICS_UPDATED";
  channel: MarketingChannel;
  payload: Record<string, unknown>;
  timestamp: string;
}

/**
 * Store em memória — em produção seria substituído pelos SDKs reais das
 * plataformas. Nunca persiste em BD: é sandbox puro.
 */
class FakeMarketingStore {
  private campaigns = new Map<string, FakeCampaignRecord>(); // key: `${channel}:${campaignId}`
  private byExternalId = new Map<string, FakeCampaignRecord>();
  private events: FakeEvent[] = [];

  static key(channel: string, campaignId: string): string {
    return `${channel}:${campaignId}`;
  }

  saveCampaign(record: FakeCampaignRecord): void {
    this.campaigns.set(
      FakeMarketingStore.key(record.channel, record.campaignId),
      record,
    );
    this.byExternalId.set(record.externalId, record);
  }

  getByCampaignId(channel: string, campaignId: string): FakeCampaignRecord | null {
    return this.campaigns.get(FakeMarketingStore.key(channel, campaignId)) ?? null;
  }

  getByExternalId(externalId: string): FakeCampaignRecord | null {
    return this.byExternalId.get(externalId) ?? null;
  }

  addEvent(event: FakeEvent): void {
    this.events.push(event);
  }

  getEvents(): FakeEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.campaigns.clear();
    this.byExternalId.clear();
    this.events = [];
  }

  listCampaignRecords(): FakeCampaignRecord[] {
    return [...this.campaigns.values()];
  }
}

const store = new FakeMarketingStore();

function deriveSnapshot(record: FakeCampaignRecord): FakeMarketingMetricsSnapshot {
  const { metrics } = record;
  return {
    ...metrics,
    externalId: record.externalId,
    channel: record.channel,
    status: record.status,
    budgetCents: record.budgetCents,
    costPerLeadCents: metrics.leads > 0 ? Math.ceil(metrics.costCents / metrics.leads) : null,
    ctr: metrics.impressions > 0 ? metrics.clicks / metrics.impressions : null,
  };
}

function externalIdFor(channel: string): string {
  return `fake_mkt_${channel.toLowerCase()}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 11)}`;
}

/* ─── Adapter de campanhas (sandbox) ──────────────────────────────────── */

export class FakeMarketingCampaignAdapter implements MarketingCampaignAdapter {
  constructor(readonly channel: MarketingChannel) {}

  async createCampaign(
    spec: MarketingCampaignSpec,
  ): Promise<MarketingAdapterResult<{ externalId: string }>> {
    await FakeMarketingProvider.simulateDelay(20);
    // Idempotência: mesma campanha + canal → mesmo externalId.
    const existing = store.getByCampaignId(this.channel, spec.campaignId);
    if (existing) {
      return { ok: true, value: { externalId: existing.externalId } };
    }
    const externalId = externalIdFor(this.channel);
    const record: FakeCampaignRecord = {
      externalId,
      campaignId: spec.campaignId,
      companyId: spec.companyId,
      name: spec.name,
      objective: spec.objective,
      channel: this.channel,
      budgetCents: spec.budgetCents,
      status: "ACTIVE", // publicação simulada: nasce ativa no sandbox
      metrics: { impressions: 0, clicks: 0, leads: 0, costCents: 0 },
      leads: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.saveCampaign(record);
    store.addEvent({
      id: `evt_${Date.now()}`,
      type: "CAMPAIGN_CREATED",
      channel: this.channel,
      payload: { externalId, campaignId: spec.campaignId, budgetCents: spec.budgetCents },
      timestamp: new Date().toISOString(),
    });
    return { ok: true, value: { externalId } };
  }

  async pauseCampaign(externalId: string): Promise<MarketingAdapterResult<void>> {
    await FakeMarketingProvider.simulateDelay(20);
    const record = store.getByExternalId(externalId);
    if (!record || record.channel !== this.channel) {
      return { ok: false, error: "CAMPAIGN_NOT_FOUND" };
    }
    record.status = "PAUSED";
    record.updatedAt = new Date().toISOString();
    store.addEvent({ id: `evt_${Date.now()}`, type: "CAMPAIGN_PAUSED", channel: this.channel, payload: { externalId }, timestamp: new Date().toISOString() });
    return { ok: true, value: undefined };
  }

  async resumeCampaign(externalId: string): Promise<MarketingAdapterResult<void>> {
    await FakeMarketingProvider.simulateDelay(20);
    const record = store.getByExternalId(externalId);
    if (!record || record.channel !== this.channel) {
      return { ok: false, error: "CAMPAIGN_NOT_FOUND" };
    }
    record.status = "ACTIVE";
    record.updatedAt = new Date().toISOString();
    store.addEvent({ id: `evt_${Date.now()}`, type: "CAMPAIGN_RESUMED", channel: this.channel, payload: { externalId }, timestamp: new Date().toISOString() });
    return { ok: true, value: undefined };
  }

  async updateBudget(externalId: string, budgetCents: number): Promise<MarketingAdapterResult<void>> {
    await FakeMarketingProvider.simulateDelay(20);
    if (!Number.isSafeInteger(budgetCents) || budgetCents < 0) {
      return { ok: false, error: "INVALID_BUDGET" };
    }
    const record = store.getByExternalId(externalId);
    if (!record || record.channel !== this.channel) {
      return { ok: false, error: "CAMPAIGN_NOT_FOUND" };
    }
    record.budgetCents = budgetCents;
    record.updatedAt = new Date().toISOString();
    store.addEvent({ id: `evt_${Date.now()}`, type: "CAMPAIGN_BUDGET_UPDATED", channel: this.channel, payload: { externalId, budgetCents }, timestamp: new Date().toISOString() });
    return { ok: true, value: undefined };
  }

  /** Sandbox-only: snapshot de métricas derivadas. */
  async getMetrics(externalId: string): Promise<MarketingAdapterResult<FakeMarketingMetricsSnapshot>> {
    const record = store.getByExternalId(externalId);
    if (!record || record.channel !== this.channel) {
      return { ok: false, error: "CAMPAIGN_NOT_FOUND" };
    }
    return { ok: true, value: deriveSnapshot(record) };
  }

  /** Sandbox-only: injeta métricas simuladas (custo nunca excede o orçamento). */
  async simulateMetrics(
    externalId: string,
    delta: Partial<FakeMarketingMetrics>,
  ): Promise<MarketingAdapterResult<FakeMarketingMetricsSnapshot>> {
    const record = store.getByExternalId(externalId);
    if (!record || record.channel !== this.channel) {
      return { ok: false, error: "CAMPAIGN_NOT_FOUND" };
    }
    const m = record.metrics;
    const next = {
      impressions: m.impressions + Math.max(0, delta.impressions ?? 0),
      clicks: m.clicks + Math.max(0, delta.clicks ?? 0),
      leads: m.leads + Math.max(0, delta.leads ?? 0),
      costCents: m.costCents + Math.max(0, delta.costCents ?? 0),
    };
    // Sandbox: o custo simulado nunca ultrapassa o orçamento da campanha.
    next.costCents = Math.min(next.costCents, record.budgetCents);
    record.metrics = next;
    record.updatedAt = new Date().toISOString();
    store.addEvent({ id: `evt_${Date.now()}`, type: "METRICS_UPDATED", channel: this.channel, payload: { externalId, ...delta }, timestamp: new Date().toISOString() });
    return { ok: true, value: deriveSnapshot(record) };
  }
}

/* ─── Adapter de leads (sandbox) ──────────────────────────────────────── */

export class FakeMarketingLeadAdapter implements MarketingLeadAdapter {
  constructor(readonly channel: MarketingChannel) {}

  /** Devolve leads simulados recebidos desde `sinceIso` neste canal. */
  async fetchLeads(
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
  > {
    await FakeMarketingProvider.simulateDelay(20);
    const since = new Date(sinceIso).getTime();
    if (Number.isNaN(since)) {
      return { ok: false, error: "INVALID_SINCE" };
    }
    const leads: FakeMarketingLead[] = [];
    // Leads vivem dentro dos registos de campanha; recolhe por canal.
    for (const record of store.listCampaignRecords()) {
      if (record.channel !== this.channel) continue;
      for (const lead of record.leads) {
        if (new Date(lead.receivedAt).getTime() >= since) leads.push(lead);
      }
    }
    leads.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    return {
      ok: true,
      value: leads.map((l) => ({
        externalId: l.externalId,
        name: l.name,
        contact: l.contact,
        campaignExternalId: l.campaignExternalId,
        receivedAt: l.receivedAt,
      })),
    };
  }
}

/* ─── Provider (sandbox) ──────────────────────────────────────────────── */

export class FakeMarketingProvider implements MarketingProvider {
  readonly id = "FAKE_SANDBOX";
  readonly connected = true; // sandbox sempre "ligado" — mas SEM API externa
  readonly sandbox = true as const;

  private campaignAdapter: FakeMarketingCampaignAdapter | null = null;
  private leadAdapter: FakeMarketingLeadAdapter | null = null;

  constructor(readonly channel: MarketingChannel) {}

  campaigns(): FakeMarketingCampaignAdapter {
    if (!this.campaignAdapter) {
      this.campaignAdapter = new FakeMarketingCampaignAdapter(this.channel);
    }
    return this.campaignAdapter;
  }

  leads(): FakeMarketingLeadAdapter {
    if (!this.leadAdapter) {
      this.leadAdapter = new FakeMarketingLeadAdapter(this.channel);
    }
    return this.leadAdapter;
  }

  /* ── Utilitários sandbox (testes / simulação) ── */

  /**
   * Gera um lead simulado para uma campanha publicada no sandbox.
   * Nada é escrito na BD do RPG-OS — apenas no store em memória.
   */
  async simulateLead(input: {
    campaignExternalId: string;
    name?: string | null;
    contact?: string | null;
    service?: string | null;
    zone?: string | null;
    estimatedJobValueCents?: number | null;
    receivedAt?: string;
  }): Promise<MarketingAdapterResult<FakeMarketingLead>> {
    await FakeMarketingProvider.simulateDelay(10);
    const record = store.getByExternalId(input.campaignExternalId);
    if (!record || record.channel !== this.channel) {
      return { ok: false, error: "CAMPAIGN_NOT_FOUND" };
    }
    const lead: FakeMarketingLead = {
      externalId: `fake_lead_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name: input.name ?? `Lead Simulado ${record.leads.length + 1}`,
      contact: input.contact ?? null,
      campaignExternalId: record.externalId,
      channel: this.channel,
      receivedAt: input.receivedAt ?? new Date().toISOString(),
      service: input.service ?? null,
      zone: input.zone ?? null,
      estimatedJobValueCents: input.estimatedJobValueCents ?? null,
    };
    record.leads.push(lead);
    record.metrics.leads += 1;
    record.updatedAt = new Date().toISOString();
    store.addEvent({
      id: `evt_${Date.now()}`,
      type: "LEAD_RECEIVED",
      channel: this.channel,
      payload: { externalId: lead.externalId, campaignExternalId: record.externalId },
      timestamp: lead.receivedAt,
    });
    return { ok: true, value: lead };
  }

  static clearStore(): void {
    store.clear();
  }

  static getEvents(): FakeEvent[] {
    return store.getEvents();
  }

  /** Snapshot de leitura para testes (cópia superficial). */
  static getStoreSnapshot(): {
    campaigns: Array<Readonly<FakeCampaignRecord>>;
  } {
    return { campaigns: store.listCampaignRecords().map((c) => ({ ...c })) };
  }

  static simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
