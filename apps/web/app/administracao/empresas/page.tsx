import { hasPermission } from "@rpg/core";
import { getSessionContext } from "@/lib/session";
import EmpresasClient from "./EmpresasClient";

export const dynamic = "force-dynamic";

/**
 * Administração de Empresas — vínculo formal Company ↔ Organization.
 * Gate server-side fiscal.admin; sem permissão, estado explícito sem dados.
 */
export default async function EmpresasAdminPage() {
  const ctx = await getSessionContext();
  if (!ctx) {
    return (
      <main>
        <div className="card">Inicie sessão para gerir associações empresa-organização.</div>
      </main>
    );
  }
  if (!hasPermission(ctx.permissions, "fiscal.admin")) {
    return (
      <main>
        <div className="card">
          Não tem permissão para gerir associações empresa-organização.
          Contacte a administração da organização.
        </div>
      </main>
    );
  }
  return (
    <main>
      <p style={{ fontSize: "11px", letterSpacing: "2px", color: "var(--muted)", margin: "0 0 4px" }}>
        ADMINISTRAÇÃO
      </p>
      <h1 style={{ margin: "0 0 12px" }}>Empresas e Organizações</h1>
      <EmpresasClient organizations={ctx.availableOrganizations} />
    </main>
  );
}
