import { hasPermission } from "@rpg/core";
import { getSessionContext } from "@/lib/session";
import AtClient from "./AtClient";

export const dynamic = "force-dynamic";

/**
 * Administração AT — registo de ligações fiscais (SEM conectividade).
 * Gate server-side fiscal.manage; sem permissão, estado explícito.
 */
export default async function AtAdminPage() {
  const ctx = await getSessionContext();
  if (!ctx) {
    return (
      <main>
        <div className="card">Inicie sessão para gerir ligações AT.</div>
      </main>
    );
  }
  if (!hasPermission(ctx.permissions, "fiscal.manage")) {
    return (
      <main>
        <div className="card">
          Não tem permissão para gerir ligações AT. Contacte a administração
          da organização.
        </div>
      </main>
    );
  }
  return (
    <main>
      <p style={{ fontSize: "11px", letterSpacing: "2px", color: "var(--muted)", margin: "0 0 4px" }}>
        ADMINISTRAÇÃO
      </p>
      <h1 style={{ margin: "0 0 12px" }}>Ligações AT</h1>
      <AtClient />
    </main>
  );
}
