import { describe, it, expect } from "vitest";
import {
  sha256HexSync,
  verifyHash,
  hashAlgorithmsMatch,
  canAccessEvidence,
  requireEvidenceAccess,
} from "../../evidence/EvidenceGuard";
import type { Evidence } from "../../../types/evidence";

function makeEvidence(
  overrides: Partial<Evidence> = {},
): Evidence {
  return {
    id: "ev-1",
    type: "DOCUMENT",
    category: "CONTRACT",
    title: "Contrato",
ownerId: "owner-1",
    ownerType: "HUMAN",
    relatedEntities: [],
    file: {
      originalName: "contract.pdf",
      storedName: "c.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      storageBackend: "S3",
      storagePath: "bucket/ev-1",
    },
    hash: "abc",
    hashAlgorithm: "SHA-256",
    visibility: "PRIVATE",
    authorizedViewers: [],
    status: "READY",
    tags: [],
    metadata: { custom: {} },
    retention: {
      policyId: "p1",
      retentionDays: 365,
      autoDelete: false,
      legalHold: false,
    },
    auditTrail: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("sha256HexSync", () => {
  it("produces a deterministic hex digest", () => {
    const a = sha256HexSync("rpg-os");
    const b = sha256HexSync("rpg-os");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when content changes", () => {
    expect(sha256HexSync("rpg-os")).not.toBe(sha256HexSync("rpg-oss"));
  });

  it("handles binary content", () => {
    const bytes = new Uint8Array([1, 2, 3, 255]);
    expect(sha256HexSync(bytes)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyHash", () => {
  it("detects a matching hash", () => {
    const expected = sha256HexSync("documento");
    const result = verifyHash(expected, "documento");
    expect(result.valid).toBe(true);
    expect(result.actualHash).toBe(expected);
  });

  it("detects a tampered document", () => {
    const result = verifyHash(sha256HexSync("original"), "tampered");
    expect(result.valid).toBe(false);
    expect(result.expectedHash).not.toBe(result.actualHash);
  });
});

describe("hashAlgorithmsMatch", () => {
  it("matches case-insensitively", () => {
    expect(hashAlgorithmsMatch("SHA-256", "sha-256")).toBe(true);
    expect(hashAlgorithmsMatch("SHA-256", "BLAKE3")).toBe(false);
  });
});

describe("canAccessEvidence", () => {
  it("denies access to deleted evidence for everyone", () => {
    const evidence = makeEvidence({ ownerId: "owner-1", status: "DELETED" });
    expect(canAccessEvidence(evidence, { actorId: "owner-1" }).allowed).toBe(false);
  });

  it("denies access to quarantined evidence for everyone", () => {
    const evidence = makeEvidence({ status: "QUARANTINED" });
    expect(
      canAccessEvidence(evidence, { actorId: "owner-1", isPlatformAdmin: true })
        .allowed,
    ).toBe(false);
  });

  it("denies access to expired evidence", () => {
    const evidence = makeEvidence({ expiresAt: "2020-01-01T00:00:00.000Z" });
    expect(canAccessEvidence(evidence, { actorId: "owner-1" }).allowed).toBe(false);
  });

  it("allows the owner of private evidence", () => {
    const evidence = makeEvidence({ visibility: "PRIVATE" });
    const decision = canAccessEvidence(evidence, { actorId: "owner-1" });
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("owner");
  });

  it("denies a stranger for private evidence", () => {
    const evidence = makeEvidence({ visibility: "PRIVATE" });
    expect(canAccessEvidence(evidence, { actorId: "intruder" }).allowed).toBe(false);
  });

  it("grants access via platform admin override", () => {
    const evidence = makeEvidence({ visibility: "PRIVATE" });
    expect(
      canAccessEvidence(evidence, { actorId: "intruder", isPlatformAdmin: true })
        .allowed,
    ).toBe(true);
  });

  it("allows anyone for public evidence", () => {
    const evidence = makeEvidence({ visibility: "PUBLIC" });
    expect(canAccessEvidence(evidence, { actorId: "anonymous" }).allowed).toBe(true);
  });

  it("denies private evidence to an anonymous actor", () => {
    const evidence = makeEvidence({ visibility: "PRIVATE" });
    expect(canAccessEvidence(evidence, { actorId: "anonymous" }).allowed).toBe(false);
  });

  it("allows organization members for ORGANIZATION visibility", () => {
    const evidence = makeEvidence({
      visibility: "ORGANIZATION",
      ownerId: "org-1",
      ownerType: "ORGANIZATION",
    });
    const decision = canAccessEvidence(evidence, {
      actorId: "member-1",
      isOrganizationMember: (organizationId) => organizationId === "org-1",
    });
    expect(decision.allowed).toBe(true);
  });

  it("denies non-members for ORGANIZATION visibility", () => {
    const evidence = makeEvidence({
      visibility: "ORGANIZATION",
      ownerId: "org-1",
      ownerType: "ORGANIZATION",
    });
    expect(
      canAccessEvidence(evidence, {
        actorId: "outsider",
        isOrganizationMember: () => false,
      }).allowed,
    ).toBe(false);
  });

  it("allows restricted viewers for RESTRICTED visibility", () => {
    const evidence = makeEvidence({
      visibility: "RESTRICTED",
      authorizedViewers: ["viewer-1"],
    });
    expect(canAccessEvidence(evidence, { actorId: "viewer-1" }).allowed).toBe(true);
    expect(canAccessEvidence(evidence, { actorId: "nobody" }).allowed).toBe(false);
  });

  it("allows parties for PARTIES visibility via resolver", () => {
    const evidence = makeEvidence({
      visibility: "PARTIES",
      relatedEntities: [
        { entityType: "ORDER", entityId: "order-1", relation: "SUPPORTS" },
      ],
    });
    const decision = canAccessEvidence(evidence, {
      actorId: "provider-1",
      isRelatedActor: (entityType, entityId) =>
        entityType === "ORDER" && entityId === "order-1",
    });
    expect(decision.allowed).toBe(true);
  });

  it("denies non-parties for PARTIES visibility", () => {
    const evidence = makeEvidence({
      visibility: "PARTIES",
      relatedEntities: [
        { entityType: "ORDER", entityId: "order-1", relation: "SUPPORTS" },
      ],
    });
    expect(
      canAccessEvidence(evidence, { actorId: "stranger" }).allowed,
    ).toBe(false);
  });

  it("allows part of the order ownership chain", () => {
    const evidence = makeEvidence({ visibility: "PARTIES" });
    expect(canAccessEvidence(evidence, { actorId: "owner-1" }).allowed).toBe(true);
  });
});

describe("requireEvidenceAccess", () => {
  it("throws when access is denied", () => {
    const evidence = makeEvidence({ visibility: "PRIVATE" });
    expect(() => requireEvidenceAccess(evidence, { actorId: "intruder" })).toThrow(
      "Evidence access denied",
    );
  });

  it("does not throw for the owner", () => {
    const evidence = makeEvidence({ visibility: "PRIVATE" });
    expect(() => requireEvidenceAccess(evidence, { actorId: "owner-1" })).not.toThrow();
  });
});