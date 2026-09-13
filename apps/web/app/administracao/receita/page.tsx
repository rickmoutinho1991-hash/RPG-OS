import Link from "next/link";
import { hasPermission, REVENUE_PLAN_IDS, REVENUE_PLANS, formatBasisPoints } from "@rpg/core";
import { getSessionContext } from "@/lib/session";
import { loadRevenueCenterData } from "@/lib/revenue/center";
import { canManageRevenue } from "@/lib/revenue/tenant";
import RevenueActionsForm from "./RevenueActionsForm";

export const dynamic = "force-dynamic";

function eur(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const intPart = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const decPart = String(abs % 100).padStart(2, "0");
  return `${sign}${intPart},${decPart} €`;
}

export default async function RevenueCenterPage() {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.organization) {
    return (
      <main>
        <div className="card">Inicie sessão para aceder ao Revenue Center.</div>
      </main>
    );
  }
  if (!hasPermission(ctx.permissions, "revenue.view")) {
    return (
      <main>
        <div className="card">Não tem permissão para ver a receita da organização.</div>
      </main>
    );
  }

  const tenant = {
    userId: ctx.user.id,
    organizationId: ctx.organization.id,
    organizationName: ctx.organization.name,
    permissions: ctx.permissions,
  };
  const data = await loadRevenueCenterData(tenant);
  const m = data.metrics;

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Revenue Center</h1>
          <p className="text-sm text-muted">
            Receita da organização <strong>{ctx.organization.name}</strong>. Todos os
            valores em euros, calculados a partir do ledger (inteiros exatos).
          </p>
        </div>
        <Link href="/administracao" className="text-sm underline">
          ← Voltar à administração
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-xs text-muted">GMV (volume bruto)</div>
          <div className="text-2xl font-bold">{eur(m.gmvCents)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-muted">Receita da plataforma</div>
          <div className="text-2xl font-bold">{eur(m.platformRevenueCents)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-muted">Líquido (empresas)</div>
          <div className="text-2xl font-bold">{eur(m.netCents)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-muted">Reembolsos</div>
          <div className="text-2xl font-bold">{eur(m.refundsCents)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-muted">Taxa média (efetiva)</div>
          <div className="text-2xl font-bold">
            {m.averageFeeBps > 0 ? formatBasisPoints(m.averageFeeBps) : "0,00%"}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-muted">Organizações pagantes</div>
          <div className="text-2xl font-bold">{m.payingOrgCount}</div>
        </div>
        <div className="card">
          <div className="text-xs text-muted">MRR</div>
          <div className="text-2xl font-bold">{eur(m.mrrCents)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-muted">Subscrições ativas</div>
          <div className="text-2xl font-bold">{m.activeSubscriptionCount}</div>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-2">Planos & taxas RPG-OS</h2>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">Plano</th>
              <th className="text-left">Mensalidade</th>
              <th className="text-left">Taxa de sucesso</th>
              <th className="text-left">Descrição</th>
            </tr>
          </thead>
          <tbody>
            {REVENUE_PLAN_IDS.map((id) => {
              const p = REVENUE_PLANS[id];
              return (
                <tr key={id}>
                  <td className="font-medium">{p.label}</td>
                  <td>{p.monthlyPriceCents > 0 ? eur(p.monthlyPriceCents) : "—"}</td>
                  <td>{formatBasisPoints(p.platformFeeBps)}</td>
                  <td className="text-muted">{p.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-2">Ledger de receita (append-only)</h2>
        {data.lines.length === 0 ? (
          <p className="text-sm text-muted">Ainda não existem registos de receita.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Data</th>
                <th className="text-left">Bruto</th>
                <th className="text-left">Fee</th>
                <th className="text-left">Líquido</th>
                <th className="text-left">Taxa</th>
                <th className="text-left">Estado</th>
                <th className="text-left">Plano</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.slice(0, 50).map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.createdAt).toLocaleString("pt-PT")}</td>
                  <td>{eur(l.grossCents)}</td>
                  <td>{eur(l.feeCents)}</td>
                  <td>{eur(l.netCents)}</td>
                  <td>{formatBasisPoints(l.basisPoints)}</td>
                  <td>
                    <span
                      className={
                        l.status === "COLLECTED"
                          ? "text-emerald-600"
                          : l.status === "REFUNDED" || l.status === "REVERSED"
                          ? "text-muted"
                          : l.status === "FAILED"
                          ? "text-destructive"
                          : "text-amber-600"
                      }
                    >
                      {l.status}
                    </span>
                  </td>
                  <td>{l.planId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canManageRevenue({ userId: ctx.user.id, organizationId: ctx.organization.id, organizationName: ctx.organization.name, permissions: ctx.permissions }) && (
        <div className="card">
          <h2 className="font-semibold mb-2">Simulador (sandbox QA)</h2>
          <p className="text-sm text-muted mb-3">
            Apenas para validação local num ambiente de teste. Regista pagamentos,
            reembolsos e subscrições reais (com fake provider).
          </p>
          <RevenueActionsForm />
        </div>
      )}
    </main>
  );
}
