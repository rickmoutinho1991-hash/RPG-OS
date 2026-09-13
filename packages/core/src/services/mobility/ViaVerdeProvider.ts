/**
 * RPG-OS Via Verde Provider
 * 
 * Provider for Via Verde electronic toll services.
 * 
 * Status: PREPARED_ONLY
 * 
 * Via Verde does not currently expose a public REST API that can be called programmatically.
 * All interactions are through the web portal (A Minha Via Verde) and mobile apps.
 * Official onboarding with credentials is required for LIVE/SANDBOX access.
 * 
 * This provider implements the MobilityIntegrationProvider interface with PREPARED_ONLY
 * status, making the system ready for future official onboarding.
 */

import { 
  MobilityIntegrationProvider, 
  MobilityProviderId, 
  MobilityProviderType, 
  MobilityEnvironment, 
  MobilityCapability, 
  MobilityProviderMetadata, 
  MobilityConsentScope, 
  MobilityProviderStatus, 
  MobilityResult, 
  MobilityVehicle, 
  MobilityTollTransaction, 
  MobilityTollDebt, 
  MobilityPayment, 
  MobilityInvoice, 
  MobilityDocument, 
  MobilityNotification, 
  MobilityConnectionConfig, 
  MobilityConnectionStatus,
  MobilityError, 
  MobilityErrorCode,
  MobilityProviderFactory,
  MobilityProviderRegistry
} from "../../types/mobility";

/** Via Verde Provider - PREPARED_ONLY */
export class ViaVerdeProvider implements MobilityIntegrationProvider {
  readonly metadata: MobilityProviderMetadata;

  constructor(config?: Partial<{ apiEndpoint: string; clientId: string; clientSecret: string }>) {
    this.metadata = {
      providerId: "ViaVerde",
      providerType: "PREPARED_ONLY",
      country: "PT",
      environment: "production",
      capabilities: [
        "READ_PROFILE",
        "READ_VEHICLES",
        "READ_TOLL_TRANSACTIONS",
        "READ_TOLL_DEBTS",
        "READ_PAYMENTS",
        "READ_INVOICES",
        "READ_RECEIPTS",
        "READ_DOCUMENTS",
        "READ_NOTIFICATIONS",
        "SYNC_VEHICLES",
        "SYNC_TRANSACTIONS",
        "SYNC_DEBTS",
        "SYNC_PAYMENTS",
        "SYNC_DOCUMENTS",
        "GET_CONNECTION_STATUS"
      ],
      authMethod: "NONE",
      status: "PREPARED_ONLY",
      version: "1.0",
      documentationUrl: "https://www.viaverde.pt",
      sandboxAvailable: false,
      liveAvailable: false,
      lastUpdated: new Date().toISOString()
    };
  }

  /** Check production safety - throws in production without ALLOW_FAKE_PROVIDERS */
  static checkProductionSafety(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error("PROVIDER_UNAVAILABLE: Via Verde provider requires official onboarding. " +
        "Set ALLOW_FAKE_PROVIDERS=false (default) to fail-closed in production.");
    }
  }

  /** Validate production safety before operations */
  static validate(): void {
    this.checkProductionSafety();
  }

  /** Capability check */
  supports(capability: MobilityCapability): { supported: boolean; details?: string } {
    // All capabilities are PREPARED_ONLY - not available without official onboarding
    return {
      supported: false,
      details: `Capability "${capability}" is PREPARED_ONLY - official Via Verde onboarding required`
    };
  }

  /** Get connection status */
  async getConnectionStatus(connectionId: string): Promise<MobilityConnectionStatus> {
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      throw new Error(`PROVIDER_UNAVAILABLE: ${(err as Error).message}`);
    }
    return {
      connectionId,
      provider: "ViaVerde",
      status: "PREPARED_ONLY",
      connectedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      lastSyncAt: new Date().toISOString(),
      lastError: "PREPARED_ONLY: official onboarding required",
      scopes: []
    };
  }

  /** Connect to Via Verde */
  async connect(config: MobilityConnectionConfig): Promise<{
    success: boolean;
    connectionId: string;
    expiresAt?: string;
    error?: string;
  }> {
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, connectionId: config.connectionId, error: (err as Error).message };
    }
    return {
      success: false,
      connectionId: config.connectionId,
      error: "Conexão Via Verde requires official onboarding. Status: PREPARED_ONLY"
    };
  }

  /** Disconnect from Via Verde */
  async disconnect(connectionId: string): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: "Desconexão Via Verde requires official onboarding. Status: PREPARED_ONLY"
    };
  }

  /** Get vehicles - PREPARED_ONLY */
  async getVehicles(connectionId: string): Promise<MobilityResult<MobilityVehicle[]>> {
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "ViaVerde", connectionId } };
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY", message: "Consulta de veículos Via Verde requires official onboarding. Status: PREPARED_ONLY. " +
        "Em A Minha Via Verde > Veículos, the status shows 'Preparado para integração oficial'.", providerId: "ViaVerde", connectionId }
    };
  }

  /** Get toll transactions - PREPARED_ONLY */
  async getTollTransactions(connectionId: string): Promise<MobilityResult<MobilityTollTransaction[]>> {
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "ViaVerde", connectionId } };
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY", message: "Histórico de transações de portagem Via Verde requires official onboarding. Status: PREPARED_ONLY. " +
        "Em A Minha Via Verde > Portagens > Movimentos, the status shows 'Preparado para integração oficial'.", providerId: "ViaVerde", connectionId }
    };
  }

  /** Get toll debts - PREPARED_ONLY */
  async getTollDebts(connectionId: string): Promise<MobilityResult<MobilityTollDebt[]>> {
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "ViaVerde", connectionId } };
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY", message: "Consulta de débitos Via Verde requires official onboarding. Status: PREPARED_ONLY. " +
        "Em A Minha Via Verde > Débitos, the status shows 'Preparado para integração oficial'.", providerId: "ViaVerde", connectionId }
    };
  }

  /** Get payments - PREPARED_ONLY */
  async getPayments(connectionId: string): Promise<MobilityResult<MobilityPayment[]>> {
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "ViaVerde", connectionId } };
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY", message: "Consulta de pagamentos Via Verde requires official onboarding. Status: PREPARED_ONLY. " +
        "Em A Minha Via Verde > Pagamentos, the status shows 'Preparado para integração oficial'.", providerId: "ViaVerde", connectionId }
    };
  }

  /** Get invoices - PREPARED_ONLY */
  async getInvoices(connectionId: string): Promise<MobilityResult<MobilityInvoice[]>> {
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "ViaVerde", connectionId } };
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY", message: "Consulta de faturas Via Verde requires official onboarding. Status: PREPARED_ONLY. " +
        "Em A Minha Via Verde > Faturas, the status shows 'Preparado para integração oficial'.", providerId: "ViaVerde", connectionId }
    };
  }

  /** Get receipts/documents - PREPARED_ONLY */
  async getReceipts(connectionId: string): Promise<MobilityResult<MobilityDocument[]>> {
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "ViaVerde", connectionId } };
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY", message: "Consulta de recibos/documentos Via Verde requires official onboarding. Status: PREPARED_ONLY. " +
        "Em A Minha Via Verde > Documentos, the status shows 'Preparado para integração oficial'.", providerId: "ViaVerde", connectionId }
    };
  }

  /** Get documents - PREPARED_ONLY */
  async getDocuments(connectionId: string): Promise<MobilityResult<MobilityDocument[]>> {
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "ViaVerde", connectionId } };
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY", message: "Consulta de documentos Via Verde requires official onboarding. Status: PREPARED_ONLY. " +
        "Em A Minha Via Verde > Documentos, the status shows 'Preparado para integração oficial'.", providerId: "ViaVerde", connectionId }
    };
  }

  /** Get notifications - PREPARED_ONLY */
  async getNotifications(connectionId: string): Promise<MobilityResult<MobilityNotification[]>> {
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "ViaVerde", connectionId } };
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY", message: "Consulta de notificações Via Verde requires official onboarding. Status: PREPARED_ONLY. " +
        "Em A Minha Via Verde > Notificações, the status shows 'Preparado para integração oficial'.", providerId: "ViaVerde", connectionId }
    };
  }

  /** Sync vehicles - PREPARED_ONLY */
  async syncVehicles(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "ViaVerde", connectionId } };
    }
    return { success: false, error: { code: "PREPARED_ONLY", message: "Sincronização de veículos Via Verde requires official onboarding. Status: PREPARED_ONLY", providerId: "ViaVerde", connectionId } };
  }

  /** Sync transactions - PREPARED_ONLY */
  async syncTransactions(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "ViaVerde", connectionId } };
    }
    return { success: false, error: { code: "PREPARED_ONLY", message: "Sincronização de transações Via Verde requires official onboarding. Status: PREPARED_ONLY", providerId: "ViaVerde", connectionId } };
  }

  /** Sync debts - PREPARED_ONLY */
  async syncDebts(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "ViaVerde", connectionId } };
    }
    return { success: false, error: { code: "PREPARED_ONLY", message: "Sincronização de débitos Via Verde requires official onboarding. Status: PREPARED_ONLY", providerId: "ViaVerde", connectionId } };
  }

  /** Sync payments - PREPARED_ONLY */
  async syncPayments(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "ViaVerde", connectionId } };
    }
    return { success: false, error: { code: "PREPARED_ONLY", message: "Sincronização de pagamentos Via Verde requires official onboarding. Status: PREPARED_ONLY", providerId: "ViaVerde", connectionId } };
  }

  /** Sync documents - PREPARED_ONLY */
  async syncDocuments(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "ViaVerde", connectionId } };
    }
    return { success: false, error: { code: "PREPARED_ONLY", message: "Sincronização de documentos Via Verde requires official onboarding. Status: PREPARED_ONLY", providerId: "ViaVerde", connectionId } };
  }

  /** Sync notifications - PREPARED_ONLY */
  async syncNotifications(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "ViaVerde", connectionId } };
    }
    return { success: false, error: { code: "PREPARED_ONLY", message: "Sincronização de notificações Via Verde requires official onboarding. Status: PREPARED_ONLY", providerId: "ViaVerde", connectionId } };
  }
}

/** Factory for creating Via Verde providers */
export const ViaVerdeProviderFactory: any = {
  create(providerId: any, type: any, config?: Record<string, unknown>): any {
    if (providerId !== "ViaVerde") {
      throw new Error(`Invalid provider ID for Via Verde factory: ${providerId}`);
    }
    const provider = new ViaVerdeProvider(config as any);
    // Production safety check
    try {
      ViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      // In production, re-throw; in development, still create but mark
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
    }
    return provider;
  }
};

/** Register Via Verde provider in registry */
export const registerViaVerdeProvider = (registry: any): void => {
  const provider = ViaVerdeProviderFactory.create("ViaVerde", "PREPARED_ONLY");
  try {
    ViaVerdeProvider.checkProductionSafety();
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
  }
  registry.register(provider);
};

/** Get default Via Verde provider */
export const getViaVerdeProvider = (registry: any): any => {
  return registry.get("ViaVerde");
};