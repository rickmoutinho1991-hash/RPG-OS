/**
 * RPG-OS Government Integration Architecture (FASE 10J)
 *
 * Core abstraction for Portuguese government service integrations.
 * Supports capability discovery, secure connections, and audit trails.
 * All providers must implement the GovernmentIntegrationProvider interface.
 */

import type { Invoice, InvoiceType } from "../../types/invoice";
import { governmentProviderRegistry, registerDefaultProviders } from "./atProvider";

export { governmentProviderRegistry, registerDefaultProviders };

/** Country code for Portugal */
export const PORTUGAL_COUNTRY_CODE = "PT";

/** Official Portuguese government provider identifiers */
export type GovernmentProviderId =
  | "AT"                 // Autoridade Tributária / Portal das Finanças
  | "EFATURA"            // e-Fatura (AT subsystem)
  | "SEGURANCA_SOCIAL"   // Segurança Social Direta
  | "AUTENTICACAO_GOV"   // Autenticação.gov
  | "CMD"                // Chave Móvel Digital
  | "GOV_PT";            // Gov.pt

/** Provider implementation type */
export type GovernmentProviderType =
  | "FAKE"       // Local/development testing only
  | "SANDBOX"    // Official sandbox environment
  | "OFFICIAL"   // Production official integration
  | "UNAVAILABLE"; // Not yet implemented or available

/** Capability identifiers for government providers */
export type GovernmentCapability =
  | "SUBMIT_INVOICE"           // Submit fiscal document (FT, FS, FR, NC, ND)
  | "QUERY_INVOICE"            // Query document status by ID
  | "CANCEL_INVOICE"           // Cancel submitted document
  | "VALIDATE_INVOICE"         // Pre-submission validation
  | "SAFT_EXPORT"              // Generate SAF-T PT export
  | "REAL_TIME_STATUS"         // Real-time document status via webhooks/polling
  | "AUTHENTICATION"           // User authentication (Autenticação.gov, CMD)
  | "IDENTITY_VERIFICATION"    // Identity verification (NIF, CC, CMD)
  | "ORGANIZATION_REPRESENTATION" // Act on behalf of organization
  | "DIGITAL_SIGNING"          // Qualified digital signing
  | "QUERY_OBLIGATIONS"        // Query fiscal obligations/deadlines
  | "SUBMIT_DECLARATION"       // Submit tax/social security declarations
  | "QUERY_PAYMENTS"           // Query payment references/status
  | "WEBHOOK_NOTIFICATIONS";   // Receive async notifications

/** Provider status */
export type GovernmentProviderStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "ERROR"
  | "EXPIRED"
  | "REVOKED";

/** Connection environment */
export type GovernmentEnvironment =
  | "development"
  | "sandbox"
  | "production";

/** Authentication method for provider */
export type GovernmentAuthMethod =
  | "OAUTH2"
  | "OAUTH2_PKCE"
  | "CLIENT_CERTIFICATE"
  | "API_KEY"
  | "JWT_BEARER"
  | "MUTUAL_TLS"
  | "NONE";

/** Government provider metadata */
export interface GovernmentProviderMetadata {
  providerId: GovernmentProviderId;
  providerType: GovernmentProviderType;
  country: string;
  environment: GovernmentEnvironment;
  capabilities: GovernmentCapability[];
  authMethod: GovernmentAuthMethod;
  status: GovernmentProviderStatus;
  version?: string;
  documentationUrl?: string;
  sandboxAvailable: boolean;
  officialAvailable: boolean;
  lastUpdated: string;
}

/** Connection configuration for a provider */
export interface GovernmentConnectionConfig {
  connectionId: string;
  organizationId: string;
  userId: string;
  providerId: GovernmentProviderId;
  environment: GovernmentEnvironment;
  scopes: string[];
  status: GovernmentProviderStatus;
  connectedAt: string;
  expiresAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  externalAccountReference?: string;
  metadata?: Record<string, unknown>;
}

/** Consent record for government access */
export interface GovernmentConsent {
  consentId: string;
  organizationId: string;
  userId: string;
  providerId: GovernmentProviderId;
  scopes: string[];
  grantedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  source: "USER" | "ADMIN" | "SYSTEM";
  auditMetadata: {
    ip?: string;
    userAgent?: string;
    sessionId?: string;
  };
}

/** Document submission request */
export interface GovernmentDocumentSubmission {
  submissionId: string;
  organizationId: string;
  connectionId: string;
  document: Invoice;
  idempotencyKey: string;
  submittedAt: string;
  status: "PENDING" | "SUBMITTED" | "ACCEPTED" | "REJECTED" | "ERROR";
  externalReference?: string;
  atcud?: string;
  error?: string;
  retryCount: number;
  lastAttemptAt?: string;
}

/** Document status query */
export interface GovernmentDocumentStatusQuery {
  queryId: string;
  organizationId: string;
  connectionId: string;
  documentId: string;
  documentType: InvoiceType;
  series: string;
  documentNumber: string;
  requestedAt: string;
  status: "PENDING" | "SUCCESS" | "ERROR";
  result?: {
    status: string;
    atcud?: string;
    hash?: string;
    qrCode?: string;
    lastUpdated: string;
  };
  error?: string;
}

/** Provider health check result */
export interface GovernmentProviderHealth {
  providerId: GovernmentProviderId;
  healthy: boolean;
  latencyMs?: number;
  message?: string;
  checkedAt: string;
  details?: Record<string, unknown>;
}

/** Capability check result */
export interface CapabilityCheckResult {
  providerId: GovernmentProviderId;
  capability: GovernmentCapability;
  supported: boolean;
  details?: string;
}

/** Government integration provider interface */
export interface GovernmentIntegrationProvider {
  readonly metadata: GovernmentProviderMetadata;

  /** Check if provider supports a specific capability */
  supports(capability: GovernmentCapability): CapabilityCheckResult;

  /** Get provider health status */
  getHealth(): Promise<GovernmentProviderHealth>;

  /** Connect to provider (authenticate) */
  connect(config: GovernmentConnectionConfig): Promise<{
    success: boolean;
    connectionId: string;
    expiresAt?: string;
    error?: string;
  }>;

  /** Disconnect from provider */
  disconnect(connectionId: string): Promise<{ success: boolean; error?: string }>;

  /** Get connection status */
  getConnectionStatus(connectionId: string): Promise<GovernmentConnectionConfig | null>;

  /** Submit a fiscal document */
  submitDocument(
    connectionId: string,
    document: Invoice,
    idempotencyKey: string
  ): Promise<GovernmentDocumentSubmission>;

  /** Get document status from provider */
  getDocumentStatus(
    connectionId: string,
    documentId: string
  ): Promise<GovernmentDocumentStatusQuery>;

  /** Cancel a submitted document */
  cancelDocument(
    connectionId: string,
    documentId: string,
    reason: string
  ): Promise<{ success: boolean; cancellationId?: string; error?: string }>;

  /** Query documents by criteria */
  queryDocuments(
    connectionId: string,
    criteria: {
      startDate?: string;
      endDate?: string;
      documentType?: InvoiceType;
      status?: string;
      page?: number;
      pageSize?: number;
    }
  ): Promise<{
    documents: Array<{
      documentId: string;
      series: string;
      documentNumber: string;
      documentType: InvoiceType;
      issueDate: string;
      totalAmount: number;
      status: string;
      atcud?: string;
    }>;
    totalCount: number;
    page: number;
    pageSize: number;
  }>;

  /** Export documents (SAF-T, etc.) */
  exportDocuments(
    connectionId: string,
    format: "SAFT-PT" | "JSON" | "CSV",
    criteria: {
      startDate: string;
      endDate: string;
      documentTypes?: InvoiceType[];
    }
  ): Promise<{ exportId: string; data: string; format: string }>;

  /** Synchronize local state with provider */
  synchronize(connectionId: string): Promise<{
    success: boolean;
    syncedCount: number;
    errors: string[];
    lastSyncAt: string;
  }>;
}

/** Provider registry for managing all government integrations */
export interface GovernmentProviderRegistry {
  register(provider: GovernmentIntegrationProvider): void;
  unregister(providerId: GovernmentProviderId): void;
  get(providerId: GovernmentProviderId): GovernmentIntegrationProvider | undefined;
  getAll(): GovernmentIntegrationProvider[];
  getByCapability(capability: GovernmentCapability): GovernmentIntegrationProvider[];
  getByCountry(country: string): GovernmentIntegrationProvider[];
  getByType(type: GovernmentProviderType): GovernmentIntegrationProvider[];
  clear(): void;
}

/** Factory for creating providers */
export interface GovernmentProviderFactory {
  create(providerId: GovernmentProviderId, type: GovernmentProviderType, config?: Record<string, unknown>): GovernmentIntegrationProvider;
}

/** Error codes for government integrations */
export type GovernmentIntegrationErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_CREDENTIALS"
  | "EXPIRED_CREDENTIALS"
  | "INSUFFICIENT_SCOPES"
  | "CONNECTION_FAILED"
  | "SUBMISSION_FAILED"
  | "VALIDATION_FAILED"
  | "DOCUMENT_NOT_FOUND"
  | "DUPLICATE_SUBMISSION"
  | "IDENTITY_MISMATCH"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "CONSENT_REVOKED"
  | "ORGANIZATION_MISMATCH"
  | "TENANT_ISOLATION_VIOLATION";

/** Standardized error for government integrations */
export class GovernmentIntegrationError extends Error {
  constructor(
    public readonly code: GovernmentIntegrationErrorCode,
    message: string,
    public readonly providerId: GovernmentProviderId,
    public readonly connectionId?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GovernmentIntegrationError";
  }
}

/** Result wrapper for government operations */
export type GovernmentResult<T> =
  | { success: true; data: T }
  | { success: false; error: GovernmentIntegrationError };

/** Helper to create success result */
export function governmentSuccess<T>(data: T): GovernmentResult<T> {
  return { success: true, data };
}

/** Helper to create error result */
export function governmentError<T>(
  code: GovernmentIntegrationErrorCode,
  message: string,
  providerId: GovernmentProviderId,
  connectionId?: string,
  details?: Record<string, unknown>
): GovernmentResult<T> {
  return {
    success: false,
    error: new GovernmentIntegrationError(code, message, providerId, connectionId, details),
  };
}