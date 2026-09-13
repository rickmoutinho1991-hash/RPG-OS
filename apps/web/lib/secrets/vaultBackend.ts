/**
 * RPG-OS — VaultSecretBackend (server-side only).
 *
 * Implementa SecureSecretStore sobre Supabase Vault através de wrappers RPC
 * mínimos (`rpg_vault_*`, SECURITY DEFINER, EXECUTE só para service_role).
 * O schema `vault` NÃO é exposto no PostgREST — nunca acedido por anon.
 * Namespacing at/<company>/<ENV>/<tipo>/<uuid> (sem NIF/nomes/valores);
 * metadata não sensível em description (JSON).
 *
 * NUNCA expor valores em erros/logs/UI. Sem fallback: falha do Vault é falha.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SecretStoreError,
  type SecretCredentialType,
  type SecretEnvironment,
  type SecretMetadata,
  type SecretReference,
  type SecureSecret,
  type SecureSecretStore,
} from "@rpg/core";

export interface VaultBackendConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

interface VaultMeta {
  provider: string;
  companyId: string;
  environment: SecretEnvironment;
  credentialType: SecretCredentialType;
  status: "ACTIVE" | "REVOKED";
  expiresAt: string | null;
}

interface VaultRow {
  id: string;
  name?: string;
  decrypted_secret?: string;
  description: string | null;
  created_at?: string;
}

/** Nome Vault: at/<company>/<ENV>/<tipo>/<uuid> — opaco, sem PII. */
export function vaultSecretName(ref: {
  provider: string;
  companyId: string;
  environment: SecretEnvironment;
  credentialType: SecretCredentialType;
  secretId: string;
}): string {
  return `${ref.provider}/${ref.companyId}/${ref.environment}/${ref.credentialType}/${ref.secretId}`;
}

function parseMeta(description: string | null): VaultMeta | null {
  if (!description) return null;
  try {
    const m = JSON.parse(description) as Partial<VaultMeta>;
    if (
      typeof m.provider !== "string" ||
      typeof m.companyId !== "string" ||
      (m.environment !== "TEST" && m.environment !== "PRODUCTION") ||
      typeof m.credentialType !== "string" ||
      (m.status !== "ACTIVE" && m.status !== "REVOKED")
    ) {
      return null;
    }
    return {
      provider: m.provider,
      companyId: m.companyId,
      environment: m.environment,
      credentialType: m.credentialType as VaultMeta["credentialType"],
      status: m.status,
      expiresAt: typeof m.expiresAt === "string" ? m.expiresAt : null,
    };
  } catch {
    return null;
  }
}

function memSecret(id: string, value: string): SecureSecret {
  return {
    id,
    reveal: () => value,
    toString: () => "[REDACTED]",
  };
}

function checkUsable(meta: VaultMeta): void {
  if (meta.status !== "ACTIVE") {
    throw new SecretStoreError("SECRET_REVOKED", "Segredo revogado.");
  }
  if (meta.expiresAt && new Date(meta.expiresAt).getTime() <= Date.now()) {
    throw new SecretStoreError("SECRET_EXPIRED", "Segredo expirado.");
  }
}

function mapError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  // Nunca vazar detalhes internos (SQL, conexão, Vault).
  if (/duplicate|already exists|unique/i.test(msg)) {
    throw new SecretStoreError("SECRET_INVALID", "Referência de segredo duplicada.");
  }
  throw new SecretStoreError("SECRET_BACKEND_ERROR", "Operação do cofre falhou.");
}

export class VaultSecretBackend implements SecureSecretStore {
  private readonly client: SupabaseClient;

  constructor(config: VaultBackendConfig) {
    if (!config.supabaseUrl || !config.serviceRoleKey) {
      throw new SecretStoreError(
        "SECRET_STORE_NOT_CONFIGURED",
        "Backend Vault sem configuração.",
      );
    }
    this.client = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  private static refFromTenantKey(
    tenantId: string,
    key: string,
    credentialType: SecretCredentialType = "AT_WFA_PASSWORD",
  ): SecretReference {
    return {
      secretId: key,
      provider: "AT",
      companyId: tenantId,
      environment: "TEST",
      credentialType,
    };
  }

  private static checkValue(value: string): void {
    if (typeof value !== "string" || value.length === 0) {
      throw new SecretStoreError("SECRET_INVALID", "Valor de segredo inválido.");
    }
  }

  private static checkBinding(meta: VaultMeta | null, ref: SecretReference): VaultMeta {
    // Isolamento: a linha tem de corresponder exatamente à referência.
    if (
      !meta ||
      meta.provider !== ref.provider ||
      meta.companyId !== ref.companyId ||
      meta.environment !== ref.environment ||
      meta.credentialType !== ref.credentialType
    ) {
      throw new SecretStoreError("SECRET_ACCESS_DENIED", "Referência fora do scope.");
    }
    checkUsable(meta);
    return meta;
  }

  async putRef(
    ref: SecretReference,
    value: string,
    opts?: { expiresAt?: string | null },
  ): Promise<SecretMetadata> {
    VaultSecretBackend.checkValue(value);
    const name = vaultSecretName(ref);
    const meta: VaultMeta = {
      provider: ref.provider,
      companyId: ref.companyId,
      environment: ref.environment,
      credentialType: ref.credentialType,
      status: "ACTIVE",
      expiresAt: opts?.expiresAt ?? null,
    };
    try {
      const { data, error } = await this.client.rpc("rpg_vault_create_secret", {
        p_name: name,
        p_secret: value,
        p_description: JSON.stringify(meta),
      });
      if (error) mapError(error);
      const id = String(data as unknown as string);
      return {
        id,
        tenantId: ref.companyId,
        key: ref.secretId,
        createdAt: new Date().toISOString(),
        rotatedAt: null,
        expiresAt: meta.expiresAt,
        status: "ACTIVE",
      };
    } catch (err) {
      if (err instanceof SecretStoreError) throw err;
      mapError(err);
    }
  }

  async getRef(ref: SecretReference): Promise<SecureSecret | null> {
    const name = vaultSecretName(ref);
    let row: VaultRow | null = null;
    try {
      const { data, error } = await this.client.rpc("rpg_vault_get_secret", {
        p_name: name,
      });
      if (error) mapError(error);
      const list = (data ?? []) as VaultRow[];
      row = list[0] ?? null;
    } catch (err) {
      if (err instanceof SecretStoreError) throw err;
      mapError(err);
    }
    if (!row) return null;
    VaultSecretBackend.checkBinding(parseMeta(row.description), ref);
    return memSecret(String(row.id), String(row.decrypted_secret));
  }

  async revokeRef(secretId: string, companyId: string): Promise<void> {
    let row: VaultRow | null = null;
    try {
      const { data, error } = await this.client.rpc("rpg_vault_get_secret_by_id", {
        p_id: secretId,
      });
      if (error) mapError(error);
      const list = (data ?? []) as VaultRow[];
      row = list[0] ?? null;
    } catch (err) {
      if (err instanceof SecretStoreError) throw err;
      mapError(err);
    }
    if (!row) {
      throw new SecretStoreError("SECRET_NOT_FOUND", "Segredo inexistente.");
    }
    const meta = parseMeta(row.description);
    if (!meta || meta.companyId !== companyId) {
      throw new SecretStoreError("SECRET_ACCESS_DENIED", "Referência fora do scope.");
    }
    // Revogação = marcar metadata como REVOKED (valor mantido para
    // auditoria, nunca mais utilizável: checkBinding/get recusam).
    try {
      const { error } = await this.client.rpc("rpg_vault_update_secret", {
        p_id: secretId,
        p_description: JSON.stringify({ ...meta, status: "REVOKED" }),
      });
      if (error) mapError(error);
    } catch (err) {
      if (err instanceof SecretStoreError) throw err;
      mapError(err);
    }
  }

  async deleteRef(secretId: string, companyId: string): Promise<boolean> {
    let row: VaultRow | null = null;
    try {
      const { data, error } = await this.client.rpc("rpg_vault_get_secret_by_id", {
        p_id: secretId,
      });
      if (error) mapError(error);
      const list = (data ?? []) as VaultRow[];
      row = list[0] ?? null;
    } catch (err) {
      if (err instanceof SecretStoreError) throw err;
      mapError(err);
    }
    if (!row) return false;
    const meta = parseMeta(row.description);
    if (!meta || meta.companyId !== companyId) {
      throw new SecretStoreError("SECRET_ACCESS_DENIED", "Referência fora do scope.");
    }
    try {
      const { data, error } = await this.client.rpc("rpg_vault_delete_secret", {
        p_id: secretId,
      });
      if (error) mapError(error);
      return Boolean(data);
    } catch (err) {
      if (err instanceof SecretStoreError) throw err;
      mapError(err);
    }
  }

  /** Leitura por id + company (uso interno server-side; valida scope). */
  async getSecretById(secretId: string, companyId: string): Promise<SecureSecret | null> {
    let row: VaultRow | null = null;
    try {
      const { data, error } = await this.client.rpc("rpg_vault_get_secret_by_id", {
        p_id: secretId,
      });
      if (error) mapError(error);
      const list = (data ?? []) as VaultRow[];
      row = list[0] ?? null;
    } catch (err) {
      if (err instanceof SecretStoreError) throw err;
      mapError(err);
    }
    if (!row) return null;
    const meta = parseMeta(row.description);
    if (!meta || meta.companyId !== companyId) {
      throw new SecretStoreError("SECRET_ACCESS_DENIED", "Referência fora do scope.");
    }
    checkUsable(meta);
    return memSecret(String(row.id), String(row.decrypted_secret));
  }

  /** Existe e utilizável, por id + company (sem valor). */
  async existsRef(secretId: string, companyId: string): Promise<boolean> {
    try {
      const got = await this.getSecretById(secretId, companyId);
      return got !== null;
    } catch {
      return false;
    }
  }

  /** Lista metadata da company (nunca valores). */
  async listRef(companyId: string): Promise<SecretMetadata[]> {
    let rows: VaultRow[] = [];
    try {
      const { data, error } = await this.client.rpc("rpg_vault_list_secrets");
      if (error) mapError(error);
      rows = ((data ?? []) as Array<VaultRow & { name?: string; created_at?: string }>);
    } catch (err) {
      if (err instanceof SecretStoreError) throw err;
      mapError(err);
    }
    const out: SecretMetadata[] = [];
    for (const r of rows) {
      const meta = parseMeta(r.description);
      if (!meta || meta.companyId !== companyId) continue;
      out.push({
        id: String(r.id),
        tenantId: companyId,
        key: String(r.id),
        createdAt: String(r.created_at ?? new Date().toISOString()),
        rotatedAt: null,
        expiresAt: meta.expiresAt,
        status: meta.status,
      });
    }
    return out;
  }

  /** Roda valor por id + company (com verificações de scope/estado). */
  async rotateRef(secretId: string, companyId: string, value: string): Promise<SecretMetadata> {
    VaultSecretBackend.checkValue(value);
    let row: VaultRow | null = null;
    try {
      const { data, error } = await this.client.rpc("rpg_vault_get_secret_by_id", {
        p_id: secretId,
      });
      if (error) mapError(error);
      const list = (data ?? []) as VaultRow[];
      row = list[0] ?? null;
    } catch (err) {
      if (err instanceof SecretStoreError) throw err;
      mapError(err);
    }
    if (!row) {
      throw new SecretStoreError("SECRET_NOT_FOUND", "Segredo inexistente.");
    }
    const meta = parseMeta(row.description);
    if (!meta || meta.companyId !== companyId) {
      throw new SecretStoreError("SECRET_ACCESS_DENIED", "Referência fora do scope.");
    }
    checkUsable(meta);
    try {
      const { error } = await this.client.rpc("rpg_vault_update_secret", {
        p_id: secretId,
        p_secret: value,
      });
      if (error) mapError(error);
    } catch (err) {
      if (err instanceof SecretStoreError) throw err;
      mapError(err);
    }
    return {
      id: secretId,
      tenantId: companyId,
      key: secretId,
      createdAt: new Date().toISOString(),
      rotatedAt: new Date().toISOString(),
      expiresAt: meta.expiresAt,
      status: "ACTIVE",
    };
  }

  // --- Interface base (tenant opaco), delegada para referências TEST ---

  async put(tenantId: string, key: string, value: string): Promise<SecretMetadata> {
    return this.putRef(VaultSecretBackend.refFromTenantKey(tenantId, key), value);
  }

  async get(tenantId: string, key: string): Promise<SecureSecret | null> {
    return this.getRef(VaultSecretBackend.refFromTenantKey(tenantId, key));
  }

  async delete(tenantId: string, key: string): Promise<boolean> {
    const name = vaultSecretName(VaultSecretBackend.refFromTenantKey(tenantId, key));
    let row: VaultRow | null = null;
    try {
      const { data, error } = await this.client.rpc("rpg_vault_get_secret", {
        p_name: name,
      });
      if (error) mapError(error);
      const list = (data ?? []) as VaultRow[];
      row = list[0] ?? null;
    } catch (err) {
      if (err instanceof SecretStoreError) throw err;
      mapError(err);
    }
    if (!row) return false;
    return this.deleteRef(String(row.id), tenantId);
  }

  async list(tenantId: string): Promise<SecretMetadata[]> {
    return this.listRef(tenantId);
  }

  async exists(tenantId: string, key: string): Promise<boolean> {
    try {
      const got = await this.get(tenantId, key);
      return got !== null;
    } catch {
      return false;
    }
  }

  async rotate(tenantId: string, key: string, value: string): Promise<SecretMetadata> {
    VaultSecretBackend.checkValue(value);
    const name = vaultSecretName(VaultSecretBackend.refFromTenantKey(tenantId, key));
    let row: VaultRow | null = null;
    try {
      const { data, error } = await this.client.rpc("rpg_vault_get_secret", {
        p_name: name,
      });
      if (error) mapError(error);
      const list = (data ?? []) as VaultRow[];
      row = list[0] ?? null;
    } catch (err) {
      if (err instanceof SecretStoreError) throw err;
      mapError(err);
    }
    if (!row) {
      throw new SecretStoreError("SECRET_NOT_FOUND", "Segredo inexistente.");
    }
    return this.rotateRef(String(row.id), tenantId, value);
  }
}
