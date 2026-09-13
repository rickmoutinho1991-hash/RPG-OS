/**
 * RPG-OS — Evidence Guard
 *
 * SHA-256 integrity verification + access control for evidence.
 * deny-closed: no access path exists unless explicitly granted.
 */

import { createHash } from "node:crypto";
import type { Evidence, EvidenceRelation } from "../../types/evidence";

export function sha256HexSync(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

export interface HashVerificationResult {
  valid: boolean;
  expectedHash: string;
  actualHash: string;
}

export function verifyHash(
  expectedHash: string,
  content: Uint8Array | string,
): HashVerificationResult {
  const actualHash = sha256HexSync(content);
  return { valid: actualHash === expectedHash, expectedHash, actualHash };
}

export function hashAlgorithmsMatch(expected: string, actual: string): boolean {
  return expected.toLowerCase() === actual.toLowerCase();
}

export interface EvidenceAccessContext {
  actorId: string;
  organizationIds?: string[];
  isOrganizationMember?: (organizationId: string) => boolean;
  isRelatedActor?: (
    entityType: EvidenceRelation["entityType"],
    entityId: string,
  ) => boolean;
  isPlatformAdmin?: boolean;
}

export interface EvidenceAccessDecision {
  allowed: boolean;
  reason: string;
}

const UNAVAILABLE_STATUSES: Evidence["status"][] = ["DELETED", "QUARANTINED"];

export function canAccessEvidence(
  evidence: Pick<
    Evidence,
| "status"
    | "visibility"
    | "ownerId"
    | "authorizedViewers"
    | "relatedEntities"
    | "expiresAt"
  >,
  context: EvidenceAccessContext,
): EvidenceAccessDecision {
  if (UNAVAILABLE_STATUSES.includes(evidence.status)) {
    return { allowed: false, reason: `evidence status ${evidence.status}` };
  }

  if (evidence.expiresAt) {
    const expiresAt = new Date(evidence.expiresAt).getTime();
    if (!Number.isNaN(expiresAt) && expiresAt < Date.now()) {
      return { allowed: false, reason: "evidence expired" };
    }
  }

  if (context.isPlatformAdmin) {
    return { allowed: true, reason: "platform admin override" };
  }

  if (evidence.ownerId === context.actorId) {
    return { allowed: true, reason: "owner" };
  }

  if (evidence.visibility === "PUBLIC") {
    return { allowed: true, reason: "public visibility" };
  }

  if (evidence.visibility === "ORGANIZATION") {
    const member = context.isOrganizationMember?.(evidence.ownerId) ?? false;
    if (member) {
      return { allowed: true, reason: "organization member" };
    }
    const memberByOrg = (context.organizationIds ?? []).includes(evidence.ownerId);
    if (memberByOrg) {
      return { allowed: true, reason: "organization membership" };
    }
    return { allowed: false, reason: "not an organization member" };
  }

  if (evidence.visibility === "RESTRICTED") {
    if (evidence.authorizedViewers.includes(context.actorId)) {
      return { allowed: true, reason: "authorized viewer" };
    }
    return { allowed: false, reason: "not an authorized viewer" };
  }

  if (evidence.visibility === "PARTIES") {
    if (evidence.authorizedViewers.includes(context.actorId)) {
      return { allowed: true, reason: "authorized party" };
    }
    const relation = context.isRelatedActor;
    if (
      relation &&
      evidence.relatedEntities.some((r) => relation(r.entityType, r.entityId))
    ) {
      return { allowed: true, reason: "related party" };
    }
    return { allowed: false, reason: "not a party" };
  }

  return { allowed: false, reason: "private visibility" };
}

export function requireEvidenceAccess(
  evidence: Pick<
    Evidence,
| "status"
    | "visibility"
    | "ownerId"
    | "authorizedViewers"
    | "relatedEntities"
    | "expiresAt"
  >,
  context: EvidenceAccessContext,
): void {
  const decision = canAccessEvidence(evidence, context);
  if (!decision.allowed) {
    throw new Error(`Evidence access denied: ${decision.reason}`);
  }
}
