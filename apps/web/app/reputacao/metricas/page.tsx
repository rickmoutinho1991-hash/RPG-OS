import { SectionHeader } from "@/components/ui/SectionHeader";
import { getReputationMetricsAction } from "./actions";
import { MetricsClient } from "./MetricsClient";

export const dynamic = "force-dynamic";

export default async function ReputacaoMetricasPage() {
  const result = await getReputationMetricsAction();
  return (
    <main>
      <SectionHeader
        title="Métricas de Reputação"
        description="Evolução da reputação, distribuição de notas, taxa de resolução e desempenho por alvo."
      />
      <div style={{ marginTop: "24px" }}>
        <MetricsClient {...result} />
      </div>
    </main>
  );
}