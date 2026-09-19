/**
 * RPG-OS — Resolução de roles de sistema (segurança, M-G).
 *
 * Corrige a escalada de privilégios em que um utilizador SEM role registada
 * resolvia para "ADMIN" (permissões `["*"]`) por omissão. O default passa a
 * ser o role menos privilegiado (`CLIENT`); valores inválidos nunca concedem
 * poderes de sistema.
 */

import { SYSTEM_ROLES, SystemRole } from "../constants/roles";

/** Role seguro/least-privilege para utilizadores sem role registada. */
export const DEFAULT_SYSTEM_ROLE: SystemRole = "CLIENT";

/** Pode ou não é conhecido → default seguro; nunca clusters de sistema. */
export function resolveSystemRole(raw: string | null | undefined): SystemRole {
  if (raw && raw in SYSTEM_ROLES) return raw as SystemRole;
  return DEFAULT_SYSTEM_ROLE;
}

/** Permissões efetivas (nunca `*` para valores não validados). */
export function resolveSystemPermissions(
  role: string | null | undefined,
): string[] {
  const resolved = role && role in SYSTEM_ROLES ? (role as SystemRole) : null;
  if (!resolved) return [];
  const definition = SYSTEM_ROLES[resolved];
  return definition?.permissions ?? [];
}

/** Custo de inspeção: devolve o role apenas se validado. */
export function isKnownSystemRole(
  role: string | null | undefined,
): role is SystemRole {
  return typeof role === "string" && role in SYSTEM_ROLES;
}