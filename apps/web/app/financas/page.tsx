import { SectionHeader } from "@/components/ui/SectionHeader";
import { FinancasClient } from "./FinancasClient";
import { getFinanceOverview } from "./actions";

export const dynamic = "force-dynamic";

export default async function FinancasPage() {
  const result = await getFinanceOverview();

  return (
    <main>
      <SectionHeader
        title="Centro Financeiro"
        description="Vida financeira num só lugar: saldo, contas a pagar, dívidas, receitas, despesas e assistente financeiro pessoal."
      />

      <div style={{ marginTop: "24px" }}>
        <FinancasClient {...result} />
      </div>
    </main>
  );
}