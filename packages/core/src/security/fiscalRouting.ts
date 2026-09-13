/**
 * RPG-OS — Fiscal inbox routing decision (lógica pura, sem I/O).
 *
 * Decisão arquitetural codificada: a associação Company <-> Organization
 * (administrativa) NÃO é autorização de routing fiscal. Sem contexto
 * explícito de routing por documento, o único resultado seguro é NÃO
 * routear — independentemente de haver 0, 1 ou N vínculos ACTIVE.
 *
 * Esta função existe para que a decisão seja testável e para que o futuro
 * producer a reutilize como guarda (nunca como bypass).
 */

export interface FiscalRoutingLink {
  organization_id: string;
  status: "ACTIVE" | "REVOKED";
}

export type FiscalRoutingBlockReason = "NO_LINKS" | "NEEDS_EXPLICIT_RULE";

export interface FiscalRoutingDecision {
  /** Hoje sempre vazio: sem regra explícita, nada é routado. */
  targets: string[];
  /** Motivo do bloqueio (null = routável, reservado a futuro). */
  blockedReason: FiscalRoutingBlockReason | null;
}

/**
 * Resolve targets de routing para uma invoice de uma company.
 * Considera apenas vínculos ACTIVE. Devolve sempre bloqueio:
 * - sem vínculos → NO_LINKS;
 * - com vínculos → NEEDS_EXPLICIT_RULE (a associação não prova que cada
 *   invoice pertence a cada organização; fase 15 do audit).
 */
export function resolveFiscalRoutingTargets(
  activeLinks: FiscalRoutingLink[],
): FiscalRoutingDecision {
  const orgs = [...new Set(activeLinks.filter((l) => l.status === "ACTIVE").map((l) => l.organization_id))];
  if (orgs.length === 0) return { targets: [], blockedReason: "NO_LINKS" };
  return { targets: [], blockedReason: "NEEDS_EXPLICIT_RULE" };
}
