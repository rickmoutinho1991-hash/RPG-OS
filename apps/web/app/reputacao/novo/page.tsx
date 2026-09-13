import Link from "next/link";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { NovoClient } from "./NovoClient";

export const dynamic = "force-dynamic";

export default async function NovaEntradaPage() {
  const ctx = await getSessionContext();
  const canCreate = ctx ? hasPermission(ctx.permissions, "reputation.create") : false;

  return (
    <main>
      <SectionHeader
        title="Nova Avaliação / Reclamação"
        description="Avalia, reclama, recomenda ou elogia. Anexa evidências (ficheiros) e guarda rascunhos para mais tarde."
      />
      <div style={{ marginTop: "16px" }}>
        <Link href="/reputacao" className="button secondary">← Centro de Reputação</Link>
      </div>
      <div style={{ marginTop: "16px" }}>
        <NovoClient canCreate={canCreate} />
      </div>
    </main>
  );
}