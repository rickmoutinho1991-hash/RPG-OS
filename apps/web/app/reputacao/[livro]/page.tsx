import { SectionHeader } from "@/components/ui/SectionHeader";
import { LivroClient } from "./LivroClient";
import { getReputationBookAction, getReputationDetailAction } from "../actions";
import type { ReputationEntryType } from "@rpg/core";

export const dynamic = "force-dynamic";

const BOOK_SLUGS: Record<string, { label: string; entryType: ReputationEntryType; description: string }> = {
  reclamacoes: { label: "Reclamações", entryType: "COMPLAINT", description: "Reclamações dos clientes e colaboradores." },
  recomendacoes: { label: "Recomendações", entryType: "RECOMMENDATION", description: "Recomendações recebidas e dadas." },
  elogios: { label: "Elogios", entryType: "PRAISE", description: "Elogios e reconhecimentos." },
  avaliacoes: { label: "Avaliações", entryType: "REVIEW", description: "Avaliações gerais da tua marca e serviços." },
};

export default async function LivroPage({ params }: { params: Promise<{ livro: string }> }) {
  const { livro } = await params;
  const book = BOOK_SLUGS[livro];

  if (!book) {
    const detail = await getReputationDetailAction(livro);
    return (
      <main>
        <SectionHeader title="Detalhe da Avaliação" description="Registo individual no Centro de Reputação." />
        <div style={{ marginTop: "24px" }}>
          <LivroClient detail={detail} />
        </div>
      </main>
    );
  }

  const result = await getReputationBookAction(book.entryType);

  return (
    <main>
      <SectionHeader title={book.label} description={book.description} />
      <div style={{ marginTop: "24px" }}>
        <LivroClient entries={result.ok ? result.rows : []} entryType={book.entryType} />
      </div>
    </main>
  );
}