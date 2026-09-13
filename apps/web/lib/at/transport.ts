/**
 * RPG-OS — AT SOAP transport (server-side only, mTLS estrito).
 *
 * node:https com certificado cliente em memória. TLS SEMPRE validado
 * (rejectUnauthorized hardcoded true — sem toggle, sem env override).
 * Timeout finito; correlation ID em logs/audit (sem segredos, sem bodies).
 */
import https from "node:https";
import { randomUUID } from "node:crypto";
import { normalizeTransportError, type AtNormalizedError } from "./soap";

export interface AtTlsMaterial {
  certPem: string;
  keyPem: string;
  caPem?: string;
}

export interface AtTransportRequest {
  url: string;
  envelopeXml: string;
  tls: AtTlsMaterial;
  timeoutMs?: number;
}

export interface AtTransportSuccess {
  ok: true;
  httpStatus: number;
  bodyXml: string;
  durationMs: number;
  correlationId: string;
}

export interface AtTransportFailure {
  ok: false;
  error: AtNormalizedError | "AT_HTTP_ERROR";
  httpStatus?: number;
  durationMs: number;
  correlationId: string;
}

export type AtTransportResult = AtTransportSuccess | AtTransportFailure;

export type AtHttpPost = (req: AtTransportRequest & { correlationId: string }) => Promise<{
  httpStatus: number;
  bodyXml: string;
  durationMs: number;
}>;

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function realHttpPost(req: AtTransportRequest & { correlationId: string }): Promise<{
  httpStatus: number;
  bodyXml: string;
  durationMs: number;
}> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const target = new URL(req.url);
    const body = Buffer.from(req.envelopeXml, "utf8");
    const attempt = https.request(
      {
        hostname: target.hostname,
        port: Number(target.port) || 443,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "Content-Length": body.length,
        },
        cert: req.tls.certPem,
        key: req.tls.keyPem,
        ca: req.tls.caPem,
        // Segurança absoluta: validação TLS sempre ligada, sem override.
        rejectUnauthorized: true,
        timeout: req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BODY_BYTES) {
            res.destroy(new Error("AT response too large"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          resolve({
            httpStatus: res.statusCode ?? 0,
            bodyXml: Buffer.concat(chunks).toString("utf8"),
            durationMs: Date.now() - started,
          });
        });
      },
    );
    attempt.on("timeout", () => attempt.destroy(new Error("AT_TIMEOUT")));
    attempt.on("error", (err) => reject(err));
    attempt.write(body);
    attempt.end();
  });
}

/**
 * Envia envelope SOAP. httpPost injetável apenas para testes unitários
 * (parser/erros/timeout); produção usa sempre realHttpPost.
 */
export async function sendAtSoap(
  req: AtTransportRequest,
  opts?: { httpPost?: AtHttpPost },
): Promise<AtTransportResult> {
  const correlationId = randomUUID();
  const started = Date.now();
  try {
    const post = opts?.httpPost ?? realHttpPost;
    const res = await post({ ...req, correlationId });
    if (res.httpStatus < 200 || res.httpStatus >= 300) {
      return {
        ok: false,
        error: "AT_HTTP_ERROR",
        httpStatus: res.httpStatus,
        durationMs: Date.now() - started,
        correlationId,
      };
    }
    return { ...res, ok: true as const, correlationId };
  } catch (err) {
    return {
      ok: false,
      error: normalizeTransportError(err),
      durationMs: Date.now() - started,
      correlationId,
    };
  }
}
