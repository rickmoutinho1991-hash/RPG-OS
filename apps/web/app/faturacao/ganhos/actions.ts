"use server";

import {
  aggregateFeeLedger,
  type FeeLedgerEntry,
  type FeeMonthlyPoint,
  type FeePeriodTotals,
} from "@rpg/core";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  FeePeriod,
  FeeDashboardRange,
  FeeDashboardData,
} from "./feePeriods";
import { FEE_PERIODS, resolveRange, monthLabel } from "./feePeriods";

/**
 * Carrega o ledger real da EMPRESA do utilizador autenticado e agrega
 * server-side com os snapshots persistidos (gross/fee/net/bps).
 * O cliente não fornece company_id nem quaisquer valores financeiros.
 */
export async function getFeeDashboard(params?: {
  period?: string;
  from?: string;
  to?: string;
}): Promise<{ data: FeeDashboardData | null; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { data: null, error: "Inicie sessão para continuar." };

  const companyId = user.companyId ? String(user.companyId) : null;
  if (!companyId) {
    return { data: null, error: "Sem empresa associada ao utilizador." };
  }

  const requested = FEE_PERIODS.includes((params?.period ?? "") as never)
    ? (params?.period as FeePeriod)
    : "mes-atual";
  const range =
    resolveRange(requested, params?.from, params?.to) ??
    resolveRange("mes-atual")!;

  try {
    const supabase = createAdminClient();

    // Ledger real, filtrado pela empresa na PRÓPRIA query (não no cliente).
    let query = supabase
      .from("platform_fees")
      .select("gross_cents, fee_cents, net_cents, basis_points, created_at, status")
      .eq("company_id", companyId)
      .gte("created_at", `${range.from}T00:00:00Z`)
      .lte("created_at", `${range.to}T23:59:59Z`)
      .order("created_at", { ascending: true })
      .limit(5000);

    // Fees canceladas não contam para volume/ganhos.
    query = query.neq("status", "CANCELLED");

    const [{ data: rows }, { data: config }] = await Promise.all([
      query,
      supabase
        .from("platform_fee_config")
        .select("basis_points")
        .is("company_id", null)
        .maybeSingle(),
    ]);

    const entries: FeeLedgerEntry[] = (rows ?? []).map((r) => ({
      grossCents: Number(r.gross_cents),
      feeCents: Number(r.fee_cents),
      netCents: Number(r.net_cents),
      basisPoints: Number(r.basis_points),
      createdAt: String(r.created_at),
    }));

    const { totals, monthly } = aggregateFeeLedger(entries);

    return {
      data: {
        company: { id: companyId, name: user.companyName ?? "Empresa" },
        range,
        totals,
        monthly: monthly.map((p) => ({ ...p, label: monthLabel(p.month) })),
        currentBasisPoints:
          typeof config?.basis_points === "number" ? config.basis_points : null,
      },
    };
  } catch {
    return { data: null, error: "Não foi possível carregar os ganhos." };
  }
}