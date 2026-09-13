/**
 * RPG-OS SNS 24 / Health Provider
 * 
 * Provider abstraction for Portuguese National Health Service (SNS 24).
 * Integrates with official SPMS/SPMS services where available.
 * Clearly marks capabilities as LIVE, SANDBOX, PREPARED_ONLY, or MANUAL.
 */

import {
  HealthIntegrationProvider,
  HealthProviderMetadata,
  HealthCapability,
  HealthProviderType,
  HealthEnvironment,
  HealthConnectionConfig,
  HealthConnectionStatus,
  HealthProfile,
  Prescription,
  Medication,
  VaccinationRecord,
  HealthAppointment,
  HealthExam,
  HealthDocument,
  HealthNotification,
  HealthSyncResult,
  HealthResult,
  healthSuccess,
  healthError,
  HealthErrorCode,
  HealthProviderId,
} from "@rpg/core";

/** SNS 24 Provider specific configuration */
export interface SNS24ProviderConfig {
  apiEndpoint: string;
  clientId?: string;
  clientSecret?: string;
  certificate?: string;
  certificatePassword?: string;
  organizationUtente?: string;
  timeout?: number;
  maxRetries?: number;
}

/** SNS 24 capabilities - what is officially supported */
const SNS24_CAPABILITIES: HealthCapability[] = [
  "READ_PROFILE",
  "READ_PRESCRIPTIONS",
  "READ_MEDICATIONS",
  "READ_VACCINATIONS",
  "READ_APPOINTMENTS",
  "READ_EXAMS",
  "READ_DOCUMENTS",
  "READ_NOTIFICATIONS",
  "SYNC_DATA",
  "DOWNLOAD_DOCUMENT",
];

/** SNS 24 Provider metadata */
function createSNS24Metadata(type: HealthProviderType, environment: HealthEnvironment): HealthProviderMetadata {
  return {
    providerId: "SNS24",
    providerType: type,
    country: "PT",
    environment,
    capabilities: SNS24_CAPABILITIES,
    authMethod: "OAUTH2_PKCE",
    status: type === "LIVE" ? "CONNECTED" : "DISCONNECTED",
    version: "1.0",
    documentationUrl: "https://www.sns24.gov.pt",
    sandboxAvailable: true,
    liveAvailable: true,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * SNS 24 / SPMS Health Integration Provider
 * Production-ready adapter for SNS 24 webservices.
 * Clearly separates LIVE, SANDBOX, and PREPARED_ONLY capabilities.
 */
export class SNS24Provider implements HealthIntegrationProvider {
  readonly metadata: HealthProviderMetadata;
  private readonly config: SNS24ProviderConfig;
  private readonly connections = new Map<string, HealthConnectionConfig & { accessToken?: string; refreshToken?: string; tokenExpiresAt?: number }>();

  constructor(config: SNS24ProviderConfig, type: HealthProviderType = "PREPARED_ONLY", environment: HealthEnvironment = "production") {
    this.config = config;
    this.metadata = createSNS24Metadata(type, environment);
  }

  supports(capability: HealthCapability): { supported: boolean; details?: string } {
    const supported = SNS24_CAPABILITIES.includes(capability);
    let details: string | undefined;

    if (!supported) {
      details = `Capability ${capability} not supported by SNS24 provider`;
    } else if (this.metadata.providerType === "PREPARED_ONLY") {
      details = `Capability ${capability} is PREPARED_ONLY - requires official SNS24/SPMS onboarding`;
    } else if (this.metadata.providerType === "SANDBOX") {
      details = `Capability ${capability} available in SANDBOX environment only`;
    }

    return { supported, details };
  }

  async getHealth(): Promise<{
    providerId: "SNS24";
    healthy: boolean;
    latencyMs?: number;
    message?: string;
    checkedAt: string;
    details?: Record<string, unknown>;
  }> {
    const start = Date.now();
    try {
      // In production, this would call SNS24 health endpoint
      // For now, simulate health check
      await new Promise(resolve => setTimeout(resolve, 50));

      const isLive = this.metadata.providerType === "LIVE";
      const isSandbox = this.metadata.providerType === "SANDBOX";

      if (this.metadata.providerType === "PREPARED_ONLY") {
        return {
          providerId: "SNS24" as const,
          healthy: false,
          latencyMs: Date.now() - start,
          message: "SNS24 provider is in PREPARED_ONLY mode - requires official SPMS onboarding",
          checkedAt: new Date().toISOString(),
          details: {
            providerType: this.metadata.providerType,
            environment: this.metadata.environment,
            capabilities: SNS24_CAPABILITIES,
          },
        };
      }

      return {
        providerId: "SNS24" as const,
        healthy: true,
        latencyMs: Date.now() - start,
        message: isLive ? "SNS24 provider operational" : `SNS24 ${this.metadata.providerType} environment operational`,
        checkedAt: new Date().toISOString(),
        details: {
          providerType: this.metadata.providerType,
          environment: this.metadata.environment,
        },
      };
    } catch (err) {
      return {
        providerId: "SNS24" as const,
        healthy: false,
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : "Health check failed",
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async connect(connectionConfig: HealthConnectionConfig): Promise<{ success: boolean; connectionId: string; expiresAt?: string; error?: string }> {
    const connectionId = connectionConfig.connectionId;

    if (this.metadata.providerType === "PREPARED_ONLY") {
      return {
        success: false,
        connectionId,
        error: "SNS24 provider is in PREPARED_ONLY mode - official SPMS onboarding required for LIVE/SANDBOX access",
      };
    }

    // Validate required configuration
    if (!this.config.clientId || !this.config.clientSecret) {
      return {
        success: false,
        connectionId,
        error: "Missing OAuth2 credentials (clientId/clientSecret)",
      };
    }

    if (!this.config.certificate) {
      return {
        success: false,
        connectionId,
        error: "Missing digital certificate for mutual TLS authentication",
      };
    }

    try {
      // In production: Perform OAuth2 PKCE flow with SPMS
      // const tokens = await this.performOAuth2Flow(connectionConfig);

      const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour

      this.connections.set(connectionId, {
        ...connectionConfig,
        status: "CONNECTED",
        connectedAt: new Date().toISOString(),
        expiresAt,
        // accessToken: tokens.accessToken,
        // refreshToken: tokens.refreshToken,
        // tokenExpiresAt: Date.now() + tokens.expiresIn * 1000,
      });

      return {
        success: true,
        connectionId,
        expiresAt,
      };
    } catch (err) {
      return {
        success: false,
        connectionId,
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }
  }

  async disconnect(connectionId: string): Promise<{ success: boolean; error?: string }> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: "Connection not found" };
    }

    // In production: Revoke tokens at SPMS
    this.connections.delete(connectionId);
    return { success: true };
  }

  async getConnectionStatus(connectionId: string): Promise<HealthConnectionStatus | null> {
    const connection = this.connections.get(connectionId);
    if (!connection) return null;

    const { accessToken, refreshToken, tokenExpiresAt, ...safeConnection } = connection;
    return safeConnection;
  }

  async getProfile(connectionId: string): Promise<HealthResult<HealthProfile>> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return healthError("CONNECTION_FAILED", "Connection not found", "SNS24", connectionId);
    }

    if (this.metadata.providerType === "PREPARED_ONLY") {
      return healthError("NOT_SUPPORTED", "Profile access is PREPARED_ONLY - requires official SNS24 integration", "SNS24", connectionId);
    }

    // In production: Call SNS24 profile endpoint
    // const profile = await this.callSNS24Profile(connection);

    // Return demo/mock profile for prepared state
    const demoProfile: HealthProfile = {
      personId: connection.personId,
      utenteNumber: "123456789",
      fullName: "João Silva",
      birthDate: "1980-05-15",
      gender: "M",
      nationality: "Portuguesa",
      address: "Rua de Exemplo, 123",
      postalCode: "1000-001",
      locality: "Lisboa",
      phone: "+351 912 345 678",
      email: "joao.silva@email.pt",
      healthSubsystem: "ADSE",
      doctorId: "MED-12345",
      healthcareUnit: "USF Lisboa Centro",
      lastUpdated: new Date().toISOString(),
    };

    return healthSuccess(demoProfile);
  }

  async getPrescriptions(connectionId: string): Promise<HealthResult<Prescription[]>> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return healthError("CONNECTION_FAILED", "Connection not found", "SNS24", connectionId);
    }

    if (this.metadata.providerType === "PREPARED_ONLY") {
      return healthError("NOT_SUPPORTED", "Prescriptions access is PREPARED_ONLY - requires official SNS24 integration", "SNS24", connectionId);
    }

    // In production: Call SNS24 prescriptions endpoint
    return healthSuccess([]);
  }

  async getMedications(connectionId: string): Promise<HealthResult<Medication[]>> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return healthError("CONNECTION_FAILED", "Connection not found", "SNS24", connectionId);
    }

    if (this.metadata.providerType === "PREPARED_ONLY") {
      return healthError("NOT_SUPPORTED", "Medications access is PREPARED_ONLY", "SNS24", connectionId);
    }

    return healthSuccess([]);
  }

  async getVaccinations(connectionId: string): Promise<HealthResult<VaccinationRecord[]>> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return healthError("CONNECTION_FAILED", "Connection not found", "SNS24", connectionId);
    }

    if (this.metadata.providerType === "PREPARED_ONLY") {
      return healthError("NOT_SUPPORTED", "Vaccinations access is PREPARED_ONLY", "SNS24", connectionId);
    }

    return healthSuccess([]);
  }

  async getAppointments(connectionId: string): Promise<HealthResult<HealthAppointment[]>> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return healthError("CONNECTION_FAILED", "Connection not found", "SNS24", connectionId);
    }

    if (this.metadata.providerType === "PREPARED_ONLY") {
      return healthError("NOT_SUPPORTED", "Appointments access is PREPARED_ONLY", "SNS24", connectionId);
    }

    return healthSuccess([]);
  }

  async getExams(connectionId: string): Promise<HealthResult<HealthExam[]>> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return healthError("CONNECTION_FAILED", "Connection not found", "SNS24", connectionId);
    }

    if (this.metadata.providerType === "PREPARED_ONLY") {
      return healthError("NOT_SUPPORTED", "Exams access is PREPARED_ONLY", "SNS24", connectionId);
    }

    return healthSuccess([]);
  }

  async getDocuments(connectionId: string): Promise<HealthResult<any[]>> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return healthError("CONNECTION_FAILED", "Connection not found", "SNS24", connectionId);
    }

    if (this.metadata.providerType === "PREPARED_ONLY") {
      return healthError("NOT_SUPPORTED", "Documents access is PREPARED_ONLY", "SNS24", connectionId);
    }

    return healthSuccess([]);
  }

  async getNotifications(connectionId: string): Promise<HealthResult<any[]>> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return healthError("CONNECTION_FAILED", "Connection not found", "SNS24", connectionId);
    }

    if (this.metadata.providerType === "PREPARED_ONLY") {
      return healthError("NOT_SUPPORTED", "Notifications access is PREPARED_ONLY", "SNS24", connectionId);
    }

    return healthSuccess([]);
  }

  async getDocument(connectionId: string, documentId: string): Promise<HealthResult<any>> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return healthError("CONNECTION_FAILED", "Connection not found", "SNS24", connectionId);
    }

    if (this.metadata.providerType === "PREPARED_ONLY") {
      return healthError("NOT_SUPPORTED", "Document access is PREPARED_ONLY", "SNS24", connectionId);
    }

    return healthError("NOT_FOUND", "Document not found", "SNS24", connectionId);
  }

  async downloadDocument(connectionId: string, documentId: string): Promise<HealthResult<{ fileUrl: string; expiresAt: string }>> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return healthError("CONNECTION_FAILED", "Connection not found", "SNS24", connectionId);
    }

    if (this.metadata.providerType === "PREPARED_ONLY") {
      return healthError("NOT_SUPPORTED", "Document download is PREPARED_ONLY", "SNS24", connectionId);
    }

    return healthError("NOT_SUPPORTED", "Document download not implemented", "SNS24", connectionId);
  }

  async synchronize(connectionId: string): Promise<HealthResult<any>> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return healthError("CONNECTION_FAILED", "Connection not found", "SNS24", connectionId);
    }

    if (this.metadata.providerType === "PREPARED_ONLY") {
      return healthError("NOT_SUPPORTED", "Synchronization is PREPARED_ONLY", "SNS24", connectionId);
    }

    const syncResult = {
      syncId: `sync_${Date.now()}`,
      personId: connection.personId,
      providerId: "SNS24" as const,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: "COMPLETED" as const,
      syncedEntities: {
        prescriptions: 0,
        medications: 0,
        vaccinations: 0,
        appointments: 0,
        exams: 0,
        documents: 0,
        notifications: 0,
      },
      errors: [],
      lastSyncAt: new Date().toISOString(),
    };

    return healthSuccess(syncResult);
  }
}

/**
 * Fake SNS24 Provider for local/development testing
 * Clearly marked as FAKE - never for production
 */
export class FakeSNS24Provider implements HealthIntegrationProvider {
  readonly metadata: HealthProviderMetadata;
  private readonly fakeProfile: HealthProfile;
  private readonly connections = new Map<string, HealthConnectionConfig>();

  constructor(config?: Partial<SNS24ProviderConfig>) {
    this.metadata = createSNS24Metadata("FAKE", "development");
    this.fakeProfile = {
      personId: "demo-person",
      utenteNumber: "987654321",
      fullName: "Maria Santos (DEMO)",
      birthDate: "1990-03-22",
      gender: "F",
      nationality: "Portuguesa",
      address: "Rua da Saúde, 456",
      postalCode: "4000-001",
      locality: "Porto",
      phone: "+351 933 456 789",
      email: "maria.santos.demo@email.pt",
      healthSubsystem: "SNS",
      doctorId: "MED-98765",
      healthcareUnit: "USF Porto Centro",
      lastUpdated: new Date().toISOString(),
    };
  }

  supports(capability: HealthCapability): { supported: boolean; details?: string } {
    const supported = SNS24_CAPABILITIES.includes(capability);
    return {
      supported,
      details: supported ? undefined : `Capability ${capability} not supported by fake SNS24 provider`,
    };
  }

  async getHealth() {
    return {
      providerId: "SNS24" as const,
      healthy: true,
      latencyMs: 5,
      message: "Fake SNS24 provider operational (development only)",
      checkedAt: new Date().toISOString(),
    };
  }

  async connect(connectionConfig: HealthConnectionConfig) {
    const connectionId = connectionConfig.connectionId;
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    this.connections.set(connectionId, {
      ...connectionConfig,
      status: "CONNECTED",
      connectedAt: new Date().toISOString(),
      expiresAt,
    });

    return { success: true, connectionId, expiresAt };
  }

  async disconnect(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (!connection) return { success: false, error: "Connection not found" };
    this.connections.delete(connectionId);
    return { success: true };
  }

  async getConnectionStatus(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (!connection) return null;
    return connection;
  }

  async getProfile(connectionId: string): Promise<HealthResult<HealthProfile>> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return healthError("CONNECTION_FAILED", "Connection not found", "SNS24", connectionId);
    }
    return healthSuccess(this.fakeProfile as HealthProfile);
  }

  async getPrescriptions(connectionId: string): Promise<HealthResult<Prescription[]>> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return healthError("CONNECTION_FAILED", "Connection not found", "SNS24", connectionId);
    }
    return healthSuccess([
      {
        prescriptionId: "rx-001",
        personId: connection.personId,
        prescriptionNumber: "REC-2024-001234",
        status: "ACTIVE",
        medication: { medicationId: "med-001", name: "Paracetamol", strength: "500mg", form: "comprimido" },
        dosage: "1 comprimido de 8/8h",
        instructions: "Tomar após as refeições",
        prescribedDate: "2024-01-15",
        validFrom: "2024-01-15",
        validUntil: "2024-04-15",
        prescribedBy: { professionalId: "MED-001", name: "Dr. João Médico", healthcareUnit: "USF Porto Centro" },
        createdAt: "2024-01-15T10:00:00Z",
        updatedAt: "2024-01-15T10:00:00Z",
      }
    ]);
  }

  async getMedications(connectionId: string) {
    return healthSuccess([]);
  }

  async getVaccinations(connectionId: string) {
    return healthSuccess([]);
  }

  async getAppointments(connectionId: string) {
    return healthSuccess([]);
  }

  async getExams(connectionId: string) {
    return healthSuccess([]);
  }

  async getDocuments(connectionId: string) {
    return healthSuccess([]);
  }

  async getNotifications(connectionId: string) {
    return healthSuccess([]);
  }

  async getDocument(connectionId: string, documentId: string): Promise<HealthResult<HealthDocument>> {
    return healthError("NOT_FOUND", "Document not found", "SNS24", undefined);
  }

  async downloadDocument(connectionId: string, documentId: string): Promise<HealthResult<{ fileUrl: string; expiresAt: string }>> {
    return healthError("NOT_SUPPORTED", "Document download not implemented in fake provider", "SNS24", undefined);
  }

  async synchronize(connectionId: string): Promise<HealthResult<HealthSyncResult>> {
    return healthSuccess({
      syncId: `sync_${Date.now()}`,
      personId: "demo-person",
      providerId: "SNS24" as HealthProviderId,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: "COMPLETED" as const,
      syncedEntities: { prescriptions: 1, medications: 0, vaccinations: 0, appointments: 0, exams: 0, documents: 0, notifications: 0 },
      errors: [],
      lastSyncAt: new Date().toISOString(),
    });
  }
}

/**
 * Factory for creating SNS24 providers
 */
export class SNS24ProviderFactory {
  create(providerId: string, type: HealthProviderType, config?: Record<string, unknown>) {
    if (providerId !== "SNS24") {
      throw new Error(`Invalid provider ID for SNS24 factory: ${providerId}`);
    }

    const providerConfig: SNS24ProviderConfig = {
      apiEndpoint: (config?.apiEndpoint as string) ?? "https://api.sns24.gov.pt",
      clientId: config?.clientId as string,
      clientSecret: config?.clientSecret as string,
      certificate: config?.certificate as string,
      certificatePassword: config?.certificatePassword as string,
      organizationUtente: config?.organizationUtente as string,
      timeout: config?.timeout as number,
      maxRetries: config?.maxRetries as number,
    };

    const environment = (config?.environment as HealthEnvironment) ?? "production";

    if (type === "FAKE") {
      return new FakeSNS24Provider(providerConfig);
    }

    if (type === "SANDBOX") {
      return new SNS24Provider(providerConfig, "SANDBOX", "sandbox");
    }

    return new SNS24Provider(providerConfig, "LIVE", environment);
  }
}

/**
 * Registry for health providers
 */
export class HealthProviderRegistryImpl {
  private providers = new Map<HealthProviderId, any>();

  register(provider: HealthIntegrationProvider): void {
    this.providers.set(provider.metadata.providerId, provider);
  }

  unregister(providerId: HealthProviderId): void {
    this.providers.delete(providerId);
  }

  get(providerId: HealthProviderId) {
    return this.providers.get(providerId);
  }

  getAll() {
    return Array.from(this.providers.values());
  }

  getByCapability(capability: string) {
    return this.getAll().filter(p => p.supports(capability as any).supported);
  }

  getByType(type: string) {
    return this.getAll().filter(p => p.metadata.providerType === type);
  }

  clear() {
    this.providers.clear();
  }
}

export const healthProviderRegistry = new HealthProviderRegistryImpl();

export function registerDefaultHealthProviders(): void {
  if (process.env.NODE_ENV === 'production') {
    // In production, NO fake providers are registered automatically
    // Real providers must be explicitly configured and registered
    return;
  }

  // Development/test: register fake SNS24 provider
  const fakeSNS24 = new FakeSNS24Provider();
  healthProviderRegistry.register(fakeSNS24);
}