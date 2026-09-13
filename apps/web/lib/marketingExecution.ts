/**
 * RPG-OS — Marketing Execution Sandbox (lado servidor).
 *
 * Liga o pipeline puro do core ao provider fake (FakeMarketingProvider):
 *
 *   campaign → action → guardrails → approval/autonomy → provider → result
 *
 * Nucles de segurança:
 *  - O provider fake NÃO contacta APIs externas nem gasta dinheiro real;
 *  - A execução só acontece se os guardrails devolverem ALLOWED (avaliados de
 *    novo no momento da execução contra a configuração real da BD);
 *  - Campanhas criadas ficam persistidas (marketing_campaigns) com o
 *    provider_id / provider_external_id do sandbox;
 *  - Resultado sempre auditado (MARKETING_ACTION_EXECUTED / _FAILED).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FakeMarketingProvider,
  executeMarketingActionViaProvider,
  type MarketingExecutionResult,
} from "@rpg/core";
import type {
  MarketingAction,
  MarketingConfig,
} from "@rpg/core";

const MARKETING_MODULE = "MARKETING_AI";

function providerFor(channel: string) {
  return new FakeMarketingProvider(channel as MarketingAction["channel"]);
}

/**
 * Persiste/atualiza a campanha local associada a uma ação criada no sandbox.
 * - CREATE_CAMPAIGN com sucesso → insere marketing_campaigns (ACTIVE)
 *   com provider_id/provider_external_id (idempotente por external_id).
 * - Ações já existentes (PAUSE/RESUME/ADJUST) usam o campaignId fornecido.
 */
async function upsertCampaignFromExecution(input: {
  companyId: string;
  userId: string;
  action: MarketingAction;
  providerId: string;
  providerExternalId: string;
  existingCampaignId?: string | null;
}): Promise<string | null> {
  const supabase = createAdminClient();
  // CREATE_CAMPAIGN: cria campanha nova.
  if (input.action.type === "CREATE_CAMPAIGN") {
    const { data, error } = await supabase
      .from("marketing_campaigns")
      .insert({
        company_id: input.companyId,
        name: `Campanha ${input.action.objective} (${input.action.channel})`,
        objective: input.action.objective,
        status: "ACTIVE",
        channels: [input.action.channel],
        budget_cents:
          input.action.campaignBudgetCents ?? input.action.estimatedCostCents ?? 0,
        provider_id: input.providerId,
        provider_external_id: input.providerExternalId,
        created_by: input.userId,
      })
      .select("id")
      .single();
    if (error || !data) return null;
    return String(data.id);
  }
  // Outras ações: apenas devolve o id da campanha existente.
  return input.existingCampaignId ?? null;
}

/**
 * NÚCLEO de execução sandbox. Recebe a configuração real (fonte BD) e a ação,
 * reavalia os guardrails no momento da execução e, se ALLOWED e com conceito
 * externo, chama o provider FAKE. Persiste a campanha/local, o estado da ação
 * (EXECUTED/FAILED/RECORDED) e audita tudo.
 */
export async function runSandboxExecution(input: {
  companyId: string;
  userId: string;
  action: MarketingAction;
  config: MarketingConfig;
  /** ID da linha na BD (para atualizar status/provider). */
  actionRecordId?: string | null;
  /** Campanha local associada (para ações de campanha já criada). */
  campaign?: { id: string; providerExternalId: string | null } | null;
  context?: {
    spentTodayCents?: number;
    spentThisMonthCents?: number;
    leadsThisMonth?: number;
  };
}): Promise<{
  success: boolean;
  status: MarketingExecutionResult["status"];
  providerId: string | null;
  providerExternalId: string | null;
  campaignId: string | null;
  error?: string;
}> {
  const supabase = createAdminClient();
  const provider = providerFor(input.action.channel);

  const exec = await executeMarketingActionViaProvider({
    config: input.config,
    action: input.action,
    context: input.context ?? {},
    provider,
    campaign: input.campaign
      ? {
          id: input.campaign.id,
          providerId: "FAKE_SANDBOX",
          providerExternalId: input.campaign.providerExternalId,
        }
      : null,
  });

  let campaignId: string | null = input.campaign?.id ?? null;
  if (exec.status === "EXECUTED" && exec.providerExternalId) {
    campaignId = await upsertCampaignFromExecution({
      companyId: input.companyId,
      userId: input.userId,
      action: input.action,
      providerId: exec.providerId ?? "FAKE_SANDBOX",
      providerExternalId: exec.providerExternalId,
      existingCampaignId: campaignId,
    });
  }

  const newStatus =
    exec.status === "EXECUTED"
      ? "EXECUTED"
      : exec.status === "FAILED"
        ? "FAILED"
        : "RECORDED";

  if (input.actionRecordId) {
    await supabase
      .from("marketing_actions")
      .update({
        status: newStatus,
        provider_id: exec.providerId,
        provider_external_id: exec.providerExternalId,
        executed_at:
          exec.status === "EXECUTED" ? new Date().toISOString() : null,
      })
      .eq("id", input.actionRecordId);
  }

  await supabase.from("audit_logs").insert({
    user_id: input.userId,
    company_id: input.companyId,
    action:
      exec.status === "EXECUTED"
        ? "MARKETING_ACTION_EXECUTED"
        : exec.status === "FAILED"
          ? "MARKETING_ACTION_FAILED"
          : "MARKETING_ACTION_DECIDED",
    module: MARKETING_MODULE,
    entity_type: "MARKETING_ACTION",
    entity_id: input.actionRecordId ?? "",
    metadata: {
      decision: exec.decision.decision,
      reasonCode: exec.decision.reason,
      message: exec.decision.message,
      providerId: exec.providerId,
      providerExternalId: exec.providerExternalId,
      campaignId,
      error: exec.error ?? null,
      // Fato explícito: execução SIMULADA (sandbox), sem gasto real.
      sandbox: true,
      executedExternally: false,
    },
  });

  return {
    success: exec.status === "EXECUTED",
    status: exec.status,
    providerId: exec.providerId,
    providerExternalId: exec.providerExternalId,
    campaignId,
    error: exec.error,
  };
}

/** Verifica se um tipo de ação tem conceito externo (usado pelo UI). */
export function hasExternalExecution(type: string): boolean {
  return ["CREATE_CAMPAIGN", "PAUSE_CAMPAIGN", "RESUME_CAMPAIGN", "ADJUST_BUDGET"].includes(
    type,
  );
}

/**
 * Simula métricas (impressions/clicks/leads/custo) numa campanha publicada
 * no sandbox e atualiza o store em memória do provider fake. O custo
 * simulado respeita sempre o orçamento da campanha.
 */
export async function simulateSandboxMetrics(input: {
  companyId: string;
  userId: string;
  channel: string;
  providerExternalId: string;
  delta: { impressions: number; clicks: number; leads: number; costCents: number };
}): Promise<{ success: boolean; error?: string }> {
  const provider = providerFor(input.channel);
  const res = await provider
    .campaigns()
    .simulateMetrics(input.providerExternalId, {
      impressions: input.delta.impressions,
      clicks: input.delta.clicks,
      leads: input.delta.leads,
      costCents: input.delta.costCents,
    });
  if (!res.ok) return { success: false, error: res.error };

  const supabase = createAdminClient();
  await supabase.from("audit_logs").insert({
    user_id: input.userId,
    company_id: input.companyId,
    action: "MARKETING_METRICS_SIMULATED",
    module: MARKETING_MODULE,
    entity_type: "MARKETING_CAMPAIGN",
    entity_id: "",
    metadata: {
      channel: input.channel,
      providerExternalId: input.providerExternalId,
      delta: input.delta,
      snapshot: res.value,
      sandbox: true,
      executedExternally: false,
    },
  });
  return { success: true };
}

/**
 * Injet a lead SIMULADO no provider fake e persiste o intake em
 * marketing_leads (etapa LEAD). Não cria quote/job/invoice — a conversão
 * é humana e futura (trilho lead → quote → job → invoice → payment → fee).
 */
export async function simulateSandboxLead(input: {
  companyId: string;
  userId: string;
  campaignId: string;
  channel: string;
  providerExternalId: string;
  name?: string | null;
  contact?: string | null;
  service?: string | null;
  zone?: string | null;
  estimatedJobValueCents?: number | null;
}): Promise<{ success: boolean; leadId?: string; error?: string }> {
  const provider = providerFor(input.channel);
  const res = await provider.simulateLead({
    campaignExternalId: input.providerExternalId,
    name: input.name ?? null,
    contact: input.contact ?? null,
    service: input.service ?? null,
    zone: input.zone ?? null,
    estimatedJobValueCents: input.estimatedJobValueCents ?? null,
  });
  if (!res.ok) return { success: false, error: res.error };

  const lead = res.value;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("marketing_leads")
    .insert({
      company_id: input.companyId,
      campaign_id: input.campaignId,
      provider_id: "FAKE_SANDBOX",
      external_lead_id: lead.externalId,
      name: lead.name,
      contact: lead.contact,
      service: lead.service,
      zone: lead.zone,
      estimated_job_value_cents: lead.estimatedJobValueCents,
      received_at: lead.receivedAt,
      stage: "LEAD",
      metadata: { channel: input.channel },
    })
    .select("id")
    .single();
  if (error || !data) {
    return { success: false, error: "Não foi possível persistir o lead." };
  }

  await supabase.from("audit_logs").insert({
    user_id: input.userId,
    company_id: input.companyId,
    action: "MARKETING_LEAD_SIMULATED",
    module: MARKETING_MODULE,
    entity_type: "MARKETING_LEAD",
    entity_id: String(data.id),
    metadata: {
      leadId: String(data.id),
      campaignId: input.campaignId,
      providerId: "FAKE_SANDBOX",
      externalLeadId: lead.externalId,
      service: lead.service,
      zone: lead.zone,
      estimatedJobValueCents: lead.estimatedJobValueCents,
      stage: "LEAD",
      sandbox: true,
      executedExternally: false,
    },
  });
  return { success: true, leadId: String(data.id) };
}