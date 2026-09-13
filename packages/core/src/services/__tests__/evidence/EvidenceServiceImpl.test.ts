import { describe, it, expect } from "vitest";
import { EvidenceServiceImpl } from "../../evidence/EvidenceServiceImpl";
import { InMemoryEvidenceStorage } from "../../evidence/EvidenceStorage";
import { InMemoryEvidenceRepository } from "../../evidence/EvidenceRepository";
import { sha256HexSync } from "../../evidence/EvidenceGuard";

function makeService(overrides: Partial<ConstructorParameters<typeof EvidenceServiceImpl>[0]> = {}) {
  const storage = new InMemoryEvidenceStorage();
  return {
    service: new EvidenceServiceImpl({
      storage,
      repository: new InMemoryEvidenceRepository(),
      now: () => "2026-02-01T00:00:00.000Z",
      createId: () => `ev-${Math.random().toString(36).slice(2)}`,
      ...overrides,
    }),
    storage,
  };
}

const CONTENT = new TextEncoder().encode("rpg-os evidence content");

function baseInput() {
  return {
    type: "PHOTO" as const,
    category: "MILESTONE" as const,
    title: "Fotografia de progresso",
    description: "Fase 1 concluída",
    actorId: "client-1",
    ownerId: "client-1",
    ownerType: "HUMAN" as const,
    file: {
      originalName: "projeto.jpg",
      mimeType: "image/jpeg",
      sizeBytes: CONTENT.byteLength,
      buffer: CONTENT,
    },
    relatedEntities: [
      { entityType: "MILESTONE" as const, entityId: "ms-1", relation: "PROVES" as const },
    ],
    visibility: "PRIVATE" as const,
    tags: ["obras"],
  };
}

describe("EvidenceServiceImpl upload", () => {
  it("uploads evidence and computes a deterministic SHA-256 over content", async () => {
    const { service } = makeService();
    const result = await service.upload(baseInput());

    expect(result.evidence.id).toBeTruthy();
    expect(result.evidence.hash).toBe(sha256HexSync(CONTENT));
    expect(result.evidence.hashAlgorithm).toBe("SHA-256");
    expect(result.evidence.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.evidence.status).toBe("READY");
    expect(result.evidence.ownerId).toBe("client-1");
    expect(result.evidence.createdAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("stores metadata, related entities, visibility and storage reference", async () => {
    const { service } = makeService();
    const result = await service.upload(baseInput());

    const ev = result.evidence;
    expect(ev.file.storageBackend).toBeTruthy();
    expect(ev.file.storagePath).toContain("client-1");
    expect(ev.file.storageBucket).toBe("evidence");
    expect(ev.file.mimeType).toBe("image/jpeg");
    expect(ev.file.sizeBytes).toBe(CONTENT.byteLength);
    expect(ev.relatedEntities).toHaveLength(1);
    expect(ev.relatedEntities[0].entityId).toBe("ms-1");
    expect(ev.visibility).toBe("PRIVATE");
    expect(ev.auditTrail[0].action).toBe("UPLOADED");
    expect(ev.auditTrail[0].details.hash).toBe(ev.hash);
  });

  it("does not store file content in the record", async () => {
    const { service } = makeService();
    const result = await service.upload(baseInput());
    expect((result.evidence as any).file.buffer).toBeUndefined();
    expect((result.evidence as any).file.content).toBeUndefined();
    expect(result.storageRef.sizeBytes).toBe(CONTENT.byteLength);
  });

  it("rejects missing title", async () => {
    const { service } = makeService();
    await expect(service.upload({ ...baseInput(), title: "" })).rejects.toThrow(
      "Evidence title is required",
    );
  });

  it("rejects empty content", async () => {
    const { service } = makeService();
    const input = baseInput();
    input.file = { ...input.file, buffer: new Uint8Array(0) };
    await expect(service.upload(input)).rejects.toThrow("Evidence file content is required");
  });

  it("rejects oversized files", async () => {
    const { service } = makeService({ maxSizeBytes: 10 });
    await expect(service.upload(baseInput())).rejects.toThrow("File size exceeds limit");
  });

  it("rejects disallowed mime types", async () => {
    const { service } = makeService();
    const input = baseInput();
    input.file = { ...input.file, mimeType: "application/octet-stream" };
    await expect(service.upload(input)).rejects.toThrow("is not allowed");
  });

  it("rejects owner spoofing (actorId must match ownerId)", async () => {
    const { service } = makeService();
    const input = {
      ...baseInput(),
      ownerId: "client-2", // attacker tries to register evidence as client-2
    };
    await expect(service.upload(input)).rejects.toThrow(
      "on behalf of another owner",
    );
  });

  it("records the authenticated uploader in the audit trail", async () => {
    const { service } = makeService();
    const result = await service.upload(baseInput());
    expect(result.evidence.auditTrail[0].actorId).toBe("client-1");
  });

  it("two uploads of identical content produce identical hash but distinct ids", async () => {
    const { service } = makeService();
    const a = await service.upload(baseInput());
    const b = await service.upload(baseInput());
    expect(a.evidence.hash).toBe(b.evidence.hash);
    expect(a.evidence.id).not.toBe(b.evidence.id);
  });
});

describe("EvidenceServiceImpl verifyHash", () => {
  it("verifies a matching hash over stored content", async () => {
    const { service } = makeService();
    const { evidence } = await service.upload(baseInput());
    const result = await service.verifyHash(evidence.id);
    expect(result.valid).toBe(true);
    expect(result.expectedHash).toBe(sha256HexSync(CONTENT));
    expect(result.actualHash).toBe(result.expectedHash);
  });

  it("detects tampered content", async () => {
    const { service, storage } = makeService();
    const { evidence } = await service.upload(baseInput());
    const tampered = new TextEncoder().encode("tampered content");
    await storage.store({
      path: evidence.file.storagePath,
      bucket: evidence.file.storageBucket!,
      content: tampered,
      mimeType: evidence.file.mimeType,
      originalName: evidence.file.originalName,
    });
    const result = await service.verifyHash(evidence.id);
    expect(result.valid).toBe(false);
    expect(result.actualHash).not.toBe(result.expectedHash);
  });

  it("reports CONTENT_NOT_FOUND when stored content is missing", async () => {
    const { service, storage } = makeService();
    const { evidence } = await service.upload(baseInput());
    await storage.delete(evidence.file.storagePath);
    const result = await service.verifyHash(evidence.id);
    expect(result.valid).toBe(false);
    expect(result.actualHash).toBe("CONTENT_NOT_FOUND");
  });
});

describe("EvidenceServiceImpl access control", () => {
  it("owner can read private evidence", async () => {
    const { service } = makeService();
    const { evidence } = await service.upload(baseInput());
    const got = await service.getById(evidence.id, { actorId: "client-1" });
    expect(got).not.toBeNull();
  });

  it("non-owner cannot read private evidence (deny-closed)", async () => {
    const { service } = makeService();
    const { evidence } = await service.upload(baseInput());
    await expect(service.getById(evidence.id, { actorId: "other-client" })).rejects.toThrow(
      "Evidence access denied",
    );
  });

  it("public evidence is readable by anyone", async () => {
    const { service } = makeService();
    const { evidence } = await service.upload({ ...baseInput(), visibility: "PUBLIC" });
    const got = await service.getById(evidence.id, { actorId: "stranger" });
    expect(got).not.toBeNull();
  });

  it("platform admin can read any evidence as override", async () => {
    const { service } = makeService();
    const { evidence } = await service.upload(baseInput());
    const got = await service.getById(evidence.id, {
      actorId: "stranger",
      isPlatformAdmin: true,
    });
    expect(got).not.toBeNull();
  });

  it("search filters out inaccessible evidence", async () => {
    const { service } = makeService();
    await service.upload(baseInput());
    await service.upload({ ...baseInput(), title: "Public", visibility: "PUBLIC" });
    const result = await service.search({}, { actorId: "other-client" });
    expect(result.items.length).toBe(1);
    expect(result.items[0].title).toBe("Public");
  });
});

describe("EvidenceServiceImpl metadata & visibility", () => {
  it("owner can update metadata", async () => {
    const { service } = makeService();
    const { evidence } = await service.upload(baseInput());
    const updated = await service.updateMetadata(evidence.id, "client-1", {
      custom: { reviewedBy: "boss" },
    });
    expect(updated.metadata.custom.reviewedBy).toBe("boss");
  });

  it("non-owner cannot update metadata", async () => {
    const { service } = makeService();
    const { evidence } = await service.upload(baseInput());
    await expect(
      service.updateMetadata(evidence.id, "other", { custom: {} }),
    ).rejects.toThrow("Only the evidence owner");
  });

  it("owner can change visibility", async () => {
    const { service } = makeService();
    const { evidence } = await service.upload(baseInput());
    const updated = await service.changeVisibility(evidence.id, "client-1", "PARTIES", [
      "provider-1",
    ]);
    expect(updated.visibility).toBe("PARTIES");
    expect(updated.authorizedViewers).toContain("provider-1");
  });

  it("non-owner cannot change visibility", async () => {
    const { service } = makeService();
    const { evidence } = await service.upload(baseInput());
    await expect(
      service.changeVisibility(evidence.id, "other", "PUBLIC"),
    ).rejects.toThrow("Only the evidence owner");
  });
});

describe("EvidenceServiceImpl delete", () => {
  it("soft-delete keeps the record but marks DELETED", async () => {
    const { service } = makeService();
    const { evidence } = await service.upload(baseInput());
    await service.delete(evidence.id, "client-1");
    await expect(service.getById(evidence.id, { actorId: "client-1" })).rejects.toThrow(
      "Evidence access denied",
    );
  });

  it("hard-delete removes content from storage", async () => {
    const { service, storage } = makeService();
    const { evidence } = await service.upload(baseInput());
    expect(await storage.exists(evidence.file.storagePath)).toBe(true);
    await service.delete(evidence.id, "client-1", true);
    expect(await storage.exists(evidence.file.storagePath)).toBe(false);
    expect(await service.getById(evidence.id, { actorId: "client-1" })).toBeNull();
  });

  it("non-owner cannot delete", async () => {
    const { service } = makeService();
    const { evidence } = await service.upload(baseInput());
    await expect(service.delete(evidence.id, "other")).rejects.toThrow(
      "Only the evidence owner",
    );
  });
});