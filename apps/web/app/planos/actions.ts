"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import { RPG_OS_PLANS, SubscriptionTier } from "@rpg/core";
import { revalidatePath } from "next/cache";

export async function subscribeToPlanAction(data: {
  tier: SubscriptionTier;
  billingInterval: "MONTHLY" | "ANNUAL";
  companyName?: string;
  email?: string;
}): Promise<{ success: boolean; error?: string; message?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sessão não iniciada. Inicie sessão para subscrever um plano." };
  }

  const supabase = createAdminClient();
  const plan = RPG_OS_PLANS[data.tier];
  const amount = data.billingInterval === "ANNUAL" ? plan.annualPrice : plan.monthlyPrice;

  try {
    const next30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await supabase.from("saas_subscriptions").insert({
      user_id: user.id,
      company_id: user.companyId || null,
      tier: data.tier,
      billing_interval: data.billingInterval,
      status: "ACTIVE",
      amount,
      current_period_start: new Date().toISOString(),
      current_period_end: next30Days,
    });

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      company_id: user.companyId || null,
      action: "SAAS_PLAN_SUBSCRIBED",
      module: "SUBSCRIPTIONS",
      entity_type: "SUBSCRIPTION",
      entity_id: user.id,
      metadata: { tier: data.tier, billingInterval: data.billingInterval, amount },
    });

    revalidatePath("/planos");
    revalidatePath("/dashboard");
    return {
      success: true,
      message: `Subscrição no plano RPG-OS ${plan.name} ativada com sucesso!`,
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao ativar plano." };
  }
}
