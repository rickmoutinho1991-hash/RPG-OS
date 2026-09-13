import { REVENUE_PLANS } from "@rpg/core";
import { getSessionContext } from "@/lib/session";
import { PlanosClient } from "./PlanosClient";

export default async function PlanosSubscricaoPage() {
  const ctx = await getSessionContext();

  const planos = [
    "FREE",
    "STARTER",
    "PRO",
    "BUSINESS",
    "ENTERPRISE",
  ] as const;

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planos RPG-OS</h1>
          {ctx && (
            <p className="text-sm text-muted">
              Logado como {ctx.user.name || ctx.user.email}.
            </p>
          )}
        </div>
      </div>

      <p className="text-sm text-muted mb-4">
        Escolha o plano que melhor se adapta às suas necessidades. Todos os planos
        incluem acesso ao RPG-OS com comissão transacional sobre o volume processado.
      </p>

      <PlanosClient planos={planos} ctx={ctx} />

      <div className="mt-6 pt-6 border-t">
        <p className="text-xs text-muted">
          Os preços estão em euros (€) e incluem a taxa RPG-OS por transação. O plano
          FREE não tem mensalidade, apenas comissão sobre transações.
        </p>
      </div>
    </main>
  );
}