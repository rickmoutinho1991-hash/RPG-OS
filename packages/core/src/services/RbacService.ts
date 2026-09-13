/**
 * RPG-OS — Serviço de RBAC: resolve permissões efetivas de um utilizador
 * num contexto (organização + cargo + overrides + temporais).
 */
import { hasPermission } from "../constants/permissions";
import { getBuiltinRole } from "../constants/orgRoles";
import type { CustomRole, OrgMembership } from "../types/organization";

export interface EffectivePermissionsResult {
  permissions: string[];
  isOwner: boolean;
}

export function resolveEffectivePermissions(
  membership: OrgMembership | null | undefined,
  customRoles: CustomRole[] = [],
): EffectivePermissionsResult {
  if (!membership || membership.status === "REMOVED") {
    return { permissions: [], isOwner: false };
  }

  // Permissões temporárias expiradas não contam
  const now = new Date();
  if (membership.validFrom && new Date(membership.validFrom) > now) {
    return { permissions: [], isOwner: false };
  }
  if (membership.validUntil && new Date(membership.validUntil) < now) {
    return { permissions: [], isOwner: false };
  }
  if (membership.status === "SUSPENDED") {
    return { permissions: [], isOwner: false };
  }

  let base: string[] = [];
  let isOwner = false;

  const custom = membership.customRoleId
    ? customRoles.find((r) => r.id === membership.customRoleId)
    : undefined;

  if (custom) {
    base = custom.permissions;
  } else {
    const builtin = getBuiltinRole(membership.roleKey);
    base = builtin?.permissions ?? [];
    isOwner =
      membership.roleKey === "OWNER" || membership.roleKey === "FOUNDER";
  }

  // Overrides concedidos diretamente ao membro (delegação)
  const merged = Array.from(
    new Set([...base, ...(membership.permissionsOverride ?? [])]),
  );

  return { permissions: merged, isOwner: isOwner || merged.includes("*") };
}

export function can(permissions: string[], required: string): boolean {
  return hasPermission(permissions, required);
}
