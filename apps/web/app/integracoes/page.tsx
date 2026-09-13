import { SectionHeader } from "@/components/ui/SectionHeader";
import { IntegracoesClient } from "./IntegracoesClient";

export const dynamic = "force-dynamic";

export default function IntegracoesPage() {
  return (
    <main>
      <SectionHeader
        title="Integrações Oficiais Portuguesas"
        description="Gestão de conexões com a AMA (Autenticação.gov / Chave Móvel), AT (Autoridade Tributária & e-Fatura) e SIBS (Multibanco & MBWay)."
      />
      <div style={{ marginTop: "24px" }}>
        <IntegracoesClient />
      </div>
    </main>
  );
}
