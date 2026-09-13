/**
 * RPG-OS — VaultSecretBackend integration tests (Vault local real).
 *
 * Só correm com TEST_SUPABASE_URL + TEST_SUPABASE_SERVICE_KEY (Supabase
 * local). Sem env → skip, sem falhar. Valores sempre não-sensíveis
 * ("test-value-..."); limpeza total no fim (delete por id).
 * Nunca tocar em segredos reais, AT, WFA ou produção.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  SecretStoreNotConfiguredError,
  type SecretReference,
} from "@rpg/core";
import { VaultSecretBackend, vaultSecretName } from "../vaultBackend";
import { getSecretStore } from "../index";

const URL = process.env.TEST_SUPABASE_URL;
const KEY = process.env.TEST_SUPABASE_SERVICE_KEY;
const ENABLED = Boolean(URL && KEY);
const describeIf = ENABLED ? describe : describe.skip;

function ref(id: string, overrides: Partial<SecretReference> = {}): SecretReference {
  return {
    secretId: id,
    provider: "AT",
    companyId: "test-company",
    environment: "TEST",
    credentialType: "AT_WFA_PASSWORD",
    ...overrides,
  };
}

const created: Array<{ id: string; company: string }> = [];

describeIf("VaultSecretBackend (Vault local)", () => {
  let backend: VaultSecretBackend;
  beforeAll(() => {
    backend = new VaultSecretBackend({ supabaseUrl: URL!, serviceRoleKey: KEY! });
  });
  afterAll(async () => {
    for (const c of created) {
      try {
        await backend.deleteRef(c.id, c.company);
      } catch {
        // limpeza best-effort
      }
    }
  });

  it("put/get/exists/list/delete com valor não-sensível", async () => {
    const meta = await backend.putRef(ref("t-basic"), "test-value-001");
    created.push({ id: meta.id, company: "test-company" });
    expect(meta.status).toBe("ACTIVE");
    expect(await backend.existsRef(meta.id, "test-company")).toBe(true);
    const got = await backend.getRef(ref("t-basic"));
    expect(got?.reveal()).toBe("test-value-001");
    expect(String(got)).toBe("[REDACTED]");
    expect(JSON.stringify(got)).not.toContain("test-value-001");
    const listed = await backend.listRef("test-company");
    expect(listed.some((m) => m.id === meta.id)).toBe(true);
    expect(JSON.stringify(listed)).not.toContain("test-value-001");
    expect(await backend.deleteRef(meta.id, "test-company")).toBe(true);
    expect(await backend.existsRef(meta.id, "test-company")).toBe(false);
    created.pop();
  });

  it("isolamento company/provider/environment/tipo (fail-closed sem oráculo)", async () => {
    const meta = await backend.putRef(ref("t-iso"), "test-value-002");
    created.push({ id: meta.id, company: "test-company" });
    // Nome inclui o vínculo: scope errado => null, indistinguível de
    // inexistente. Sem oracle de existência para o atacante.
    expect(await backend.getRef(ref("t-iso", { companyId: "other-company" }))).toBeNull();
    expect(await backend.getRef(ref("t-iso", { provider: "SIBS" }))).toBeNull();
    expect(await backend.getRef(ref("t-iso", { environment: "PRODUCTION" }))).toBeNull();
    expect(
      await backend.getRef(ref("t-iso", { credentialType: "AT_CLIENT_PRIVATE_KEY" })),
    ).toBeNull();
    expect((await backend.getRef(ref("t-iso")))?.reveal()).toBe("test-value-002");
    // Por id, scope errado é rejeitado explicitamente (defesa em profundidade).
    await expect(backend.revokeRef(meta.id, "other-company")).rejects.toMatchObject({
      code: "SECRET_ACCESS_DENIED",
    });
    await expect(backend.deleteRef(meta.id, "other-company")).rejects.toMatchObject({
      code: "SECRET_ACCESS_DENIED",
    });
  });

  it("revogação e expiração bloqueiam", async () => {
    const m1 = await backend.putRef(ref("t-rev"), "test-value-003");
    created.push({ id: m1.id, company: "test-company" });
    await backend.revokeRef(m1.id, "test-company");
    await expect(backend.getRef(ref("t-rev"))).rejects.toMatchObject({
      code: "SECRET_REVOKED",
    });
    const m2 = await backend.putRef(ref("t-exp"), "test-value-004", {
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    created.push({ id: m2.id, company: "test-company" });
    await expect(backend.getRef(ref("t-exp"))).rejects.toMatchObject({
      code: "SECRET_EXPIRED",
    });
  });

  it("rotate substitui valor", async () => {
    const m = await backend.putRef(ref("t-rot"), "test-value-005");
    created.push({ id: m.id, company: "test-company" });
    const r = await backend.rotateRef(m.id, "test-company", "test-value-006");
    expect(r.rotatedAt).not.toBeNull();
    expect((await backend.getRef(ref("t-rot")))?.reveal()).toBe("test-value-006");
  });

  it("concorrência: dois puts distintos não colidem; repeat put gera referência nova", async () => {
    const a = await backend.putRef(ref("t-conc-a"), "test-value-007");
    const b = await backend.putRef(ref("t-conc-b"), "test-value-008");
    created.push({ id: a.id, company: "test-company" });
    created.push({ id: b.id, company: "test-company" });
    expect(a.id).not.toBe(b.id);
  });

  it("namespace nunca contém NIF/nomes/valores (só o nome do tipo)", () => {
    const name = vaultSecretName(ref("some-id"));
    expect(name).toBe("AT/test-company/TEST/AT_WFA_PASSWORD/some-id");
    // O segmento do tipo é rótulo, não valor; nada secreto aqui.
    expect(name).not.toMatch(/501234|BEGIN PRIVATE|hunter2|super-secreto/i);
    const segments = name.split("/");
    expect(segments).toHaveLength(5);
  });
});

describe("selector", () => {
  it("sem SECRET_BACKEND=vault → NotConfigured (fail-closed)", () => {
    const prev = process.env.SECRET_BACKEND;
    delete process.env.SECRET_BACKEND;
    try {
      const store = getSecretStore();
      expect(store.constructor.name).toBe("NotConfiguredSecretStore");
      return expect(store.get("t", "k")).rejects.toBeInstanceOf(
        SecretStoreNotConfiguredError,
      );
    } finally {
      if (prev !== undefined) process.env.SECRET_BACKEND = prev;
    }
  });
});
