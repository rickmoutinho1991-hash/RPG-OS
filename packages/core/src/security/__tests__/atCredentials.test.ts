/**
 * RPG-OS — AT credential infrastructure tests (lógica pura, sem rede/AT).
 *
 * Estados, expiração, matching chave-certificado (chaves efémeras geradas
 * com CSPRNG nativo — nunca credenciais reais), erros sem segredos.
 */
import { describe, it, expect } from "vitest";
import {
  AtCredentialError,
  certificateMatchesPrivateKey,
  generateEphemeralKeyPair,
  jwkThumbprint,
  resolveAtConnectionState,
  resolveAtCredentialState,
} from "../atCredentials";

const ALL = {
  certificate: true,
  privateKey: true,
  chain: true,
  wfaUsername: true,
  wfaPassword: true,
};
const NONE = {
  certificate: false,
  privateKey: false,
  chain: false,
  wfaUsername: false,
  wfaPassword: false,
};
const FUTURE = new Date(Date.now() + 86400_000).toISOString();
const PAST = new Date(Date.now() - 86400_000).toISOString();

describe("resolveAtCredentialState", () => {
  it("vazio → MISSING; parcial → PARTIAL; completo válido → READY", () => {
    expect(resolveAtCredentialState(NONE, { certNotAfter: null, revoked: false })).toBe("MISSING");
    expect(
      resolveAtCredentialState({ ...NONE, certificate: true }, { certNotAfter: null, revoked: false }),
    ).toBe("PARTIAL");
    expect(resolveAtCredentialState(ALL, { certNotAfter: FUTURE, revoked: false })).toBe("READY");
  });

  it("revogado → REVOKED; expirado → EXPIRED", () => {
    expect(resolveAtCredentialState(ALL, { certNotAfter: FUTURE, revoked: true })).toBe("REVOKED");
    expect(resolveAtCredentialState(ALL, { certNotAfter: PAST, revoked: false })).toBe("EXPIRED");
  });
});

describe("resolveAtConnectionState", () => {
  it("READY de credenciais nunca vira ACTIVE sozinho", () => {
    expect(
      resolveAtConnectionState({ revoked: false, invalid: false, credentialState: "READY" }),
    ).toBe("READY");
  });

  it("revogado/inválido dominam; PENDING/EXPIRED mapeiam", () => {
    expect(
      resolveAtConnectionState({ revoked: true, invalid: false, credentialState: "READY" }),
    ).toBe("REVOKED");
    expect(
      resolveAtConnectionState({ revoked: false, invalid: true, credentialState: "READY" }),
    ).toBe("INVALID");
    expect(
      resolveAtConnectionState({ revoked: false, invalid: false, credentialState: "MISSING" }),
    ).toBe("CREDENTIALS_PENDING");
    expect(
      resolveAtConnectionState({ revoked: false, invalid: false, credentialState: "EXPIRED" }),
    ).toBe("EXPIRED");
  });
});

describe("crypto primitives (CSPRNG nativo)", () => {
  it("duas gerações diferem; mesma chave tem thumbprint estável", () => {
    const a = generateEphemeralKeyPair();
    const b = generateEphemeralKeyPair();
    expect(a.privateKeyPem).not.toBe(b.privateKeyPem);
    expect(jwkThumbprint(a.publicKeyPem)).toBe(jwkThumbprint(a.publicKeyPem));
    expect(jwkThumbprint(a.publicKeyPem)).not.toBe(jwkThumbprint(b.publicKeyPem));
  });

  it("material inválido lança sem expor conteúdo", () => {
    expect(() => certificateMatchesPrivateKey("não-pem", "também-não")).toThrow(AtCredentialError);
    try {
      certificateMatchesPrivateKey("x", "y");
    } catch (err) {
      expect(err).toBeInstanceOf(AtCredentialError);
      expect((err as Error).message).not.toMatch(/não-pem|também-não/);
      expect((err as AtCredentialError).code).toBe("AT_CERTIFICATE_INVALID");
    }
  });
});
