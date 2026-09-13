import { hasPermission } from "@rpg/core";
import { getSessionContext } from "@/lib/session";
import FiscalInboxClient from "./FiscalInboxClient";

export const dynamic = "force-dynamic";

/**
 * Caixa Fiscal — gate server-side (R1).
 * Sessão → fiscal.admin → só depois UI (que carrega via loader server-side).
 * Sem permissão: estado explícito, sem queries, sem IDs, sem dados fiscais.
 */
export default async function FiscalAdminPage() {
  const ctx = await getSessionContext();
  if (!ctx) {
    return (
      <main>
        <div className="card">Inicie sessão para aceder à Caixa Fiscal.</div>
      </main>
    );
  }
  if (!hasPermission(ctx.permissions, "fiscal.admin")) {
    return (
      <main>
        <div className="card">
          Não tem permissão para aceder à Caixa Fiscal. Contacte a administração
          da organização.
        </div>
      </main>
    );
  }
  return <FiscalInboxClient />;
}
