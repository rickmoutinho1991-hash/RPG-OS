/**
 * RPG-OS — AT SOAP helpers (construção + parsing, sem I/O).
 *
 * Envelope SOAP 1.1 document/literal conforme WSDL Fatcorews. Valores sempre
 * escapados (sem concatenação insegura). Parsing com fast-xml-parser
 * (sem DTD/entities por defeito; limite de tamanho aplicado pelo chamador).
 * Estrutura do header WFA segue o Manual de Integração AT; campos exatos
 * validados contra o WSDL na D4.x com credenciais.
 */
import { XMLParser } from "fast-xml-parser";
import { AT_WSDL } from "./endpoints";

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface WfaHeaderFields {
  username: string;
  password: string;
  nonce: string;
  created: string;
}

/** Header WS-Security UsernameToken (WFA) — estrutura do manual AT. */
export function buildWfaHeader(fields: WfaHeaderFields): string {
  const ns = AT_WSDL.namespace;
  return (
    `<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">` +
    `<wsse:UsernameToken>` +
    `<wsse:Username>${escapeXml(fields.username)}</wsse:Username>` +
    `<wsse:Password>${escapeXml(fields.password)}</wsse:Password>` +
    `<wsse:Nonce>${escapeXml(fields.nonce)}</wsse:Nonce>` +
    `<wsu:Created xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">${escapeXml(fields.created)}</wsu:Created>` +
    `</wsse:UsernameToken></wsse:Security>`
  );
}

export function buildSoapEnvelope(operation: string, headerXml: string, bodyXml: string): string {
  void operation;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="${AT_WSDL.namespace}">` +
    `<soap:Header>${headerXml}</soap:Header>` +
    `<soap:Body>${bodyXml}</soap:Body>` +
    `</soap:Envelope>`
  );
}

export type AtSoapParseResult =
  | { kind: "response"; rootName: string; body: Record<string, unknown> }
  | { kind: "fault"; faultCode: string; faultString: string }
  | { kind: "malformed" };

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: true,
  trimValues: true,
  processEntities: true,
  allowBooleanAttributes: false,
  // Sem DTD/doctype processing (XXE-safe); limite aplicado no transporte.
});

/** Extrai ResponseType {CodigoResposta, Mensagem, DataOperacao} ou Fault. */
export function parseAtSoapResponse(xml: string): AtSoapParseResult {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return { kind: "malformed" };
  }
  if (typeof doc !== "object" || doc === null) return { kind: "malformed" };
  const envelope = (doc as Record<string, unknown>).Envelope as Record<string, unknown> | undefined;
  if (!envelope || typeof envelope !== "object") return { kind: "malformed" };
  const body = envelope.Body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") return { kind: "malformed" };

  if (body.Fault && typeof body.Fault === "object") {
    const fault = body.Fault as Record<string, unknown>;
    return {
      kind: "fault",
      faultCode: String((fault.faultcode as string | number | undefined) ?? "UNKNOWN"),
      faultString: String((fault.faultstring as string | undefined) ?? "UNKNOWN").slice(0, 500),
    };
  }
  // Primeira resposta nomeada do Body (ex.: RegisterInvoiceResponse,
  // InvoicesResponse). Não validar schema aqui — o chamador interpreta.
  for (const [rootName, node] of Object.entries(body)) {
    if (node && typeof node === "object") {
      return { kind: "response", rootName, body: node as Record<string, unknown> };
    }
  }
  return { kind: "malformed" };
}

/** Extrai ResponseType fatcorews {CodigoResposta, Mensagem, DataOperacao}. */
export function readFatcorewsResponse(body: Record<string, unknown>): {
  codigoResposta: number;
  mensagem: string;
  dataOperacao: string;
} | null {
  const r = body.Response as Record<string, unknown> | undefined;
  if (!r || typeof r !== "object") return null;
  const codigo = Number(r.CodigoResposta);
  if (!Number.isFinite(codigo)) return null;
  return {
    codigoResposta: codigo,
    mensagem: String(r.Mensagem ?? "").slice(0, 500),
    dataOperacao: String(r.DataOperacao ?? ""),
  };
}

/** Extrai estadoExecucao fatshare {EstadoOperacao, Desc}. */
export function readFatshareResponse(body: Record<string, unknown>): {
  estadoOperacao: number;
  desc: string;
} | null {
  const r = body.estadoExecucao as Record<string, unknown> | undefined;
  if (!r || typeof r !== "object") return null;
  const estado = Number(r.EstadoOperacao);
  if (!Number.isFinite(estado)) return null;
  return { estadoOperacao: estado, desc: String(r.Desc ?? "").slice(0, 500) };
}

export type AtNormalizedError =
  | "AT_NETWORK_ERROR"
  | "AT_TLS_ERROR"
  | "AT_CERTIFICATE_ERROR"
  | "AT_AUTHENTICATION_ERROR"
  | "AT_SOAP_FAULT"
  | "AT_HTTP_ERROR"
  | "AT_TIMEOUT"
  | "AT_INVALID_RESPONSE"
  | "AT_UNKNOWN"
  | "AT_CONFIGURATION_ERROR";

/** Mapeia falhas de transporte para erros normalizados (sem detalhes internos). */
export function normalizeTransportError(err: unknown): AtNormalizedError {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  if (/timeout|timed out|ETIMEDOUT|abort/i.test(msg)) return "AT_TIMEOUT";
  if (/certificate|cert|UNABLE_TO_VERIFY|DEPTH_ZERO|EXPIRED|SELF_SIGNED|ssl|tls/i.test(msg)) {
    return /selfsigned|self-signed/i.test(msg) ? "AT_CERTIFICATE_ERROR" : "AT_TLS_ERROR";
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH|EPIPE/i.test(msg)) {
    return "AT_NETWORK_ERROR";
  }
  return "AT_UNKNOWN";
}
