import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatEurosFromCents } from "@rpg/core";
import { getFeeDashboard } from "./actions";
import { FEE_PERIODS, type FeePeriod } from "./feePeriods";

export const dynamic = "force-dynamic";

const PERIOD_OPTIONS: Array<{ key: FeePeriod; label: string }> = [
  { key: "mes-atual", label: "Este mês" },
  { key: "mes-anterior", label: "Mês anterior" },
  { key: "3m", label: "Últimos 3 meses" },
  { key: "12m", label: "Últimos 12 meses" },
];

export default async function GanhosPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const period =
    FEE_PERIODS.includes((params.period ?? "") as never) && params.period
      ? (params.period as FeePeriod)
      : "mes-atual";

  const result = await getFeeDashboard({
    period,
    from: typeof params.from === "string" ? params.from : undefined,
    to: typeof params.to === "string" ? params.to : undefined,
  });

  const data = result.data;
  const qs = (p: FeePeriod) =>
    p === "custom"
      ? `?period=custom&from=${encodeURIComponent(params.from ?? "")}&to=${encodeURIComponent(params.to ?? "")}`
      : `?period=${p}`;

  return (
    <main>
      <SectionHeader
        title="Ganhos via RPG-OS"
        description="Transparência total do modelo de sucesso: sem mensalidade fixa — a plataforma apenas retém a sua taxa sobre o volume efetivamente pago através do RPG-OS."
        action={
          <div style={{ display: "flex", gap: "10px" }}>
            <Link href="/faturacao" className="button secondary">
              ← Voltar à Faturação
            </Link>
          </div>
        }
      />

      {/* Seleção de período (só filtragem por datas — sem valores financeiros) */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <Link
            key={opt.key}
            href={qs(opt.key)}
            className={period === opt.key ? "button" : "button secondary"}
            style={{ padding: "6px 14px", fontSize: "0.85rem" }}
          >
            {opt.label}
          </Link>
        ))}
        <form
          method="get"
          className="ml-2 flex items-center gap-2"
          action="/faturacao/ganhos"
        >
          <input type="hidden" name="period" value="custom" />
          <input
            type="date"
            name="from"
            defaultValue={params.from ?? ""}
            className="input text-sm"
            aria-label="Data inicial"
          />
          <span className="text-slate-400">→</span>
          <input
            type="date"
            name="to"
            defaultValue={params.to ?? ""}
            className="input text-sm"
            aria-label="Data final"
          />
          <button
            type="submit"
            className="button secondary"
            style={{ padding: "6px 14px", fontSize: "0.85rem" }}
          >
            Aplicar
          </button>
        </form>
      </div>

      {result.error && !data ? (
        <Card title="Sem dados">{result.error}</Card>
      ) : data ? (
        <>
          {/* Resumo do período — volume / fee / líquido claramente separados */}
          <div
            className="metrics grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            style={{ marginTop: "8px" }}
          >
            <Card
              title="Volume gerado no período"
              value={formatEurosFromCents(data.totals.grossCents)}
              description={`${data.totals.paymentsCount} pagamentos processados via RPG-OS`}
            />
            <Card
              title="Fee RPG-OS"
              value={formatEurosFromCents(data.totals.feeCents)}
              description={`Taxa efetiva aplicada: ${(data.totals.effectiveBasisPoints / 100).toFixed(2)}%`}
            />
            <Card
              title="Líquido para a empresa"
              value={formatEurosFromCents(data.totals.netCents)}
              description="Volume menos fee da plataforma"
            />
            <Card
              title="Ticket médio"
              value={formatEurosFromCents(data.totals.avgTicketCents)}
              description={
                data.currentBasisPoints !== null
                  ? `Taxa vigente atualmente: ${(data.currentBasisPoints / 100).toFixed(2)}%`
                  : undefined
              }
            />
          </div>

          {/* Evolução mensal (barras CSS puras; altura proporcional em inteiros) */}
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">
              Evolução mensal — fee RPG-OS vs volume
            </h2>
            {data.monthly.length === 0 ? (
              <p className="text-sm text-slate-500">
                Sem pagamentos registados neste período.
              </p>
            ) : (
              (() => {
                const maxGross = Math.max(
                  ...data.monthly.map((m) => m.grossCents),
                  1,
                );
                return (
                  <div className="flex items-end gap-3 overflow-x-auto pb-2">
                    {data.monthly.map((m) => {
                      const hVol = Math.max(
                        Math.round((m.grossCents / maxGross) * 120),
                        m.grossCents > 0 ? 4 : 0,
                      );
                      const hFee = Math.max(
                        Math.round((m.feeCents / maxGross) * 120),
                        m.feeCents > 0 ? 4 : 0,
                      );
                      return (
                        <div
                          key={m.month}
                          className="flex min-w-[64px] flex-col items-center gap-1"
                          title={`Volume: ${formatEurosFromCents(m.grossCents)} · Fee: ${formatEurosFromCents(m.feeCents)} · Líquido: ${formatEurosFromCents(m.netCents)} (${m.count} pag.)`}
                        >
                          <div className="flex h-[130px] items-end gap-1">
                            <div
                              className="w-5 rounded-t bg-indigo-500"
                              style={{ height: `${hVol}px` }}
                            />
                            <div
                              className="w-5 rounded-t bg-emerald-500"
                              style={{ height: `${hFee}px` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-500">
                            {m.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
            <div className="mt-3 flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-500" />
                Volume bruto processado
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                Fee RPG-OS
              </span>
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Período apresentado: {data.range.from} → {data.range.to}. Os
            valores são snapshots históricos persistidos aquando de cada
            pagamento — alterações posteriores à configuração da taxa não os
            afetam.
          </p>
        </>
      ) : null}
    </main>
  );
}