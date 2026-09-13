/**
 * RPG-OS — Tenant Isolation (server-side).
 *
 * REGRA FUNDAMENTAL: o cliente NUNCA é a autoridade sobre organizationId,
 * companyId, tenantId, permissões ou ownership. Todos estes valores são
 * resolvidos a partir da sessão autenticada (cookie de sessão + base de
 * dados), nunca de parâmetros/formulários/headers enviados pelo cliente.
 *
 * Pipeline de autorização:
 *   1. resolver identidade        → getSessionContext()
 *   2. resolver membership        → sessão (apenas memberships ACTIVE)
 *   3. resolver tenant autorizado → requireOrganizationAccess/requireCompanyAccess
 *   4. só depois consultar/escrever dados (sempre com filtro de tenant)
 */
import { getSessionContext } from "@/lib/session";
import type { SessionContext } from "@rpg/core";

export type TenantAccessResult =
  | { ok: true; ctx: SessionContext; tenantId: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Exige utilizador autenticado com organização ativa.
 * O tenantId vem SEMPRE da sessão (membership ACTIVE), nunca do cliente.
 */
export async function requireOrganizationAccess(
  permission?: string,
): Promise<TenantAccessResult> {
  const ctx = await getSessionContext();

  if (!ctx) {
    return { ok: false, status: 401, error: "Sessão não iniciada." };
  }
  if (!ctx.organization || !ctx.membership) {
    return {
      ok: false,
      status: 403,
      error: "Sem organização ativa associada à conta.",
    };
  }
  if (
    permission &&
    !ctx.permissions.includes(permission) &&
    !ctx.permissions.includes("*")
  ) {
    return { ok: false, status: 403, error: "Sem permissão para esta ação." };
  }

  return { ok: true, ctx, tenantId: ctx.organization.id };
}

/**
 * Variante para dados ligados a "company_id" (schema legado).
 * company_id é resolvido a partir da organização ativa da sessão.
 */
export async function requireCompanyAccess(
  permission?: string,
): Promise<TenantAccessResult> {
  return requireOrganizationAccess(permission);
}

/**
 * Resolve o tenant autorizado para consultas.
 * Devolve null se não houver sessão/organização — o chamador deve falhar.
 * NUNCA aceitar um tenantId vindo do cliente.
 */
export async function resolveTenantContext(): Promise<{
  userId: string;
  tenantId: string | null;
  permissions: string[];
} | null> {
  const ctx = await getSessionContext();
  if (!ctx) return null;

  return {
    userId: ctx.user.id,
    tenantId: ctx.organization?.id ?? null,
    permissions: ctx.permissions,
  };
}
