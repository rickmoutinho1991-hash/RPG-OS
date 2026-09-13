import { describe, expect, it } from "vitest";
import {
  evaluateRetention,
  findRetentionPolicy,
  DEFAULT_RETENTION_POLICIES,
} from "../retention";
import {
  NotConfiguredSecretStore,
  SecretStoreNotConfiguredError,
} from "../secureSecretStore";

describe("retention", () => {
  it("define políticas base para categorias críticas", () => {
    const categories = DEFAULT_RETENTION_POLICIES.map((p) => p.dataCategory);
    expect(categories).toContain("audit_logs");
    expect(categories).toContain("fiscal_documents");
    expect(categories).toContain("integrity_ledger");
  });

  it("não elegível antes do prazo", () => {
    const policy = findRetentionPolicy("audit_logs")!;
    const out = evaluateRetention(policy, "2026-01-01T00:00:00.000Z", new Date("2026-06-01T00:00:00.000Z"));
    expect(out.eligibleForAction).toBe(false);
    expect(out.recommendedAction).toBeNull();
  });

  it("elegível após o prazo com ação recomendada", () => {
    const policy = findRetentionPolicy("audit_logs")!; // 12 meses → DELETE
    const out = evaluateRetention(policy, "2024-01-01T00:00:00.000Z", new Date("2026-06-01T00:00:00.000Z"));
    expect(out.eligibleForAction).toBe(true);
    expect(out.recommendedAction).toBe("DELETE");
  });

  it("fiscal documents retêm 10 anos com REVIEW", () => {
    const policy = findRetentionPolicy("fiscal_documents")!;
    expect(policy.retentionMonths).toBe(120);
    const out = evaluateRetention(policy, "2015-01-01T00:00:00.000Z", new Date("2026-06-01T00:00:00.000Z"));
    expect(out.eligibleForAction).toBe(true);
    expect(out.recommendedAction).toBe("REVIEW");
  });

  it("categoria desconhecida devolve null", () => {
    expect(findRetentionPolicy("inexistente")).toBeNull();
  });

  it("avaliação é pura (determinística com now fixo)", () => {
    const policy = findRetentionPolicy("audit_logs")!;
    const a = evaluateRetention(policy, "2024-01-01T00:00:00.000Z", new Date("2026-06-01T00:00:00.000Z"));
    const b = evaluateRetention(policy, "2024-01-01T00:00:00.000Z", new Date("2026-06-01T00:00:00.000Z"));
    expect(a).toEqual(b);
  });
});

describe("SecureSecretStore", () => {
  it("implementação não configurada falha explicitamente em todas as operações", async () => {
    const store = new NotConfiguredSecretStore();
    const anyStore = store as unknown as {
      put: (...a: unknown[]) => Promise<unknown>;
      get: (...a: unknown[]) => Promise<unknown>;
      delete: (...a: unknown[]) => Promise<unknown>;
      list: (...a: unknown[]) => Promise<unknown>;
    };
    await expect(anyStore.put("tenant", "key", "value")).rejects.toBeInstanceOf(
      SecretStoreNotConfiguredError,
    );
    await expect(anyStore.get("tenant", "key")).rejects.toBeInstanceOf(
      SecretStoreNotConfiguredError,
    );
    await expect(anyStore.delete("tenant", "key")).rejects.toBeInstanceOf(
      SecretStoreNotConfiguredError,
    );
    await expect(anyStore.list("tenant")).rejects.toBeInstanceOf(
      SecretStoreNotConfiguredError,
    );
  });

  it("erro explica que segredos nunca ficam em texto simples", () => {
    const err = new SecretStoreNotConfiguredError();
    expect(err.message).toContain("texto simples");
  });
});
