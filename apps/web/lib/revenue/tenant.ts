/**
 * RPG-OS — Revenue Center: camada segura de acesso (FASE 7).
 *
 * O tenant é SEMPRE resolvido no servidor a partir da sessão
 * (`getSessionContext` → organização ativa). NUNCA confiar em
 * organization_id vindo do cliente. As consultas usam o client admin
 * (server-side) e o scope por organização é aplicado explicitamente em todas
 * as tabelas do Revenue Engine. RLS + RBAC mantidos.
 */
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RevenueTenantContext {
  userId: string;
  organizationId: string;
  organizationName: string;
  permissions: string[];
}

/** Permissões do Revenue Center. */
export const REVENUE_VIEW_PERMISSION = "revenue.view";
export const REVENUE_MANAGE_PERMISSION = "revenue.manage";

export async function resolveRevenueTenant(): Promise<RevenueTenantContext | null> {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.organization) return null;
  return {
    userId: ctx.user.id,
    organizationId: ctx.organization.id,
    organizationName: ctx.organization.name,
    permissions: ctx.permissions,
  };
}

export function canViewRevenue(ctx: RevenueTenantContext | null): boolean {
  return ctx ? hasPermission(ctx.permissions, REVENUE_VIEW_PERMISSION) : false;
}

export function canManageRevenue(ctx: RevenueTenantContext | null): boolean {
  return ctx ? hasPermission(ctx.permissions, REVENUE_MANAGE_PERMISSION) : false;
}
