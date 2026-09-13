/**
 * RPG-OS — Decisão pura de vínculo Company <-> Organization.
 *
 * Espelha exatamente as validações da server action (sem I/O): a organization
 * tem de ser das memberships ACTIVE do actor, a company tem de ser a do
 * perfil do actor, e linhas existentes determinam create/reactivar/no-op.
 * Segurança por semântica: mesmo UUID nos dois lados não confere nada sem
 * passar em ambas as verificações independentes.
 */

export type CompanyOrgLinkExisting = "ACTIVE" | "REVOKED" | null;

export interface CompanyOrgLinkRequest {
  /** company_id do perfil do actor (null = sem empresa). */
  actorCompanyId: string | null;
  /** company_id pedido (intenção do client). */
  requestedCompanyId: string;
  /** organization_ids das memberships ACTIVE do actor. */
  memberOrgIds: string[];
  /** organization_id pedido (intenção do client). */
  requestedOrgId: string;
  /** Estado da linha existente para o par, se houver. */
  existingStatus: CompanyOrgLinkExisting;
}

export type CompanyOrgLinkDecision =
  | { ok: true; mode: "create" | "reactivate" | "noop-active" }
  | { ok: false; error: "FORBIDDEN" };

/**
 * Decide vínculo sem I/O. FORBIDDEN quando: org fora das memberships, ou
 * company diferente da do perfil (inclui actor sem empresa).
 */
export function decideCompanyOrgLink(
  req: CompanyOrgLinkRequest,
): CompanyOrgLinkDecision {
  if (!req.memberOrgIds.includes(req.requestedOrgId)) {
    return { ok: false, error: "FORBIDDEN" };
  }
  if (!req.actorCompanyId || req.actorCompanyId !== req.requestedCompanyId) {
    return { ok: false, error: "FORBIDDEN" };
  }
  if (req.existingStatus === "ACTIVE") return { ok: true, mode: "noop-active" };
  if (req.existingStatus === "REVOKED") return { ok: true, mode: "reactivate" };
  return { ok: true, mode: "create" };
}
