/**
 * RPG-OS — AT credential infrastructure (lógica pura, sem I/O, sem rede).
 *
 * Estados de credenciais/conexão, erros AT e primitivas criptográficas com
 * Node.js crypto (madura, nativa): comparação de chaves por thumbprint JWK
 * (RFC 7638) e validade temporal. Sem geração de CSR (requer PKCS#10 —
 * bloqueador documentado), sem certificados reais, sem chamadas AT.
 */
import { createHash, createPublicKey, generateKeyPairSync, X509Certificate } from "node:crypto";

/** Estado agregado das credenciais (nunca confundir com conectividade). */
export type AtCredentialState =
  | "MISSING"
  | "PARTIAL"
  | "READY"
  | "EXPIRED"
  | "REVOKED"
  | "INVALID";

export interface AtCredentialPresence {
  certificate: boolean;
  privateKey: boolean;
  chain: boolean;
  wfaUsername: boolean;
  wfaPassword: boolean;
}

export interface AtCredentialExpiry {
  /** notAfter do certificado (ISO) ou null se desconhecido. */
  certNotAfter: string | null;
  revoked: boolean;
  nowIso?: string;
}

/** Erros AT normalizados (sem segredos nas mensagens). */
export type AtErrorCode =
  | "AT_CONNECTION_NOT_FOUND"
  | "AT_CONNECTION_REVOKED"
  | "AT_CREDENTIALS_MISSING"
  | "AT_CREDENTIALS_PARTIAL"
  | "AT_CREDENTIALS_EXPIRED"
  | "AT_CERTIFICATE_INVALID"
  | "AT_CERTIFICATE_KEY_MISMATCH"
  | "AT_WFA_MISSING"
  | "AT_CONSENT_REQUIRED"
  | "AT_UNAUTHORIZED"
  | "AT_ENVIRONMENT_MISMATCH"
  | "AT_PROVIDER_MISMATCH";

export class AtCredentialError extends Error {
  readonly code: AtErrorCode;
  constructor(code: AtErrorCode, message: string) {
    super(message);
    this.name = "AtCredentialError";
    this.code = code;
  }
}

/**
 * Resolve estado agregado das credenciais a partir de presença + validade.
 * READY exige os 5 materiais presentes, não revogados e certificado válido.
 */
export function resolveAtCredentialState(
  present: AtCredentialPresence,
  expiry: AtCredentialExpiry,
): AtCredentialState {
  if (expiry.revoked) return "REVOKED";
  const allPresent =
    present.certificate &&
    present.privateKey &&
    present.chain &&
    present.wfaUsername &&
    present.wfaPassword;
  if (!present.certificate && !present.privateKey && !present.chain && !present.wfaUsername && !present.wfaPassword) {
    return "MISSING";
  }
  if (!allPresent) return "PARTIAL";
  if (expiry.certNotAfter && new Date(expiry.certNotAfter).getTime() <= Date.now()) {
    return "EXPIRED";
  }
  return "READY";
}

/** Estados de conexão (conectividade real só em D4; nunca derivar de credenciais). */
export type AtConnectionState =
  | "NOT_CONNECTED"
  | "CREDENTIALS_PENDING"
  | "READY"
  | "ACTIVE"
  | "REVOKED"
  | "INVALID"
  | "EXPIRED";

/**
 * Estado de conexão derivado APENAS de estado administrativo + credenciais.
 * READY aqui significa "credenciais prontas", nunca "AT ligado".
 */
export function resolveAtConnectionState(input: {
  revoked: boolean;
  invalid: boolean;
  credentialState: AtCredentialState;
}): AtConnectionState {
  if (input.revoked) return "REVOKED";
  if (input.invalid) return "INVALID";
  switch (input.credentialState) {
    case "MISSING":
    case "PARTIAL":
      return "CREDENTIALS_PENDING";
    case "READY":
      return "READY";
    case "EXPIRED":
      return "EXPIRED";
    case "REVOKED":
      return "REVOKED";
    default:
      return "CREDENTIALS_PENDING";
  }
}

/** Verifica se par PEM representa a mesma chave (thumbprint JWK SHA-256). */
export function jwkThumbprint(publicKeyPem: string): string {
  const key = createPublicKey(publicKeyPem);
  const jwk = key.export({ format: "jwk" });
  const ordered: Record<string, string> = {};
  for (const k of Object.keys(jwk).sort()) {
    const v = (jwk as Record<string, unknown>)[k];
    if (typeof v === "string") ordered[k] = v;
  }
  return createHash("sha256").update(JSON.stringify(ordered)).digest("base64url");
}

/**
 * Confirma que certificado e chave privada correspondem (via chaves públicas).
 * Lança AtCredentialError em material inválido — nunca expõe o material.
 */
export function certificateMatchesPrivateKey(certificatePem: string, privateKeyPem: string): boolean {
  let certKey: string;
  let privKey: string;
  try {
    // Certificado: extrair chave pública via X509 (parse nativo, sem verificação de cadeia).
    const x509 = new X509Certificate(certificatePem);
    certKey = jwkThumbprint(x509.publicKey.export({ type: "spki", format: "pem" }) as unknown as string);
    const priv = createPublicKey({ key: privateKeyPem, format: "pem" });
    privKey = jwkThumbprint(priv.export({ type: "spki", format: "pem" }) as unknown as string);
  } catch {
    throw new AtCredentialError("AT_CERTIFICATE_INVALID", "Material de certificado inválido.");
  }
  return certKey === privKey;
}

/** Gera par de chaves efémero SEGURO (testes/mecânica futura) — nunca AT real. */
export function generateEphemeralKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem", cipher: undefined },
  });
  return {
    publicKeyPem: publicKey as unknown as string,
    privateKeyPem: privateKey as unknown as string,
  };
}
