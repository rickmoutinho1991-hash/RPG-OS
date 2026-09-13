import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FakeMarketingProvider,
  type FakeMarketingLead,
} from "../marketing/FakeMarketingProvider";
import {
  executeMarketingActionViaProvider,
  validateCampaignStatusTransition,
  isProviderExecutingAction,
} from "../marketing/MarketingExecutionService";
import { buildLeadIntake } from "../marketing/LeadPipeline";
import type { MarketingConfig, MarketingAction } from "../MarketingAiService";

function config(overrides?: Partial<MarketingConfig>): MarketingConfig {
  return {
    companyId: "company-1",
    isActive: true,
    autonomyLevel: "AUTOPILOT",
    budget: {
      dailyBudgetCents: 10000,
      monthlyBudgetCents: 200000,
      maxCampaignBudgetCents: 50000,
    },
    guardrails: {
      maxCostPerLeadCents: 500,
      maxLeadsPerMonth: 50,
      minJobValueCents: 15000,
      minMarginBps: null,
      allowedChannels: ["META", "GOOGLE", "WEBSITE", "LOCAL"],
      allowedServices: ["CANALIZACAO", "PINTURA"],
      allowedZones: ["LISBOA", "SINTRA"],
    },
    requiresHumanApproval: false,
    ...overrides,
  };
}

function action(overrides?: Partial<MarketingAction>): MarketingAction {
  return {
    type: "CREATE_CAMPAIGN",
    channel: "META",
    objective: "LEADS",
    estimatedCostCents: 5000,
    campaignBudgetCents: 20000,
    estimatedCostPerLeadCents: 400,
    estimatedLeads: 10,
    service: "CANALIZACAO",
    zone: "LISBOA",
    jobValueCents: 30000,
    ...overrides,
  };
}

const SPEC = {
  campaignId: "camp-1",
  companyId: "company-1",
  name: "Teste",
  objective: "LEADS" as const,
  budgetCents: 20000,
  channel: "META" as const,
  targeting: { services: [], zones: [] },
};

describe("FakeMarketingProvider", () => {
  let provider: FakeMarketingProvider;

  beforeEach(() => {
    provider = new FakeMarketingProvider("META");
    FakeMarketingProvider.clearStore();
  });

  afterEach(() => {
    FakeMarketingProvider.clearStore();
  });

  it("cria campanha publicada (ACTIVE) com external id", async () => {
    const res = await provider.campaigns().createCampaign(SPEC);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.externalId).toContain("fake_mkt_meta");
    expect(FakeMarketingProvider.getStoreSnapshot().campaigns[0].status).toBe("ACTIVE");
  });

  it("é idempotente por campaignId+channel", async () => {
    const a = await provider.campaigns().createCampaign(SPEC);
    const b = await provider.campaigns().createCampaign(SPEC);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value.externalId).toBe(b.value.externalId);
  });

  it("pausa, retoma e altera orçamento", async () => {
    const res = await provider.campaigns().createCampaign(SPEC);
    if (!res.ok) throw new Error("expected ok");
    const id = res.value.externalId;
    expect((await provider.campaigns().pauseCampaign(id)).ok).toBe(true);
    expect(FakeMarketingProvider.getStoreSnapshot().campaigns[0].status).toBe("PAUSED");
    expect((await provider.campaigns().resumeCampaign(id)).ok).toBe(true);
    expect(FakeMarketingProvider.getStoreSnapshot().campaigns[0].status).toBe("ACTIVE");
    expect((await provider.campaigns().updateBudget(id, 30000)).ok).toBe(true);
    expect(FakeMarketingProvider.getStoreSnapshot().campaigns[0].budgetCents).toBe(30000);
  });

  it("operações sobre campanha inexistente falham graciosamente", async () => {
    const r = await provider.campaigns().pauseCampaign("nope");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("CAMPAIGN_NOT_FOUND");
  });

  it("métricas simuladas respeitam o teto do orçamento e derivam CPL", async () => {
    const res = await provider.campaigns().createCampaign({
      ...SPEC,
      budgetCents: 5000, // 50 €
    });
    if (!res.ok) throw new Error("expected ok");
    const m = await provider
      .campaigns()
      .simulateMetrics(res.value.externalId, {
        impressions: 1000,
        clicks: 50,
        leads: 10,
        costCents: 999999,
      });
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.value.costCents).toBe(5000); // nunca excede o orçamento
    expect(m.value.costPerLeadCents).toBe(500); // ceil(5000/10)
    expect(m.value.ctr).toBeCloseTo(0.05);
  });

  it("leads simulados ficam visíveis em fetchLeads por janela temporal", async () => {
    const res = await provider.campaigns().createCampaign(SPEC);
    if (!res.ok) throw new Error("expected ok");
    const before = new Date(Date.now() - 60_000).toISOString();
    const l1: FakeMarketingLead | null = null;
    void l1;
    await provider.simulateLead({ campaignExternalId: res.value.externalId });
    await provider.simulateLead({ campaignExternalId: res.value.externalId });
    const all = await provider.leads().fetchLeads("1970-01-01T00:00:00Z");
    const recent = await provider.leads().fetchLeads(before);
    expect(all.ok && recent.ok).toBe(true);
    if (all.ok && recent.ok) {
      expect(all.value.length).toBe(2);
      expect(recent.value.length).toBe(2);
    }
    const none = await provider.leads().fetchLeads("2999-01-01T00:00:00Z");
    if (none.ok) expect(none.value.length).toBe(0);
  });

  it("registra eventos auditáveis no store (sandbox)", async () => {
    await provider.campaigns().createCampaign(SPEC);
    expect(
      FakeMarketingProvider.getEvents().some((e) => e.type === "CAMPAIGN_CREATED"),
    ).toBe(true);
  });
});

describe("executeMarketingActionViaProvider (pipeline)", () => {
  beforeEach(() => {
    FakeMarketingProvider.clearStore();
  });

  afterEach(() => {
    FakeMarketingProvider.clearStore();
  });

  it("AUTOPILOT dentro dos limites → executa no provider e devolve external id", async () => {
    const provider = new FakeMarketingProvider("META");
    const r = await executeMarketingActionViaProvider({
      config: config(),
      action: action(),
      provider,
      campaign: { id: "camp-1", providerId: null, providerExternalId: null },
    });
    expect(r.decision.decision).toBe("ALLOWED");
    expect(r.status).toBe("EXECUTED");
    expect(r.executed).toBe(true);
    expect(r.external).toBe(true);
    expect(r.providerId).toBe("FAKE_SANDBOX");
    expect(r.providerExternalId).toContain("fake_mkt_meta");
    expect(r.metricsSnapshot?.budgetCents).toBe(20000);
  });

  it("COPILOT → NUNCA executa (requer aprovação humana)", async () => {
    const provider = new FakeMarketingProvider("META");
    const r = await executeMarketingActionViaProvider({
      config: config({ autonomyLevel: "COPILOT" }),
      action: action(),
      provider,
    });
    expect(r.decision.decision).toBe("REQUIRES_APPROVAL");
    expect(r.status).toBe("NOT_EXECUTED");
    expect(r.external).toBe(false);
  });

  it("guardrails negam no momento da execução (budget diário esgotado)", async () => {
    const provider = new FakeMarketingProvider("META");
    const r = await executeMarketingActionViaProvider({
      config: config(),
      action: action(),
      context: { spentTodayCents: 9999 },
      provider,
    });
    expect(r.decision.decision).toBe("DENIED");
    expect(r.status).toBe("NOT_EXECUTED");
    expect(r.external).toBe(false);
  });

  it("sem provider → fail-safe, nada é executado", async () => {
    const r = await executeMarketingActionViaProvider({
      config: config(),
      action: action(),
      provider: null,
    });
    expect(r.decision.decision).toBe("ALLOWED");
    expect(r.status).toBe("NOT_EXECUTED");
    expect(r.error).toBe("NO_PROVIDER");
  });

  it("ações sem conceito externo ficam apenas registadas", async () => {
    const provider = new FakeMarketingProvider("META");
    for (const type of ["GENERATE_CONTENT", "SUGGEST_TARGETING"] as const) {
      const r = await executeMarketingActionViaProvider({
        config: config(),
        action: action({ type }),
        provider,
      });
      expect(r.status).toBe("NOT_EXECUTED");
      expect(r.external).toBe(false);
      expect(r.error).toBe("NO_EXTERNAL_CONCEPT");
    }
    expect(isProviderExecutingAction("GENERATE_CONTENT")).toBe(false);
    expect(isProviderExecutingAction("CREATE_CAMPAIGN")).toBe(true);
  });

  it("PAUSE sem publicação prévia → FAILED (campanha não publicada)", async () => {
    const provider = new FakeMarketingProvider("META");
    const r = await executeMarketingActionViaProvider({
      config: config(),
      action: action({ type: "PAUSE_CAMPAIGN" }),
      provider,
      campaign: { id: "camp-x", providerId: "FAKE_SANDBOX", providerExternalId: null },
    });
    expect(r.status).toBe("FAILED");
    expect(r.error).toBe("CAMPAIGN_NOT_PUBLISHED");
  });

  it("PAUSE após CREATE altera o estado externo da campanha", async () => {
    const provider = new FakeMarketingProvider("META");
    const created = await executeMarketingActionViaProvider({
      config: config(),
      action: action(),
      provider,
      campaign: { id: "camp-1", providerId: null, providerExternalId: null },
    });
    if (created.status !== "EXECUTED" || !created.providerExternalId) {
      throw new Error("expected executed");
    }
    const paused = await executeMarketingActionViaProvider({
      config: config(),
      action: action({ type: "PAUSE_CAMPAIGN" }),
      provider,
      campaign: {
        id: "camp-1",
        providerId: "FAKE_SANDBOX",
        providerExternalId: created.providerExternalId,
      },
    });
    expect(paused.status).toBe("EXECUTED");
    expect(
      FakeMarketingProvider.getStoreSnapshot().campaigns[0].status,
    ).toBe("PAUSED");
  });
});

describe("validateCampaignStatusTransition", () => {
  it("transições válidas do ciclo de vida", () => {
    expect(validateCampaignStatusTransition("DRAFT", "PENDING_APPROVAL").valid).toBe(true);
    expect(validateCampaignStatusTransition("DRAFT", "ACTIVE").valid).toBe(true);
    expect(validateCampaignStatusTransition("ACTIVE", "PAUSED").valid).toBe(true);
    expect(validateCampaignStatusTransition("PAUSED", "ACTIVE").valid).toBe(true);
    expect(validateCampaignStatusTransition("ACTIVE", "COMPLETED").valid).toBe(true);
  });

  it("estados terminais não transicionam", () => {
    expect(validateCampaignStatusTransition("COMPLETED", "ACTIVE").valid).toBe(false);
    expect(validateCampaignStatusTransition("CANCELLED", "ACTIVE").valid).toBe(false);
    expect(validateCampaignStatusTransition("ACTIVE", "DRAFT").valid).toBe(false);
    expect(validateCampaignStatusTransition("ACTIVE", "ACTIVE").valid).toBe(false);
  });
});

describe("buildLeadIntake (ligação futura)", () => {
  it("intake nasce sempre na etapa LEAD com links vazios", () => {
    const intake = buildLeadIntake({
      leadId: "lead-1",
      externalLeadId: "fake_lead_1",
      companyId: "company-1",
      campaignId: "camp-1",
      providerId: "FAKE_SANDBOX",
      service: "CANALIZACAO",
      zone: "LISBOA",
      estimatedJobValueCents: 30000,
      receivedAt: new Date().toISOString(),
    });
    expect(intake.stage).toBe("LEAD");
    expect(intake.links).toEqual({});
    expect(intake.providerId).toBe("FAKE_SANDBOX");
    expect(intake.estimatedJobValueCents).toBe(30000);
  });
});
