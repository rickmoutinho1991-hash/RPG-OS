import { SectionHeader } from "@/components/ui/SectionHeader";
import { FiscalClient } from "./FiscalClient";
import { DeductionsClient } from "./DeductionsClient";
import { getTaxObligationsList } from "./actions";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";

export const dynamic = "force-dynamic";

export default async function FiscalPage() {
  // Mesmo padrão da Vida: sessão → permissão → só depois dados
  // (a action revalida server-side).
  const ctx = await getSessionContext();
  if (!ctx) {
    return (
      <main>
        <div className="card">Inicie sessão para ver as suas obrigações fiscais.</div>
      </main>
    );
  }
  if (!hasPermission(ctx.permissions, "fiscal.view")) {
    return (
      <main>
        <div className="card">
          Não tem permissão para aceder à área fiscal. Contacte a administração
          da organização.
        </div>
      </main>
    );
  }

  const obligations = await getTaxObligationsList();

  return (
    <main>
      <SectionHeader
        title="Portal das Finanças & Segurança Social Direta"
        description="Acompanhamento oficial de obrigações tributárias da AT, e-Fatura, retenções na fonte, simulação de TSU e prazos contributivos."
      />

      <div style={{ marginTop: "24px" }}>
        <FiscalClient obligations={obligations} />
        <DeductionsClient />
      </div>
    </main>
  );
}
