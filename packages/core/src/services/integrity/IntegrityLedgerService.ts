/**
 * RPG-OS — Integrity Ledger Service
 *
 * Transversal wiring between domain events/artifacts, the integrity hash
 * chain (security/integrityLedger) and the audit log.
 *
 * Model:
 *   event/resource
 *   ↓ canonical representation
 *   ↓ SHA-256
 *   ↓ integrity record (append-only chain)
 *   ↓ audit reference
 *
 * NOT a blockchain. NOT a second audit log.
 * Distinction:
 *   - AUDIT LOG: what happened, by whom, when (metadata-rich).
 *   - INTEGRITY LEDGER: tamper-evident fingerprints of critical events.
 */

import { createHash } from "node:crypto";
import {
  createIntegrityRecord,
  verifyIntegrityChain,
  getGenesisHash,
} from "../../security/integrityLedger";
import type { IntegrityRecord } from "../../security/integrityLedger";

export interface IntegrityLedgerEvent {
  eventType: string;
  eventId: string;
  organizationId?: string | null;
  companyId?: string | null;
  /** Audit entry id, if a corresponding audit_logs entry exists. */
  auditReference?: string | null;
  /** Canonical payload (sanitized, no secrets). */
  payload: Record<string, unknown>;
}

export interface IntegrityLedgerRecord extends IntegrityRecord {
  auditReference?: string | null;
}

export interface IntegrityLedgerRepository {
  append(record: IntegrityLedgerRecord): Promise<void>;
  get(eventType: string, eventId: string): Promise<IntegrityLedgerRecord | null>;
  getAll(): Promise<IntegrityLedgerRecord[]>;
  getChainTail(): Promise<string>;
}

export class InMemoryIntegrityLedgerRepository implements IntegrityLedgerRepository {
  private records: IntegrityLedgerRecord[] = [];

  async append(record: IntegrityLedgerRecord): Promise<void> {
    this.records.push(record);
  }

  async get(eventType: string, eventId: string): Promise<IntegrityLedgerRecord | null> {
    return this.records.find((r) => r.eventType === eventType && r.eventId === eventId) ?? null;
  }

  async getAll(): Promise<IntegrityLedgerRecord[]> {
    return [...this.records];
  }

  async getChainTail(): Promise<string> {
    if (this.records.length === 0) return getGenesisHash();
    return this.records[this.records.length - 1].currentHash;
  }
}

/** Serialização canónica determinística do payload (ordem fixa de chaves). */
export function canonicalizeLedgerPayload(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload).sort();
  return keys.map((k) => `${k}=${String(payload[k])}`).join("|");
}

export function ledgerSha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class IntegrityLedgerService {
  private repository: IntegrityLedgerRepository;

  constructor(repository: IntegrityLedgerRepository = new InMemoryIntegrityLedgerRepository()) {
    this.repository = repository;
  }

  /**
   * Regista um evento no ledger: canonical → hash → record encadeado.
   * O registo guarda apenas hashes/metadados mínimos — nunca PII nem segredos.
   */
  async record(event: IntegrityLedgerEvent): Promise<IntegrityLedgerRecord> {
    if (!event.eventType || !event.eventId) {
      throw new Error("Integrity event requires eventType and eventId");
    }

    const previousHash = await this.repository.getChainTail();
    const eventHash = this.hashLedgerEvent(event.payload);
    const record = await createIntegrityRecord(
      {
        eventType: event.eventType,
        eventId: event.eventId,
        timestamp: new Date().toISOString(),
        organizationId: event.organizationId ?? null,
        companyId: event.companyId ?? null,
        eventHash,
      },
      previousHash,
    );

    const ledgerRecord: IntegrityLedgerRecord = {
      ...record,
      auditReference: event.auditReference ?? null,
    };

    await this.repository.append(ledgerRecord);
    return ledgerRecord;
  }

  /** Hash canónico do payload de um evento. */
  hashLedgerEvent(payload: Record<string, unknown>): string {
    return ledgerSha256Hex(canonicalizeLedgerPayload(payload));
  }

  /** Verifica a cadeia completa do repositório. Índice do 1.º inválido ou -1. */
  async verifyChain(): Promise<{ valid: boolean; brokenAt: number; records: number }> {
    const records = await this.repository.getAll();
    if (records.length === 0) return { valid: true, brokenAt: -1, records: 0 };
    const idx = await verifyIntegrityChain(records);
    return { valid: idx === -1, brokenAt: idx, records: records.length };
  }

  /** Verifica um evento contra o registo guardado (requer o payload original). */
  async verifyEvent(
    event: Pick<IntegrityLedgerEvent, "eventType" | "eventId" | "payload">,
  ): Promise<boolean> {
    const record = await this.repository.get(event.eventType, event.eventId);
    if (!record) return false;
    return this.hashLedgerEvent(event.payload) === record.eventHash;
  }

  /** Devolve todos os registos do ledger. */
  async getAll(): Promise<IntegrityLedgerRecord[]> {
    return this.repository.getAll();
  }
}