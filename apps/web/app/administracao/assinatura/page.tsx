import { getSessionContext } from "@/lib/session";
import { REVENUE_PLANS, hasPermission } from "@rpg/core";
import { loadRevenueCenterData, type RevenueCenterData } from "@/lib/revenue/center";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdministracaoAssinaturaClient } from "./AssinaturaClient";
import Link from "next/link";

interface DatabaseSubscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: string;
  monthly_price_cents: number;
  billing_interval: string;
  period_price_cents: number;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  current_users: number | null;
  current_companies: number | null;
  current_projects: number | null;
  current_storage_mb: number | null;
  current_automations: number | null;
  created_at: string;
  updated_at: string;
}

export default async function AdministracaoAssinaturaPage() {
  const ctx = await getSessionContext();

  if (!ctx || !ctx.organization) {
    return (
      <main>
        <div className="card">Inicie sessão para aceder à administração.</div>
      </main>
    );
  }
  if (!hasPermission(ctx.permissions, "revenue.manage")) {
    return (
      <main>
        <div className="card">Não tem permissão para gerir a subscrição da organização.</div>
      </main>
    );
  }

  const supabase = createAdminClient();
  const { data: subscription, error: subError } = await supabase
    .from("organization_subscriptions")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .single();

  if (!subscription || subError) {
    return (
      <main>
        <div className="card">
          Sem subscrição ativa. <Link href="/administracao">Voltar à administração</Link>
        </div>
      </main>
    );
  }

  const typedSubscription = subscription as DatabaseSubscription;

  const revenueData: RevenueCenterData = await loadRevenueCenterData({
    userId: ctx.user.id,
    organizationId: ctx.organization.id,
    organizationName: ctx.organization.name,
    permissions: ctx.permissions,
  });

  const plan = REVENUE_PLANS[typedSubscription.plan_id as keyof typeof REVENUE_PLANS];

  return (
    <AdministracaoAssinaturaClient
      plan={plan}
      subscription={typedSubscription}
      revenueData={revenueData}
      organizationName={ctx.organization.name}
    />
  );
}