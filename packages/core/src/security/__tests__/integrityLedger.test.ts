import { describe, expect, it } from "vitest";
import {
  computeIntegrityHash,
  createIntegrityRecord,
  verifyIntegrityChain,
  verifyIntegrityRecord,
  getGenesisHash,
  sha256Hex,
  type IntegrityRecord,
} from "../integrityLedger";

// IDs fictícios (UUIDs de teste) — nenhum dado pessoal real.
const ORG_A = "00000000-0000-4000-8000-0000000000aa";
const ORG_B = "00000000-0000-4000-8000-0000000000bb";

function eventInput(overrides: Partial<Parameters<typeof createIntegrityRecord>[0]> = {}) {
  return {
    eventType: "AUDIT_LOG",
    eventId: "evt-0001",
    timestamp: "2026-01-01T10:00:00.000Z",
    organizationId: ORG_A,
    companyId: ORG_A,
    eventHash: sha256Of("conteudo-ficticio"),
    ...overrides,
  };
}

function sha256Of(value: string): string {
  // helper síncrono não é possível com Web Crypto; usamos hash determinístico
  // pré-calculado nos testes — mas os testes são async, por isso usamos wrapper.
  return value.padEnd(64, "0").slice(0, 64);
}

describe("integrityLedger", () => {
  it("sha256Hex produz 64 chars hex", async () => {
    const h = await sha256Hex("abc");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("primeiro evento assenta no GENESIS", async () => {
    const rec = await createIntegrityRecord(eventInput());
    expect(rec.previousHash).toBe(getGenesisHash());
    expect(rec.currentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.currentHash).not.toBe(getGenesisHash());
  });

  it("encadeamento: hash depende do anterior", async () => {
    const first = await createIntegrityRecord(eventInput({ eventId: "e1" }));
    const second = await createIntegrityRecord(
      eventInput({ eventId: "e2" }),
      first.currentHash,
    );
    expect(second.previousHash).toBe(first.currentHash);

    // Mesmo evento com previousHash diferente → hash diferente.
    const alt = await createIntegrityRecord(
      eventInput({ eventId: "e2" }),
      getGenesisHash(),
    );
    expect(alt.currentHash).not.toBe(second.currentHash);
  });

  it("alteração de qualquer campo muda o hash", async () => {
    const base = eventInput();
    const h1 = await computeIntegrityHash(base, getGenesisHash());
    const h2 = await computeIntegrityHash({ ...base, eventHash: "f".repeat(64) }, getGenesisHash());
    const h3 = await computeIntegrityHash({ ...base, organizationId: ORG_B }, getGenesisHash());
    const h4 = await computeIntegrityHash({ ...base, timestamp: "2026-01-02T10:00:00.000Z" }, getGenesisHash());
    expect(h2).not.toBe(h1);
    expect(h3).not.toBe(h1);
    expect(h4).not.toBe(h1);
  });

  it("verifica registo individual", async () => {
    const rec = await createIntegrityRecord(eventInput());
    expect(await verifyIntegrityRecord(rec)).toBe(true);
    expect(await verifyIntegrityRecord({ ...rec, eventHash: "f".repeat(64) })).toBe(false);
  });

  it("cadeia válida de N eventos", async () => {
    const chain: IntegrityRecord[] = [];
    let prev = getGenesisHash();
    for (let i = 1; i <= 5; i++) {
      const rec = await createIntegrityRecord(
        eventInput({ eventId: `e${i}`, timestamp: `2026-01-0${i}T10:00:00.000Z` }),
        prev,
      );
      chain.push(rec);
      prev = rec.currentHash;
    }
    expect(await verifyIntegrityChain(chain)).toBe(-1);
  });

  it("deteção de adulteração de evento (tampering)", async () => {
    const chain: IntegrityRecord[] = [];
    let prev = getGenesisHash();
    for (let i = 1; i <= 3; i++) {
      const rec = await createIntegrityRecord(
        eventInput({ eventId: `e${i}`, timestamp: `2026-01-0${i}T10:00:00.000Z` }),
        prev,
      );
      chain.push(rec);
      prev = rec.currentHash;
    }

    // Adulterar o 2.º evento (posição 1): os seguintes deixam de validar.
    const tampered = chain.map((r, i) =>
      i === 1 ? { ...r, eventHash: "f".repeat(64) } : r,
    );
    expect(await verifyIntegrityChain(tampered)).toBe(1);
  });

  it("alteração de previousHash quebra a cadeia", async () => {
    const first = await createIntegrityRecord(eventInput({ eventId: "e1" }));
    const second = await createIntegrityRecord(
      eventInput({ eventId: "e2" }),
      first.currentHash,
    );
    // previousHash reescrito para apontar a GENESIS (ataque de reencadeamento).
    const forged = { ...second, previousHash: getGenesisHash() };
    expect(await verifyIntegrityChain([first, forged])).toBe(1);
  });

  it("cadeia inválida por reorder", async () => {
    const a = await createIntegrityRecord(eventInput({ eventId: "e1" }));
    const b = await createIntegrityRecord(eventInput({ eventId: "e2" }), a.currentHash);
    expect(await verifyIntegrityChain([b, a])).toBe(0);
  });

  it("tenant scope: eventos de tenants diferentes produzem hashes diferentes", async () => {
    const a = await createIntegrityRecord(eventInput({ organizationId: ORG_A, companyId: ORG_A }));
    const b = await createIntegrityRecord(eventInput({ organizationId: ORG_B, companyId: ORG_B }));
    expect(a.currentHash).not.toBe(b.currentHash);
  });

  it("valida eventHash obrigatório de 64 chars", async () => {
    await expect(
      createIntegrityRecord(eventInput({ eventHash: "curto" })),
    ).rejects.toThrow();
  });
});
