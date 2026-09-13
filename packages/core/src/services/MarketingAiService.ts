/**
 * RPG-OS Marketing AI / Autopilot — FUNDAÇÃO DE DOMÍNIO (serviço puro).
 *
 * Sem dependências de Next.js, Supabase ou BD. Tudo determinístico e
 * testável. O servidor persiste as decisões calculadas aqui; o cliente
 * NUNCA fornece budget, autonomia, limites ou empresa — só sugestões.
 *
 * Princípios:
 *  - Todo o dinheiro em CENTAVOS inteiros (bigint na BD) — zero floating point;
 *  - A decisão de execução é separada da geração da recomendação: a IA pode
 *    sugerir uma ação que os guardrails rejeitam de seguida;
 *  - Nenhuma ação da IA consegue ultrapassar os limites configurados;
 *  - Nesta fase NÃO existem integrações externas (Meta/Google/TikTok) —
 *    os adapters são apenas contratos; nada é publicado.
 */

/* ─── Níveis de autonomia ─────────────────────────────────────────────── */

/**
 * Níveis de autonomia da IA de marketing:
 *  - COPILOT: analisa e sugere; nada é executado sem aprovação humana;
 *  - SEMI_AUTONOMOUS: executa ações pré-autorizadas dentro dos limites;
 *    ações fora dos limites exigem aprovação; violações de allowlist são negadas;
 *  - AUTOPILOT: executa automaticamente DENTRO dos limites; qualquer limite
 *    ultrapassado → DENIED (nunca escalam para fora dos guardrails).
 * O estado "OFF" do produto é representado por `isActive: false` na config.
 */
export type MarketingAutonomyLevel =
  | "COPILOT"
  | "SEMI_AUTONOMOUS"
  | "AUTOPILOT";

export const MARKETING_AUTONOMY_LEVELS = [
  "COPILOT",
  "SEMI_AUTONOMOUS",
  "AUTOPILOT",
] as const satisfies readonly MarketingAutonomyLevel[];

export function isValidAutonomyLevel(
  value: unknown,
): value is MarketingAutonomyLevel {
  return (
    typeof value === "string" &&
    (MARKETING_AUTONOMY_LEVELS as readonly string[]).includes(value)
  );
}

/* ─── Estados de campanha / objetivos / canais ────────────────────────── */

export type MarketingCampaignStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

export const MARKETING_CAMPAIGN_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const satisfies readonly MarketingCampaignStatus[];

export type MarketingObjective =
  | "LEADS"
  | "QUOTES"
  | "JOBS"
  | "AWARENESS";

export const MARKETING_OBJECTIVES = [
  "LEADS",
  "QUOTES",
  "JOBS",
  "AWARENESS",
] as const satisfies readonly MarketingObjective[];

/**
 * Canais preparados para integração FUTURA. Nenhum canal está ligado nesta
 * fase — a existência do enum não implica conectividade.
 */
export type MarketingChannel =
  | "META"
  | "GOOGLE"
  | "INSTAGRAM"
  | "FACEBOOK"
  | "TIKTOK"
  | "LOCAL"
  | "WEBSITE";

export const MARKETING_CHANNELS = [
  "META",
  "GOOGLE",
  "INSTAGRAM",
  "FACEBOOK",
  "TIKTOK",
  "LOCAL",
  "WEBSITE",
] as const satisfies readonly MarketingChannel[];

export function isValidMarketingChannel(
  value: unknown,
): value is MarketingChannel {
  return (
    typeof value === "string" &&
    (MARKETING_CHANNELS as readonly string[]).includes(value)
  );
}

export function isValidMarketingObjective(
  value: unknown,
): value is MarketingObjective {
  return (
    typeof value === "string" &&
    (MARKETING_OBJECTIVES as readonly string[]).includes(value)
  );
}

/* ─── Configuração (budget + guardrails) ──────────────────────────────── */

export interface MarketingBudget {
  /** Teto de gasto por dia (cêntimos). */
  dailyBudgetCents: number;
  /** Teto de gasto por mês (cêntimos). Deve ser ≥ daily. */
  monthlyBudgetCents: number;
  /** Teto de orçamento por campanha (cêntimos). */
  maxCampaignBudgetCents: number;
}

export interface MarketingGuardrails {
  /** Custo máximo aceitável por lead (cêntimos). */
  maxCostPerLeadCents: number;
  /** Número máximo de leads por mês. */
  maxLeadsPerMonth: number;
  /** Valor mínimo de trabalho aceitável (cêntimos). */
  minJobValueCents: number;
  /** Margem mínima exigida (basis points, 0..10000). null = não aplicável. */
  minMarginBps: number | null;
  /** Canais autorizados pelo proprietário. */
  allowedChannels: MarketingChannel[];
  /** Serviços autorizados (comparação case-insensitive). */
  allowedServices: string[];
  /** Zonas autorizadas (comparação case-insensitive). */
  allowedZones: string[];
}

/**
 * Configuração completa do Marketing AI de UMA empresa (multi-tenant).
 * `isActive: false` = estado OFF do produto (nenhuma ação é decidida).
 */
export interface MarketingConfig {
  companyId: string;
  isActive: boolean;
  autonomyLevel: MarketingAutonomyLevel;
  budget: MarketingBudget;
  guardrails: MarketingGuardrails;
  /**
   * Kill-switch do proprietário: quando true, TODAS as ações — mesmo em
   * AUTOPILOT — exigem aprovação humana prévia.
   */
  requiresHumanApproval: boolean;
}

export function isSafeNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Normaliza texto para comparação de listas (serviços/zonas). */
function normalizeListItem(value: string): string {
  return value.trim().toUpperCase();
}

export interface MarketingConfigValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validação estrutural completa da configuração. Regras:
 *  - autonomia pertence ao enum; canais são conhecidos;
 *  - todos os valores monetários são inteiros seguros ≥ 0;
 *  - monthly ≥ daily; maxCampaignBudget ≤ monthly;
 *  - maxCostPerLead e minJobValue ≥ 0; maxLeadsPerMonth ≥ 0;
 *  - minMarginBps ∈ 0..10000 ou null; listas são arrays de strings não vazias.
 */
export function validateMarketingConfig(
  config: MarketingConfig | null | undefined,
): MarketingConfigValidation {
  const errors: string[] = [];
  if (!config || typeof config !== "object") {
    return { valid: false, errors: ["Configuração em falta."] };
  }
  if (typeof config.companyId !== "string" || !config.companyId.trim()) {
    errors.push("Identificador da empresa em falta.");
  }
  if (typeof config.isActive !== "boolean") {
    errors.push("Estado ativo inválido.");
  }
  if (!isValidAutonomyLevel(config.autonomyLevel)) {
    errors.push(
      `Nível de autonomia inválido. Valores permitidos: ${MARKETING_AUTONOMY_LEVELS.join(", ")}.`,
    );
  }
  const b = config.budget;
  if (!b || typeof b !== "object") {
    errors.push("Orçamento em falta.");
  } else {
    if (!isSafeNonNegativeInt(b.dailyBudgetCents)) {
      errors.push("Orçamento diário deve ser um inteiro não-negativo (cêntimos).");
    }
    if (!isSafeNonNegativeInt(b.monthlyBudgetCents)) {
      errors.push("Orçamento mensal deve ser um inteiro não-negativo (cêntimos).");
    }
    if (!isSafeNonNegativeInt(b.maxCampaignBudgetCents)) {
      errors.push(
        "Orçamento máximo por campanha deve ser um inteiro não-negativo (cêntimos).",
      );
    }
    if (
      isSafeNonNegativeInt(b.dailyBudgetCents) &&
      isSafeNonNegativeInt(b.monthlyBudgetCents) &&
      b.monthlyBudgetCents < b.dailyBudgetCents
    ) {
      errors.push("Orçamento mensal não pode ser inferior ao diário.");
    }
    if (
      isSafeNonNegativeInt(b.maxCampaignBudgetCents) &&
      isSafeNonNegativeInt(b.monthlyBudgetCents) &&
      b.maxCampaignBudgetCents > b.monthlyBudgetCents
    ) {
      errors.push(
        "Orçamento máximo por campanha não pode exceder o orçamento mensal.",
      );
    }
  }
  const g = config.guardrails;
  if (!g || typeof g !== "object") {
    errors.push("Guardrails em falta.");
  } else {
    if (!isSafeNonNegativeInt(g.maxCostPerLeadCents)) {
      errors.push("Custo máximo por lead deve ser um inteiro não-negativo (cêntimos).");
    }
    if (!isSafeNonNegativeInt(g.maxLeadsPerMonth)) {
      errors.push("Número máximo de leads deve ser um inteiro não-negativo.");
    }
    if (!isSafeNonNegativeInt(g.minJobValueCents)) {
      errors.push("Valor mínimo de trabalho deve ser um inteiro não-negativo (cêntimos).");
    }
    if (
      g.minMarginBps !== null &&
      (!Number.isSafeInteger(g.minMarginBps) ||
        g.minMarginBps < 0 ||
        g.minMarginBps > 10000)
    ) {
      errors.push("Margem mínima deve estar entre 0 e 10000 basis points.");
    }
    if (
      !Array.isArray(g.allowedChannels) ||
      g.allowedChannels.some((c) => !isValidMarketingChannel(c))
    ) {
      errors.push("Canais autorizados contêm valores desconhecidos.");
    }
    for (const [label, list] of [
      ["serviços", g.allowedServices],
      ["zonas", g.allowedZones],
    ] as const) {
      if (
        !Array.isArray(list) ||
        list.some((v) => typeof v !== "string" || !v.trim())
      ) {
        errors.push(`Lista de ${label} autorizados é inválida.`);
      }
    }
  }
  if (typeof config.requiresHumanApproval !== "boolean") {
    errors.push("Indicador de aprovação humana inválido.");
  }
  return { valid: errors.length === 0, errors };
}

/* ─── Ações da IA e decisão determinística ────────────────────────────── */

export type MarketingActionType =
  | "CREATE_CAMPAIGN"
  | "PAUSE_CAMPAIGN"
  | "RESUME_CAMPAIGN"
  | "ADJUST_BUDGET"
  | "GENERATE_CONTENT"
  | "SUGGEST_TARGETING";

export const MARKETING_ACTION_TYPES = [
  "CREATE_CAMPAIGN",
  "PAUSE_CAMPAIGN",
  "RESUME_CAMPAIGN",
  "ADJUST_BUDGET",
  "GENERATE_CONTENT",
  "SUGGEST_TARGETING",
] as const satisfies readonly MarketingActionType[];

/**
 * Ação PROPOSTA pela IA (recomendação). A decisão de execução é calculada
 * depois, contra os guardrails — a IA nunca decide sozinha.
 */
export interface MarketingAction {
  type: MarketingActionType;
  channel: MarketingChannel;
  objective: MarketingObjective;
  /** Custo estimado total da ação (cêntimos). */
  estimatedCostCents?: number | null;
  /** Orçamento da campanha proposta/alterada (cêntimos). */
  campaignBudgetCents?: number | null;
  /** Custo estimado por lead (cêntimos). Derivado se custo+leads presentes. */
  estimatedCostPerLeadCents?: number | null;
  estimatedLeads?: number | null;
  /** Serviço alvo (validado contra allowedServices). */
  service?: string | null;
  /** Zona alvo (validada contra allowedZones). */
  zone?: string | null;
  /** Valor de trabalho associado ao lead/objetivo (cêntimos). */
  jobValueCents?: number | null;
  /** Margem estimada (basis points). */
  estimatedMarginBps?: number | null;
}

export type MarketingDecision =
  | "ALLOWED"
  | "REQUIRES_APPROVAL"
  | "DENIED";

export type MarketingDecisionReason =
  | "OK"
  | "CONFIG_INACTIVE"
  | "INVALID_CONFIG"
  | "INVALID_AUTONOMY"
  | "INVALID_ACTION"
  | "CHANNEL_NOT_ALLOWED"
  | "SERVICE_NOT_ALLOWED"
  | "ZONE_NOT_ALLOWED"
  | "COST_PER_LEAD_EXCEEDED"
  | "CAMPAIGN_BUDGET_EXCEEDED"
  | "DAILY_BUDGET_EXCEEDED"
  | "MONTHLY_BUDGET_EXCEEDED"
  | "MAX_LEADS_EXCEEDED"
  | "JOB_VALUE_BELOW_MINIMUM"
  | "MARGIN_BELOW_MINIMUM"
  | "HUMAN_APPROVAL_REQUIRED"
  | "AUTONOMY_COPILOT_REQUIRES_APPROVAL";

export interface MarketingActionDecision {
  decision: MarketingDecision;
  reason: MarketingDecisionReason;
  /** Mensagem determinística para audit/UI. */
  message: string;
  /** Violação concreta detetada (mesmo quando a decisão final é approval). */
  violation?: MarketingDecisionReason;
}

export interface MarketingActionContext {
  /** Gasto já acumulado hoje (cêntimos) — resolvido SERVER-SIDE. */
  spentTodayCents?: number;
  /** Gasto já acumulado no mês (cêntimos) — resolvido SERVER-SIDE. */
  spentThisMonthCents?: number;
  /** Leads já adquiridos no mês — resolvido SERVER-SIDE. */
  leadsThisMonth?: number;
}

function deny(
  reason: MarketingDecisionReason,
  message: string,
): MarketingActionDecision {
  return { decision: "DENIED", reason, message, violation: reason };
}

function requireApproval(
  reason: MarketingDecisionReason,
  message: string,
  violation?: MarketingDecisionReason,
): MarketingActionDecision {
  return {
    decision: "REQUIRES_APPROVAL",
    reason,
    message,
    violation: violation ?? reason,
  };
}

function allow(): MarketingActionDecision {
  return {
    decision: "ALLOWED",
    reason: "OK",
    message: "Ação dentro dos limites configurados.",
  };
}

/**
 * Verificação de allowlist (case-insensitive). Lista vazia = nada
 * autorizado → qualquer valor específico é recusado.
 */
function isAllowedInList(
  list: string[],
  value: string | null | undefined,
): boolean {
  if (value === null || value === undefined || !value.trim()) return false;
  const norm = normalizeListItem(value);
  return list.some((item) => normalizeListItem(item) === norm);
}

/**
 * NÚCLEO DOS GUARDRAILS — decisão pura e determinística.
 *
 * Semântica:
 *  - OFF (isActive=false) ou config/autonomia inválidos → DENIED;
 *  - Allowlists (canal/serviço/zona), custo por lead, orçamento máximo de
 *    campanha, valor mínimo de trabalho e margem mínima são VIOLAÇÕES DUURAS:
 *    DENIED para qualquer nível de autonomia;
 *  - Limites de período (diário, mensal, nº leads) ultrapassados:
 *      · COPILOT/SEMI_AUTONOMOUS → REQUIRES_APPROVAL (o humano decide),
 *      · AUTOPILOT → DENIED (a IA nunca ultrapassa os limites);
 *  - requiresHumanApproval (kill-switch) → tudo REQUIRES_APPROVAL;
 *  - COPILOT → tudo REQUIRES_APPROVAL (a IA só sugere).
 */
export function canExecuteMarketingAction(
  config: MarketingConfig,
  action: MarketingAction,
  context: MarketingActionContext = {},
): MarketingActionDecision {
  // ── 1. Configuração ──────────────────────────────────────────────────
  if (!config || typeof config !== "object") {
    return deny("INVALID_CONFIG", "Configuração de marketing inexistente.");
  }
  if (!isValidAutonomyLevel(config.autonomyLevel)) {
    return deny(
      "INVALID_AUTONOMY",
      "Nível de autonomia da IA é inválido — nenhuma ação pode ser executada.",
    );
  }
  if (!config.isActive) {
    return deny(
      "CONFIG_INACTIVE",
      "Marketing AI está desligado (OFF) para esta empresa.",
    );
  }
  const cfgVal = validateMarketingConfig(config);
  if (!cfgVal.valid) {
    return deny(
      "INVALID_CONFIG",
      `Configuração inválida: ${cfgVal.errors.join(" ")}`,
    );
  }

  // ── 2. Forma da ação ─────────────────────────────────────────────────
  const moneyFields: Array<number | null | undefined> = [
    action?.estimatedCostCents,
    action?.campaignBudgetCents,
    action?.estimatedCostPerLeadCents,
    action?.jobValueCents,
  ];
  if (
    !action ||
    typeof action !== "object" ||
    !isValidMarketingChannel(action.channel) ||
    !isValidMarketingObjective(action.objective) ||
    !(MARKETING_ACTION_TYPES as readonly string[]).includes(action.type) ||
    (action.estimatedLeads !== null &&
      action.estimatedLeads !== undefined &&
      !isSafeNonNegativeInt(action.estimatedLeads)) ||
    (action.estimatedMarginBps !== null &&
      action.estimatedMarginBps !== undefined &&
      (!Number.isSafeInteger(action.estimatedMarginBps) ||
        action.estimatedMarginBps < 0 ||
        action.estimatedMarginBps > 10000)) ||
    moneyFields.some(
      (v) => v !== null && v !== undefined && !isSafeNonNegativeInt(v),
    )
  ) {
    return deny(
      "INVALID_ACTION",
      "Ação da IA inválida (canal, objetivo, tipo ou valores monetários fora do domínio).",
    );
  }

  // ── 3. Guardrails duros (DENIED para qualquer autonomia) ─────────────
  const g = config.guardrails;
  const budget = config.budget;
  if (!g.allowedChannels.includes(action.channel)) {
    return deny(
      "CHANNEL_NOT_ALLOWED",
      `Canal "${action.channel}" não está autorizado pelo proprietário.`,
    );
  }
  if (action.service && !isAllowedInList(g.allowedServices, action.service)) {
    return deny(
      "SERVICE_NOT_ALLOWED",
      `Serviço "${action.service}" não está autorizado pelo proprietário.`,
    );
  }
  if (action.zone && !isAllowedInList(g.allowedZones, action.zone)) {
    return deny(
      "ZONE_NOT_ALLOWED",
      `Zona "${action.zone}" não está autorizada pelo proprietário.`,
    );
  }
  if (
    action.jobValueCents !== null &&
    action.jobValueCents !== undefined &&
    action.jobValueCents < g.minJobValueCents
  ) {
    return deny(
      "JOB_VALUE_BELOW_MINIMUM",
      "Valor de trabalho estimado está abaixo do mínimo configurado.",
    );
  }
  // Custo por lead: explícito ou derivado de custo ÷ leads (arred. por cima).
  const derivedPerLead =
    action.estimatedCostPerLeadCents == null &&
    isSafeNonNegativeInt(action.estimatedCostCents) &&
    isSafeNonNegativeInt(action.estimatedLeads) &&
    (action.estimatedLeads as number) > 0
      ? Math.ceil(
          (action.estimatedCostCents as number) /
            (action.estimatedLeads as number),
        )
      : null;
  const effectivePerLead = action.estimatedCostPerLeadCents ?? derivedPerLead;
  if (
    effectivePerLead !== null &&
    effectivePerLead !== undefined &&
    effectivePerLead > g.maxCostPerLeadCents
  ) {
    return deny(
      "COST_PER_LEAD_EXCEEDED",
      "Custo por lead estimado excede o máximo configurado.",
    );
  }
  if (
    action.campaignBudgetCents !== null &&
    action.campaignBudgetCents !== undefined &&
    action.campaignBudgetCents > budget.maxCampaignBudgetCents
  ) {
    return deny(
      "CAMPAIGN_BUDGET_EXCEEDED",
      "Orçamento de campanha excede o máximo configurado.",
    );
  }
  if (
    action.estimatedMarginBps !== null &&
    action.estimatedMarginBps !== undefined &&
    g.minMarginBps !== null &&
    action.estimatedMarginBps < g.minMarginBps
  ) {
    return deny(
      "MARGIN_BELOW_MINIMUM",
      "Margem estimada está abaixo da margem mínima configurada.",
    );
  }

  // ── 4. Limites de período (contexto sempre resolvido server-side) ────
  const cost = action.estimatedCostCents ?? 0;
  const spentToday = isSafeNonNegativeInt(context.spentTodayCents)
    ? (context.spentTodayCents as number)
    : 0;
  const spentMonth = isSafeNonNegativeInt(context.spentThisMonthCents)
    ? (context.spentThisMonthCents as number)
    : 0;
  const leadsMonth = isSafeNonNegativeInt(context.leadsThisMonth)
    ? (context.leadsThisMonth as number)
    : 0;
  const estimatedLeads = action.estimatedLeads ?? 0;

  let periodViolation: MarketingDecisionReason | null = null;
  if (spentToday + cost > budget.dailyBudgetCents) {
    periodViolation = "DAILY_BUDGET_EXCEEDED";
  } else if (spentMonth + cost > budget.monthlyBudgetCents) {
    periodViolation = "MONTHLY_BUDGET_EXCEEDED";
  } else if (
    g.maxLeadsPerMonth > 0 &&
    leadsMonth + estimatedLeads > g.maxLeadsPerMonth
  ) {
    periodViolation = "MAX_LEADS_EXCEEDED";
  }

  // ── 5. Autonomia + kill-switch humano ────────────────────────────────
  if (config.requiresHumanApproval) {
    return requireApproval(
      "HUMAN_APPROVAL_REQUIRED",
      "O proprietário exige aprovação humana para todas as ações.",
      periodViolation ?? undefined,
    );
  }
  if (config.autonomyLevel === "COPILOT") {
    return periodViolation
      ? requireApproval(
          periodViolation,
          "A IA opera em COPILOT: a ação excede limites e requer aprovação humana.",
          periodViolation,
        )
      : requireApproval(
          "AUTONOMY_COPILOT_REQUIRES_APPROVAL",
          "A IA opera em COPILOT: nenhuma ação é executada sem aprovação humana.",
        );
  }
  if (config.autonomyLevel === "SEMI_AUTONOMOUS") {
    return periodViolation
      ? requireApproval(
          periodViolation,
          "Ação fora dos limites configurados — requer aprovação humana.",
          periodViolation,
        )
      : allow();
  }
  // AUTOPILOT: executa automaticamente DENTRO dos limites; fora → DENIED.
  return periodViolation
    ? deny(
        periodViolation,
        "AUTOPILOT nunca ultrapassa os limites definidos — ação negada.",
      )
    : allow();
}

/* ─── Formatação (apresentação) ───────────────────────────────────────── */

/** Formata cêntimos como euros (pt-PT) para UI/audit legível. */
export function formatEuroFromCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) return "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
