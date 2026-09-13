/**
 * RPG-OS — AT connectivity test (server-side only, TEST env only).
 *
 * Pipeline: resolver credenciais → binding TEST → envelope fatshare
 * Invoices (read-only, janela de 1 dia) → mTLS → parse → resultado honesto.
 * Nunca marca ACTIVE/CONNECTED sem resposta oficial válida; atualiza só
 * updated_at. PRODUCTION sempre bloqueada nesta fase.
 */
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/audit";
import {
  resolveATTransportCredentials,
  AtResolverException,
} from "./credentialResolver";
import { resolveAtEndpoint, assertTestOnlyEnvironment, AT_WSDL } from "./endpoints";
import {
  buildSoapEnvelope,
  buildWfaHeader,
  escapeXml,
  parseAtSoapResponse,
  readFatshareResponse,
} from "./soap";
import { sendAtSoap } from "./transport";

export type AtConnectivityStatus =
  | "CONNECTED"
  | "NOT_CONNECTED"
  | "UNKNOWN"
  | "AUTH_FAILED"
  | "CONFIGURATION_ERROR";

export interface AtConnectivityResult {
  status: AtConnectivityStatus;
  operation: "fatshare.Invoices";
  environment: "TEST";
  connectionId: string;
  correlationId: string;
  durationMs: number;
  detail?: string;
}

/**
 * Gate explícito D6: handshake TEST desligado até ativação auditada futura.
 * Sem isto em `true`, nenhuma chamada de rede é sequer tentada.
 */
export const AT_TEST_ENABLED = false as boolean;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Envelope fatshare Invoices read-only (próprio NIF, janela de 1 dia). */
export function buildInvoicesQueryEnvelope(nif: string, wfa: { username: string; password: string }): string {
  const day = today();
  const header = buildWfaHeader({
    username: wfa.username,
    password: wfa.password,
    nonce: randomUUID(),
    created: new Date().toISOString(),
  });
  const body =
    `<tns:InvoicesRequest>` +
    `<tns:TaxRegistrationNumber>${escapeXml(nif)}</tns:TaxRegistrationNumber>` +
    `<tns:StartDate>${day}</tns:StartDate>` +
    `<tns:EndDate>${day}</tns:EndDate>` +
    `</tns:InvoicesRequest>`;
  return buildSoapEnvelope("Invoices", header, body);
}

export async function testATConnection(connectionId: string): Promise<AtConnectivityResult> {
  const started = Date.now();
  const correlationId = randomUUID();
  async function audit(result: string, errorCode?: string): Promise<void> {
    try {
      await recordAuditEvent({
        userId: "system",
        companyId: null,
        organizationId: null,
        action:
          result === "started"
            ? "at.connectivity.test.started"
            : result === "succeeded"
              ? "at.connectivity.test.succeeded"
              : "at.connectivity.test.failed",
        module: "FISCAL",
        entityType: "AT_CONNECTION",
        entityId: connectionId,
        metadata: { operation: "fatshare.Invoices", environment: "TEST", result, errorCode, correlationId },
      });
    } catch {
      // Auditoria nunca bloqueia o teste.
    }
  }

  await audit("started");
  if (!AT_TEST_ENABLED) {
    await audit("failed", "AT_TEST_DISABLED");
    return {
      status: "CONFIGURATION_ERROR",
      operation: "fatshare.Invoices",
      environment: "TEST",
      connectionId,
      correlationId,
      durationMs: Date.now() - started,
      detail: "AT_TEST_DISABLED",
    };
  }
  let bundle;
  try {
    bundle = await resolveATTransportCredentials(connectionId);
  } catch (err) {
    const code = err instanceof AtResolverException ? err.code : "AT_CONFIGURATION_ERROR";
    await audit("failed", code);
    return {
      status: code === "FORBIDDEN" || code === "UNAUTHENTICATED" ? "NOT_CONNECTED" : "CONFIGURATION_ERROR",
      operation: "fatshare.Invoices",
      environment: "TEST",
      connectionId,
      correlationId,
      durationMs: Date.now() - started,
      detail: code,
    };
  }
  // TEST ONLY: produção bloqueada mesmo com credenciais presentes.
  try {
    assertTestOnlyEnvironment(bundle.environment);
  } catch {
    await audit("failed", "AT_PRODUCTION_DISABLED");
    return {
      status: "NOT_CONNECTED",
      operation: "fatshare.Invoices",
      environment: "TEST",
      connectionId,
      correlationId,
      durationMs: Date.now() - started,
      detail: "AT_PRODUCTION_DISABLED",
    };
  }

  const endpoint = resolveAtEndpoint("TEST", "fatshare");
  const envelope = buildInvoicesQueryEnvelope(bundle.nif, {
    username: bundle.wfaUsername,
    password: bundle.wfaPassword,
  });
  const res = await sendAtSoap({
    url: endpoint.url,
    envelopeXml: envelope,
    tls: bundle.tls,
  });
  if (!res.ok) {
    const status =
      res.error === "AT_TIMEOUT" ? "UNKNOWN" : res.error === "AT_HTTP_ERROR" ? "NOT_CONNECTED" : "NOT_CONNECTED";
    await audit("failed", res.error);
    // Nunca deduzir AUTH_FAILED sem evidência; timeout = UNKNOWN.
    return {
      status,
      operation: "fatshare.Invoices",
      environment: "TEST",
      connectionId,
      correlationId: res.correlationId,
      durationMs: res.durationMs,
      detail: res.error,
    };
  }
  const parsed = parseAtSoapResponse(res.bodyXml);
  if (parsed.kind === "fault") {
    await audit("failed", "AT_SOAP_FAULT");
    return {
      status: "AUTH_FAILED",
      operation: "fatshare.Invoices",
      environment: "TEST",
      connectionId,
      correlationId: res.correlationId,
      durationMs: res.durationMs,
      detail: `AT_SOAP_FAULT:${parsed.faultCode}`,
    };
  }
  if (parsed.kind !== "response") {
    await audit("failed", "AT_INVALID_RESPONSE");
    return {
      status: "UNKNOWN",
      operation: "fatshare.Invoices",
      environment: "TEST",
      connectionId,
      correlationId: res.correlationId,
      durationMs: res.durationMs,
      detail: "AT_INVALID_RESPONSE",
    };
  }
  const estado = readFatshareResponse(parsed.body);
  if (!estado) {
    await audit("failed", "AT_INVALID_RESPONSE");
    return {
      status: "UNKNOWN",
      operation: "fatshare.Invoices",
      environment: "TEST",
      connectionId,
      correlationId: res.correlationId,
      durationMs: res.durationMs,
      detail: "AT_INVALID_RESPONSE",
    };
  }
  // Resposta oficial válida com estado da operação = prova de canal.
  await audit("succeeded");
  await touchConnection(connectionId);
  return {
    status: "CONNECTED",
    operation: "fatshare.Invoices",
    environment: "TEST",
    connectionId,
    correlationId: res.correlationId,
    durationMs: res.durationMs,
    detail: `EstadoOperacao=${estado.estadoOperacao}`,
  };
}

/** Atualiza só updated_at (nunca credenciais, nunca status de conexão). */
async function touchConnection(connectionId: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from("at_connections")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", connectionId);
  } catch {
    // Não crítico.
  }
}

export const AT_WSDL_REF = AT_WSDL;
