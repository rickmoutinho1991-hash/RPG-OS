import { SectionHeader } from "@/components/ui/SectionHeader";
import { BancoClient } from "./BancoClient";
import { getBankingOverview, getExpensesList } from "./actions";

export const dynamic = "force-dynamic";

export default async function BancoPage() {
  const [data, expenses] = await Promise.all([
    getBankingOverview(),
    getExpensesList(),
  ]);

  return (
    <main>
      <SectionHeader
        title="Homebanking & Carteira Digital (Open Banking)"
        description="Gestão integrada de contas bancárias portuguesas, saldo consolidado, cartões virtuais, transferências SEPA e registo de despesas."
      />

      <div style={{ marginTop: "24px" }}>
        <BancoClient
          mainAccount={data.mainAccount}
          connectedAccounts={data.connectedAccounts}
          transactions={data.transactions}
          virtualCards={data.virtualCards}
          hasRealAccounts={data.hasRealAccounts}
          expenses={expenses}
        />
      </div>
    </main>
  );
}
