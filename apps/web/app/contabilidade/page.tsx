import { SectionHeader } from "@/components/ui/SectionHeader";
import { ContabilidadeClient } from "./ContabilidadeClient";
import { getAccountingOverview } from "./actions";

export const dynamic = "force-dynamic";

export default async function ContabilidadePage() {
  const data = await getAccountingOverview();

  return (
    <main>
      <SectionHeader
        title="Contabilista Virtual & Fecho de Contas"
        description="Apuramento de IVA (Liquidado vs Dedutível), retenções na fonte de IRS/IRC, balancetes e exportação de dossiers para TOC."
      />

      <div style={{ marginTop: "24px" }}>
        <ContabilidadeClient
          vatPeriod={data.vatPeriod}
          incomeTotal={data.incomeTotal}
          expensesTotal={data.expensesTotal}
          netIncome={data.netIncome}
          withholdingTaxTotal={data.withholdingTaxTotal}
          hasRealData={data.hasRealData}
        />
      </div>
    </main>
  );
}
