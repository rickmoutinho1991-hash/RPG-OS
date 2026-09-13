/**
 * RPG-OS — testes do readiness gate AT TEST (D12).
 * Função pura: metadata booleana → READY/BLOCKED. Sem I/O, sem rede, sem segredos.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateAtTestReadiness,
  type AtTestReadinessInput,
} from "../atReadiness";

function complete(): AtTestReadinessInput {
  return {
    environment: "TEST",
    connectionConfigured: true,
    credentialRefConfigured: true,
    certificateRefConfigured: true,
    privateKeyRefConfigured: true,
    endpointAllowed: true,
    consentActive: true,
    authorized: true,
    testGateEnabled: true,
  };
}

describe("D12 readiness gate", () => {
  it("metadata TEST completa → READY sem razões", () => {
    expect(evaluateAtTestReadiness(complete())).toEqual({ status: "READY", reasons: [] });
  });

  it("sem conexão → BLOCKED MISSING_CONNECTION", () => {
    const r = evaluateAtTestReadiness({ ...complete(), connectionConfigured: false });
    expect(r.status).toBe("BLOCKED");
    expect(r.reasons).toContain("MISSING_CONNECTION");
  });

  it("sem ref de credencial → BLOCKED MISSING_CREDENTIAL_REFERENCE", () => {
    const r = evaluateAtTestReadiness({ ...complete(), credentialRefConfigured: false });
    expect(r.status).toBe("BLOCKED");
    expect(r.reasons).toContain("MISSING_CREDENTIAL_REFERENCE");
  });

  it("sem ref de certificado → BLOCKED MISSING_CERTIFICATE_REFERENCE", () => {
    const r = evaluateAtTestReadiness({ ...complete(), certificateRefConfigured: false });
    expect(r.status).toBe("BLOCKED");
    expect(r.reasons).toContain("MISSING_CERTIFICATE_REFERENCE");
  });

  it("sem ref de chave privada → BLOCKED MISSING_PRIVATE_KEY_REFERENCE", () => {
    const r = evaluateAtTestReadiness({ ...complete(), privateKeyRefConfigured: false });
    expect(r.status).toBe("BLOCKED");
    expect(r.reasons).toContain("MISSING_PRIVATE_KEY_REFERENCE");
  });

  it.each(["PRODUCTION", "PROD", "production", "test", "", undefined, null, 123, {}])(
    "ambiente %p → BLOCKED INVALID_ENVIRONMENT (produção nunca READY)",
    (environment) => {
      const r = evaluateAtTestReadiness({ ...complete(), environment });
      expect(r.status).toBe("BLOCKED");
      expect(r.reasons).toContain("INVALID_ENVIRONMENT");
    },
  );

  it("endpoint fora da allowlist → BLOCKED ENDPOINT_NOT_ALLOWED", () => {
    const r = evaluateAtTestReadiness({ ...complete(), endpointAllowed: false });
    expect(r.status).toBe("BLOCKED");
    expect(r.reasons).toContain("ENDPOINT_NOT_ALLOWED");
  });

  it("consentimento em falta → BLOCKED CONSENT_REQUIRED", () => {
    const r = evaluateAtTestReadiness({ ...complete(), consentActive: false });
    expect(r.status).toBe("BLOCKED");
    expect(r.reasons).toContain("CONSENT_REQUIRED");
  });

  it("sem autorização → BLOCKED AUTHORIZATION_REQUIRED", () => {
    const r = evaluateAtTestReadiness({ ...complete(), authorized: false });
    expect(r.status).toBe("BLOCKED");
    expect(r.reasons).toContain("AUTHORIZATION_REQUIRED");
  });

  it("test gate desligado → BLOCKED TEST_GATE_DISABLED", () => {
    const r = evaluateAtTestReadiness({ ...complete(), testGateEnabled: false });
    expect(r.status).toBe("BLOCKED");
    expect(r.reasons).toContain("TEST_GATE_DISABLED");
  });

  it("output nunca contém segredos — só status e razões de um vocabulário fechado", () => {
    const r = evaluateAtTestReadiness({
      environment: "PRODUCTION",
      connectionConfigured: false,
      credentialRefConfigured: false,
      certificateRefConfigured: false,
      privateKeyRefConfigured: false,
      endpointAllowed: false,
      consentActive: false,
      authorized: false,
      testGateEnabled: false,
    });
    const raw = JSON.stringify(r);
    for (const forbidden of ["BEGIN PRIVATE", "BEGIN CERTIFICATE", "test-password", "dummy-", "bearer ", "password="]) {
      expect(raw.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
