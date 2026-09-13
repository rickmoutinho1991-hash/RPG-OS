import { getSessionContext } from "@/lib/session";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import PwaRegister from "./PwaRegister";
import { OrganizationProviderWrapper } from "./OrganizationProviderWrapper";

/**
 * AppShell — resolve a sessão no servidor e injeta permissões
 * na navegação. Páginas de autenticação ficam fora do shell.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();

  return (
    <OrganizationProviderWrapper>
      <div className="app-shell">
        <Sidebar permissions={ctx?.permissions ?? []} />
        <main className="main-shell">
          <Topbar
            user={
              ctx
                ? {
                    name: ctx.user.name,
                    email: ctx.user.email,
                    organizationName: ctx.organization?.name,
                    organizations: ctx.availableOrganizations.map((organization) => ({ id: organization.id, name: organization.name })),
                  }
                : null
            }
          />
          <section className="page-content">{children}</section>
        </main>
        <PwaRegister />
      </div>
    </OrganizationProviderWrapper>
  );
}
