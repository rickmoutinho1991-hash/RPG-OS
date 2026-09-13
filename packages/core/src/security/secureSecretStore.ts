/**
 * RPG-OS — Secure Data Boundary.
 *
 * Separação conceptual entre:
 *   BUSINESS DATA (clientes, projetos, invoices, quotes, payments,
 *   workflows) — vive nas tabelas relacionais normais com RLS.
 *   SECURE DATA (credentials, tokens, API keys, secrets, documentos
 *   altamente sensíveis) — nunca nas tabelas normais nem em logs.
 *
 * NÃO existe armazenamento de secrets configurado nesta fase.
 * Esta interface é o ponto de integração único para quando existir
 * (ex.: Vault, KMS, Supabase Vault). A implementação disponível falha
 * explicitamente — nunca guarda segredos em texto simples.
 */

/** Valor secreto opaco. Nunca serializável nem logável. */
export interface SecureSecret {
  readonly id: string;
  /** Valor apenas acessível em memória na operação que o pediu. */
  reveal(): string;
  /** Nunca devolve o valor — usado em logs. */
  toString(): "[REDACTED]";
}

export interface SecureSecretStore {
  /** Guarda um segredo encriptado, associado a um tenant. */
  put(tenantId: string, key: string, value: string): Promise<SecretMetadata>;
  /** Lê e desencripta um segredo para uso imediato em memória. */
  get(tenantId: string, key: string): Promise<SecureSecret | null>;
  /** Remove um segredo. */
  delete(tenantId: string, key: string): Promise<boolean>;
  /** Lista metadados (nunca valores). */
  list(tenantId: string): Promise<SecretMetadata[]>;
  /** Existe e está utilizável (não revogado/expirado)? Nunca lança por falta. */
  exists(tenantId: string, key: string): Promise<boolean>;
  /** Substitui o valor mantendo a referência; atualiza rotatedAt. */
  rotate(tenantId: string, key: string, value: string): Promise<SecretMetadata>;
  /**
   * Leitura por id + company (uso interno server-side; valida scope).
   * Necessária quando a referência (ex.: AT) guarda o id em vez da chave.
   */
  getSecretById(secretId: string, companyId: string): Promise<SecureSecret | null>;
}

export interface SecretMetadata {
  id: string;
  tenantId: string;
  key: string;
  createdAt: string;
  /** Rotação: data da última substituição. */
  rotatedAt: string | null;
  /** Validade opcional: expirado => acesso negado. */
  expiresAt: string | null;
  /** Lifecycle: apenas ACTIVE é utilizável. */
  status: "ACTIVE" | "REVOKED";
}

/** Tipos de credencial com necessidade comprovada (AT fiscal). */
export type SecretCredentialType =
  | "AT_CLIENT_CERTIFICATE"
  | "AT_CLIENT_PRIVATE_KEY"
  | "AT_CERTIFICATE_CHAIN"
  | "AT_WFA_USERNAME"
  | "AT_WFA_PASSWORD";

/** Ambientes nunca misturáveis. */
export type SecretEnvironment = "TEST" | "PRODUCTION";

/**
 * Referência opaca a um segredo. O secretId nunca contém NIF, password,
 * certificado, chave ou token. O vínculo (provider, company, environment)
 * é validado antes de qualquer acesso — nunca vem só do browser.
 */
export interface SecretReference {
  readonly secretId: string;
  readonly provider: string;
  readonly companyId: string;
  readonly environment: SecretEnvironment;
  readonly credentialType: SecretCredentialType;
}

/** Códigos de erro semânticos (sem valores sensíveis nas mensagens). */
export type SecretStoreErrorCode =
  | "SECRET_STORE_NOT_CONFIGURED"
  | "SECRET_NOT_FOUND"
  | "SECRET_ACCESS_DENIED"
  | "SECRET_REVOKED"
  | "SECRET_EXPIRED"
  | "SECRET_BACKEND_ERROR"
  | "SECRET_INVALID";

export class SecretStoreError extends Error {
  readonly code: SecretStoreErrorCode;
  constructor(code: SecretStoreErrorCode, message: string) {
    super(message);
    this.name = "SecretStoreError";
    this.code = code;
  }
}

/** Erro lançado por implementações não configuradas. */
export class SecretStoreNotConfiguredError extends SecretStoreError {
  constructor() {
    super(
      "SECRET_STORE_NOT_CONFIGURED",
      "SecureSecretStore não está configurado. Segredos NUNCA devem ser " +
        "guardados em texto simples. Configurar um backend (ex.: Supabase " +
        "Vault / KMS) antes de usar.",
    );
    this.name = "SecretStoreNotConfiguredError";
  }
}

/**
 * Implementação placeholder — falha explicitamente em todas as operações.
 * Não guardar nada. Não manter nada em memória.
 */
export class NotConfiguredSecretStore implements SecureSecretStore {
  async put(_tenantId: string, _key: string, _value: string): Promise<SecretMetadata> {
    void _tenantId;
    void _key;
    void _value;
    throw new SecretStoreNotConfiguredError();
  }
  async get(_tenantId: string, _key: string): Promise<SecureSecret | null> {
    void _tenantId;
    void _key;
    throw new SecretStoreNotConfiguredError();
  }
  async delete(_tenantId: string, _key: string): Promise<boolean> {
    void _tenantId;
    void _key;
    throw new SecretStoreNotConfiguredError();
  }
  async list(_tenantId: string): Promise<SecretMetadata[]> {
    void _tenantId;
    throw new SecretStoreNotConfiguredError();
  }
  async exists(_tenantId: string, _key: string): Promise<boolean> {
    void _tenantId;
    void _key;
    throw new SecretStoreNotConfiguredError();
  }
  async rotate(_tenantId: string, _key: string, _value: string): Promise<SecretMetadata> {
    void _tenantId;
    void _key;
    void _value;
    throw new SecretStoreNotConfiguredError();
  }
  async getSecretById(_secretId: string, _companyId: string): Promise<SecureSecret | null> {
    void _secretId;
    void _companyId;
    throw new SecretStoreNotConfiguredError();
  }
}

/** Instância única do store da aplicação (não configurada nesta fase). */
export const secureSecretStore: SecureSecretStore =
  new NotConfiguredSecretStore();
