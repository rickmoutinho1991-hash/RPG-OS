import { SectionHeader } from "@/components/ui/SectionHeader";
import { DiarioClient } from "./DiarioClient";
import { getDiaryEntriesList } from "./actions";

export const dynamic = "force-dynamic";

export default async function DiarioPage() {
  const entries = await getDiaryEntriesList();

  return (
    <main>
      <SectionHeader
        title="Diário Universal & Produtividade"
        description="Registo diário universal para qualquer pessoa ou empresa: notas de reuniões, obras, rotinas de saúde/medicação, finanças e metas."
      />
      <div style={{ marginTop: "24px" }}>
        <DiarioClient initialEntries={entries} />
      </div>
    </main>
  );
}
