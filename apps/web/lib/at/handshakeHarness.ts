/**
 * RPG-OS — AT TEST live execution harness (server-side only, D12).
 *
 * Camada fina e separada: avalia READINESS (metadata) e só delega ao
 * handshake real (`testATConnection`) quando readiness = READY.
 * Qualquer falha de gate → BLOCKED sem qualquer chamada de rede.
 *
 * O harness é incapaz de submeter: importa apenas `connectivity`
 * (handshake read-only fatshare.Invoices) — nunca submission.
 * READY nunca promove para CERTIFIED; SUBMISSION e PRODUCTION continuam DISABLED.
 */
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { getCurrentUser } from "@/lib/supabase/auth";
import { recordAuditEvent } from "@/lib/audit";
import {
  evaluateAtTestReadiness,
  hasPermission,
  type AtReadinessReason,
} from "@rpg/core";
import {
  AT_TEST_ENABLED,
  testATConnection,
  type AtConnectivityResult,
} from "./connectivity";

export type AtHandshakeOutcome = "PASSED" | "FAILED" | "BLOCKED" | "NOT_EXECUTED";

export interface AtHandshakeResult {
  readiness: "READY" | "BLOCKED";
  readinessReasons: AtReadinessReason[];
  handshake: AtHandshakeOutcome;
  /** Resultado de rede; null quando bloqueado antes de qualquer network call. */
  connectivity: AtConnectivityResult | null;
  environment: "TEST";
  connectionId: string;
  correlationId: string;
}

interface ConnectionMeta {
  id: string;
  company_id: string;
  environment: string;
  status: string;
  consent_id: string | null;
  cert_secret_ref: string | null;
  key_secret_ref: string | null;
  wfa_user_secret_ref: string | null;
  wfa_pass_secret_ref: string | null;
}

/**
 * Executa o handshake AT TEST controlado. Server-side only: company, tenant,
 * environment e credenciais derivam da sessão + DB — nunca do browser.
 */
export async function runAtTestHandshake(connectionId: string): Promise<AtHandshakeResult> {
  const correlationId = randomUUID();
  const blocked = (reasons: AtReadinessReason[]): AtHandshakeResult => ({
    readiness: "BLOCKED",
    readinessReasons: reasons,
    handshake: "NOT_EXECUTED",
    connectivity: null,
    environment: "TEST",
    connectionId,
    correlationId,
  });

  // 1-3. Autorização server-side (qualquer exceção → AUTHORIZATION_REQUIRED).
  let companyId: string | null = null;
  try {
    const session = await getSessionContext();
    if (!session || !hasPermission(session.permissions, "fiscal.manage")) {
      return blocked(["AUTHORIZATION_REQUIRED"]);
    }
    const user = await getCurrentUser();
    if (!user?.companyId) return blocked(["AUTHORIZATION_REQUIRED"]);
    companyId = user.companyId;
  } catch {
    return blocked(["AUTHORIZATION_REQUIRED"]);
  }

  // 4-5. Metadata da conexão (tenant isolation: company do actor).
  let conn: ConnectionMeta | null = null;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("at_connections")
      .select(
        "id,company_id,environment,status,consent_id,cert_secret_ref,key_secret_ref,wfa_user_secret_ref,wfa_pass_secret_ref",
      )
      .eq("id", connectionId)
      .maybeSingle();
    conn = data as unknown as ConnectionMeta | null;
  } catch {
    conn = null;
  }
  if (!conn || conn.company_id !== companyId || conn.status === "REVOKED") {
    return blocked(!conn ? ["MISSING_CONNECTION"] : ["AUTHORIZATION_REQUIRED"]);
  }

  // 6. Consentimento AT ativo (metadata apenas).
  let consentActive = false;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("government_consents")
      .select("revoked_at,expires_at,provider_id")
      .eq("id", conn.consent_id ?? "")
      .maybeSingle();
    const row = data as unknown as {
      revoked_at: string | null;
      expires_at: string | null;
      provider_id: string;
    } | null;
    consentActive =
      !!conn.consent_id &&
      !!row &&
      !row.revoked_at &&
      row.provider_id === "AT" &&
      !(row.expires_at && new Date(row.expires_at).getTime() <= Date.now());
  } catch {
    consentActive = false;
  }

  // 7. Readiness pura — endpoint permitido só se ambiente TEST (allowlist
  // oficial aplicada dentro de testATConnection; aqui só metadata).
  const readiness = evaluateAtTestReadiness({
    environment: conn.environment,
    connectionConfigured: true,
    credentialRefConfigured: !!conn.wfa_user_secret_ref && !!conn.wfa_pass_secret_ref,
    certificateRefConfigured: !!conn.cert_secret_ref,
    privateKeyRefConfigured: !!conn.key_secret_ref,
    endpointAllowed: conn.environment === "TEST",
    consentActive,
    authorized: true,
    testGateEnabled: AT_TEST_ENABLED,
  });
  if (readiness.status !== "READY") {
    await auditBlocked(connectionId, companyId, correlationId, readiness.reasons);
    return {
      readiness: "BLOCKED",
      readinessReasons: readiness.reasons,
      handshake: "NOT_EXECUTED",
      connectivity: null,
      environment: "TEST",
      connectionId,
      correlationId,
    };
  }

  // 8. READY → delegar ao handshake real (com os seus próprios gates).
  const connectivity = await testATConnection(connectionId);
  return {
    readiness: "READY",
    readinessReasons: [],
    handshake: connectivity.status === "CONNECTED" ? "PASSED" : "FAILED",
    connectivity,
    environment: "TEST",
    connectionId,
    correlationId,
  };
}

/** Auditoria metadata-only; nunca bloqueia, nunca contém segredos. */
async function auditBlocked(
  connectionId: string,
  companyId: string | null,
  correlationId: string,
  reasons: AtReadinessReason[],
): Promise<void> {
  try {
    await recordAuditEvent({
      userId: "system",
      companyId,
      organizationId: null,
      action: "at.handshake.blocked",
      module: "FISCAL",
      entityType: "AT_CONNECTION",
      entityId: connectionId,
      metadata: { environment: "TEST", outcome: "BLOCKED", reasons, correlationId },
    });
  } catch {
    // Auditoria nunca bloqueia o gate.
  }
}
