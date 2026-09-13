import { SectionHeader } from "@/components/ui/SectionHeader";
import { DispositivosHub } from "./DispositivosHub";

export const dynamic = "force-dynamic";

export default function DispositivosPage() {
  return (
    <main>
      <SectionHeader
        title="Dispositivos & Sincronização"
        description="Gestão de relógios inteligentes (Apple Watch & Wear OS), telemóveis, PWA e envio de notificações em tempo real."
      />
      <div style={{ marginTop: "24px" }}>
        <DispositivosHub />
      </div>
    </main>
  );
}
