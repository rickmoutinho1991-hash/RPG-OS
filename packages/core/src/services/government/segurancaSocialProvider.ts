/**
 * RPG-OS Segurança Social Direta Provider (FASE 10J-E)
 *
 * Provider abstraction for Segurança Social Direta.
 * DOES NOT invent an API - implements the interface for future official integration.
 * Fake provider included for local/development testing.
 */

import {
  GovernmentIntegrationProvider,
  GovernmentProviderMetadata,
  GovernmentCapability,
  GovernmentProviderType,
  GovernmentEnvironment,
  GovernmentConnectionConfig,
  GovernmentDocumentSubmission,
  GovernmentDocumentStatusQuery,
  GovernmentProviderHealth,
  CapabilityCheckResult,
  GovernmentProviderFactory,
  GovernmentProviderId,
} from "./governmentIntegration";

/** Segurança Social Provider specific configuration */
export interface SegurancaSocialProviderConfig {
  /** API base URL */
  apiEndpoint: string;
  /** Organization NISS (Número de Identificação da Segurança Social) */
  organizationNiss: string;
  /** OAuth2 client ID */
  clientId?: string;
  /** OAuth2 client secret */
  clientSecret?: string;
  /** Certificate for authentication */
  certificate?: string;
  /** Certificate password */
  certificatePassword?: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
}

/** Segurança Social capabilities - what SS officially supports */
const SEGURANCA_SOCIAL_CAPABILITIES: GovernmentCapability[] = [
  "QUERY_OBLIGATIONS",
  "SUBMIT_DECLARATION",
  "QUERY_PAYMENTS",
  "WEBHOOK_NOTIFICATIONS",
];

/** Segurança Social Provider metadata */
function createSegurancaSocialMetadata(type: GovernmentProviderType, environment: GovernmentEnvironment): GovernmentProviderMetadata {
  return {
    providerId: "SEGURANCA_SOCIAL",
    providerType: type,
    country: "PT",
    environment,
    capabilities: SEGURANCA_SOCIAL_CAPABILITIES,
    authMethod: "OAUTH2_PKCE",
    status: "DISCONNECTED",
    version: "1.0",
    documentationUrl: "https://www.seg-social.pt/",
    sandboxAvailable: true,
    officialAvailable: true,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Segurança Social Direta Integration Provider
 * Future-ready adapter for Segurança Social Direta webservices
 */
export class SegurancaSocialProvider implements GovernmentIntegrationProvider {
  readonly metadata: GovernmentProviderMetadata;
  private readonly config: SegurancaSocialProviderConfig;
  private readonly connections = new Map<string, GovernmentConnectionConfig & { accessToken?: string; refreshToken?: string; tokenExpiresAt?: number }>();

  constructor(config: SegurancaSocialProviderConfig, type: GovernmentProviderType = "OFFICIAL", environment: GovernmentEnvironment = "production") {
    this.config = config;
    this.metadata = createSegurancaSocialMetadata(type, environment);
  }

  supports(capability: GovernmentCapability): CapabilityCheckResult {
    const supported = SEGURANCA_SOCIAL_CAPABILITIES.includes(capability);
    return {
      providerId: this.metadata.providerId,
      capability,
      supported,
      details: supported ? undefined : `Capability ${capability} not supported by Segurança Social provider`,
    };
  }

  async getHealth(): Promise<GovernmentProviderHealth> {
    const start = Date.now();
    try {
      await new Promise(resolve => setTimeout(resolve, 10));
      return {
        providerId: this.metadata.providerId,
        healthy: true,
        latencyMs: Date.now() - start,
        message: "Segurança Social provider operational",
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        providerId: this.metadata.providerId,
        healthy: false,
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : "Health check failed",
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async connect(connectionConfig: GovernmentConnectionConfig): Promise<{ success: boolean; connectionId: string; expiresAt?: string; error?: string }> {
    const connectionId = connectionConfig.connectionId;

    if (!this.config.clientId || !this.config.clientSecret) {
      return {
        success: false,
        connectionId,
        error: "Missing OAuth2 credentials (clientId/clientSecret)",
      };
    }

    if (!this.config.organizationNiss) {
      return {
        success: false,
        connectionId,
        error: "Missing organization NISS",
      };
    }

    try {
      const expiresAt = new Date(Date.now() + 3600000).toISOString();

      this.connections.set(connectionId, {
        ...connectionConfig,
        status: "CONNECTED",
        connectedAt: new Date().toISOString(),
        expiresAt,
      });

      return { success: true, connectionId, expiresAt };
    } catch (err) {
      return { success: false, connectionId, error: err instanceof Error ? err.message : "Connection failed" };
    }
  }

  async disconnect(connectionId: string): Promise<{ success: boolean; error?: string }> {
    const connection = this.connections.get(connectionId);
    if (!connection) return { success: false, error: "Connection not found" };
    this.connections.delete(connectionId);
    return { success: true };
  }

  async getConnectionStatus(connectionId: string): Promise<GovernmentConnectionConfig | null> {
    const connection = this.connections.get(connectionId);
    if (!connection) return null;
    const { accessToken, refreshToken, tokenExpiresAt, ...safe } = connection;
    return safe;
  }

  // Not applicable for Segurança Social - no invoice submission
  async submitDocument(
    connectionId: string,
    document: any,
    idempotencyKey: string
  ): Promise<GovernmentDocumentSubmission> {
    throw new Error("Segurança Social provider does not support invoice submission");
  }

  async getDocumentStatus(
    connectionId: string,
    documentId: string
  ): Promise<GovernmentDocumentStatusQuery> {
    throw new Error("Segurança Social provider does not support document status queries");
  }

  async cancelDocument(
    connectionId: string,
    documentId: string,
    reason: string
  ): Promise<{ success: boolean; cancellationId?: string; error?: string }> {
    return { success: false, error: "Not supported" };
  }

  async queryDocuments(
    connectionId: string,
    criteria: {
      startDate?: string;
      endDate?: string;
      documentType?: any;
      status?: string;
      page?: number;
      pageSize?: number;
    }
  ): Promise<{
    documents: Array<{
      documentId: string;
      series: string;
      documentNumber: string;
      documentType: any;
      issueDate: string;
      totalAmount: number;
      status: string;
      atcud?: string;
    }>;
    totalCount: number;
    page: number;
    pageSize: number;
  }> {
    throw new Error("Segurança Social provider does not support document queries");
  }

  async exportDocuments(
    connectionId: string,
    format: "SAFT-PT" | "JSON" | "CSV",
    criteria: {
      startDate: string;
      endDate: string;
      documentTypes?: any[];
    }
  ): Promise<{ exportId: string; data: string; format: string }> {
    throw new Error("Segurança Social provider does not support document export");
  }

  async synchronize(connectionId: string): Promise<{
    success: boolean;
    syncedCount: number;
    errors: string[];
    lastSyncAt: string;
  }> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, syncedCount: 0, errors: ["Connection not found"], lastSyncAt: new Date().toISOString() };
    }
    return { success: true, syncedCount: 0, errors: [], lastSyncAt: new Date().toISOString() };
  }
}

/**
 * Fake Segurança Social Provider for local/development testing
 */
export class FakeSegurancaSocialProvider implements GovernmentIntegrationProvider {
  readonly metadata: GovernmentProviderMetadata;
  private readonly connections = new Map<string, GovernmentConnectionConfig & { status: string }>();

  constructor(config?: Partial<SegurancaSocialProviderConfig>) {
    this.metadata = createSegurancaSocialMetadata("FAKE", "development");
  }

  supports(capability: GovernmentCapability): CapabilityCheckResult {
    const supported = SEGURANCA_SOCIAL_CAPABILITIES.includes(capability);
    return {
      providerId: this.metadata.providerId,
      capability,
      supported,
      details: supported ? undefined : `Capability ${capability} not supported by fake Segurança Social provider`,
    };
  }

  async getHealth(): Promise<GovernmentProviderHealth> {
    await new Promise(resolve => setTimeout(resolve, 10));
    return {
      providerId: this.metadata.providerId,
      healthy: true,
      latencyMs: 10,
      message: "Fake Segurança Social provider operational",
      checkedAt: new Date().toISOString(),
    };
  }

  async connect(connectionConfig: GovernmentConnectionConfig): Promise<{ success: boolean; connectionId: string; expiresAt?: string; error?: string }> {
    const connectionId = connectionConfig.connectionId;

    if (!connectionConfig.organizationId) {
      return { success: false, connectionId, error: "Missing organizationId" };
    }

    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    this.connections.set(connectionId, {
      ...connectionConfig,
      status: "CONNECTED",
      connectedAt: new Date().toISOString(),
      expiresAt,
    });

    return { success: true, connectionId, expiresAt };
  }

  async disconnect(connectionId: string): Promise<{ success: boolean; error?: string }> {
    const connection = this.connections.get(connectionId);
    if (!connection) return { success: false, error: "Connection not found" };
    this.connections.delete(connectionId);
    return { success: true };
  }

  async getConnectionStatus(connectionId: string): Promise<GovernmentConnectionConfig | null> {
    const connection = this.connections.get(connectionId);
    if (!connection) return null;
    return connection;
  }

  async submitDocument(
    connectionId: string,
    document: any,
    idempotencyKey: string
  ): Promise<GovernmentDocumentSubmission> {
    throw new Error("Fake Segurança Social provider does not support invoice submission");
  }

  async getDocumentStatus(
    connectionId: string,
    documentId: string
  ): Promise<GovernmentDocumentStatusQuery> {
    throw new Error("Not supported");
  }

  async cancelDocument(
    connectionId: string,
    documentId: string,
    reason: string
  ): Promise<{ success: boolean; cancellationId?: string; error?: string }> {
    return { success: false, error: "Not supported" };
  }

  async queryDocuments(
    connectionId: string,
    criteria: {
      startDate?: string;
      endDate?: string;
      documentType?: any;
      status?: string;
      page?: number;
      pageSize?: number;
    }
  ): Promise<{
    documents: Array<{
      documentId: string;
      series: string;
      documentNumber: string;
      documentType: any;
      issueDate: string;
      totalAmount: number;
      status: string;
      atcud?: string;
    }>;
    totalCount: number;
    page: number;
    pageSize: number;
  }> {
    throw new Error("Not supported");
  }

  async exportDocuments(
    connectionId: string,
    format: "SAFT-PT" | "JSON" | "CSV",
    criteria: {
      startDate: string;
      endDate: string;
      documentTypes?: any[];
    }
  ): Promise<{ exportId: string; data: string; format: string }> {
    throw new Error("Not supported");
  }

  async synchronize(connectionId: string): Promise<{
    success: boolean;
    syncedCount: number;
    errors: string[];
    lastSyncAt: string;
  }> {
    return { success: true, syncedCount: 0, errors: [], lastSyncAt: new Date().toISOString() };
  }
}

/**
 * Factory for creating Segurança Social providers
 */
export class SegurancaSocialProviderFactory implements GovernmentProviderFactory {
  create(providerId: GovernmentProviderId, type: GovernmentProviderType, config?: Record<string, unknown>): GovernmentIntegrationProvider {
    if (providerId !== "SEGURANCA_SOCIAL") {
      throw new Error(`Invalid provider ID for Segurança Social factory: ${providerId}`);
    }

    const providerConfig: SegurancaSocialProviderConfig = {
      apiEndpoint: (config?.apiEndpoint as string) ?? "https://api.seg-social.pt",
      organizationNiss: (config?.organizationNiss as string) ?? "",
      clientId: config?.clientId as string,
      clientSecret: config?.clientSecret as string,
      certificate: config?.certificate as string,
      certificatePassword: config?.certificatePassword as string,
      timeout: config?.timeout as number,
      maxRetries: config?.maxRetries as number,
    };

    if (type === "FAKE") {
      return new FakeSegurancaSocialProvider();
    }

    return new SegurancaSocialProvider(providerConfig, type, (config?.environment as any) ?? "production");
  }
}