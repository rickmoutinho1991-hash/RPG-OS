/**
 * RPG-OS — Integrity Ledger (fundação criptográfica).
 *
 * Ledger APEND-ONLY para prova de integridade de eventos de auditoria.
 *
 * IMPORTANTE (limites reais — ver docs/SECURITY.md):
 *  - Hash/ledger NÃO é encriptação e NÃO torna dados privados.
 *  - NÃO é blockchain, não há consenso, mineração nem rede distribuída.
 *  - O ledger NUNCA contém PII: apenas hashes SHA-256 e metadados mínimos
 *    (tipo de evento, IDs, tenant scope, timestamp).
 *  - Um atacante com controlo total da base de dados pode RECALCULAR a
 *    cadeia inteira; a proteção real exige âncoras externas periódicas
 *    (futuro: RPG-OS Global Network / notário).
 *
 * Modelo:
 *   currentHash = SHA-256( previousHash | eventType | eventId | timestamp
 *                          | organizationId | companyId | eventHash )
 *
 * O encadeamento garante deteção de adulteração retroativa: alterar um
 * evento quebra todos os hashes seguintes.
 *
 * Implementação pura e assíncrona (Web Crypto API — Node 18+ e browsers).
 */

const GENESIS_HASH = "0".repeat(64);
const SHA_256_HEX_LENGTH = 64;

export interface IntegrityEventInput {
  eventType: string;
  eventId: string;
  /** ISO-8601 UTC — deve ser gerado server-side. */
  timestamp: string;
  /** Tenant scope — apenas identificadores, nunca PII. */
  organizationId: string | null;
  companyId: string | null;
  /** Hash canónico do evento (já sanitizado — ver sanitizeAuditMetadata). */
  eventHash: string;
}

export interface IntegrityRecord extends IntegrityEventInput {
  previousHash: string;
  currentHash: string;
}

/** Serialização canónica determinística (campos fixos, ordem fixa). */
function canonicalSerialize(
  input: IntegrityEventInput,
  previousHash: string,
): string {
  return [
    previousHash,
    input.eventType,
    input.eventId,
    input.timestamp,
    input.organizationId ?? "",
    input.companyId ?? "",
    input.eventHash,
  ].join("|");
}

/** Hash SHA-256 hex de uma string. */
export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hash de integridade encadeado: depende do previousHash.
 * Se previousHash ou qualquer campo mudar, o resultado muda.
 */
export async function computeIntegrityHash(
  input: IntegrityEventInput,
  previousHash: string,
): Promise<string> {
  return sha256Hex(canonicalSerialize(input, previousHash));
}

/** Cria um registo de integridade (usado na escrita server-side). */
export async function createIntegrityRecord(
  input: IntegrityEventInput,
  previousHash: string = GENESIS_HASH,
): Promise<IntegrityRecord> {
  if (!input.eventType || !input.eventId || !input.eventHash) {
    throw new Error(
      "Integrity event requires eventType, eventId and eventHash.",
    );
  }
  if (!input.timestamp) {
    throw new Error("Integrity event requires server-side timestamp.");
  }
  if (input.eventHash.length !== SHA_256_HEX_LENGTH) {
    throw new Error("eventHash must be a 64-char SHA-256 hex digest.");
  }

  const currentHash = await computeIntegrityHash(input, previousHash);
  return { ...input, previousHash, currentHash };
}

/** Recalcula e valida um registo individual contra o previousHash. */
export async function verifyIntegrityRecord(
  record: IntegrityRecord,
): Promise<boolean> {
  const expected = await computeIntegrityHash(record, record.previousHash);
  return expected === record.currentHash;
}

/**
 * Verifica uma cadeia completa (ordem do array = ordem do ledger).
 * - o primeiro registo deve assentar em GENESIS;
 * - cada previousHash deve ser o currentHash do anterior;
 * - cada currentHash deve validar.
 * Devolve o índice do primeiro registo inválido ou -1 se a cadeia é válida.
 */
export async function verifyIntegrityChain(
  records: IntegrityRecord[],
): Promise<number> {
  let previousHash = GENESIS_HASH;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    if (record.previousHash !== previousHash) {
      return i; // quebra de encadeamento (ou adulteração do previousHash)
    }

    const valid = await verifyIntegrityRecord(record);
    if (!valid) {
      return i; // evento adulterado
    }

    previousHash = record.currentHash;
  }

  return -1;
}

/** Hash génesis (exposto para clientes de persistência). */
export function getGenesisHash(): string {
  return GENESIS_HASH;
}
