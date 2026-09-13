import { SectionHeader } from "@/components/ui/SectionHeader";
import { RgpdClient } from "./RgpdClient";

export const dynamic = "force-dynamic";

export default function RgpdPage() {
  return (
    <main>
      <SectionHeader
        title="Privacidade & RGPD"
        description="Gestão de conformidade com o Regulamento Geral sobre a Proteção de Dados (Regulamento UE 2016/679), exportação de dados e direito ao esquecimento."
      />
      <div style={{ marginTop: "24px" }}>
        <RgpdClient />
      </div>
    </main>
  );
}
