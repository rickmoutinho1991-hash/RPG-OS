import { getSessionContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSpaceModeServer } from "@/lib/mode.server";
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
  const mode = await getSpaceModeServer();

  let areaId: string | null = null;
  if (ctx) {
    const admin = createAdminClient();
    const { data: areaProfile } = await admin
      .from("profiles")
      .select("profession_area")
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    areaId = (areaProfile?.profession_area as string | null) ?? null;
  }

  return (
    <OrganizationProviderWrapper>
      <div className="app-shell">
        <Sidebar permissions={ctx?.permissions ?? []} areaId={areaId} mode={mode} />
        <main className="main-shell">
          <Topbar
            user={
              ctx
                ? {
                    name: ctx.user.name,
                    email: ctx.user.email,
                    organizationName:
                      ctx.organization?.name ?? "Espaço Pessoal",
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
