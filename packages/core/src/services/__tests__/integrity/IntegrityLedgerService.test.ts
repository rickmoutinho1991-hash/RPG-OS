import { describe, it, expect } from "vitest";
import {
  IntegrityLedgerService,
  InMemoryIntegrityLedgerRepository,
  canonicalizeLedgerPayload,
  ledgerSha256Hex,
} from "../../integrity/IntegrityLedgerService";
import type { IntegrityLedgerRecord } from "../../integrity/IntegrityLedgerService";

describe("IntegrityLedgerService", () => {
  it("records an event into a chained ledger", async () => {
    const service = new IntegrityLedgerService();
    const record = await service.record({
      eventType: "PAYMENT_CREATED",
      eventId: "p-1",
      organizationId: "org-1",
      payload: { amountCents: 15000, currency: "EUR" },
      auditReference: "audit-1",
    });

    expect(record.eventType).toBe("PAYMENT_CREATED");
    expect(record.eventId).toBe("p-1");
    expect(record.currentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.eventHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.auditReference).toBe("audit-1");
    expect(record.previousHash).toBe("0".repeat(64)); // genesis
  });

  it("chains records (previousHash follows currentHash)", async () => {
    const service = new IntegrityLedgerService();
    const r1 = await service.record({
      eventType: "QUOTE_CREATED",
      eventId: "q-1",
      payload: { amountCents: 5000 },
    });
    const r2 = await service.record({
      eventType: "QUOTE_ACCEPTED",
      eventId: "q-1",
      payload: { amountCents: 5000 },
    });

    expect(r2.previousHash).toBe(r1.currentHash);
  });

  it("verifyChain is valid for an unmodified ledger", async () => {
    const service = new IntegrityLedgerService();
    await service.record({
      eventType: "MILESTONE_APPROVED",
      eventId: "ms-1",
      payload: { approvedBy: "client-1" },
    });
    await service.record({
      eventType: "EVIDENCE_UPLOADED",
      eventId: "ev-1",
      payload: { hash: "abc" },
    });
    const result = await service.verifyChain();
    expect(result.valid).toBe(true);
    expect(result.records).toBe(2);
  });

  it("verifyChain detects a tampered record", async () => {
    const repo = new InMemoryIntegrityLedgerRepository();
    const service = new IntegrityLedgerService(repo);
    const r1 = await service.record({
      eventType: "PAYMENT_CREATED",
      eventId: "p-1",
      payload: { amountCents: 10000 },
    });
    const r2 = await service.record({
      eventType: "PAYMENT_CONFIRMED",
      eventId: "p-1",
      payload: { amountCents: 10000 },
    });

    // Alteração retroativa do r1 quebra a cadeia
    const tampered: IntegrityLedgerRecord = {
      ...r1,
      currentHash: "0".repeat(64),
    };
    await repo.append(tampered);
    // not used; recreate a ledger with tampered inserted before r2
    void r2;

    const service2 = new IntegrityLedgerService(
      new TamperedRepo([tampered, r2]),
    );
    const result = await service2.verifyChain();
    expect(result.valid).toBe(false);
  });

  it("verifyEvent validates the original payload against the stored hash", async () => {
    const service = new IntegrityLedgerService();
    const payload = { amountCents: 25000, currency: "EUR" };
    await service.record({
      eventType: "ORDER_CREATED",
      eventId: "o-1",
      payload,
    });

    expect(
      await service.verifyEvent({ eventType: "ORDER_CREATED", eventId: "o-1", payload }),
    ).toBe(true);

    expect(
      await service.verifyEvent({
        eventType: "ORDER_CREATED",
        eventId: "o-1",
        payload: { amountCents: 9999, currency: "EUR" },
      }),
    ).toBe(false);
  });

  it("verifyEvent returns false for an unknown event", async () => {
    const service = new IntegrityLedgerService();
    expect(
      await service.verifyEvent({ eventType: "X", eventId: "missing", payload: {} }),
    ).toBe(false);
  });

  it("rejects events without eventType or eventId", async () => {
    const service = new IntegrityLedgerService();
    await expect(
      service.record({ eventType: "", eventId: "x", payload: {} }),
    ).rejects.toThrow("eventType and eventId");
  });

  it("never stores PII/secrets in the record", async () => {
    const service = new IntegrityLedgerService();
    const record = await service.record({
      eventType: "LOGIN",
      eventId: "s-1",
      payload: { password: "hunter2", email: "x@example.com", ok: true },
    });
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("x@example.com");
    expect(("payload" in record)).toBe(false);
  });
});

describe("canonicalizeLedgerPayload", () => {
  it("is deterministic regardless of key order", () => {
    const a = canonicalizeLedgerPayload({ b: "2", a: "1" });
    const b = canonicalizeLedgerPayload({ a: "1", b: "2" });
    expect(a).toBe(b);
    expect(a).toContain("a=1");
    expect(a).toContain("b=2");
  });
});

describe("ledgerSha256Hex", () => {
  it("produces a 64-char hex digest", () => {
    expect(ledgerSha256Hex("rpg-os")).toMatch(/^[0-9a-f]{64}$/);
  });
});

class TamperedRepo extends InMemoryIntegrityLedgerRepository {
  private prerecords: IntegrityLedgerRecord[];
  constructor(records: IntegrityLedgerRecord[]) {
    super();
    this.prerecords = records;
  }
  override async getAll(): Promise<IntegrityLedgerRecord[]> {
    return [...this.prerecords];
  }
  override async getChainTail(): Promise<string> {
    return this.prerecords.length === 0 ? "0".repeat(64) : this.prerecords[this.prerecords.length - 1].currentHash;
  }
}