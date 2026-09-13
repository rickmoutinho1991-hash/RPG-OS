"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  updateMarketingConfig,
  proposeMarketingAction,
  decideMarketingAction,
  type MarketingConfigInput,
  type MarketingConfigResult,
  type MarketingActionInput,
  type MarketingActionResult,
} from "@/lib/marketing";
import {
  simulateSandboxMetrics,
  simulateSandboxLead,
} from "@/lib/marketingExecution";

/**
 * Server Action: guardar a configuração do Marketing AI.
 * O cliente apenas envia input; autorização (marketing.manage), validação
 * de âmbito multi-tenant, conversão de valores e workflow acontecem no
 * servidor — nunca no cliente.
 */
export async function saveMarketingConfigAction(
  input: MarketingConfigInput,
): Promise<MarketingConfigResult> {
  const r = await updateMarketingConfig(input);
  if (r.success) revalidatePath("/marketing");
  return r;
}

/** Server Action: propor uma ação da IA (passa sempre pelos guardrails). */
export async function proposeMarketingActionAction(
  input: MarketingActionInput,
): Promise<MarketingActionResult> {
  const r = await proposeMarketingAction(input);
  if (r.success) revalidatePath("/marketing");
  return r;
}

/** Server Action: aprovar/rejeitar ação pendente de aprovação humana. */
export async function decideMarketingActionAction(
  actionId: string,
  approve: boolean,
  note?: string,
): Promise<{ success: boolean; error?: string }> {
  const r = await decideMarketingAction(actionId, approve, note);
  if (r.success) revalidatePath("/marketing");
  return r;
}

const MARKETING_EXECUTE_PERMISSION = "marketing.execute";

/**
 * Valida o âmbito multi-tenant de uma campanha: o utilizador tem de ser
 * colaborador da empresa da campanha e ter marketing.execute. Devolve o
 * userId e o companyId resolvido na BD — nunca do browser.
 */
async function resolveCampaignScope(
  campaignId: string,
): Promise<{ userId: string; companyId: string } | { error: string }> {
  const ctx = await getSessionContext();
  if (!ctx || !hasPermission(ctx.permissions, MARKETING_EXECUTE_PERMISSION)) {
    return { error: "Sem autorização." };
  }
  const supabase = createAdminClient();
  const { data: campaign } = await supabase
    .from("marketing_campaigns")
    .select("company_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { error: "Campanha não encontrada." };
  const { data: employees } = await supabase
    .from("company_employees")
    .select("company_id")
    .eq("user_id", ctx.user.id)
    .eq("company_id", String(campaign.company_id));
  if (!employees || employees.length === 0) {
    return { error: "Sem âmbito sobre esta campanha." };
  }
  return { userId: ctx.user.id, companyId: String(campaign.company_id) };
}

/** Server Action: simular métricas numa campanha publicada (sandbox only). */
export async function simulateMetricsAction(input: {
  campaignId: string;
  channel: string;
  providerExternalId: string;
  impressions: number;
  clicks: number;
  leads: number;
  cost: string; // euros
}): Promise<{ success: boolean; error?: string }> {
  const scope = await resolveCampaignScope(input.campaignId);
  if ("error" in scope) return { success: false, error: scope.error };
  const cents = Math.round(Number(input.cost) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    return { success: false, error: "Custo inválido." };
  }
  const r0 = await simulateSandboxMetrics({
    companyId: scope.companyId,
    userId: scope.userId,
    channel: input.channel,
    providerExternalId: input.providerExternalId,
    delta: {
      impressions: Math.max(0, input.impressions),
      clicks: Math.max(0, input.clicks),
      leads: Math.max(0, input.leads),
      costCents: cents,
    },
  });
  if (r0.success) revalidatePath("/marketing");
  return r0;
}

/** Server Action: simular um lead recebido numa campanha publicada. */
export async function simulateLeadAction(input: {
  campaignId: string;
  channel: string;
  providerExternalId: string;
  name: string;
  contact: string;
  service: string;
  zone: string;
  jobValue: string; // euros
}): Promise<{ success: boolean; error?: string; leadId?: string }> {
  const scope = await resolveCampaignScope(input.campaignId);
  if ("error" in scope) return { success: false, error: scope.error };
  const cents = input.jobValue.trim()
    ? Math.round(Number(input.jobValue) * 100)
    : null;
  if (cents !== null && (!Number.isSafeInteger(cents) || cents < 0)) {
    return { success: false, error: "Valor de trabalho inválido." };
  }
  const r0 = await simulateSandboxLead({
    companyId: scope.companyId,
    userId: scope.userId,
    campaignId: input.campaignId,
    channel: input.channel,
    providerExternalId: input.providerExternalId,
    name: input.name?.trim() || null,
    contact: input.contact?.trim() || null,
    service: input.service?.trim() || null,
    zone: input.zone?.trim() || null,
    estimatedJobValueCents: cents,
  });
  if (r0.success) revalidatePath("/marketing");
  return r0;
}