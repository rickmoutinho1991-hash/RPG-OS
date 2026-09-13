import { createClient } from "./server";
import { createAdminClient } from "./admin";
import { AuthenticatedUser } from "@rpg/core";
import { SYSTEM_ROLES, SystemRole } from "@rpg/core";

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    const admin = createAdminClient();

    // Obter perfil e roles
    const { data: profile } = await admin
      .from("profiles")
      .select("name, tax_number, company_id, companies(legal_name)")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: userRoles } = await admin
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", user.id);

    const primaryRole =
      ((userRoles?.[0]?.roles as unknown as { name: string })
        ?.name as SystemRole) || "ADMIN";
    const permissions = SYSTEM_ROLES[primaryRole]?.permissions || [];

    const companyData = profile?.companies as unknown as {
      legal_name: string;
    } | null;

    return {
      id: user.id,
      email: user.email || "",
      name: profile?.name || user.email?.split("@")[0] || "Utilizador",
      role: primaryRole,
      permissions,
      companyId: profile?.company_id || undefined,
      companyName: companyData?.legal_name || undefined,
    };
  } catch {
    return null;
  }
}
