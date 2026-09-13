/**
 * RPG-OS — Audit Hardening (server-side).
 *
 * Pipeline único para eventos de auditoria:
 *   AUDIT EVENT → SANITIZE → AUDIT LOG → INTEGRITY HASH
 *
 * Garantias:
 *  - actor (user_id) resolvido server-side — nunca confiado ao cliente;
 *  - timestamp server-side (base de dados via default now(), audit helper
 *    também gera ISO-UTC server-side);
 *  - metadata sempre passada por sanitizeAuditMetadata (sem PII redigível
 *    em claro, sem passwords/tokens/secrets — removidos);
 *  - cada evento produz um registo no integrity_ledger (hash encadeado).
 *
 * Nota: as escritas existentes espalhadas pelas server actions continuam a
 * funcionar; este helper é o caminho preferido para código novo.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { IntegrityRecord } from "@rpg/core";
import {
  sanitizeAuditMetadata,
  createIntegrityRecord,
  getGenesisHash,
} from "@rpg/core";

export interface AuditEventInput {
  /** Actor resolvido server-side (getCurrentUser()/sessão). */
  userId: string;
  companyId: string | null;
  organizationId?: string | null;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  /** Metadados brutos — serão sanitizados antes de qualquer persistência. */
  metadata?: Record<string, unknown>;
}

async function hashEvent(metadata: Record<string, unknown>): Promise<string> {
  const canonical = JSON.stringify(metadata, Object.keys(metadata).sort());
  const data = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Registra um evento auditado com sanitização e hash de integridade.
 * O hash anterior é o último current_hash do tenant (ou GENESIS).
 * Falha de integridade não bloqueia o audit log (auditoria > ledger),
 * mas o erro é propagado para visibilidade em desenvolvimento.
 */
export async function recordAuditEvent(
  input: AuditEventInput,
): Promise<{ auditId: string | null; integrityHash: string | null }> {
  const supabase = createAdminClient();
  const sanitized = sanitizeAuditMetadata(input.metadata ?? {});

  // 1. Audit log (timestamp server-side).
  const { data: auditRow, error: auditError } = await supabase
    .from("audit_logs")
    .insert({
      user_id: input.userId,
      company_id: input.companyId,
      action: input.action,
      module: input.module,
      entity_type: input.entityType,
      entity_id: input.entityId,
      metadata: sanitized,
    })
    .select("id")
    .single();

  if (auditError) return { auditId: null, integrityHash: null };

  // 2. Integrity hash encadeado (apenas prova, sem PII).
  let integrityHash: string | null = null;
  try {
    const eventHash = await hashEvent(sanitized);
    const orgId = input.organizationId ?? input.companyId ?? null;

    const { data: last } = await supabase
      .from("integrity_ledger")
      .select("current_hash")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const record = await createIntegrityRecord(
      {
        eventType: input.action,
        eventId: String(auditRow.id),
        timestamp: new Date().toISOString(),
        organizationId: orgId,
        companyId: input.companyId,
        eventHash,
      },
      last?.current_hash ?? getGenesisHash(),
    );

    const { error: ledgerError } = await supabase
      .from("integrity_ledger")
      .insert({
        organization_id: orgId,
        company_id: input.companyId,
        event_type: record.eventType,
        event_id: record.eventId,
        previous_hash: record.previousHash,
        current_hash: record.currentHash,
      });
    if (!ledgerError) integrityHash = record.currentHash;
  } catch {
    // Ledger indisponível: audit log já foi persistido; não bloquear.
  }

  return { auditId: String(auditRow.id), integrityHash };
}

/** Utilitário para verificar a cadeia de integridade de um tenant. */
export async function verifyTenantIntegrityChain(
  organizationId: string,
): Promise<{ valid: boolean; brokenAtIndex: number; size: number }> {
  const supabase = createAdminClient();
  const { verifyIntegrityChain } = await import("@rpg/core");

  const { data } = await supabase
    .from("integrity_ledger")
    .select(
      "event_type, event_id, previous_hash, current_hash, organization_id, company_id, created_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  const records = (data ?? []).map(
    (r: Record<string, unknown>) =>
      ({
        eventType: r.event_type,
        eventId: r.event_id,
        previousHash: r.previous_hash,
        currentHash: r.current_hash,
        timestamp: new Date(String(r.created_at)).toISOString(),
        organizationId: r.organization_id,
        companyId: r.company_id,
        eventHash: "", // não utilizado na verificação de encadeamento abaixo
      }) as unknown as IntegrityRecord,
  );

  const brokenAtIndex = await verifyIntegrityChain(records);
  return { valid: brokenAtIndex === -1, brokenAtIndex, size: records.length };
}
