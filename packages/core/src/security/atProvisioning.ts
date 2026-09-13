/**
 * RPG-OS — AT TEST credential provisioning (lógica pura, sem I/O, sem rede).
 *
 * Validação de material + gate de autorização para a server action de
 * provisioning. Valores nunca saem daqui para logs/audit/respostas — só
 * booleanos e códigos sanitizados. Nomes de colunas = schema real
 * `at_connections` (cert/key/chain/wfa_user/wfa_pass *_secret_ref).
 */
import type { SecretCredentialType } from "./secureSecretStore";
import { AtCredentialError, certificateMatchesPrivateKey } from "./atCredentials";

/** Tipos de material provisionável (sem valores, só chaves). */
export type AtProvisionKind =
  | "wfaUsername"
  | "wfaPassword"
  | "certificate"
  | "privateKey"
  | "chain";

/** Coluna real + tipo Vault por kind. Chain é opcional. */
export const PROVISION_REF_COLUMNS: Record<
  AtProvisionKind,
  { column: string; credentialType: SecretCredentialType; required: boolean }
> = {
  wfaUsername: {
    column: "wfa_user_secret_ref",
    credentialType: "AT_WFA_USERNAME",
    required: true,
  },
  wfaPassword: {
    column: "wfa_pass_secret_ref",
    credentialType: "AT_WFA_PASSWORD",
    required: true,
  },
  certificate: {
    column: "cert_secret_ref",
    credentialType: "AT_CLIENT_CERTIFICATE",
    required: true,
  },
  privateKey: {
    column: "key_secret_ref",
    credentialType: "AT_CLIENT_PRIVATE_KEY",
    required: true,
  },
  chain: {
    column: "chain_secret_ref",
    credentialType: "AT_CERTIFICATE_CHAIN",
    required: false,
  },
};

export interface AtProvisionMaterial {
  wfaUsername: string;
  wfaPassword: string;
  certificatePem: string;
  privateKeyPem: string;
  /** Cadeia CA (opcional quando a AT não a fornece). */
  chainPem: string | null;
}

export type AtProvisionError =
  | "WFA_USERNAME_EMPTY"
  | "WFA_PASSWORD_EMPTY"
  | "CERTIFICATE_INVALID_FORMAT"
  | "PRIVATE_KEY_INVALID_FORMAT"
  | "CERTIFICATE_KEY_MISMATCH"
  | "CHAIN_INVALID_FORMAT";

function isPem(value: string, label: "CERTIFICATE" | "PRIVATE KEY"): boolean {
  const t = value.trim();
  if (label === "CERTIFICATE") {
    return (
      t.includes("-----BEGIN CERTIFICATE-----") &&
      t.includes("-----END CERTIFICATE-----")
    );
  }
  return (
    t.includes("-----BEGIN") &&
    t.includes("PRIVATE KEY-----") &&
    t.includes("-----END")
  );
}

/**
 * Valida material em memória. Nunca loga nem devolve valores —
 * só códigos de erro sanitizados.
 */
export function validateProvisionMaterial(
  material: AtProvisionMaterial,
): { ok: boolean; errors: AtProvisionError[] } {
  const errors: AtProvisionError[] = [];
  if (!material.wfaUsername || material.wfaUsername.trim().length === 0) {
    errors.push("WFA_USERNAME_EMPTY");
  }
  if (!material.wfaPassword || material.wfaPassword.length === 0) {
    errors.push("WFA_PASSWORD_EMPTY");
  }
  const certOk = isPem(material.certificatePem ?? "", "CERTIFICATE");
  if (!certOk) errors.push("CERTIFICATE_INVALID_FORMAT");
  const keyOk = isPem(material.privateKeyPem ?? "", "PRIVATE KEY");
  if (!keyOk) errors.push("PRIVATE_KEY_INVALID_FORMAT");
  if (certOk && keyOk) {
    try {
      if (
        !certificateMatchesPrivateKey(
          material.certificatePem,
          material.privateKeyPem,
        )
      ) {
        errors.push("CERTIFICATE_KEY_MISMATCH");
      }
    } catch (err) {
      if (err instanceof AtCredentialError) {
        errors.push("CERTIFICATE_KEY_MISMATCH");
      } else {
        errors.push("CERTIFICATE_INVALID_FORMAT");
      }
    }
  }
  if (
    material.chainPem !== null &&
    material.chainPem !== "" &&
    !isPem(material.chainPem, "CERTIFICATE")
  ) {
    errors.push("CHAIN_INVALID_FORMAT");
  }
  return { ok: errors.length === 0, errors };
}

export type AtProvisionGateReason =
  | "FORBIDDEN"
  | "INVALID_ENVIRONMENT"
  | "REVOKED";

/**
 * Gate puro pré-Vault: autorização + tenant + TEST-only + não revogada.
 * Qualquer falha → nenhum write no Vault, nenhuma rede.
 */
export function resolveProvisionGate(input: {
  authorized: boolean;
  actorCompanyId: string | null;
  connectionCompanyId: string | null;
  environment: unknown;
  revoked: boolean;
}): { allowed: boolean; reason: AtProvisionGateReason | null } {
  if (
    !input.authorized ||
    !input.actorCompanyId ||
    !input.connectionCompanyId ||
    input.actorCompanyId !== input.connectionCompanyId
  ) {
    return { allowed: false, reason: "FORBIDDEN" };
  }
  if (input.environment !== "TEST") {
    return { allowed: false, reason: "INVALID_ENVIRONMENT" };
  }
  if (input.revoked) {
    return { allowed: false, reason: "REVOKED" };
  }
  return { allowed: true, reason: null };
}
