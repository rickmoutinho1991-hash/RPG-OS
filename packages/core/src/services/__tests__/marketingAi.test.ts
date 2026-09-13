import { describe, it, expect } from "vitest";
import {
  canExecuteMarketingAction,
  validateMarketingConfig,
  formatEuroFromCents,
  type MarketingConfig,
  type MarketingAction,
} from "../MarketingAiService";

/** Config base: ativa, AUTOPILOT, limites confortáveis. */
function baseConfig(overrides?: Partial<MarketingConfig>): MarketingConfig {
  return {
    companyId: "company-1",
    isActive: true,
    autonomyLevel: "AUTOPILOT",
    budget: {
      dailyBudgetCents: 10000, // 100 €/dia
      monthlyBudgetCents: 200000, // 2 000 €/mês
      maxCampaignBudgetCents: 50000, // 500 €/campanha
    },
    guardrails: {
      maxCostPerLeadCents: 500, // 5 €
      maxLeadsPerMonth: 50,
      minJobValueCents: 15000, // 150 €
      minMarginBps: null,
      allowedChannels: ["META", "GOOGLE", "WEBSITE", "LOCAL"],
      allowedServices: ["CANALIZACAO", "PINTURA"],
      allowedZones: ["LISBOA", "SINTRA"],
    },
    requiresHumanApproval: false,
    ...overrides,
  };
}

/** Ação base válida: campanha de leads no META, dentro de todos os limites. */
function baseAction(overrides?: Partial<MarketingAction>): MarketingAction {
  return {
    type: "CREATE_CAMPAIGN",
    channel: "META",
    objective: "LEADS",
    estimatedCostCents: 5000, // 50 €
    campaignBudgetCents: 20000, // 200 €
    estimatedCostPerLeadCents: 400, // 4 €
    estimatedLeads: 10,
    service: "CANALIZACAO",
    zone: "LISBOA",
    jobValueCents: 30000, // 300 €
    ...overrides,
  };
}

describe("COPILOT", () => {
  it("requer aprovação para qualquer ação, mesmo dentro dos limites", () => {
    const d = canExecuteMarketingAction(
      baseConfig({ autonomyLevel: "COPILOT" }),
      baseAction(),
    );
    expect(d.decision).toBe("REQUIRES_APPROVAL");
    expect(d.reason).toBe("AUTONOMY_COPILOT_REQUIRES_APPROVAL");
  });

  it("requer aprovação também quando há violação de limite de período", () => {
    const d = canExecuteMarketingAction(
      baseConfig({ autonomyLevel: "COPILOT" }),
      baseAction(),
      { spentTodayCents: 9999 },
    );
    expect(d.decision).toBe("REQUIRES_APPROVAL");
    expect(d.violation).toBe("DAILY_BUDGET_EXCEEDED");
  });

  it("negado em violação dura (canal não autorizado), mesmo em COPILOT", () => {
    const d = canExecuteMarketingAction(
      baseConfig({ autonomyLevel: "COPILOT" }),
      baseAction({ channel: "TIKTOK" }),
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("CHANNEL_NOT_ALLOWED");
  });
});

describe("SEMI_AUTONOMOUS", () => {
  it("dentro dos limites → permitido", () => {
    const d = canExecuteMarketingAction(
      baseConfig({ autonomyLevel: "SEMI_AUTONOMOUS" }),
      baseAction(),
    );
    expect(d.decision).toBe("ALLOWED");
  });

  it("orçamento diário excedido → requer aprovação", () => {
    const d = canExecuteMarketingAction(
      baseConfig({ autonomyLevel: "SEMI_AUTONOMOUS" }),
      baseAction(),
      { spentTodayCents: 6000 }, // 60 + 50 > 100 €
    );
    expect(d.decision).toBe("REQUIRES_APPROVAL");
    expect(d.violation).toBe("DAILY_BUDGET_EXCEEDED");
  });

  it("orçamento mensal excedido → requer aprovação", () => {
    const d = canExecuteMarketingAction(
      baseConfig({ autonomyLevel: "SEMI_AUTONOMOUS" }),
      baseAction(),
      { spentThisMonthCents: 196000 },
    );
    expect(d.decision).toBe("REQUIRES_APPROVAL");
    expect(d.violation).toBe("MONTHLY_BUDGET_EXCEEDED");
  });

  it("canal não autorizado → negado (allowlist é violação dura)", () => {
    const d = canExecuteMarketingAction(
      baseConfig({ autonomyLevel: "SEMI_AUTONOMOUS" }),
      baseAction({ channel: "TIKTOK" }),
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("CHANNEL_NOT_ALLOWED");
  });
});

describe("AUTOPILOT", () => {
  it("dentro dos limites → permitido", () => {
    const d = canExecuteMarketingAction(baseConfig(), baseAction());
    expect(d.decision).toBe("ALLOWED");
    expect(d.reason).toBe("OK");
  });

  it("orçamento diário excedido → negado", () => {
    const d = canExecuteMarketingAction(baseConfig(), baseAction(), {
      spentTodayCents: 9501, // 95,01 + 50 > 100 €
    });
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("DAILY_BUDGET_EXCEEDED");
  });

  it("orçamento mensal excedido → negado", () => {
    const d = canExecuteMarketingAction(baseConfig(), baseAction(), {
      spentThisMonthCents: 195001,
    });
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("MONTHLY_BUDGET_EXCEEDED");
  });

  it("campanha acima do máximo → negado", () => {
    const d = canExecuteMarketingAction(
      baseConfig(),
      baseAction({ campaignBudgetCents: 50001 }),
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("CAMPAIGN_BUDGET_EXCEEDED");
  });

  it("custo por lead acima do limite → negado", () => {
    const d = canExecuteMarketingAction(
      baseConfig(),
      baseAction({ estimatedCostPerLeadCents: 501 }),
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("COST_PER_LEAD_EXCEEDED");
  });

  it("custo por lead derivado de custo ÷ leads acima do limite → negado", () => {
    const d = canExecuteMarketingAction(
      baseConfig(),
      baseAction({ estimatedCostCents: 5000, estimatedLeads: 9, estimatedCostPerLeadCents: null }),
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("COST_PER_LEAD_EXCEEDED");
  });

  it("número máximo de leads excedido → negado", () => {
    const d = canExecuteMarketingAction(baseConfig(), baseAction(), {
      leadsThisMonth: 45,
    });
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("MAX_LEADS_EXCEEDED");
  });

  it("kill-switch de aprovação humana → requer aprovação mesmo em AUTOPILOT", () => {
    const d = canExecuteMarketingAction(
      baseConfig({ requiresHumanApproval: true }),
      baseAction(),
    );
    expect(d.decision).toBe("REQUIRES_APPROVAL");
    expect(d.reason).toBe("HUMAN_APPROVAL_REQUIRED");
  });
});

describe("Guardrails duros (todos os níveis)", () => {
  it("serviço não autorizado → negado", () => {
    const d = canExecuteMarketingAction(
      baseConfig(),
      baseAction({ service: "ELETRICIDADE" }),
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("SERVICE_NOT_ALLOWED");
  });

  it("serviço autorizado é case-insensitive", () => {
    const d = canExecuteMarketingAction(
      baseConfig(),
      baseAction({ service: "canalizacao" }),
    );
    expect(d.decision).toBe("ALLOWED");
  });

  it("zona não autorizada → negado", () => {
    const d = canExecuteMarketingAction(
      baseConfig(),
      baseAction({ zone: "PORTO" }),
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("ZONE_NOT_ALLOWED");
  });

  it("trabalho abaixo do valor mínimo → negado", () => {
    const d = canExecuteMarketingAction(
      baseConfig(),
      baseAction({ jobValueCents: 14999 }),
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("JOB_VALUE_BELOW_MINIMUM");
  });

  it("margem abaixo da mínima → negado", () => {
    const cfg = baseConfig();
    cfg.guardrails.minMarginBps = 2000; // 20 %
    const d = canExecuteMarketingAction(
      cfg,
      baseAction({ estimatedMarginBps: 1999 }),
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("MARGIN_BELOW_MINIMUM");
  });

  it("lista de serviços vazia = nada autorizado", () => {
    const cfg = baseConfig();
    cfg.guardrails.allowedServices = [];
    const d = canExecuteMarketingAction(cfg, baseAction());
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("SERVICE_NOT_ALLOWED");
  });
});

describe("Configuração", () => {
  it("config inativa (OFF) → negado", () => {
    const d = canExecuteMarketingAction(
      baseConfig({ isActive: false }),
      baseAction(),
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("CONFIG_INACTIVE");
  });

  it("autonomia inválida → negada (defesa em profundidade)", () => {
    const cfg = baseConfig();
    // Simula valor corrompido na BD (ex.: dado inválido escrito à mão).
    (cfg as unknown as { autonomyLevel: string }).autonomyLevel = "GODMODE";
    const d = canExecuteMarketingAction(cfg, baseAction());
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("INVALID_AUTONOMY");
  });

  it("config inválida (orçamento mensal < diário) → negada", () => {
    const cfg = baseConfig();
    cfg.budget.monthlyBudgetCents = 100; // < daily 10000
    const d = canExecuteMarketingAction(cfg, baseAction());
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("INVALID_CONFIG");
  });

  it("validateMarketingConfig rejeita valores monetários inválidos", () => {
    const negatives = [
      { dailyBudgetCents: -1, monthlyBudgetCents: 200000, maxCampaignBudgetCents: 50000 },
      { dailyBudgetCents: 100.5, monthlyBudgetCents: 200000, maxCampaignBudgetCents: 50000 },
      { dailyBudgetCents: 10000, monthlyBudgetCents: Number.NaN, maxCampaignBudgetCents: 50000 },
    ];
    for (const budget of negatives) {
      const v = validateMarketingConfig(baseConfig({ budget }));
      expect(v.valid).toBe(false);
    }
  });

  it("validateMarketingConfig rejeita autonomia/canais desconhecidos", () => {
    const badAutonomy = baseConfig();
    (badAutonomy as unknown as { autonomyLevel: string }).autonomyLevel = "FULL_AUTO";
    expect(validateMarketingConfig(badAutonomy).valid).toBe(false);

    const badChannel = baseConfig();
    badChannel.guardrails.allowedChannels = ["CARRIER_PIGEON" as never];
    expect(validateMarketingConfig(badChannel).valid).toBe(false);
  });

  it("validateMarketingConfig aceita a configuração base", () => {
    expect(validateMarketingConfig(baseConfig()).valid).toBe(true);
  });
});

describe("Ações inválidas", () => {
  it("valores monetários negativos → negado", () => {
    const d = canExecuteMarketingAction(
      baseConfig(),
      baseAction({ estimatedCostCents: -500 }),
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("INVALID_ACTION");
  });

  it("valores monetários fracionários → negado (cêntimos inteiros)", () => {
    const d = canExecuteMarketingAction(
      baseConfig(),
      baseAction({ campaignBudgetCents: 100.5 }),
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("INVALID_ACTION");
  });

  it("canal desconhecido na ação → negado", () => {
    const d = canExecuteMarketingAction(
      baseConfig(),
      baseAction({ channel: "SNAPCHAT" as never }),
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("INVALID_ACTION");
  });

  it("margem fora do domínio (bps) → negado", () => {
    const d = canExecuteMarketingAction(
      baseConfig(),
      baseAction({ estimatedMarginBps: 20000 }),
    );
    expect(d.decision).toBe("DENIED");
    expect(d.reason).toBe("INVALID_ACTION");
  });
});

describe("formatEuroFromCents", () => {
  it("formata cêntimos como euros", () => {
    expect(formatEuroFromCents(82065)).toContain("820,65");
    expect(formatEuroFromCents(0)).toContain("0,00");
    expect(formatEuroFromCents(Number.NaN)).toBe("—");
  });
});
