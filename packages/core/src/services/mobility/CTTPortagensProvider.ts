/**
 * RPG-OS CTT Portagens Provider
 * 
 * Provider for CTT / Portagens electronic toll services.
 * 
 * Status: PREPARED_ONLY
 * 
 * CTT/Portagens does not currently expose a public REST API that can be called programmatically.
 * All interactions are through the web portal (Área de Cliente CTT) and mobile apps.
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

/** CTT Portagens Provider - PREPARED_ONLY */
export class CTTPortagensProvider implements MobilityIntegrationProvider {
  readonly metadata: MobilityProviderMetadata;

  constructor(config?: Partial<{ apiEndpoint: string; clientId: string; clientSecret: string }>) {
    this.metadata = {
      providerId: "CTTPortagens",
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
      documentationUrl: "https://www.ctt.pt",
      sandboxAvailable: false,
      liveAvailable: false,
      lastUpdated: new Date().toISOString()
    };
  }

  /** Check production safety - throws in production without ALLOW_FAKE_PROVIDERS */
  static checkProductionSafety(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error("PROVIDER_UNAVAILABLE: CTT Portagens provider requires official onboarding. " +
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
      details: `Capability "${capability}" is PREPARED_ONLY - official CTT Portagens onboarding required`
    };
  }

  /** Get connection status */
  async getConnectionStatus(connectionId: string): Promise<MobilityConnectionStatus> {
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      throw new Error(`FAKE_NOT_ALLOWED: ${(err as Error).message}`);
    }
    return {
      connectionId,
      provider: "CTTPortagens",
      status: "PREPARED_ONLY",
      connectedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      lastSyncAt: new Date().toISOString(),
      lastError: "PREPARED_ONLY: official onboarding required",
      scopes: []
    };
  }

  /** Connect to CTT Portagens */
  async connect(config: MobilityConnectionConfig): Promise<{
    success: boolean;
    connectionId: string;
    expiresAt?: string;
    error?: string;
  }> {
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, connectionId: config.connectionId, error: (err as Error).message };
    }
    return {
      success: false,
      connectionId: config.connectionId,
      error: "Conexão CTT Portagens requires official onboarding. Status: PREPARED_ONLY"
    };
  }

  /** Disconnect from CTT Portagens */
  async disconnect(connectionId: string): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: "Desconexão CTT Portagens requires official onboarding. Status: PREPARED_ONLY"
    };
  }

  /** Get vehicles - PREPARED_ONLY */
  async getVehicles(connectionId: string): Promise<MobilityResult<MobilityVehicle[]>> {
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: "Fake provider not allowed", providerId: "CTTPortagens" as any, connectionId } };
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY", message: "Consulta de veículos CTT requires official onboarding. Status: PREPARED_ONLY. " +
        "Em Área de Cliente CTT > Veículos, the status shows 'Preparado para integração oficial'.", providerId: "CTTPortagens", connectionId }
    };
  }

  /** Get toll transactions - PREPARED_ONLY */
  async getTollTransactions(connectionId: string): Promise<MobilityResult<MobilityTollTransaction[]>> {
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "CTTPortagens", connectionId } };
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY", message: "Histórico de transações de portagem CTT requires official onboarding. Status: PREPARED_ONLY. " +
        "Em Área de Cliente CTT > Portagens > Histórico de Passagens, the status shows 'Preparado para integração oficial'.", providerId: "CTTPortagens", connectionId }
    };
  }

  /** Get toll debts - PREPARED_ONLY */
  async getTollDebts(connectionId: string): Promise<MobilityResult<MobilityTollDebt[]>> {
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "CTTPortagens", connectionId } };
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY", message: "Consulta de débitos CTT requires official onboarding. Status: PREPARED_ONLY. " +
        "Em Área de Cliente CTT > Portagens em Dívida, the status shows 'Preparado para integração oficial'.", providerId: "CTTPortagens", connectionId }
    };
  }

  /** Get payments - PREPARED_ONLY */
  async getPayments(connectionId: string): Promise<MobilityResult<MobilityPayment[]>> {
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "CTTPortagens", connectionId } };
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY", message: "Consulta de pagamentos CTT requires official onboarding. Status: PREPARED_ONLY. " +
        "Em Área de Cliente CTT > Pagamentos, the status shows 'Preparado para integração oficial'.", providerId: "CTTPortagens", connectionId }
    };
  }

  /** Get invoices - PREPARED_ONLY */
  async getInvoices(connectionId: string): Promise<MobilityResult<MobilityInvoice[]>> {
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "CTTPortagens", connectionId } };
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY", message: "Consulta de faturas CTT requires official onboarding. Status: PREPARED_ONLY. " +
        "Em Área de Cliente CTT > Faturas, the status shows 'Preparado para integração oficial'.", providerId: "CTTPortagens", connectionId }
    };
  }

  /** Get receipts/documents - PREPARED_ONLY */
  async getReceipts(connectionId: string): Promise<MobilityResult<MobilityDocument[]>> {
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "CTTPortagens", connectionId } };
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY", message: "Consulta de recibos/documentos CTT requires official onboarding. Status: PREPARED_ONLY. " +
        "Em Área de Cliente CTT > Recibos, the status shows 'Preparado para integração oficial'.", providerId: "CTTPortagens", connectionId }
    };
  }

  /** Get documents - PREPARED_ONLY */
  async getDocuments(connectionId: string): Promise<MobilityResult<MobilityDocument[]>> {
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "CTTPortagens", connectionId } };
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY", message: "Consulta de documentos CTT requires official onboarding. Status: PREPARED_ONLY. " +
        "Em Área de Cliente CTT > Documentos, the status shows 'Preparado para integração oficial'.", providerId: "CTTPortagens", connectionId }
    };
  }

  /** Get notifications - PREPARED_ONLY */
  async getNotifications(connectionId: string): Promise<MobilityResult<MobilityNotification[]>> {
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "CTTPortagens", connectionId } };
    }
    return {
      success: false,
      error: { code: "PREPARED_ONLY", message: "Consulta de notificações CTT requires official onboarding. Status: PREPARED_ONLY. " +
        "Em Área de Cliente CTT > Notificações, the status shows 'Preparado para integração oficial'.", providerId: "CTTPortagens", connectionId }
    };
  }

  /** Sync vehicles - PREPARED_ONLY */
  async syncVehicles(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "CTTPortagens", connectionId } };
    }
    return { success: false, error: { code: "PREPARED_ONLY", message: "Sincronização de veículos CTT requires official onboarding. Status: PREPARED_ONLY", providerId: "CTTPortagens", connectionId } };
  }

  /** Sync transactions - PREPARED_ONLY */
  async syncTransactions(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "CTTPortagens", connectionId } };
    }
    return { success: false, error: { code: "PREPARED_ONLY", message: "Sincronização de transações CTT requires official onboarding. Status: PREPARED_ONLY", providerId: "CTTPortagens", connectionId } };
  }

  /** Sync debts - PREPARED_ONLY */
  async syncDebts(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "CTTPortagens", connectionId } };
    }
    return { success: false, error: { code: "PREPARED_ONLY", message: "Sincronização de débitos CTT requires official onboarding. Status: PREPARED_ONLY", providerId: "CTTPortagens", connectionId } };
  }

  /** Sync payments - PREPARED_ONLY */
  async syncPayments(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "CTTPortagens", connectionId } };
    }
    return { success: false, error: { code: "PREPARED_ONLY", message: "Sincronização de pagamentos CTT requires official onboarding. Status: PREPARED_ONLY", providerId: "CTTPortagens", connectionId } };
  }

  /** Sync documents - PREPARED_ONLY */
  async syncDocuments(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "CTTPortagens", connectionId } };
    }
    return { success: false, error: { code: "PREPARED_ONLY", message: "Sincronização de documentos CTT requires official onboarding. Status: PREPARED_ONLY", providerId: "CTTPortagens", connectionId } };
  }

  /** Sync notifications - PREPARED_ONLY */
  async syncNotifications(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>> {
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "PREPARED_ONLY", message: (err as Error).message, providerId: "CTTPortagens", connectionId } };
    }
    return { success: false, error: { code: "PREPARED_ONLY", message: "Sincronização de notificações CTT requires official onboarding. Status: PREPARED_ONLY", providerId: "CTTPortagens", connectionId } };
  }
}

/** Factory for creating CTT Portagens providers */
export const CTTPortagensProviderFactory: any = {
  create(providerId: any, type: any, config?: Record<string, unknown>): any {
    if (providerId !== "CTTPortagens") {
      throw new Error(`Invalid provider ID for CTT Portagens factory: ${providerId}`);
    }
    const provider = new CTTPortagensProvider(config as any);
    // Production safety check
    try {
      CTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      // In production, re-throw; in development, still create but mark
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
    }
    return provider;
  }
};

/** Register CTT Portagens provider in registry */
export const registerCTTPortagensProvider = (registry: any): void => {
  const provider = CTTPortagensProviderFactory.create("CTTPortagens", "PREPARED_ONLY");
  try {
    CTTPortagensProvider.checkProductionSafety();
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
  }
  registry.register(provider);
};

/** Get default CTT Portagens provider */
export const getCTTPortagensProvider = (registry: any): any => {
  return registry.get("CTTPortagens");
};