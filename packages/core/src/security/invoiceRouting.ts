/**
 * RPG-OS — Decisão pura de routing assignment de invoice (sem I/O).
 *
 * Espelha as validações da server action: actor com fiscal.admin (verificado
 * fora), company da invoice == company do perfil do actor, destino ∈
 * memberships ACTIVE, vínculo company_organizations ACTIVE, e estado do
 * assignment existente. Segurança por semântica, nunca por valor de UUID.
 */

export type InvoiceRoutingExisting = "ASSIGNED" | "REVOKED" | null;

export interface InvoiceRoutingRequest {
  /** company_id do perfil do actor (null = sem empresa). */
  actorCompanyId: string | null;
  /** company_id real da invoice (derivado server-side). Null = sem company. */
  invoiceCompanyId: string | null;
  /** organization_ids das memberships ACTIVE do actor. */
  memberOrgIds: string[];
  /** organization_id pedida (intenção do client). */
  requestedOrgId: string;
  /** Existe vínculo ACTIVE (company da invoice, org pedida)? */
  linkActive: boolean;
  /** Estado do assignment existente para a invoice, se houver. */
  existingStatus: InvoiceRoutingExisting;
  /** Ação pedida. */
  action: "assign" | "revoke";
}

export type InvoiceRoutingDecision =
  | { ok: true; mode: "create" | "reassign" | "noop-assigned" | "revoke" | "noop-revoked" }
  | { ok: false; error: "FORBIDDEN" | "NO_ROUTE" };

/**
 * Decide assignment sem I/O.
 * - Sem company na invoice → NO_ROUTE (fail closed).
 * - Company do actor ≠ company da invoice → FORBIDDEN.
 * - Org fora das memberships → FORBIDDEN.
 * - Sem vínculo ACTIVE → NO_ROUTE (associação ≠ prova; destino exige vínculo).
 * - Mesmo assignment → no-op idempotente; REVOKED → reassign/reactivate path
 *   tratado pelo chamador (nunca duplicar: UNIQUE parcial no banco).
 */
export function decideInvoiceRouting(
  req: InvoiceRoutingRequest,
): InvoiceRoutingDecision {
  if (!req.invoiceCompanyId) return { ok: false, error: "NO_ROUTE" };
  if (!req.actorCompanyId || req.actorCompanyId !== req.invoiceCompanyId) {
    return { ok: false, error: "FORBIDDEN" };
  }
  if (!req.memberOrgIds.includes(req.requestedOrgId)) {
    return { ok: false, error: "FORBIDDEN" };
  }
  if (req.action === "revoke") {
    if (req.existingStatus !== "ASSIGNED") return { ok: true, mode: "noop-revoked" };
    return { ok: true, mode: "revoke" };
  }
  if (!req.linkActive) return { ok: false, error: "NO_ROUTE" };
  if (req.existingStatus === "ASSIGNED") return { ok: true, mode: "noop-assigned" };
  if (req.existingStatus === "REVOKED") return { ok: true, mode: "reassign" };
  return { ok: true, mode: "create" };
}
