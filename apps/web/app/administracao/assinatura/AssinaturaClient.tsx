"use client";

import { useState, useEffect } from "react";
import { planLimitStatus, planLimitMessage, planLimit, planLimitRemaining, planLimitPercentage } from "@rpg/core";
import { computeRevenueCenter, type LedgerLine } from "@rpg/core";
import type { RevenueCenterData } from "@/lib/revenue/center";

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

interface AssinaturaClientProps {
  plan: {
    label: string;
    platformFeeBps: number;
    annualDiscountBps: number;
    monthlyPriceCents: number;
    limits: { maxUsers: number; maxCompanies: number; maxProjects: number; maxStorageMb: number; maxAutomations: number };
    description: string;
    id: string;
  };
  subscription: DatabaseSubscription;
  revenueData: RevenueCenterData;
  organizationName: string;
}

export function AdministracaoAssinaturaClient({ plan, subscription, revenueData, organizationName }: AssinaturaClientProps) {
  const [ledgerEntries, setLedgerEntries] = useState<LedgerLine[]>([]);
  const [billingSummary, setBillingSummary] = useState(revenueData.metrics);

  useEffect(() => {
    const loadData = async () => {
      const supabase = (await import("@/lib/supabase/admin")).createAdminClient();
      const orgId = subscription.organization_id;

      const { data: ledger, error: ledgerError } = await supabase
        .from("revenue_ledger_entries")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (ledger && !ledgerError) {
        const rows: LedgerLine[] = ledger.map((row) => ({
          id: String(row.id),
          organizationId: String(row.organization_id),
          grossCents: Number(row.gross_cents),
          feeCents: Number(row.fee_cents),
          netCents: Number(row.net_cents),
          feeCollectedCents: 0,
          basisPoints: 0,
          feeRefundedCents: 0,
          status: (row.status as LedgerLine["status"]) || "PENDING",
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
          sourceType: row.source_type,
        }));
        const metrics = computeRevenueCenter(rows);
        setBillingSummary(metrics);
        setLedgerEntries(rows);
      }
    };

    loadData();
  }, [subscription.organization_id]);

  const annualPrice =
    subscription.billing_interval === "YEAR"
      ? Math.round(
          subscription.monthly_price_cents * 12 * (10000 - plan.annualDiscountBps) / 10000,
        )
      : null;

  const limitKeys = ["maxUsers", "maxCompanies", "maxProjects", "maxStorageMb", "maxAutomations"] as const;
  const limitUsages: Record<string, number> = {
    maxUsers: subscription.current_users ?? 0,
    maxCompanies: subscription.current_companies ?? 0,
    maxProjects: subscription.current_projects ?? 0,
    maxStorageMb: subscription.current_storage_mb ?? 0,
    maxAutomations: subscription.current_automations ?? 0,
  };

  const limitEvaluations = limitKeys.map((key) => {
    const limit = planLimit(plan, key);
    const usage = limitUsages[key as keyof typeof limitUsages];
    const status = planLimitStatus(usage, limit);
    const percentage = planLimitPercentage(usage, limit);
    const remaining = planLimitRemaining(usage, limit);
    return {
      key,
      limit,
      usage,
      status,
      percentage,
      remaining,
      message: planLimitMessage(plan, key, usage),
    };
  });

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assinatura da Organização</h1>
          <p className="text-sm text-muted">
            {organizationName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium opacity-60">
            {subscription.status}
          </span>
          {subscription.billing_interval === "MONTH" ? "Mês" : "Ano"}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card p-4">
          <h4 className="font-medium mb-2">Plano atual</h4>
          <p>{plan.label}</p>
          <p className="text-2xl font-bold">
            {subscription.monthly_price_cents > 0
              ? `${(subscription.monthly_price_cents / 100).toFixed(2)} €/mês`
              : "Grátis"}
          </p>
          <p className="text-sm text-muted">
            {plan.platformFeeBps / 100}% comissão
          </p>
        </div>
        <div className="card p-4">
          <h4 className="font-medium mb-2">Intervalo de faturação</h4>
          <p>{subscription.billing_interval === "MONTH" ? "Mensal" : "Anual"}</p>
          {annualPrice && (
            <p className="text-sm text-muted">
              Anual: {annualPrice / 100} €/mês (com {plan.annualDiscountBps / 10}% desconto)
            </p>
          )}
          <p className="text-sm text-muted">Próximo pagamento: {subscription.current_period_end
            ? new Date(subscription.current_period_end).toLocaleDateString("pt-PT")
            : "N/A"}</p>
          {subscription.cancel_at_period_end && (
            <p className="text-sm text-warning">
              Cancelamento pendente no final do período
            </p>
          )}
        </div>

        <div className="card p-4">
          <h4 className="font-medium mb-2">Limites atuais</h4>
          {limitEvaluations.map((evaluation) => {
            const limitKeyMapShort: Record<string, string> = {
              maxUsers: "users",
              maxCompanies: "companies",
              maxProjects: "projects",
              maxStorageMb: "MB",
              maxAutomations: "automações",
            };
            return (
              <div key={evaluation.key} className="mb-3 p-3 rounded border">
                <div className="flex justify-between align-baseline">
                  <span>{limitKeyMapShort[evaluation.key]}</span>
                  <span className="text-xs font-medium opacity-60">
                    {evaluation.usage}
                  </span>
                </div>
                <p className="text-sm">
                  {evaluation.remaining > 0 ? `${evaluation.remaining} restantes` : "Limite atingido"}
                </p>
                <p className="text-xs mt-1">
                  {evaluation.status === "OK"
                    ? "OK"
                    : evaluation.status === "WARNING"
                      ? "Aviso"
                      : "Excedido"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-4">
        <h4 className="font-medium mb-2">Faturamento do período</h4>
        {billingSummary && (
          <>
            <p>GMV: {(billingSummary.gmvCents / 100).toFixed(2)} €</p>
            <p>Comissão RPG-OS: {(billingSummary.platformRevenueCents / 100).toFixed(2)} €</p>
            <p>Líquido (para empresas): {(billingSummary.netCents / 100).toFixed(2)} €</p>
            <p>Reembolsos: {(billingSummary.refundsCents / 100).toFixed(2)} €</p>
          </>
        )}
        {(!billingSummary || billingSummary.gmvCents === 0) && (
          <p className="text-sm text-muted">Sem registos de faturamento.</p>
        )}
      </div>

      <div className="card p-4">
        <h4 className="font-medium mb-2">Últimas transações do ledger</h4>
        {ledgerEntries.length === 0 ? (
          <p className="text-sm text-muted">Sem registos de ledger.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {ledgerEntries.map((entry, idx) => (
              <div key={entry.id} className="p-2 rounded border-b">
                <div className="flex justify-between align-baseline">
                  <span>
                    {new Date(entry.createdAt).toLocaleString("pt-PT")}
                  </span>
                  <span className="text-xs font-medium">
                    {entry.sourceType}
                  </span>
                </div>
                <div className="mt-1">
                  <p>
                    <strong>Bruto:</strong> {(entry.grossCents / 100).toFixed(2)} €
                  </p>
                  <p>
                    <strong>Comissão:</strong> {(entry.feeCents / 100).toFixed(2)} €
                  </p>
                  <p>
                    <strong>Líquido:</strong> {(entry.netCents / 100).toFixed(2)} €
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}