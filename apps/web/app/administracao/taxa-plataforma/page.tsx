import Link from "next/link";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBasisPoints } from "@rpg/core";
import { getPlatformFeeAdminData, type FeeConfigRowView } from "@/lib/feeConfig";
import FeeConfigForm from "./FeeConfigForm";

export const dynamic = "force-dynamic";

export default async function PlatformFeeAdminPage() {
  const ctx = await getSessionContext();
  if (!ctx)
    return (
      <main>
        <div className="card">Inicie sessão para aceder a esta página.</div>
      </main>
    );
  if (!hasPermission(ctx.permissions, "platform_fees.manage")) {
    return (
      <main>
        <div className="card">
          Não tem permissão para configurar a taxa RPG-OS.
        </div>
      </main>
    );
  }

  const data = await getPlatformFeeAdminData();
  if (!data.authorized) {
    return (
      <main>
        <div className="card">
          Não tem permissão para configurar a taxa RPG-OS.
        </div>
      </main>
    );
  }

  const globalConfig: FeeConfigRowView | null = data.globalConfig;
  const currentGlobalLabel = globalConfig
    ? formatBasisPoints(globalConfig.basisPoints)
    : "não definida";

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Taxa RPG-OS</h1>
          <p className="text-sm text-muted">
            Modelo sem mensalidade. RPG-OS cobra uma percentagem apenas sobre
            pagamentos efetivamente processados.
          </p>
        </div>
        <Link href="/administracao" className="text-sm underline">
          ← Voltar à administração
        </Link>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-2">Taxa global atual</h2>
        <p className="text-lg">{currentGlobalLabel}</p>
        <p className="text-xs text-muted mt-1">
          Aplica-se a todas as empresas sem override específico.
        </p>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-2">Overrides por empresa</h2>
        {data.overrides.length === 0 ? (
          <p className="text-sm text-muted">Sem overrides ativos.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Empresa</th>
                <th className="text-left">Taxa</th>
                <th className="text-left">Estado</th>
                <th className="text-left">Última atualização</th>
              </tr>
            </thead>
            <tbody>
              {data.overrides.map((o) => (
                <tr key={`${o.companyId}-${o.updatedAt ?? ""}`}>
                  <td>{o.companyName}</td>
                  <td>{formatBasisPoints(o.basisPoints)}</td>
                  <td>
                    {o.isActive ? (
                      <span className="text-emerald-600">Ativo</span>
                    ) : (
                      <span className="text-muted">Inativo</span>
                    )}
                  </td>
                  <td>
                    {o.updatedAt
                      ? new Date(o.updatedAt).toLocaleString("pt-PT")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
        }
      </div>

      <div className="card">
        <h2 className="font-semibold mb-2">Propor alteração de taxa</h2>
        <p className="text-sm text-muted mb-3">
          A alteração só passa a vigorar após aprovação. Crie um pedido de
          aprovação através do workflow engine.
        </p>
        <FeeConfigForm
          effectiveBps={data.effectiveBps}
          managedCompanies={data.managedCompanies}
          pendingInstanceId={data.pendingInstanceId}
        />
      </div>

      <div className="card">
        <h2 className="font-semibold mb-2">Histórico de alterações</h2>
        {data.history.length === 0 ? (
          <p className="text-sm text-muted">Sem alterações registadas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Ação</th>
                <th className="text-left">Âmbito</th>
                <th className="text-left">De → Para</th>
                <th className="text-left">Por</th>
                <th className="text-left">Data</th>
                <th className="text-left">Motivo</th>
                <th className="text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((h, i) => (
                <tr key={`${h.action}-${i}`}>
                  <td>{h.action}</td>
                  <td>{h.scopeLabel}</td>
                  <td>
                    {h.previousBps != null
                      ? formatBasisPoints(h.previousBps)
                      : "—"}{" "}
                    →{" "}
                    {h.newBps != null ? formatBasisPoints(h.newBps) : "—"}
                  </td>
                  <td>{h.actorName}</td>
                  <td>
                    {h.timestamp
                      ? new Date(h.timestamp).toLocaleString("pt-PT")
                      : "—"}
                  </td>
                  <td>{h.reason ?? "—"}</td>
                  <td>
                    {h.status === "PENDING" ? (
                      <span className="text-amber-600">Pendente</span>
                    ) : h.status === "APPLIED" ? (
                      <span className="text-emerald-600">Aplicado</span>
                    ) : (
                      h.status ?? "—"
                    )}
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
