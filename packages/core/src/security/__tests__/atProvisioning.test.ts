/**
 * RPG-OS — testes de provisioning AT TEST (D21.5).
 * Lógica pura: validação de material + gate. Sem I/O, sem rede.
 * Valores abaixo são fictícios e claramente marcados como tal.
 */
import { describe, expect, it } from "vitest";
import {
  PROVISION_REF_COLUMNS,
  resolveProvisionGate,
  validateProvisionMaterial,
} from "../atProvisioning";

const FAKE_CERT = `-----BEGIN CERTIFICATE-----
VEVTVC1GSUNUSVRJT1VTLU5PVC1BLVJFQUwtQ0VSVA==
-----END CERTIFICATE-----`;
const FAKE_KEY = `-----BEGIN PRIVATE KEY-----
VEVTVC1GSUNUSVRJT1VTLU5PVC1BLVJFQUwtS0VZ
-----END PRIVATE KEY-----`;

function material(over: Record<string, unknown> = {}) {
  return {
    wfaUsername: "000000000/9-TEST-FICTITIOUS",
    wfaPassword: "test-fictitious-only",
    certificatePem: FAKE_CERT,
    privateKeyPem: FAKE_KEY,
    chainPem: null,
    ...over,
  };
}

describe("D21.5 validateProvisionMaterial", () => {
  it("material vazio → erros sanitizados, sem valores no output", () => {
    const r = validateProvisionMaterial(material({ wfaUsername: "  ", wfaPassword: "" }));
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("WFA_USERNAME_EMPTY");
    expect(r.errors).toContain("WFA_PASSWORD_EMPTY");
    expect(JSON.stringify(r)).not.toContain("fictitious");
  });

  it("PEM inválido → FORMAT, sem ecoar conteúdo", () => {
    const r = validateProvisionMaterial(material({ certificatePem: "not-a-pem", privateKeyPem: "nope" }));
    expect(r.errors).toContain("CERTIFICATE_INVALID_FORMAT");
    expect(r.errors).toContain("PRIVATE_KEY_INVALID_FORMAT");
    expect(JSON.stringify(r)).not.toContain("not-a-pem");
  });

  it("cert/key não correspondentes → MISMATCH", () => {
    const r = validateProvisionMaterial(material());
    expect(r.errors).toContain("CERTIFICATE_KEY_MISMATCH");
  });

  it("chain inválida quando fornecida → CHAIN_INVALID_FORMAT; null → ok parcial", () => {
    const bad = validateProvisionMaterial(material({ chainPem: "garbage" }));
    expect(bad.errors).toContain("CHAIN_INVALID_FORMAT");
    const none = validateProvisionMaterial(material({ chainPem: null }));
    expect(none.errors).not.toContain("CHAIN_INVALID_FORMAT");
  });
});

describe("D21.5 resolveProvisionGate", () => {
  const base = {
    authorized: true,
    actorCompanyId: "c1",
    connectionCompanyId: "c1",
    environment: "TEST",
    revoked: false,
  };
  it("TEST + própria company → allowed", () => {
    expect(resolveProvisionGate(base)).toEqual({ allowed: true, reason: null });
  });
  it("outra company → FORBIDDEN", () => {
    expect(resolveProvisionGate({ ...base, connectionCompanyId: "c2" }).reason).toBe("FORBIDDEN");
  });
  it("sem autorização → FORBIDDEN", () => {
    expect(resolveProvisionGate({ ...base, authorized: false }).reason).toBe("FORBIDDEN");
  });
  it.each(["PRODUCTION", "PROD", undefined, null, ""])("ambiente %p → INVALID_ENVIRONMENT", (environment) => {
    expect(resolveProvisionGate({ ...base, environment }).reason).toBe("INVALID_ENVIRONMENT");
  });
  it("revogada → REVOKED", () => {
    expect(resolveProvisionGate({ ...base, revoked: true }).reason).toBe("REVOKED");
  });
});

describe("D21.5 PROVISION_REF_COLUMNS usa schema real", () => {
  it("colunas = at_connections reais; chain opcional", () => {
    expect(PROVISION_REF_COLUMNS.wfaUsername.column).toBe("wfa_user_secret_ref");
    expect(PROVISION_REF_COLUMNS.wfaPassword.column).toBe("wfa_pass_secret_ref");
    expect(PROVISION_REF_COLUMNS.certificate.column).toBe("cert_secret_ref");
    expect(PROVISION_REF_COLUMNS.privateKey.column).toBe("key_secret_ref");
    expect(PROVISION_REF_COLUMNS.chain.column).toBe("chain_secret_ref");
    expect(PROVISION_REF_COLUMNS.chain.required).toBe(false);
  });
});
