/**
 * RPG-OS — Revenue Center: leitura do ledger e métricas (FASE 7I).
 *
 * Lê as linhas do ledger escopadas à organização da sessão e deriva as
 * métricas do Revenue Center através das funções PURAS do núcleo
 * (`computeRevenueCenter`), que garantem inteiros exatos e zero-when-empty.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeMonthlyRecurringRevenue,
  computeRevenueCenter,
  type LedgerLine,
} from "@rpg/core";
export { computeRevenueCenter };
import type { RevenueTenantContext } from "./tenant";

interface LedgerRow {
  id: string;
  organization_id: string;
  company_id: string | null;
  gross_cents: number;
  fee_cents: number;
  net_cents: number;
  fee_collected_cents: number;
  fee_refunded_cents: number;
  basis_points: number;
  status: string;
  plan_id: string | null;
  source_type: string;
  created_at: string;
  updated_at: string;
}

function toLedgerLine(row: LedgerRow): LedgerLine {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    companyId: row.company_id ? String(row.company_id) : undefined,
    grossCents: Number(row.gross_cents),
    feeCents: Number(row.fee_cents),
    netCents: Number(row.net_cents),
    feeCollectedCents: Number(row.fee_collected_cents),
    basisPoints: Number(row.basis_points),
    feeRefundedCents: Number(row.fee_refunded_cents),
    planId: row.plan_id ? String(row.plan_id) : undefined,
    status: row.status as LedgerLine["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export interface RevenueCenterData {
  metrics: ReturnType<typeof computeRevenueCenter>;
  lines: LedgerLine[];
  activeSubscriptionPriceCents: number;
  mrrCents: number;
}

/**
 * Carrega os dados do Revenue Center para a organização da sessão.
 * Com zero linhas, as métricas devolvem tudo a 0 (nunca NaN/undefined).
 */
export async function loadRevenueCenterData(
  ctx: RevenueTenantContext,
): Promise<RevenueCenterData> {
  const supabase = createAdminClient();

  const [ledgerRes, subRes] = await Promise.all([
    supabase
      .from("revenue_ledger_entries")
      .select("*")
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("organization_subscriptions")
      .select("plan_id, status, monthly_price_cents")
      .eq("organization_id", ctx.organizationId)
      .eq("status", "ACTIVE")
      .maybeSingle(),
  ]);

  const rows = ((ledgerRes.data ?? []) as LedgerRow[]).map(toLedgerLine);
  const metrics = computeRevenueCenter(rows);

  const activePrice =
    subRes.data && subRes.data.status === "ACTIVE"
      ? Number(subRes.data.monthly_price_cents || 0)
      : 0;

  const mrr = computeMonthlyRecurringRevenue({
    activeMonthlyPriceCents: [activePrice],
  });

  return {
    metrics: {
      ...metrics,
      mrrCents: mrr.mrrCents,
      activeSubscriptionCount: mrr.count,
    },
    lines: rows,
    activeSubscriptionPriceCents: activePrice,
    mrrCents: mrr.mrrCents,
  };
}
