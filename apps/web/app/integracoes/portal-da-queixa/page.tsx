import { SectionHeader } from "@/components/ui/SectionHeader";
import { PortalClient } from "./PortalClient";
import { getPortalDaQueixaAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PortalDaQueixaPage() {
  const result = await getPortalDaQueixaAction();
  return (
    <main>
      <SectionHeader
        title="Portal da Queixa"
        description="Monitorizar a tua presença e reputação no Portal da Queixa, de forma honesta e desacoplada — sem scraping nem API inventada."
      />
      <div style={{ marginTop: "24px" }}>
        <PortalClient result={result} />
      </div>
    </main>
  );
}