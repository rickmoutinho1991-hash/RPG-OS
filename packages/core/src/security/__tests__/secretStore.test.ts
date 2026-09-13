/**
 * RPG-OS — Secure secret store matrix (Fase C).
 *
 * Prova: fail-closed sem backend, isolamento, revogação, expiração,
 * fake proibido em produção e zero leakage. Sem segredos reais — apenas
 * valores fictícios de teste, nunca persistidos fora do processo.
 */
import { describe, it, expect } from "vitest";
import {
  NotConfiguredSecretStore,
  SecretStoreError,
  SecretStoreNotConfiguredError,
  type SecretReference,
} from "../secureSecretStore";
import { sanitizeAuditMetadata } from "../redaction";
import { FakeSecureSecretStore } from "./fakeSecretStore";

function ref(overrides: Partial<SecretReference> = {}): SecretReference {
  return {
    secretId: "sec-001",
    provider: "AT",
    companyId: "company-a",
    environment: "TEST",
    credentialType: "AT_WFA_PASSWORD",
    ...overrides,
  };
}

describe("NotConfigured — fail-closed", () => {
  it("todas as operações falham explicitamente, sem fallback", async () => {
    const store = new NotConfiguredSecretStore();
    await expect(store.put("t", "k", "v")).rejects.toBeInstanceOf(
      SecretStoreNotConfiguredError,
    );
    await expect(store.get("t", "k")).rejects.toBeInstanceOf(
      SecretStoreNotConfiguredError,
    );
    await expect(store.delete("t", "k")).rejects.toBeInstanceOf(
      SecretStoreNotConfiguredError,
    );
    await expect(store.list("t")).rejects.toBeInstanceOf(
      SecretStoreNotConfiguredError,
    );
    await expect(store.exists("t", "k")).rejects.toBeInstanceOf(
      SecretStoreNotConfiguredError,
    );
    await expect(store.rotate("t", "k", "v2")).rejects.toBeInstanceOf(
      SecretStoreNotConfiguredError,
    );
  });

  it("códigos de erro semânticos, sem valores", () => {
    const err = new SecretStoreError("SECRET_NOT_FOUND", "x");
    expect(err.code).toBe("SECRET_NOT_FOUND");
    expect(err.message).not.toMatch(/hunter2|segredo-real/i);
    expect(new SecretStoreNotConfiguredError().code).toBe(
      "SECRET_STORE_NOT_CONFIGURED",
    );
  });
});

describe("FakeSecureSecretStore — proibido em produção", () => {
  it("construtor lança com NODE_ENV=production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => new FakeSecureSecretStore()).toThrow(SecretStoreError);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe("isolamento", () => {
  it("scope errado resolve para inexistente (fail-closed sem oráculo)", async () => {
    const store = new FakeSecureSecretStore();
    await store.putRef(ref(), "v-a");
    // Nome inclui o vínculo completo: qualquer segmento errado => null,
    // indistinguível de inexistente (sem oracle de existência).
    expect(await store.getRef(ref({ companyId: "company-b" }))).toBeNull();
    expect(await store.getRef(ref({ provider: "SIBS" }))).toBeNull();
    expect(await store.getRef(ref({ environment: "PRODUCTION" }))).toBeNull();
    expect(
      await store.getRef(ref({ credentialType: "AT_CLIENT_PRIVATE_KEY" })),
    ).toBeNull();
    // O valor legítimo continua acessível.
    expect((await store.getRef(ref()))?.reveal()).toBe("v-a");
  });

  it("tenant opaco isola por tenantId na API base", async () => {
    const store = new FakeSecureSecretStore();
    await store.put("tenant-a", "k", "v-a");
    expect(await store.get("tenant-b", "k")).toBeNull();
    expect(await store.exists("tenant-a", "k")).toBe(true);
    expect(await store.exists("tenant-a", "missing")).toBe(false);
  });
});

describe("revogação e expiração", () => {
  it("revogado → denied (retrieve e exists)", async () => {
    const store = new FakeSecureSecretStore();
    await store.putRef(ref(), "v-a");
    await store.revokeRef("sec-001");
    await expect(store.getRef(ref())).rejects.toMatchObject({
      code: "SECRET_REVOKED",
    });
  });

  it("expirado → denied", async () => {
    const store = new FakeSecureSecretStore();
    await store.putRef(ref(), "v-a");
    await store.expireRef("sec-001", new Date(Date.now() - 1000).toISOString());
    await expect(store.getRef(ref())).rejects.toMatchObject({
      code: "SECRET_EXPIRED",
    });
  });

  it("rotate substitui valor e marca rotatedAt", async () => {
    const store = new FakeSecureSecretStore();
    await store.put("t", "k", "v1");
    const meta = await store.rotate("t", "k", "v2");
    expect(meta.rotatedAt).not.toBeNull();
    expect((await store.get("t", "k"))?.reveal()).toBe("v2");
    await expect(store.rotate("t", "nope", "v")).rejects.toMatchObject({
      code: "SECRET_NOT_FOUND",
    });
  });
});

describe("zero leakage", () => {
  it("resposta nunca contém segredo (toString, JSON, metadata)", async () => {
    const store = new FakeSecureSecretStore();
    await store.putRef(ref(), "super-secreto-123");
    const got = (await store.getRef(ref()))!;
    expect(String(got)).toBe("[REDACTED]");
    expect(JSON.stringify(got)).not.toContain("super-secreto-123");
    const metas = await store.list("company-a");
    expect(JSON.stringify(metas)).not.toContain("super-secreto-123");
  });

  it("sanitizeAuditMetadata omite chaves de certificado/WFA/private key", () => {
    const out = sanitizeAuditMetadata({
      certificate_pem: "-----BEGIN CERTIFICATE-----",
      wfa_password: "s3nh4",
      privateKey: "rsa-xxx",
      provider: "AT",
    });
    expect(out).not.toHaveProperty("certificate_pem");
    expect(out).not.toHaveProperty("wfa_password");
    expect(out).not.toHaveProperty("privateKey");
    expect(out).toHaveProperty("provider", "AT");
  });

  it("Error com segredo não vaza via JSON.stringify do erro", () => {
    const err = new SecretStoreError("SECRET_BACKEND_ERROR", "falha genérica");
    expect(JSON.stringify(err)).not.toMatch(/super-secreto|hunter2/i);
    expect(err.message).not.toMatch(/super-secreto|hunter2/i);
  });
});
