/**
 * RPG-OS — Contexto de sessão com RBAC multi-tenant.
 * Resolve: utilizador, organização ativa, membership, permissões efetivas.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveEffectivePermissions,
  hasPermission,
  type SessionContext,
  type OrgMembership,
  type CustomRole,
} from "@rpg/core";
// hasPermission é reexportado de @rpg/core (constants/permissions)

export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const ctxUserId: string = user.id;

  const admin = createAdminClient();

  // Perfil base
  const { data: profile } = await admin
    .from("profiles")
    .select("name, avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();

// Membroships do utilizador (todas as organizações)
  const { data: memberships } = await admin
    .from("org_memberships")
    .select(
      `id, organization_id, role_key, custom_role_id, department_id, status,
        is_primary, title, permissions_override, valid_from, valid_until,
        organizations!inner(id, name, slug, tax_number)`
    )
    .eq("user_id", user.id)
    .eq("status", "ACTIVE");

  const list = (memberships ?? []) as unknown as Array<Record<string, unknown>>;

  const getStr = (m: Record<string, unknown>, k: string) => (m[k] as string | null) ?? undefined;

  // Organização ativa: cookie "active_org" → primária → primeira
  const cookieStore = await import("next/headers").then((m) => m.cookies());
  const activeOrgId = (await cookieStore).get("rpgos_active_org")?.value;
  const current =
    list.find((m) => m.organization_id === activeOrgId) ??
    list.find((m) => m.is_primary === true) ??
    list[0] ??
    null;

  let permissions: string[] = [];
  if (current) {
    let customRoles: CustomRole[] = [];
    if (current.custom_role_id) {
      const { data: cr } = await admin
        .from("custom_roles")
        .select("id, organization_id, key, label, permissions, scope")
        .eq("id", current.custom_role_id)
        .maybeSingle();
      if (cr) {
        customRoles = [
          {
            id: cr.id,
            organizationId: cr.organization_id,
            key: cr.key,
            label: cr.label,
            permissions: cr.permissions ?? [],
            scope: cr.scope as CustomRole["scope"],
          },
        ];
      }
    }
    permissions = resolveEffectivePermissions(
      {
        id: String(current.id),
        organizationId: getStr(current, "organization_id") ?? "",
        userId: ctxUserId,
        roleKey: getStr(current, "role_key") ?? "EMPLOYEE",
        customRoleId: getStr(current, "custom_role_id"),
        departmentId: getStr(current, "department_id"),
        status: (getStr(current, "status") as OrgMembership["status"]) ?? "ACTIVE",
        isPrimary: current.is_primary === true,
        title: getStr(current, "title"),
        permissionsOverride: (current.permissions_override as string[] | null) ?? [],
        validFrom: getStr(current, "valid_from"),
        validUntil: getStr(current, "valid_until"),
      },
      customRoles,
    ).permissions;
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? "",
      name: profile?.name || user.email?.split("@")[0] || "Utilizador",
      avatarUrl: profile?.avatar_url,
    },
    organization: current
      ? {
          id: (current.organizations as { id: string }).id,
          name: (current.organizations as { name: string }).name,
          slug: (current.organizations as { slug: string }).slug,
          taxNumber: (current.organizations as { tax_number?: string }).tax_number,
        }
      : null,
    membership: current
      ? {
          id: String(current.id),
          organizationId: getStr(current, "organization_id") ?? "",
          userId: ctxUserId,
          roleKey: getStr(current, "role_key") ?? "EMPLOYEE",
          status: (getStr(current, "status") as OrgMembership["status"]) ?? "ACTIVE",
        }
      : null,
    permissions,
    availableOrganizations: list.map((m) => ({
      id: (m.organizations as { id: string }).id,
      name: (m.organizations as { name: string }).name,
      slug: (m.organizations as { slug: string }).slug,
      taxNumber: (m.organizations as { tax_number?: string }).tax_number,
      roleKey: (getStr(m, "role_key") ?? "EMPLOYEE") as string,
    })),
  };
}

/** Guard de permissão para server components/actions. */
export function requirePermission(ctx: SessionContext | null, permission: string): boolean {
  return hasPermission(ctx?.permissions, permission);
}
