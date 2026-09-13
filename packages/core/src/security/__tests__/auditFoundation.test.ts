import { describe, it, expect } from "vitest";
import {
  AuditService,
  InMemoryAuditLogRepository,
  sanitizeAuditMetadata,
  auditSha256Hex,
  AUDIT_ACTION,
} from "../auditFoundation";
import type { AuditActor, AuditLogEntry } from "../auditFoundation";

function makeActor(overrides: Partial<AuditActor> = {}): AuditActor {
  return {
    id: "user-1",
    type: "HUMAN",
    name: "Cliente",
    roles: ["client"],
    ...overrides,
  };
}

function forceFlush(service: AuditService): Promise<void> {
  return service.flush();
}

describe("AuditService", () => {
  it("logs an entry and persists on flush", async () => {
    const service = new AuditService(
      { computeHashChain: true },
      new InMemoryAuditLogRepository(),
    );
    const id = await service.log({
      actor: makeActor(),
      action: AUDIT_ACTION.QUOTE_CREATED,
      module: "marketplace",
      entityType: "quote",
      entityId: "quote-1",
      category: "CONTRACT",
      severity: "INFO",
      result: "SUCCESS",
      metadata: { amountCents: 15000, currency: "EUR" },
      tags: ["marketplace"],
    });
    expect(id).toBeTruthy();
    await forceFlush(service);

    const entries = service.getPersistedEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("QUOTE_CREATED");
    expect(entries[0].entityType).toBe("quote");
    expect(entries[0].entityId).toBe("quote-1");
  });

  it("never stores secrets in metadata", async () => {
    const service = new AuditService({}, new InMemoryAuditLogRepository());
    await service.log({
      actor: makeActor(),
      action: "LOGIN",
      module: "auth",
      entityType: "session",
      entityId: "s-1",
      category: "AUTH",
      severity: "INFO",
      result: "SUCCESS",
      metadata: {
        ok: true,
        password: "hunter2",
        token: "eyJhbGciOi...secret",
        nested: { apiKey: "sk-live-1234567890" },
        cardInfo: { card_number: "4111 1111 1111 1111", pin: "1234" },
      },
      tags: [],
    });
    await forceFlush(service);
    const entry = service.getPersistedEntries()[0];
    expect(entry.metadata.password).toBe("[REDACTED]");
    expect(entry.metadata.token).toBe("[REDACTED]");
    expect((entry.metadata as any).nested.apiKey).toBe("[REDACTED]");
    expect((entry.metadata as any).cardInfo.card_number).toBe("[REDACTED]");
    expect((entry.metadata as any).cardInfo.pin).toBe("[REDACTED]");
    expect(entry.metadata.ok).toBe(true);
  });

  it("computes a real SHA-256 chain hash", async () => {
    const service = new AuditService({}, new InMemoryAuditLogRepository());
    await service.log({
      actor: makeActor(),
      action: "TEST",
      module: "test",
      entityType: "entity",
      entityId: "e-1",
      category: "SYSTEM",
      severity: "INFO",
      result: "SUCCESS",
      metadata: {},
      tags: [],
    });
    await forceFlush(service);
    const entry = service.getPersistedEntries()[0];
    const chainHash = (entry.metadata as any).hashChain;
    expect(chainHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifyIntegrity is true for an unmodified chain", async () => {
    const service = new AuditService(
      { computeHashChain: true },
      new InMemoryAuditLogRepository(),
    );
    for (let i = 0; i < 3; i++) {
      await service.log({
        actor: makeActor({ id: `user-${i}` }),
        action: `PAYMENT_${i}`,
        module: "payments",
        entityType: "payment",
        entityId: `p-${i}`,
        category: "PAYMENT",
        severity: "INFO",
        result: "SUCCESS",
        metadata: {},
        tags: [],
      });
    }
    await forceFlush(service);
    const result = await service.verifyIntegrity();
    expect(result.valid).toBe(true);
    expect(result.entriesChecked).toBe(3);
  });

  it("verifyIntegrity detects a tampered chain", async () => {
    const service = new AuditService(
      { computeHashChain: true },
      new InMemoryAuditLogRepository(),
    );
    await service.log({
      actor: makeActor(),
      action: "PAYMENT_CREATED",
      module: "payments",
      entityType: "payment",
      entityId: "p-1",
      category: "PAYMENT",
      severity: "INFO",
      result: "SUCCESS",
      metadata: { amountCents: 1000 },
      tags: [],
    });
    await forceFlush(service);
    const entries = service.getPersistedEntries();
    (entries[0] as AuditLogEntry).metadata = {
      ...entries[0].metadata,
      hashChain: "0".repeat(64),
    };
    const result = await service.verifyIntegrity();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(entries[0].id);
  });

  it("query filters by actor, module and action", async () => {
    const repo = new InMemoryAuditLogRepository();
    const service = new AuditService({}, repo);
    await service.log({
      actor: makeActor(),
      action: "QUOTE_CREATED",
      module: "marketplace",
      entityType: "quote",
      entityId: "q-1",
      category: "CONTRACT",
      severity: "INFO",
      result: "SUCCESS",
      metadata: {},
      tags: [],
    });
    await service.log({
      actor: makeActor({ id: "user-2" }),
      action: "ORDER_CREATED",
      module: "marketplace",
      entityType: "order",
      entityId: "o-1",
      category: "CONTRACT",
      severity: "INFO",
      result: "SUCCESS",
      metadata: {},
      tags: [],
    });
    await forceFlush(service);

    const byActor = await service.query({ actorId: "user-1" });
    expect(byActor).toHaveLength(1);
    expect(byActor[0].action).toBe("QUOTE_CREATED");

    const byModule = await service.query({ module: "marketplace" });
    expect(byModule).toHaveLength(2);
  });

  it("supports correlationId filtering", async () => {
    const service = new AuditService({}, new InMemoryAuditLogRepository());
    for (let i = 0; i < 3; i++) {
      await service.log({
        actor: makeActor(),
        action: `EVT_${i}`,
        module: "test",
        entityType: "entity",
        entityId: `e-${i}`,
        category: "SYSTEM",
        severity: "INFO",
        result: "SUCCESS",
        metadata: {},
        tags: [],
        correlationId: i === 0 ? "corr-1" : "corr-2",
      });
    }
    await forceFlush(service);
    const result = await service.query({ correlationId: "corr-1" });
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("EVT_0");
  });

  it("respects enabled=false and returns empty id", async () => {
    const service = new AuditService({ enabled: false }, new InMemoryAuditLogRepository());
    const id = await service.log({
      actor: makeActor(),
      action: "X",
      module: "test",
      entityType: "entity",
      entityId: "e",
      category: "SYSTEM",
      severity: "INFO",
      result: "SUCCESS",
      metadata: {},
      tags: [],
    });
    expect(id).toBe("");
  });
});

describe("sanitizeAuditMetadata", () => {
  it("redacts secret-like keys recursively", () => {
    const out = sanitizeAuditMetadata({
      a: 1,
      passwordHash: "x",
      tokens: "abc",
      obj: { client_secret: "s3" },
      list: [{ bearer_token: "t" }],
    });
    expect((out as any).passwordHash).toBe("[REDACTED]");
    expect((out as any).tokens).toBe("[REDACTED]");
    expect((out as any).obj.client_secret).toBe("[REDACTED]");
    expect((out as any).list[0].bearer_token).toBe("[REDACTED]");
    expect(out.a).toBe(1);
  });
});

describe("auditSha256Hex", () => {
  it("produces 64-char hex deterministically", () => {
    const h = auditSha256Hex("rpg-os-audit");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(auditSha256Hex("rpg-os-audit")).toBe(h);
  });
});

describe("AUDIT_ACTION constants", () => {
  it("includes the full marketplace lifecycle", () => {
    expect(AUDIT_ACTION.MARKETPLACE_REQUEST_CREATED).toBe("MARKETPLACE_REQUEST_CREATED");
    expect(AUDIT_ACTION.QUOTE_CREATED).toBe("QUOTE_CREATED");
    expect(AUDIT_ACTION.QUOTE_ACCEPTED).toBe("QUOTE_ACCEPTED");
    expect(AUDIT_ACTION.CONTRACT_ACTIVATED).toBe("CONTRACT_ACTIVATED");
    expect(AUDIT_ACTION.PAYMENT_CONFIRMED).toBe("PAYMENT_CONFIRMED");
    expect(AUDIT_ACTION.MILESTONE_APPROVED).toBe("MILESTONE_APPROVED");
    expect(AUDIT_ACTION.EVIDENCE_UPLOADED).toBe("EVIDENCE_UPLOADED");
    expect(AUDIT_ACTION.DISPUTE_OPENED).toBe("DISPUTE_OPENED");
    expect(AUDIT_ACTION.AI_ACTION_DENIED).toBe("AI_ACTION_DENIED");
  });
});