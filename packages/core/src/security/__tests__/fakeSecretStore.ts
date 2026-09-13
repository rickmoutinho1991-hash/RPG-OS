/**
 * RPG-OS — FakeSecureSecretStore (TEST ONLY, in-memory).
 *
 * NUNCA usar em produção: o construtor lança com NODE_ENV=production.
 * Nunca escreve em disco, nunca lê environment real, nunca sai do processo.
 * Existe apenas para provar isolamento (provider/company/environment),
 * revogação, expiração e leakage — sem backend real.
 */
import {
  SecretStoreError,
  type SecretCredentialType,
  type SecretEnvironment,
  type SecretMetadata,
  type SecretReference,
  type SecureSecret,
  type SecureSecretStore,
} from "../secureSecretStore";

interface Entry {
  value: string;
  provider: string;
  companyId: string;
  environment: SecretEnvironment;
  credentialType: SecretCredentialType;
  status: "ACTIVE" | "REVOKED";
  expiresAt: string | null;
  createdAt: string;
  rotatedAt: string | null;
}

function memSecret(id: string, value: string): SecureSecret {
  return {
    id,
    reveal: () => value,
    toString: () => "[REDACTED]",
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export class FakeSecureSecretStore implements SecureSecretStore {
  private readonly entries = new Map<string, Entry>();

  constructor() {
    if (process.env.NODE_ENV === "production") {
      throw new SecretStoreError(
        "SECRET_BACKEND_ERROR",
        "FakeSecureSecretStore é proibido em produção.",
      );
    }
  }

  private static checkValue(value: string): void {
    if (typeof value !== "string" || value.length === 0) {
      throw new SecretStoreError("SECRET_INVALID", "Valor de segredo inválido.");
    }
  }

  private static toMeta(id: string, tenantId: string, e: Entry): SecretMetadata {
    return {
      id,
      tenantId,
      key: id,
      createdAt: e.createdAt,
      rotatedAt: e.rotatedAt,
      expiresAt: e.expiresAt,
      status: e.status,
    };
  }

  private static usable(e: Entry): SecretStoreError | null {
    if (e.status !== "ACTIVE") {
      return new SecretStoreError("SECRET_REVOKED", "Segredo revogado.");
    }
    if (e.expiresAt && new Date(e.expiresAt).getTime() <= Date.now()) {
      return new SecretStoreError("SECRET_EXPIRED", "Segredo expirado.");
    }
    return null;
  }

  private static refKey(ref: SecretReference): string {
    // Chave inclui o vínculo completo: scope errado => nome inexistente => null.
    return `${ref.provider}‖${ref.companyId}‖${ref.environment}‖${ref.credentialType}‖${ref.secretId}`;
  }

  /** API ligada a referência (provider/company/environment) — usada nos testes. */
  async putRef(ref: SecretReference, value: string): Promise<SecretMetadata> {
    FakeSecureSecretStore.checkValue(value);
    const t = nowIso();
    this.entries.set(FakeSecureSecretStore.refKey(ref), {
      value,
      provider: ref.provider,
      companyId: ref.companyId,
      environment: ref.environment,
      credentialType: ref.credentialType,
      status: "ACTIVE",
      expiresAt: null,
      createdAt: t,
      rotatedAt: null,
    });
    return FakeSecureSecretStore.toMeta(ref.secretId, ref.companyId, this.entries.get(FakeSecureSecretStore.refKey(ref))!);
  }

  async getRef(ref: SecretReference): Promise<SecureSecret | null> {
    // Fail-closed sem oráculo: scope errado resolve para nome inexistente.
    const e = this.entries.get(FakeSecureSecretStore.refKey(ref));
    if (!e) return null;
    // Defesa em profundidade contra metadata adulterada fora de banda.
    if (
      e.provider !== ref.provider ||
      e.companyId !== ref.companyId ||
      e.environment !== ref.environment ||
      e.credentialType !== ref.credentialType
    ) {
      throw new SecretStoreError("SECRET_ACCESS_DENIED", "Referência fora do scope.");
    }
    const blocked = FakeSecureSecretStore.usable(e);
    if (blocked) throw blocked;
    return memSecret(ref.secretId, e.value);
  }

  async getSecretById(secretId: string, companyId: string): Promise<SecureSecret | null> {
    const e = this.findBySecretId(secretId);
    if (!e) return null;
    if (e.companyId !== companyId) {
      throw new SecretStoreError("SECRET_ACCESS_DENIED", "Referência fora do scope.");
    }
    const blocked = FakeSecureSecretStore.usable(e);
    if (blocked) throw blocked;
    return memSecret(secretId, e.value);
  }

  private findBySecretId(secretId: string): Entry | undefined {
    for (const [k, e] of this.entries) {
      if (k.endsWith(`‖${secretId}`)) return e;
    }
    return undefined;
  }

  async revokeRef(secretId: string): Promise<void> {
    const e = this.findBySecretId(secretId);
    if (e) e.status = "REVOKED";
  }

  async expireRef(secretId: string, expiresAt: string): Promise<void> {
    const e = this.findBySecretId(secretId);
    if (e) e.expiresAt = expiresAt;
  }

  // --- Interface base (tenant opaco) delegada para chaves simples ---

  async put(tenantId: string, key: string, value: string): Promise<SecretMetadata> {
    FakeSecureSecretStore.checkValue(value);
    const t = nowIso();
    this.entries.set(`${tenantId}‖${key}`, {
      value,
      provider: "",
      companyId: tenantId,
      environment: "TEST",
      credentialType: "AT_WFA_PASSWORD",
      status: "ACTIVE",
      expiresAt: null,
      createdAt: t,
      rotatedAt: null,
    });
    return FakeSecureSecretStore.toMeta(key, tenantId, this.entries.get(`${tenantId}‖${key}`)!);
  }

  async get(tenantId: string, key: string): Promise<SecureSecret | null> {
    const e = this.entries.get(`${tenantId}‖${key}`);
    if (!e) return null;
    const blocked = FakeSecureSecretStore.usable(e);
    if (blocked) throw blocked;
    return memSecret(key, e.value);
  }

  async delete(tenantId: string, key: string): Promise<boolean> {
    return this.entries.delete(`${tenantId}‖${key}`);
  }

  async list(tenantId: string): Promise<SecretMetadata[]> {
    const out: SecretMetadata[] = [];
    for (const [k, e] of this.entries) {
      if (k.startsWith(`${tenantId}‖`)) {
        out.push(FakeSecureSecretStore.toMeta(k.slice(tenantId.length + 1), tenantId, e));
      }
    }
    return out;
  }

  async exists(tenantId: string, key: string): Promise<boolean> {
    const e = this.entries.get(`${tenantId}‖${key}`);
    if (!e) return false;
    return FakeSecureSecretStore.usable(e) === null;
  }

  async rotate(tenantId: string, key: string, value: string): Promise<SecretMetadata> {
    FakeSecureSecretStore.checkValue(value);
    const e = this.entries.get(`${tenantId}‖${key}`);
    if (!e) {
      throw new SecretStoreError("SECRET_NOT_FOUND", "Segredo inexistente.");
    }
    e.value = value;
    e.rotatedAt = nowIso();
    e.status = "ACTIVE";
    return FakeSecureSecretStore.toMeta(key, tenantId, e);
  }
}
