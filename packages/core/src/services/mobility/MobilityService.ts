/**
 * RPG-OS Mobility Service
 * 
 * Main service for the "A Minha Mobilidade" module.
 * Follows the RPG-OS architecture pattern (based on HealthService).
 * 
 * All capabilities are classified as PREPARED_ONLY until official onboarding
 * with authorized production access is obtained.
 */

import { 
  MobilityProviderId, 
  MobilityProviderType, 
  MobilityEnvironment,
  MobilityIntegrationProvider, 
  MobilityConnectionConfig, 
  MobilityConsentScope, 
  MobilityProviderStatus, 
  MobilityCapability, 
  MobilityConsent, 
  MobilityVehicle, 
  MobilityTollTransaction, 
  MobilityTollDebt, 
  MobilityPayment, 
  MobilityInvoice, 
  MobilityDocument, 
  MobilityNotification, 
  MobilityIntegrationStatus, 
  MobilityProviderMetadata, 
  MobilityResult, 
  MobilityError, 
  MobilityErrorCode,
  MobilityProviderFactory,
  MobilityConnectionStatus
} from "../../types/mobility";

/** Fake providers registry (development/test only) */
const fakeProviders = new Map<MobilityProviderId, MobilityIntegrationProvider>();

/** Default provider registry implementation */
export class MobilityProviderRegistry {
  private providers = new Map<MobilityProviderId, MobilityIntegrationProvider>();

  register(provider: MobilityIntegrationProvider): void {
    this.providers.set(provider.metadata.providerId, provider);
  }

  unregister(providerId: MobilityProviderId): void {
    this.providers.delete(providerId);
  }

  get(providerId: MobilityProviderId): MobilityIntegrationProvider | undefined {
    return this.providers.get(providerId);
  }

  getAll(): MobilityIntegrationProvider[] {
    return Array.from(this.providers.values());
  }

  getByCapability(capability: MobilityCapability): MobilityIntegrationProvider[] {
    return Array.from(this.providers.values()).filter((p) => p.supports(capability).supported);
  }

  getByType(type: MobilityProviderType): MobilityIntegrationProvider[] {
    return Array.from(this.providers.values()).filter((p) => p.metadata.providerType === type);
  }

  clear(): void {
    this.providers.clear();
  }

  // Production fail-closed: prevent fake providers in production
  static checkProductionSafety(provider: MobilityIntegrationProvider): boolean {
    if (process.env.NODE_ENV === 'production') {
      if (provider.metadata.providerType === "FAKE") {
        throw new Error("PROVIDER_UNAVAILABLE: Fake providers are not allowed in production. " +
          "Set ALLOW_FAKE_PROVIDERS=true only for development/testing.");
      }
    }
    return true;
  }
}

/** Mobility service main implementation */
export class MobilityService {
  private registry: MobilityProviderRegistry;
  private factory: MobilityProviderFactory;

  constructor(registry: MobilityProviderRegistry, factory: MobilityProviderFactory) {
    this.registry = registry;
    this.factory = factory;
  }

  /** Get a provider by ID */
  getProvider(providerId: MobilityProviderId): MobilityIntegrationProvider | undefined {
    return this.registry.get(providerId);
  }

  /** Get all registered providers */
  getAllProviders(): MobilityIntegrationProvider[] {
    return this.registry.getAll();
  }

  /** Check production safety */
  static validateProduction(provider: MobilityIntegrationProvider): boolean {
    return MobilityProviderRegistry.checkProductionSafety(provider);
  }

  /** Get connection status */
  async getConnectionStatus(connectionId: string): Promise<MobilityConnectionStatus> {
    // Try registered providers
    for (const provider of this.registry.getAll()) {
      try {
        const status = await provider.getConnectionStatus(connectionId);
        return status;
      } catch (err) {
        // Continue to next provider
        continue;
      }
    }
    throw new Error("Connection not found");
  }

  /** Connect to a provider */
  async connect(config: MobilityConnectionConfig): Promise<MobilityResult<{ connectionId: string; expiresAt?: string; error?: string }>> {
    // Try registered providers
    for (const provider of this.registry.getAll()) {
      try {
        const result = await provider.connect(config);
        if (result.success) {
          return { success: true, data: { connectionId: result.connectionId, expiresAt: result.expiresAt } };
        }
      } catch (err) {
        // Continue to next provider
        continue;
      }
    }
    return { success: false, error: { code: "CONNECTION_FAILED" as MobilityErrorCode, message: "Connection failed", providerId: "UNKNOWN" as MobilityProviderId, connectionId: config.connectionId } };
  }

  /** Disconnect from a provider */
  async disconnect(connectionId: string): Promise<MobilityResult<{ success: boolean; error?: string }>> {
    // Try registered providers
    for (const provider of this.registry.getAll()) {
      try {
        const result = await provider.disconnect(connectionId);
        return { success: true, data: { success: true, error: result.error } };
      } catch (err) {
        // Continue to next provider
        continue;
      }
    }
    return { success: false, error: { code: "CONNECTION_FAILED" as MobilityErrorCode, message: "Connection not found", providerId: "UNKNOWN" as MobilityProviderId, connectionId } };
  }

  /** Get vehicles */
  async getVehicles(connectionId: string): Promise<MobilityResult<MobilityVehicle[]>> {
    // Try registered providers
    for (const provider of this.registry.getAll()) {
      try {
        const result = await provider.getVehicles(connectionId);
        if (result.success) {
          return { success: true, data: result.data };
        }
      } catch (err) {
        continue;
      }
    }
    // Return PREPARED_ONLY status when no provider available
    return {
      success: false,
      error: { code: "PREPARED_ONLY" as MobilityErrorCode, message: "Veículo consultation requires official onboarding. Status: PREPARED_ONLY", providerId: "UNKNOWN" as MobilityProviderId, connectionId }
    };
  }

  /** Get toll transactions */
  async getTollTransactions(connectionId: string): Promise<MobilityResult<MobilityTollTransaction[]>> {
    for (const provider of this.registry.getAll()) {
      try {
        const result = await provider.getTollTransactions(connectionId);
        if (result.success) {
          return { success: true, data: result.data };
        }
      } catch (err) {
        continue;
      }
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY" as MobilityErrorCode, message: "Histórico de transações de portagem requires official onboarding. Status: PREPARED_ONLY", providerId: "UNKNOWN" as MobilityProviderId, connectionId }
    };
  }

  /** Get toll debts */
  async getTollDebts(connectionId: string): Promise<MobilityResult<MobilityTollDebt[]>> {
    for (const provider of this.registry.getAll()) {
      try {
        const result = await provider.getTollDebts(connectionId);
        if (result.success) {
          return { success: true, data: result.data };
        }
      } catch (err) {
        continue;
      }
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY" as MobilityErrorCode, message: "Consulta de débitos requires official onboarding. Status: PREPARED_ONLY", providerId: "UNKNOWN" as MobilityProviderId, connectionId }
    };
  }

  /** Get payments */
  async getPayments(connectionId: string): Promise<MobilityResult<MobilityPayment[]>> {
    for (const provider of this.registry.getAll()) {
      try {
        const result = await provider.getPayments(connectionId);
        if (result.success) {
          return { success: true, data: result.data };
        }
      } catch (err) {
        continue;
      }
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY" as MobilityErrorCode, message: "Consulta de pagamentos requires official onboarding. Status: PREPARED_ONLY", providerId: "UNKNOWN" as MobilityProviderId, connectionId }
    };
  }

  /** Get invoices */
  async getInvoices(connectionId: string): Promise<MobilityResult<MobilityInvoice[]>> {
    for (const provider of this.registry.getAll()) {
      try {
        const result = await provider.getInvoices(connectionId);
        if (result.success) {
          return { success: true, data: result.data };
        }
      } catch (err) {
        continue;
      }
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY" as MobilityErrorCode, message: "Consulta de faturas requires official onboarding. Status: PREPARED_ONLY", providerId: "UNKNOWN" as MobilityProviderId, connectionId }
    };
  }

  /** Get receipts/documents */
  async getReceipts(connectionId: string): Promise<MobilityResult<MobilityDocument[]>> {
    for (const provider of this.registry.getAll()) {
      try {
        const result = await provider.getReceipts(connectionId);
        if (result.success) {
          return { success: true, data: result.data };
        }
      } catch (err) {
        continue;
      }
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY" as MobilityErrorCode, message: "Consulta de recibos/documentos requires official onboarding. Status: PREPARED_ONLY", providerId: "UNKNOWN" as MobilityProviderId, connectionId }
    };
  }

/** Get documents */
  async getDocuments(connectionId: string): Promise<MobilityResult<MobilityDocument[]>> {
    for (const provider of this.registry.getAll()) {
      try {
        const result = await provider.getDocuments(connectionId);
        if (result.success) {
          return { success: true, data: result.data };
        }
      } catch (err) {
        continue;
      }
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY" as MobilityErrorCode, message: "Consulta de documentos requires official onboarding. Status: PREPARED_ONLY", providerId: "UNKNOWN" as MobilityProviderId, connectionId }
    };
  }

  /** Get notifications */
  async getNotifications(connectionId: string): Promise<MobilityResult<MobilityNotification[]>> {
    for (const provider of this.registry.getAll()) {
      try {
        const result = await provider.getNotifications(connectionId);
        if (result.success) {
          return { success: true, data: result.data };
        }
      } catch (err) {
        continue;
      }
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY" as MobilityErrorCode, message: "Consulta de notificações requires official onboarding. Status: PREPARED_ONLY", providerId: "UNKNOWN" as MobilityProviderId, connectionId }
    };
  }

  /** Sync vehicles */
  async syncVehicles(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    for (const provider of this.registry.getAll()) {
      try {
        const result = await provider.syncVehicles(connectionId);
        if (result.success) {
          return { success: true, data: { inserted: result.data?.inserted ?? 0, updated: result.data?.updated ?? 0, errors: result.data?.errors ?? [] } };
        }
      } catch (err) {
        continue;
      }
    }
    return { success: false, error: { code: "PREPARED_ONLY" as MobilityErrorCode, message: "Sincronização de veículos requires official onboarding. Status: PREPARED_ONLY", providerId: "UNKNOWN" as MobilityProviderId } };
  }

  /** Sync transactions */
  async syncTransactions(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    for (const provider of this.registry.getAll()) {
      try {
        const result = await provider.syncTransactions(connectionId);
        if (result.success) {
          return { success: true, data: { inserted: result.data?.inserted ?? 0, updated: result.data?.updated ?? 0, errors: result.data?.errors ?? [] } };
        }
      } catch (err) {
        continue;
      }
    }
    return { success: false, error: { code: "PREPARED_ONLY" as MobilityErrorCode, message: "Sincronização de transações requires official onboarding. Status: PREPARED_ONLY", providerId: "UNKNOWN" as MobilityProviderId } };
  }

  /** Sync debts */
  async syncDebts(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    for (const provider of this.registry.getAll()) {
      try {
        const result = await provider.syncDebts(connectionId);
        if (result.success) {
          return { success: true, data: { inserted: result.data?.inserted ?? 0, updated: result.data?.updated ?? 0, errors: result.data?.errors ?? [] } };
        }
      } catch (err) {
        continue;
      }
    }
    return { success: false, error: { code: "PREPARED_ONLY" as MobilityErrorCode, message: "Sincronização de débitos requires official onboarding. Status: PREPARED_ONLY", providerId: "UNKNOWN" as MobilityProviderId } };
  }

  /** Sync payments */
  async syncPayments(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    for (const provider of this.registry.getAll()) {
      try {
        const result = await provider.syncPayments(connectionId);
        if (result.success) {
          return { success: true, data: { inserted: result.data?.inserted ?? 0, updated: result.data?.updated ?? 0, errors: result.data?.errors ?? [] } };
        }
      } catch (err) {
        continue;
      }
    }
    return { success: false, error: { code: "PREPARED_ONLY" as MobilityErrorCode, message: "Sincronização de pagamentos requires official onboarding. Status: PREPARED_ONLY", providerId: "UNKNOWN" as MobilityProviderId } };
  }

  /** Sync documents */
  async syncDocuments(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    for (const provider of this.registry.getAll()) {
      try {
        const result = await provider.syncDocuments(connectionId);
        if (result.success) {
          return { success: true, data: { inserted: result.data?.inserted ?? 0, updated: result.data?.updated ?? 0, errors: result.data?.errors ?? [] } };
        }
      } catch (err) {
        continue;
      }
    }
    return { success: false, error: { code: "PREPARED_ONLY" as MobilityErrorCode, message: "Sincronização de documentos requires official onboarding. Status: PREPARED_ONLY", providerId: "UNKNOWN" as MobilityProviderId } };
  }

  /** Sync notifications */
  async syncNotifications(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    for (const provider of this.registry.getAll()) {
      try {
        const result = await provider.syncNotifications(connectionId);
        if (result.success) {
          return { success: true, data: { inserted: result.data?.inserted ?? 0, updated: result.data?.updated ?? 0, errors: result.data?.errors ?? [] } };
        }
      } catch (err) {
        continue;
      }
    }
    return { success: false, error: { code: "PREPARED_ONLY" as MobilityErrorCode, message: "Sincronização de notificações requires official onboarding. Status: PREPARED_ONLY", providerId: "UNKNOWN" as MobilityProviderId } };
  }
}

/** Default MobilityService instance (using registry and factory) */
export const defaultMobilityService = (registry: MobilityProviderRegistry, factory: MobilityProviderFactory) => new MobilityService(registry, factory);