/**
 * RPG-OS — Marketing AI / Autopilot (lado servidor).
 *
 * Segurança:
 *  - O cliente/browser NUNCA é fonte de confiança: nem company_id, nem
 *    budget, nem autonomia, nem limites, nem aprovações. Tudo é resolvido
 *    na BD a partir da sessão (company_employees) e validado em @rpg/core;
 *  - RBAC: marketing.view (ler), marketing.manage (configurar), marketing.execute
 *    (propor ações que passam pelos guardrails);
 *  - Ativação de AUTOPILOT exige workflow/aprovação (motor EXISTENTE, sem
 *    segundo sistema) — os valores só vigoram após WORKFLOW_APPROVED;
 *  - TODAS as mutações produzem audit_logs com quem, empresa, quando, ação
 *    e valores relevantes;
 *  - Nesta fase nada é executado em publicidade real; ações que passam nos
 *    guardrails podem ser executadas contra o FakeMarketingProvider (sandbox,
 *    store em memória). Sem gasto real em Meta/Google/TikTok.
 */
import { getSessionContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { startApproval } from "@/lib/workflows";
import { runSandboxExecution } from "@/lib/marketingExecution";
import {
  hasPermission,
  validateMarketingConfig,
  canExecuteMarketingAction,
  parseEuroToCents,
  isValidAutonomyLevel,
  isValidMarketingChannel,
  MARKETING_CHANNELS,
  MARKETING_AUTONOMY_LEVELS,
  type MarketingAutonomyLevel,
  type MarketingConfig,
  type MarketingAction,
  type MarketingActionType,
  type MarketingObjective,
} from "@rpg/core";

export const MARKETING_VIEW_PERMISSION = "marketing.view";
export const MARKETING_MANAGE_PERMISSION = "marketing.manage";
export const MARKETING_EXECUTE_PERMISSION = "marketing.execute";

const MARKETING_MODULE = "MARKETING_AI";

/* ─── Vistas (dados já mapeados server-side) ──────────────────────────── */

export interface MarketingCompanyOption {
  id: string;
  name: string;
}

export interface MarketingConfigView {
  companyId: string;
  isActive: boolean;
  autonomyLevel: MarketingAutonomyLevel;
  dailyBudgetCents: number;
  monthlyBudgetCents: number;
  maxCampaignBudgetCents: number;
  maxCostPerLeadCents: number;
  maxLeadsPerMonth: number;
  minJobValueCents: number;
  minMarginBps: number | null;
  allowedChannels: string[];
  allowedServices: string[];
  allowedZones: string[];
  requiresHumanApproval: boolean;
  updatedAt: string | null;
}

export interface MarketingActionView {
  id: string;
  actionType: string;
  objective: string;
  channel: string;
  decision: string;
  reasonCode: string;
  message: string;
  status: string;
  estimatedCostCents: number | null;
  estimatedCostPerLeadCents: number | null;
  estimatedLeads: number | null;
  service: string | null;
  zone: string | null;
  jobValueCents: number | null;
  requestedByName: string | null;
  createdAt: string | null;
}

export interface MarketingCampaignView {
  id: string;
  name: string;
  objective: string;
  status: string;
  channels: string[];
  budgetCents: number;
  providerId: string | null;
  providerExternalId: string | null;
  createdAt: string | null;
}

export interface MarketingLeadView {
  id: string;
  name: string | null;
  contact: string | null;
  service: string | null;
  zone: string | null;
  estimatedJobValueCents: number | null;
  stage: string;
  receivedAt: string | null;
}

export interface MarketingPageData {
  authorized: boolean;
  canManage: boolean;
  canExecute: boolean;
  companies: MarketingCompanyOption[];
  companyId: string | null;
  config: MarketingConfigView | null;
  campaigns: MarketingCampaignView[];
  leads: MarketingLeadView[];
  actions: MarketingActionView[];
  spentTodayCents: number;
  spentThisMonthCents: number;
  leadsThisMonth: number;
  pendingInstanceId: string | null;
}

/* ─── Âmbito multi-tenant (resolvido NA BD, nunca no cliente) ─────────── */

async function getManagedCompanies(userId: string): Promise<MarketingCompanyOption[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("company_employees")
    .select("company_id, companies(name)")
    .eq("user_id", userId);
  return (data ?? [])
    .map((m: Record<string, unknown>) => ({
      id: String(m.company_id ?? ""),
      name:
        ((m.companies as { name?: string } | null)?.name as string) ?? "Empresa",
    }))
    .filter((c) => c.id);
}

/** Empresa alvo: pedida pelo cliente SÓ se pertencer ao âmbito do ator. */
function resolveTargetCompanyId(
  companies: MarketingCompanyOption[],
  requested: string | null | undefined,
): string | null {
  if (requested) {
    const found = companies.find(
      (c) => c.id.toLowerCase() === requested.toLowerCase(),
    );
    if (found) return found.id;
  }
  return companies[0]?.id ?? null;
}

function mapConfigRow(
  row: Record<string, unknown>,
): MarketingConfigView {
  return {
    companyId: String(row.company_id),
    isActive: row.is_active === true,
    autonomyLevel: row.autonomy_level as MarketingAutonomyLevel,
    dailyBudgetCents: Number(row.daily_budget_cents ?? 0),
    monthlyBudgetCents: Number(row.monthly_budget_cents ?? 0),
    maxCampaignBudgetCents: Number(row.max_campaign_budget_cents ?? 0),
    maxCostPerLeadCents: Number(row.max_cost_per_lead_cents ?? 0),
    maxLeadsPerMonth: Number(row.max_leads_per_month ?? 0),
    minJobValueCents: Number(row.min_job_value_cents ?? 0),
    minMarginBps: row.min_margin_bps === null ? null : Number(row.min_margin_bps),
    allowedChannels: (row.allowed_channels as string[] | null) ?? [],
    allowedServices: (row.allowed_services as string[] | null) ?? [],
    allowedZones: (row.allowed_zones as string[] | null) ?? [],
    requiresHumanApproval: row.requires_human_approval === true,
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}

/** Converte a vista persistida na config pura do core (fonte: BD). */
function toCoreConfig(v: MarketingConfigView): MarketingConfig {
  return {
    companyId: v.companyId,
    isActive: v.isActive,
    autonomyLevel: v.autonomyLevel,
    budget: {
      dailyBudgetCents: v.dailyBudgetCents,
      monthlyBudgetCents: v.monthlyBudgetCents,
      maxCampaignBudgetCents: v.maxCampaignBudgetCents,
    },
    guardrails: {
      maxCostPerLeadCents: v.maxCostPerLeadCents,
      maxLeadsPerMonth: v.maxLeadsPerMonth,
      minJobValueCents: v.minJobValueCents,
      minMarginBps: v.minMarginBps,
      allowedChannels: v.allowedChannels as MarketingConfig["guardrails"]["allowedChannels"],
      allowedServices: v.allowedServices,
      allowedZones: v.allowedZones,
    },
    requiresHumanApproval: v.requiresHumanApproval,
  };
}

function startOfDayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonthIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

/* ─── Leitura (page server-side) ──────────────────────────────────────── */

export async function getMarketingPageData(
  requestedCompanyId?: string | null,
): Promise<MarketingPageData> {
  const ctx = await getSessionContext();
  if (!ctx || !hasPermission(ctx.permissions, MARKETING_VIEW_PERMISSION)) {
    return {
      authorized: false,
      canManage: false,
      canExecute: false,
      companies: [],
      companyId: null,
      config: null,
      campaigns: [],
      leads: [],
      actions: [],
      spentTodayCents: 0,
      spentThisMonthCents: 0,
      leadsThisMonth: 0,
      pendingInstanceId: null,
    };
  }

  const canManage = hasPermission(ctx.permissions, MARKETING_MANAGE_PERMISSION);
  const canExecute = hasPermission(
    ctx.permissions,
    MARKETING_EXECUTE_PERMISSION,
  );

  const companies = await getManagedCompanies(ctx.user.id);
  const companyId = resolveTargetCompanyId(companies, requestedCompanyId);
  if (!companyId) {
    return {
      authorized: true,
      canManage,
      canExecute,
      companies,
      companyId: null,
      config: null,
      campaigns: [],
      leads: [],
      actions: [],
      spentTodayCents: 0,
      spentThisMonthCents: 0,
      leadsThisMonth: 0,
      pendingInstanceId: null,
    };
  }

  const supabase = createAdminClient();
  const [configRes, campaignsRes, actionsRes, leadsRes, spendRes, pendingRes] =
    await Promise.all([
      supabase
        .from("marketing_config")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle(),
      supabase
        .from("marketing_campaigns")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("marketing_actions")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("marketing_leads")
        .select("*")
        .eq("company_id", companyId)
        .order("received_at", { ascending: false })
        .limit(20),
      // Gasto contabilizado server-side a partir das ações executadas/decididas
      // — nunca do cliente.
      supabase
        .from("marketing_actions")
        .select("estimated_cost_cents, estimated_leads, created_at")
        .eq("company_id", companyId)
        .in("decision", ["ALLOWED"])
        .in("status", ["RECORDED", "APPROVED", "EXECUTED"])
        .gte("created_at", startOfMonthIso()),
      supabase
        .from("workflow_instances")
        .select("id")
        .eq("entity_type", "MARKETING_CONFIG")
        .eq("entity_id", companyId)
        .eq("status", "PENDING")
        .maybeSingle(),
    ]);

  const spendRows = ((spendRes.data ?? []) as Array<Record<string, unknown>>)
    .filter((r) => String(r.created_at ?? "") >= startOfDayIso());
  const spentTodayCents = spendRows.reduce(
    (acc, r) => acc + Number(r.estimated_cost_cents ?? 0),
    0,
  );
  const spentThisMonthCents = ((spendRes.data ?? []) as Array<Record<string, unknown>>).reduce(
    (acc, r) => acc + Number(r.estimated_cost_cents ?? 0),
    0,
  );
  const leadsThisMonth = ((spendRes.data ?? []) as Array<Record<string, unknown>>).reduce(
    (acc, r) => acc + Number(r.estimated_leads ?? 0),
    0,
  );

  return {
    authorized: true,
    canManage,
    canExecute,
    companies,
    companyId,
    config: configRes.data ? mapConfigRow(configRes.data) : null,
    campaigns: (campaignsRes.data ?? []).map(
      (c: Record<string, unknown>): MarketingCampaignView => ({
        id: String(c.id),
        name: String(c.name ?? ""),
        objective: String(c.objective ?? ""),
        status: String(c.status ?? "DRAFT"),
        channels: (c.channels as string[] | null) ?? [],
        budgetCents: Number(c.budget_cents ?? 0),
        providerId: (c.provider_id as string | null) ?? null,
        providerExternalId: (c.provider_external_id as string | null) ?? null,
        createdAt: (c.created_at as string | null) ?? null,
      }),
    ),
    leads: (leadsRes.data ?? []).map(
      (l: Record<string, unknown>): MarketingLeadView => ({
        id: String(l.id),
        name: (l.name as string | null) ?? null,
        contact: (l.contact as string | null) ?? null,
        service: (l.service as string | null) ?? null,
        zone: (l.zone as string | null) ?? null,
        estimatedJobValueCents:
          l.estimated_job_value_cents === null
            ? null
            : Number(l.estimated_job_value_cents),
        stage: String(l.stage ?? "LEAD"),
        receivedAt: (l.received_at as string | null) ?? null,
      }),
    ),
    actions: (actionsRes.data ?? []).map(
      (a: Record<string, unknown>): MarketingActionView => ({
        id: String(a.id),
        actionType: String(a.action_type ?? ""),
        objective: String(a.objective ?? ""),
        channel: String(a.channel ?? ""),
        decision: String(a.decision ?? ""),
        reasonCode: String(a.reason_code ?? ""),
        message: String(a.message ?? ""),
        status: String(a.status ?? ""),
        estimatedCostCents:
          a.estimated_cost_cents === null ? null : Number(a.estimated_cost_cents),
        estimatedCostPerLeadCents:
          a.estimated_cost_per_lead_cents === null
            ? null
            : Number(a.estimated_cost_per_lead_cents),
        estimatedLeads: a.estimated_leads === null ? null : Number(a.estimated_leads),
        service: (a.service as string | null) ?? null,
        zone: (a.zone as string | null) ?? null,
        jobValueCents: a.job_value_cents === null ? null : Number(a.job_value_cents),
        requestedByName: null,
        createdAt: (a.created_at as string | null) ?? null,
      }),
    ),
    spentTodayCents,
    spentThisMonthCents,
    leadsThisMonth,
    pendingInstanceId:
      pendingRes.data && typeof pendingRes.data === "object"
        ? String((pendingRes.data as { id?: string }).id ?? "") || null
        : null,
  };
}

/* ─── Escrita de configuração (Server Actions — autorização server-side) ─ */

export interface MarketingConfigInput {
  companyId?: string | null;
  isActive: boolean;
  autonomyLevel: string;
  /** Euros, formatados como texto no formulário — convertidos server-side. */
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
}

export interface MarketingConfigResult {
  success: boolean;
  error?: string;
  approvalRequired?: boolean;
  instanceId?: string;
}

function parseMoneyField(raw: string | undefined): number | "invalid" {
  if (raw === undefined || raw === null || String(raw).trim() === "") return 0;
  const cents = parseEuroToCents(raw);
  if (cents === null || cents < 0) return "invalid";
  return cents;
}

function splitList(raw: string): string[] {
  return (raw ?? "")
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseMarginBps(raw: string): number | null | "invalid" {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const cents = parseEuroToCents(s); // reutiliza parsing decimal seguro
  if (cents === null || cents < 0) return "invalid";
  const bps = Math.round(cents); // "12.5" → 1250 bps... ver abaixo
  return bps;
}

/**
 * Constrói a config a partir do input (valores vindos do FORMULÁRIO são
 * apenas INPUT — a config efetiva é a validada e persistida no servidor).
 */
function buildCoreConfig(
  companyId: string,
  input: MarketingConfigInput,
): MarketingConfig | { error: string } {
  if (!isValidAutonomyLevel(input.autonomyLevel)) {
    return {
      error: `Autonomia inválida. Valores permitidos: ${MARKETING_AUTONOMY_LEVELS.join(", ")}.`,
    };
  }
  const daily = parseMoneyField(input.dailyBudget);
  const monthly = parseMoneyField(input.monthlyBudget);
  const maxCampaign = parseMoneyField(input.maxCampaignBudget);
  const costPerLead = parseMoneyField(input.maxCostPerLead);
  const minJob = parseMoneyField(input.minJobValue);
  if (
    daily === "invalid" ||
    monthly === "invalid" ||
    maxCampaign === "invalid" ||
    costPerLead === "invalid" ||
    minJob === "invalid"
  ) {
    return { error: "Valores monetários inválidos (use euros, ex.: 100 ou 100,50)." };
  }
  const maxLeadsRaw = (input.maxLeadsPerMonth ?? "").trim();
  const maxLeads = maxLeadsRaw === "" ? 0 : Number(maxLeadsRaw);
  if (!Number.isSafeInteger(maxLeads) || maxLeads < 0) {
    return { error: "Número máximo de leads inválido." };
  }
  const marginRaw = parseMarginBps(input.minMarginPercent);
  if (marginRaw === "invalid") {
    return { error: "Margem mínima inválida." };
  }
  // Percentagem → basis points: o parsing decimal seguro devolve
  // "12.5" → 1250, que é exatamente 12,5% em bps.
  const minMarginBps: number | null = marginRaw === null ? null : marginRaw;

  const channels = (input.allowedChannels ?? []).filter((c) =>
    isValidMarketingChannel(c),
  );
  const services = splitList(input.allowedServices);
  const zones = splitList(input.allowedZones);

  const config: MarketingConfig = {
    companyId,
    isActive: input.isActive === true,
    autonomyLevel: input.autonomyLevel as MarketingAutonomyLevel,
    budget: {
      dailyBudgetCents: daily as number,
      monthlyBudgetCents: monthly as number,
      maxCampaignBudgetCents: maxCampaign as number,
    },
    guardrails: {
      maxCostPerLeadCents: costPerLead as number,
      maxLeadsPerMonth: maxLeads,
      minJobValueCents: minJob as number,
      minMarginBps,
      allowedChannels: channels,
      allowedServices: services,
      allowedZones: zones,
    },
    requiresHumanApproval: input.requiresHumanApproval === true,
  };
  const val = validateMarketingConfig(config);
  if (!val.valid) return { error: val.errors.join(" ") };
  return config;
}

function configToRow(config: MarketingConfig): Record<string, unknown> {
  return {
    company_id: config.companyId,
    autonomy_level: config.autonomyLevel,
    is_active: config.isActive,
    daily_budget_cents: config.budget.dailyBudgetCents,
    monthly_budget_cents: config.budget.monthlyBudgetCents,
    max_campaign_budget_cents: config.budget.maxCampaignBudgetCents,
    max_cost_per_lead_cents: config.guardrails.maxCostPerLeadCents,
    max_leads_per_month: config.guardrails.maxLeadsPerMonth,
    min_job_value_cents: config.guardrails.minJobValueCents,
    min_margin_bps: config.guardrails.minMarginBps,
    allowed_channels: config.guardrails.allowedChannels,
    allowed_services: config.guardrails.allowedServices,
    allowed_zones: config.guardrails.allowedZones,
    requires_human_approval: config.requiresHumanApproval,
  };
}

function diffBudget(a: MarketingConfig | null, b: MarketingConfig): boolean {
  if (!a) return false;
  return (
    a.budget.dailyBudgetCents !== b.budget.dailyBudgetCents ||
    a.budget.monthlyBudgetCents !== b.budget.monthlyBudgetCents ||
    a.budget.maxCampaignBudgetCents !== b.budget.maxCampaignBudgetCents ||
    a.guardrails.maxCostPerLeadCents !== b.guardrails.maxCostPerLeadCents
  );
}

async function upsertMarketingConfigRow(
  config: MarketingConfig,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();
  const row = configToRow(config);
  const { data: existing } = await supabase
    .from("marketing_config")
    .select("id")
    .eq("company_id", config.companyId)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await supabase
      .from("marketing_config")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return { success: !error, error: error?.message };
  }
  const { error } = await supabase.from("marketing_config").insert(row);
  return { success: !error, error: error?.message };
}

/**
 * Guarda a configuração do Marketing AI.
 * - autorização e âmbito resolvidos server-side (RBAC + company_employees);
 * - validação pura em @rpg/core antes de qualquer escrita;
 * - ativação de AUTOPILOT NÃO é aplicada de imediato: cria pedido no
 *   workflow engine EXISTENTE; só vigorará após WORKFLOW_APPROVED.
 */
export async function updateMarketingConfig(
  input: MarketingConfigInput,
): Promise<MarketingConfigResult> {
  try {
    const ctx = await getSessionContext();
    if (!ctx || !hasPermission(ctx.permissions, MARKETING_MANAGE_PERMISSION)) {
      return { success: false, error: "Sem autorização." };
    }
    const companies = await getManagedCompanies(ctx.user.id);
    const companyId = resolveTargetCompanyId(companies, input.companyId);
    if (!companyId) {
      return { success: false, error: "Sem empresa no seu âmbito." };
    }

    const built = buildCoreConfig(companyId, input);
    if ("error" in built) {
      return { success: false, error: built.error };
    }
    const config = built as MarketingConfig;

    const supabase = createAdminClient();
    const { data: existingRow } = await supabase
      .from("marketing_config")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    const existing: MarketingConfig | null = existingRow
      ? toCoreConfig(mapConfigRow(existingRow))
      : null;

    // ── Ativação de AUTOPILOT exige aprovação (workflow engine existente) ──
    const activatingAutopilot =
      config.autonomyLevel === "AUTOPILOT" &&
      (!existing ||
        !existing.isActive ||
        existing.autonomyLevel !== "AUTOPILOT");
    if (activatingAutopilot) {
      const start = await startApproval({
        title: `Marketing AI: ativar AUTOPILOT (${companies.find((c) => c.id === companyId)?.name ?? "empresa"})`,
        summary:
          "A IA passará a executar automaticamente ações de marketing, sempre limitada pelos budgets, canais, serviços e zonas configurados.",
        entityType: "MARKETING_CONFIG",
        entityId: companyId,
        organizationId: ctx.organization?.id ?? null,
        requestedBy: ctx.user.id,
        metadata: {
          companyId,
          proposed: configToRow(config),
        },
      });
      if (!start.success) {
        return {
          success: false,
          error: start.error ?? "Não foi possível criar o pedido de aprovação.",
        };
      }
      await supabase.from("audit_logs").insert({
        user_id: ctx.user.id,
        company_id: companyId,
        action: "MARKETING_AUTONOMY_CHANGE_REQUESTED",
        module: MARKETING_MODULE,
        entity_type: "MARKETING_CONFIG",
        entity_id: companyId,
        metadata: {
          previousAutonomyLevel: existing?.autonomyLevel ?? null,
          proposedAutonomyLevel: config.autonomyLevel,
          workflowInstanceId: start.instanceId ?? null,
          status: "PENDING",
        },
      });
      return {
        success: true,
        approvalRequired: true,
        instanceId: start.instanceId,
      };
    }

    // ── Alteração direta (fora da ativação de AUTOPILOT) + auditoria ─────
    const applied = await upsertMarketingConfigRow(config);
    if (!applied.success) {
      return { success: false, error: "Não foi possível guardar a configuração." };
    }
    await auditConfigChange(ctx.user.id, companyId, existing, config);
    return { success: true };
  } catch {
    return { success: false, error: "Erro inesperado." };
  }
}

/** Auditoria de alterações de config (quem, empresa, valores, resultado). */
async function auditConfigChange(
  actorId: string,
  companyId: string,
  previous: MarketingConfig | null,
  next: MarketingConfig,
): Promise<void> {
  const supabase = createAdminClient();
  const base = {
    user_id: actorId,
    company_id: companyId,
    module: MARKETING_MODULE,
    entity_type: "MARKETING_CONFIG",
    entity_id: companyId,
  };
  const insert = (action: string, metadata: Record<string, unknown>) =>
    supabase.from("audit_logs").insert({
      ...base,
      action,
      metadata: { ...metadata, status: "APPLIED" },
    });
  if (!previous) {
    await insert("MARKETING_CONFIG_CREATED", { config: configToRow(next) });
  } else {
    await insert("MARKETING_CONFIG_UPDATED", {
      previous: configToRow(previous),
      config: configToRow(next),
    });
    if (previous.autonomyLevel !== next.autonomyLevel) {
      await insert("MARKETING_AUTONOMY_CHANGED", {
        previousAutonomyLevel: previous.autonomyLevel,
        newAutonomyLevel: next.autonomyLevel,
      });
    }
    if (diffBudget(previous, next)) {
      await insert("MARKETING_BUDGET_CHANGED", {
        previous: previous.budget,
        new: next.budget,
      });
    }
  }
}

/**
 * Aplica a configuração proposta APENAS após WORKFLOW_APPROVED (gatilho no
 * decideWorkflowAction). Os valores vêm da METADATA da instância — nunca do
 * cliente — e são REVALIDADOS server-side antes de escrever.
 */
export async function applyMarketingConfigChange(input: {
  companyId: string;
  proposed: Record<string, unknown>;
  actorId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const proposed = input.proposed ?? {};
    const config: MarketingConfig = {
      companyId: input.companyId,
      isActive: proposed.is_active === true,
      autonomyLevel: proposed.autonomy_level as MarketingAutonomyLevel,
      budget: {
        dailyBudgetCents: Number(proposed.daily_budget_cents ?? 0),
        monthlyBudgetCents: Number(proposed.monthly_budget_cents ?? 0),
        maxCampaignBudgetCents: Number(proposed.max_campaign_budget_cents ?? 0),
      },
      guardrails: {
        maxCostPerLeadCents: Number(proposed.max_cost_per_lead_cents ?? 0),
        maxLeadsPerMonth: Number(proposed.max_leads_per_month ?? 0),
        minJobValueCents: Number(proposed.min_job_value_cents ?? 0),
        minMarginBps:
          proposed.min_margin_bps === null || proposed.min_margin_bps === undefined
            ? null
            : Number(proposed.min_margin_bps),
        allowedChannels: ((proposed.allowed_channels as string[] | null) ??
          []) as MarketingConfig["guardrails"]["allowedChannels"],
        allowedServices: (proposed.allowed_services as string[] | null) ?? [],
        allowedZones: (proposed.allowed_zones as string[] | null) ?? [],
      },
      requiresHumanApproval: proposed.requires_human_approval === true,
    };
    const val = validateMarketingConfig(config);
    if (!val.valid) {
      return { success: false, error: val.errors.join(" ") };
    }

    const supabase = createAdminClient();
    const { data: existingRow } = await supabase
      .from("marketing_config")
      .select("*")
      .eq("company_id", input.companyId)
      .maybeSingle();
    const existing: MarketingConfig | null = existingRow
      ? toCoreConfig(mapConfigRow(existingRow))
      : null;

    const applied = await upsertMarketingConfigRow(config);
    if (!applied.success) {
      return { success: false, error: "Não foi possível aplicar a configuração." };
    }
    await auditConfigChange(input.actorId, input.companyId, existing, config);
    return { success: true };
  } catch {
    return { success: false, error: "Erro inesperado ao aplicar configuração." };
  }
}

/* ─── Decisão de ações da IA (pipeline: recomendação → guardrails) ────── */

export interface MarketingActionInput {
  companyId?: string | null;
  actionType: string;
  objective: string;
  channel: string;
  estimatedCost: string;
  campaignBudget: string;
  estimatedCostPerLead: string;
  estimatedLeads: string;
  service: string;
  zone: string;
  jobValue: string;
  estimatedMarginPercent: string;
}

export interface MarketingActionResult {
  success: boolean;
  error?: string;
  decision?: "ALLOWED" | "REQUIRES_APPROVAL" | "DENIED";
  reason?: string;
  message?: string;
  /** Nota: nesta fase NADA é executado — mesmo ALLOWED fica só registado. */
  executedExternally?: boolean;
}

const ACTION_TYPES = [
  "CREATE_CAMPAIGN",
  "PAUSE_CAMPAIGN",
  "RESUME_CAMPAIGN",
  "ADJUST_BUDGET",
  "GENERATE_CONTENT",
  "SUGGEST_TARGETING",
];

const OBJECTIVES = ["LEADS", "QUOTES", "JOBS", "AWARENESS"];

/**
 * Regista uma recomendação da IA e decide-a com os guardrails server-side.
 * O contexto de gasto (dia/mês/leads) é SEMPRE calculado a partir da BD —
 * o cliente não consegue mascarar limites.
 */
export async function proposeMarketingAction(
  input: MarketingActionInput,
): Promise<MarketingActionResult> {
  try {
    const ctx = await getSessionContext();
    if (
      !ctx ||
      !hasPermission(ctx.permissions, MARKETING_EXECUTE_PERMISSION)
    ) {
      return { success: false, error: "Sem autorização." };
    }
    const companies = await getManagedCompanies(ctx.user.id);
    const companyId = resolveTargetCompanyId(companies, input.companyId);
    if (!companyId) {
      return { success: false, error: "Sem empresa no seu âmbito." };
    }
    if (!ACTION_TYPES.includes(input.actionType)) {
      return { success: false, error: "Tipo de ação inválido." };
    }
    if (!OBJECTIVES.includes(input.objective)) {
      return { success: false, error: "Objetivo inválido." };
    }

    const supabase = createAdminClient();
    const { data: configRow } = await supabase
      .from("marketing_config")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    if (!configRow) {
      return {
        success: false,
        error: "Marketing AI não está configurado para esta empresa.",
      };
    }
    const config = toCoreConfig(mapConfigRow(configRow));

    const cost = parseEuroToCents(input.estimatedCost || "0");
    const campBudget = parseEuroToCents(input.campaignBudget || "0");
    const perLead = input.estimatedCostPerLead?.trim()
      ? parseEuroToCents(input.estimatedCostPerLead)
      : null;
    const jobValue = input.jobValue?.trim()
      ? parseEuroToCents(input.jobValue)
      : null;
    const marginRaw = input.estimatedMarginPercent?.trim()
      ? parseEuroToCents(input.estimatedMarginPercent) // "12.5" → 1250 bps
      : null;
    const leadsRaw = (input.estimatedLeads ?? "").trim();
    const leads = leadsRaw === "" ? null : Number(leadsRaw);
    if (
      cost === null ||
      campBudget === null ||
      perLead === null ||
      jobValue === null ||
      marginRaw === null ||
      (leads !== null && (!Number.isSafeInteger(leads) || leads < 0))
    ) {
      return { success: false, error: "Valores inválidos na ação proposta." };
    }

    const action: MarketingAction = {
      type: input.actionType as MarketingActionType,
      channel: input.channel as MarketingAction["channel"],
      objective: input.objective as MarketingObjective,
      estimatedCostCents: cost,
      campaignBudgetCents: campBudget > 0 ? campBudget : null,
      estimatedCostPerLeadCents: perLead,
      estimatedLeads: leads,
      service: input.service?.trim() || null,
      zone: input.zone?.trim() || null,
      jobValueCents: jobValue,
      estimatedMarginBps: marginRaw,
    };

    // Contexto server-side: gasto acumulado a partir das ações ALLOWED.
    const { data: spendRows } = await supabase
      .from("marketing_actions")
      .select("estimated_cost_cents, estimated_leads, created_at")
      .eq("company_id", companyId)
      .eq("decision", "ALLOWED")
      .in("status", ["RECORDED", "APPROVED"])
      .gte("created_at", startOfMonthIso());
    const rows = (spendRows ?? []) as Array<Record<string, unknown>>;
    const todayRows = rows.filter(
      (r) => String(r.created_at ?? "") >= startOfDayIso(),
    );
    const context = {
      spentTodayCents: todayRows.reduce(
        (acc, r) => acc + Number(r.estimated_cost_cents ?? 0),
        0,
      ),
      spentThisMonthCents: rows.reduce(
        (acc, r) => acc + Number(r.estimated_cost_cents ?? 0),
        0,
      ),
      leadsThisMonth: rows.reduce(
        (acc, r) => acc + Number(r.estimated_leads ?? 0),
        0,
      ),
    };

    // NÚCLEO: decisão determinística (a IA nunca decide sozinha).
    const decision = canExecuteMarketingAction(config, action, context);

    const status =
      decision.decision === "ALLOWED"
        ? "RECORDED"
        : decision.decision === "REQUIRES_APPROVAL"
          ? "PENDING_APPROVAL"
          : "DENIED";

    const { data: inserted, error: insertError } = await supabase
      .from("marketing_actions")
      .insert({
        company_id: companyId,
        action_type: action.type,
        objective: action.objective,
        channel: action.channel,
        decision: decision.decision,
        reason_code: decision.reason,
        message: decision.message,
        status,
        estimated_cost_cents: action.estimatedCostCents,
        estimated_cost_per_lead_cents: action.estimatedCostPerLeadCents,
        estimated_leads: action.estimatedLeads,
        service: action.service,
        zone: action.zone,
        job_value_cents: action.jobValueCents,
        requested_by: ctx.user.id,
        metadata: {
          context,
          violation: decision.violation ?? null,
        },
      })
      .select("id")
      .single();

    if (insertError) {
      return { success: false, error: "Não foi possível registar a ação." };
    }

    await supabase.from("audit_logs").insert({
      user_id: ctx.user.id,
      company_id: companyId,
      action:
        decision.decision === "DENIED"
          ? "MARKETING_ACTION_DENIED"
          : "MARKETING_ACTION_DECIDED",
      module: MARKETING_MODULE,
      entity_type: "MARKETING_ACTION",
      entity_id: String(inserted?.id ?? ""),
      metadata: {
        action: { ...action },
        decision: decision.decision,
        reasonCode: decision.reason,
        message: decision.message,
        context,
        status,
        // Proposta de execução é avaliada e registada; sandbox pode executar.
        executedExternally: false,
      },
    });

    let execution: { status: string; providerId?: string | null } | null = null;
    // ── AUTOPILOT / autonomia permitida: executa contra o fake provider ──
    if (decision.decision === "ALLOWED") {
      execution = await runSandboxExecution({
        companyId,
        userId: ctx.user.id,
        action,
        config,
        context,
        actionRecordId: inserted ? String(inserted.id) : null,
      });
    }

    return {
      success: true,
      decision: decision.decision,
      reason: decision.reason,
      message: decision.message,
      executedExternally: execution?.status === "EXECUTED",
    };
  } catch {
    return { success: false, error: "Erro inesperado." };
  }
}

/**
 * Aprovação/rejeição humana de uma ação REQUIRES_APPROVAL (COPILOT /
 * SEMI_AUTONOMOUS fora dos limites). Exige marketing.manage e a ação tem de
 * pertencer ao âmbito do ator. Nada é executado externamente — apenas
 * muda o estado e fica auditado.
 */
export async function decideMarketingAction(
  actionId: string,
  approve: boolean,
  note?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getSessionContext();
    if (!ctx || !hasPermission(ctx.permissions, MARKETING_MANAGE_PERMISSION)) {
      return { success: false, error: "Sem autorização." };
    }
    const companies = await getManagedCompanies(ctx.user.id);
    const companyIds = new Set(companies.map((c) => c.id));

    const supabase = createAdminClient();
    const { data: row } = await supabase
      .from("marketing_actions")
      .select("id, company_id, status, decision")
      .eq("id", actionId)
      .maybeSingle();
    if (!row) return { success: false, error: "Ação não encontrada." };
    // Anti cross-tenant: a ação tem de pertencer a uma empresa do ator.
    if (!companyIds.has(String(row.company_id))) {
      return { success: false, error: "Sem autorização para esta ação." };
    }
    if (
      row.status !== "PENDING_APPROVAL" ||
      row.decision !== "REQUIRES_APPROVAL"
    ) {
      return { success: false, error: "Ação não está pendente de aprovação." };
    }

    const newStatus = approve ? "APPROVED" : "REJECTED";
    const { error } = await supabase
      .from("marketing_actions")
      .update({
        status: newStatus,
        decided_by: ctx.user.id,
        decided_at: new Date().toISOString(),
      })
      .eq("id", actionId)
      .eq("status", "PENDING_APPROVAL"); // guarda anti-TOCTOU
    if (error) {
      return { success: false, error: "Não foi possível atualizar a ação." };
    }

    let executedExternally = false;
    // ── COPILOT / aprovação humana: a ação aprovada é executada no sandbox ──
    if (approve) {
      // Reconstroi a ação a partir da row persistida (fonte de confiança).
      const numOrNull = (v: unknown): number | null =>
        v === null || v === undefined ? null : Number(v);
      const { data: fullRow } = await supabase
        .from("marketing_actions")
        .select(
          "id, company_id, campaign_id, action_type, objective, channel, estimated_cost_cents, estimated_cost_per_lead_cents, estimated_leads, service, zone, job_value_cents, metadata",
        )
        .eq("id", actionId)
        .maybeSingle();
      const { data: configRow } = await supabase
        .from("marketing_config")
        .select("*")
        .eq("company_id", String(row.company_id))
        .maybeSingle();

      if (fullRow && configRow) {
        const cfg = toCoreConfig(mapConfigRow(configRow));
        const rebuiltAction: MarketingAction = {
          type: String(fullRow.action_type) as MarketingActionType,
          channel: String(fullRow.channel) as MarketingAction["channel"],
          objective: String(fullRow.objective) as MarketingObjective,
          estimatedCostCents: numOrNull(fullRow.estimated_cost_cents),
          estimatedCostPerLeadCents: numOrNull(
            fullRow.estimated_cost_per_lead_cents,
          ),
          estimatedLeads: numOrNull(fullRow.estimated_leads),
          service: (fullRow.service as string | null) ?? null,
          zone: (fullRow.zone as string | null) ?? null,
          jobValueCents: numOrNull(fullRow.job_value_cents),
        };
        const exec = await runSandboxExecution({
          companyId: String(row.company_id),
          userId: ctx.user.id,
          action: rebuiltAction,
          config: cfg,
          actionRecordId: actionId,
        });
        executedExternally = exec.status === "EXECUTED";
      }
    }

    await supabase.from("audit_logs").insert({
      user_id: ctx.user.id,
      company_id: String(row.company_id),
      action: approve ? "MARKETING_ACTION_APPROVED" : "MARKETING_ACTION_DENIED",
      module: MARKETING_MODULE,
      entity_type: "MARKETING_ACTION",
      entity_id: actionId,
      metadata: {
        previousStatus: "PENDING_APPROVAL",
        newStatus,
        note: note?.trim() || null,
        executedExternally,
        // Aprovar executa no sandbox (simulado); sem gasto real.
        sandbox: true,
      },
    });
    return { success: true };
  } catch {
    return { success: false, error: "Erro inesperado." };
  }
}
