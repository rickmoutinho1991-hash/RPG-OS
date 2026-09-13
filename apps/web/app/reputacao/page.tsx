import { SectionHeader } from "@/components/ui/SectionHeader";
import { ReputacaoClient } from "./ReputacaoClient";
import { getReputacaoHomeData } from "./home-data";

export const dynamic = "force-dynamic";

export default async function ReputacaoPage() {
  const data = await getReputacaoHomeData();

  return (
    <main>
      <SectionHeader
        title="Centro de Reputação, Avaliações e Reclamações"
        description="Gerir a reputação da tua marca e dos teus serviços: avaliações, recomendações, elogios, reclamações e o Portal da Queixa."
      />
      <div style={{ marginTop: "24px" }}>
        <ReputacaoClient data={data} />
      </div>
    </main>
  );
}