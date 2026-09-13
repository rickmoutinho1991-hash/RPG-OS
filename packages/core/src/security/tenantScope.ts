/**
 * RPG-OS — Tenant scope helpers (lógica pura, sem I/O).
 *
 * REGRA: cada entidade usa o tenant da sua tabela. `company_id` (eixo
 * Finance/Fiscal/Documents) NUNCA recebe UUID de organização e
 * `organization_id` (eixo RBAC) NUNCA recebe UUID de empresa — mesmo que os
 * valores coincidissem, as colunas têm de estar certas (segurança por
 * semântica, não por diferença de UUIDs).
 *
 * Sem companyId não há scope de empresa possível → o chamador deve usar
 * apenas o filtro de utilizador (fail-closed, nunca query global).
 */

export interface CompanyUserScopeInput {
  /** company_id do perfil do utilizador (eixo company). Null = sem empresa. */
  companyId?: string | null;
  /** user_id da sessão (eixo user). */
  userId: string;
  /** Coluna de empresa da tabela (ex.: "company_id"). */
  companyColumn?: string;
  /** Coluna de utilizador da tabela (ex.: "user_id", "owner_user_id"). */
  userColumn?: string;
}

/**
 * Constrói o argumento para `.or()` do PostgREST com o tenant correto.
 * Devolve null quando não há companyId — nesse caso o chamador aplica
 * apenas `.eq(userColumn, userId)`. Nunca devolve filtro global.
 */
export function companyUserOrFilter(input: CompanyUserScopeInput): string | null {
  const companyColumn = input.companyColumn ?? "company_id";
  const userColumn = input.userColumn ?? "user_id";
  if (!input.companyId) return null;
  return `${companyColumn}.eq.${input.companyId},${userColumn}.eq.${input.userId}`;
}
