import Link from "next/link";
import { getSessionContext } from "@/lib/session";
import { hasPermission, formatEuroFromCents } from "@rpg/core";
import { getMarketingPageData } from "@/lib/marketing";
import MarketingConfigForm from "./MarketingConfigForm";
import MarketingActionForm from "./MarketingActionForm";
import CampaignSandboxPanel from "./CampaignSandboxPanel";

export const dynamic = "force-dynamic";

const STATE_LABELS: Record<string, string> = {
  OFF: "OFF",
  COPILOT: "COPILOT",
  SEMI_AUTONOMOUS: "SEMI-AUTONOMOUS",
  AUTOPILOT: "AUTOPILOT",
};

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx)
    return (
      <main>
        <div className="card">Inicie sessão para aceder a esta página.</div>
      </main>
    );
  if (!hasPermission(ctx.permissions, "marketing.view")) {
    return (
      <main>
        <div className="card">
          Não tem permissão para aceder ao Marketing AI (requer marketing.view).
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const data = await getMarketingPageData(params.company ?? null);

  if (!data.authorized) {
    return (
      <main>
        <div className="card">Sem autorização.</div>
      </main>
    );
  }

  if (!data.companyId) {
    return (
      <main className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Marketing AI / Autopilot</h1>
            <p className="text-sm text-muted">
              Marketing → Lead → Cliente → Orçamento → Trabalho → Pagamento → Platform Fee
            </p>
          </div>
          <Link href="/dashboard" className="text-sm underline">
            ← Voltar
          </Link>
        </div>
        <div className="card">
          O seu utilizador não está associado a nenhuma empresa
          (company_employees). O Marketing AI é configurado por empresa.
        </div>
      </main>
    );
  }

  const cfg = data.config;
  const stateKey =
    !cfg || !cfg.isActive
      ? "OFF"
      : cfg.autonomyLevel === "SEMI_AUTONOMOUS"
        ? "SEMI_AUTONOMOUS"
        : cfg.autonomyLevel;
  const stateLabel = STATE_LABELS[stateKey] ?? stateKey;

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Marketing AI / Autopilot</h1>
          <p className="text-sm text-muted">
            Marketing → Lead → Cliente → Orçamento → Trabalho → Pagamento → Platform Fee
          </p>
        </div>
        <Link href="/dashboard" className="text-sm underline">
          ← Voltar
        </Link>
      </div>

      {data.companies.length > 1 && (
        <div className="card">
          <span className="text-sm font-medium">Empresa:</span>{" "}
          {data.companies.map((c, i) => (
            <span key={c.id}>
              {i > 0 && " · "}
              {c.id === data.companyId ? (
                <strong>{c.name}</strong>
              ) : (
                <Link href={`/marketing?company=${c.id}`} className="underline">
                  {c.name}
                </Link>
              )}
            </span>
          ))}
        </div>
      )}

      {/* ─── Estado ──────────────────────────────────────────────────── */}
      <div className="card">
        <span className="metric-label">Estado do Marketing AI</span>
        <p className="text-2xl font-bold mt-1">{stateLabel}</p>
        {cfg && (
          <p className="text-xs text-muted mt-1">
            Autonomia configurada: {cfg.autonomyLevel}
            {cfg.requiresHumanApproval &&
              " · aprovação humana obrigatória (kill-switch)"}
          </p>
        )}
      </div>

      {/* ─── Segurança ───────────────────────────────────────────────── */}
      <div className="card border-amber-500">
        <h2 className="font-semibold mb-1">Segurança</h2>
        <p className="text-sm">
          <strong>A IA nunca pode ultrapassar os limites definidos.</strong>{" "}
          Todas as decisões passam por guardrails determinísticos validados no
          servidor; orçamentos, autonomia, canais, serviços e zonas são lidos
          da base de dados — nunca do browser.
        </p>
        <p className="text-xs text-muted mt-2">
          Nesta fase as integrações externas ainda não estão ligadas (Meta,
          Google, TikTok, Instagram, pagamentos de publicidade). Nenhuma
          campanha é publicada e nenhum lead real é adquirido — as decisões são
          apenas registadas e auditadas.
        </p>
      </div>

      {/* ─── Orçamento ──────────────────────────────────────────────── */}
      <div className="card">
        <h2 className="font-semibold mb-2">Orçamento</h2>
        {cfg ? (
          <dl className="text-sm grid grid-cols-2 md:grid-cols-3 gap-2">
            <div>
              <dt className="text-muted">Diário</dt>
              <dd>{formatEuroFromCents(cfg.dailyBudgetCents)}</dd>
            </div>
            <div>
              <dt className="text-muted">Mensal</dt>
              <dd>{formatEuroFromCents(cfg.monthlyBudgetCents)}</dd>
            </div>
            <div>
              <dt className="text-muted">Máximo por campanha</dt>
              <dd>{formatEuroFromCents(cfg.maxCampaignBudgetCents)}</dd>
            </div>
            <div>
              <dt className="text-muted">Gasto registado hoje</dt>
              <dd>{formatEuroFromCents(data.spentTodayCents)}</dd>
            </div>
            <div>
              <dt className="text-muted">Gasto registado no mês</dt>
              <dd>{formatEuroFromCents(data.spentThisMonthCents)}</dd>
            </div>
            <div>
              <dt className="text-muted">Leads estimados no mês</dt>
              <dd>{data.leadsThisMonth}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted">
            Sem configuração — o estado efetivo é OFF.
          </p>
        )}
      </div>

      {/* ─── Guardrails ─────────────────────────────────────────────── */}
      <div className="card">
        <h2 className="font-semibold mb-2">Guardrails</h2>
        {cfg ? (
          <dl className="text-sm grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <dt className="text-muted">Custo máximo por lead</dt>
              <dd>{formatEuroFromCents(cfg.maxCostPerLeadCents)}</dd>
            </div>
            <div>
              <dt className="text-muted">Máximo de leads/mês</dt>
              <dd>{cfg.maxLeadsPerMonth}</dd>
            </div>
            <div>
              <dt className="text-muted">Valor mínimo de trabalho</dt>
              <dd>{formatEuroFromCents(cfg.minJobValueCents)}</dd>
            </div>
            <div>
              <dt className="text-muted">Margem mínima</dt>
              <dd>
                {cfg.minMarginBps === null
                  ? "—"
                  : `${(cfg.minMarginBps / 100).toFixed(2)}%`}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Canais permitidos</dt>
              <dd>{cfg.allowedChannels.join(", ") || "nenhum"}</dd>
            </div>
            <div>
              <dt className="text-muted">Serviços permitidos</dt>
              <dd>{cfg.allowedServices.join(", ") || "nenhum"}</dd>
            </div>
            <div>
              <dt className="text-muted">Zonas permitidas</dt>
              <dd>{cfg.allowedZones.join(", ") || "nenhuma"}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted">Sem guardrails configurados.</p>
        )}
      </div>

      {/* ─── Configuração (gestão) ──────────────────────────────────── */}
      {data.canManage && data.companyId && (
        <div className="card">
          <h2 className="font-semibold mb-2">Configuração</h2>
          <MarketingConfigForm
            companyId={data.companyId}
            pendingInstanceId={data.pendingInstanceId}
            initial={{
              isActive: cfg?.isActive ?? false,
              autonomyLevel: cfg?.autonomyLevel ?? "COPILOT",
              dailyBudget: cfg ? (cfg.dailyBudgetCents / 100).toFixed(2) : "",
              monthlyBudget: cfg ? (cfg.monthlyBudgetCents / 100).toFixed(2) : "",
              maxCampaignBudget: cfg
                ? (cfg.maxCampaignBudgetCents / 100).toFixed(2)
                : "",
              maxCostPerLead: cfg ? (cfg.maxCostPerLeadCents / 100).toFixed(2) : "",
              maxLeadsPerMonth: cfg ? String(cfg.maxLeadsPerMonth) : "",
              minJobValue: cfg ? (cfg.minJobValueCents / 100).toFixed(2) : "",
              minMarginPercent:
                cfg?.minMarginBps != null
                  ? (cfg.minMarginBps / 100).toFixed(2)
                  : "",
              allowedChannels: cfg?.allowedChannels ?? [],
              allowedServices: cfg?.allowedServices.join(", ") ?? "",
              allowedZones: cfg?.allowedZones.join(", ") ?? "",
              requiresHumanApproval: cfg?.requiresHumanApproval ?? false,
            }}
          />
        </div>
      )}

      {/* ─── Simulador de decisão (execute) ─────────────────────────── */}
      {data.canExecute && data.companyId && (
        <div className="card">
          <h2 className="font-semibold mb-2">
            Pipeline de decisão (recomendação → guardrails)
          </h2>
          <p className="text-xs text-muted mb-3">
            Simula uma recomendação da IA. A decisão é calculada server-side
            com a configuração real da empresa e registada com auditoria.
          </p>
          <MarketingActionForm
            companyId={data.companyId}
            channels={cfg?.allowedChannels ?? []}
            pendingActions={data.actions
              .filter((a) => a.status === "PENDING_APPROVAL")
              .map((a) => ({
                id: a.id,
                actionType: a.actionType,
                channel: a.channel,
                estimatedCostCents: a.estimatedCostCents,
                reasonCode: a.reasonCode,
              }))}
          />
        </div>
      )}

      {/* ─── Campanhas ──────────────────────────────────────────────── */}
      <div className="card">
        <h2 className="font-semibold mb-2">Campanhas</h2>
        {data.campaigns.length === 0 ? (
          <p className="text-sm text-muted">
            Sem campanhas. Crie via ação de campanha (sandbox) ou aguarde futuras
            integrações externas. Nada é publicado em plataformas reais.
          </p>
        ) : (
          <div className="space-y-4">
            {data.campaigns.map((c) => (
              <div key={c.id} className="border rounded p-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <strong>{c.name}</strong>
                  <span>{c.objective}</span>
                  <span>{c.status}</span>
                  <span>{c.channels.join(", ")}</span>
                  <span>{formatEuroFromCents(c.budgetCents)}</span>
                  {c.providerId && (
                    <span className="text-xs text-muted">
                      {c.providerId} ·{" "}
                      <code className="text-[11px]">{c.providerExternalId}</code>
                    </span>
                  )}
                </div>
                {data.canExecute && c.providerId && (
                  <CampaignSandboxPanel campaign={c} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Leads (sandbox) ─────────────────────────────────────────── */}
      <div className="card">
        <h2 className="font-semibold mb-2">Leads (intake — sandbox)</h2>
        <p className="text-xs text-muted mb-2">
          Trilho futuro: lead → orçamento aceite → obra → fatura → pagamento →
          platform fee. Nesta fase os leads ficam em etapa LEAD; a conversão é
          humana e futura.
        </p>
        {data.leads.length === 0 ? (
          <p className="text-sm text-muted">Sem leads simulados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Nome</th>
                <th className="text-left">Contacto</th>
                <th className="text-left">Serviço</th>
                <th className="text-left">Zona</th>
                <th className="text-left">Valor trab.</th>
                <th className="text-left">Etapa</th>
                <th className="text-left">Recebido</th>
              </tr>
            </thead>
            <tbody>
              {data.leads.map((l) => (
                <tr key={l.id}>
                  <td>{l.name ?? "—"}</td>
                  <td>{l.contact ?? "—"}</td>
                  <td>{l.service ?? "—"}</td>
                  <td>{l.zone ?? "—"}</td>
                  <td>
                    {l.estimatedJobValueCents !== null
                      ? formatEuroFromCents(l.estimatedJobValueCents)
                      : "—"}
                  </td>
                  <td>{l.stage}</td>
                  <td>
                    {l.receivedAt
                      ? new Date(l.receivedAt).toLocaleString("pt-PT")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── Histórico de decisões ──────────────────────────────────── */}
      <div className="card">
        <h2 className="font-semibold mb-2">Decisões de ações (auditadas)</h2>
        {data.actions.length === 0 ? (
          <p className="text-sm text-muted">Sem ações registadas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Data</th>
                <th className="text-left">Ação</th>
                <th className="text-left">Canal</th>
                <th className="text-left">Decisão</th>
                <th className="text-left">Motivo</th>
                <th className="text-left">Estado</th>
                <th className="text-left">Custo est.</th>
              </tr>
            </thead>
            <tbody>
              {data.actions.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.createdAt
                      ? new Date(a.createdAt).toLocaleString("pt-PT")
                      : "—"}
                  </td>
                  <td>{a.actionType}</td>
                  <td>{a.channel}</td>
                  <td
                    className={
                      a.decision === "ALLOWED"
                        ? "text-emerald-600"
                        : a.decision === "DENIED"
                          ? "text-destructive"
                          : "text-amber-600"
                    }
                  >
                    {a.decision}
                  </td>
                  <td>{a.reasonCode}</td>
                  <td>{a.status}</td>
                  <td>
                    {a.estimatedCostCents !== null
                      ? formatEuroFromCents(a.estimatedCostCents)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
