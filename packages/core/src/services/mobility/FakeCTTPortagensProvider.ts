/**
 * RPG-OS Fake CTT Portagens Provider
 * 
 * Fake provider for CTT Portagens - ONLY for tests/development.
 * 
 * Production MUST fail closed with ALLOW_FAKE_PROVIDERS=false.
 * 
 * NEVER presents fabricated data as real information.
 * All fake data is clearly marked as TEST/DEMO.
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

/** Fake CTT Portagens Provider - ONLY for tests/development */
export class FakeCTTPortagensProvider implements MobilityIntegrationProvider {
  readonly metadata: MobilityProviderMetadata;
  private readonly connections = new Map<string, any>();

  constructor(config?: Partial<{ apiEndpoint: string; clientId: string; clientSecret: string }>) {
    this.metadata = {
      providerId: "CTTPortagens",
      providerType: "FAKE",
      country: "PT",
      environment: "development",
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
      status: "FAKE",
      version: "1.0-test",
      documentationUrl: "https://www.ctt.pt",
      sandboxAvailable: false,
      liveAvailable: false,
      lastUpdated: new Date().toISOString()
    };
  }

  /** Check production safety - throws in production */
  static checkProductionSafety(): void {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_FAKE_PROVIDERS !== 'true') {
      throw new Error("PROVIDER_UNAVAILABLE: Fake providers are not allowed in production. " +
        "Set ALLOW_FAKE_PROVIDERS=true only for development/testing.");
    }
  }

  /** Capability check */
  supports(capability: any): { supported: boolean; details?: string } {
    const isSupported = this.metadata.capabilities.includes(capability);
    return {
      supported: isSupported,
      details: isSupported ? "Supported in fake provider (development only)" : "Not implemented in fake provider"
    };
  }

  /** Get connection status - fake implementation */
  async getConnectionStatus(connectionId: string): Promise<any> {
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: (err as Error).message, providerId: "CTTPortagens", connectionId } };
    }
    const connection = this.connections.get(connectionId);
    if (!connection) return null;
    return {
      success: true,
      data: {
        connectionId,
        provider: "CTTPortagens",
        status: connection.status,
        connectedAt: connection.connectedAt,
        expiresAt: connection.expiresAt,
        lastSyncAt: connection.lastSyncAt,
        lastError: connection.lastError,
        scopes: connection.scopes
      }
    };
  }

  /** Connect - fake implementation */
  async connect(config: any): Promise<any> {
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed in production", providerId: "CTTPortagens", connectionId: config.connectionId } };
    }
    const connectionId = config.connectionId;
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    this.connections.set(connectionId, {
      ...config,
      status: "CONNECTED",
      connectedAt: new Date().toISOString(),
      expiresAt
    });
    return { success: true, connectionId, expiresAt };
  }

  /** Disconnect */
  async disconnect(connectionId: string): Promise<any> {
    const connection = this.connections.get(connectionId);
    if (!connection) return { success: false, error: "Connection not found" };
    this.connections.delete(connectionId);
    return { success: true };
  }

  /** Get vehicles - fake demo data */
  async getVehicles(connectionId: string): Promise<any> {
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: (err as Error).message, providerId: "CTTPortagens", connectionId } };
    }
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: { code: "CONNECTION_FAILED", message: "Connection not found", providerId: "CTTPortagens", connectionId } };
    }
    return {
      success: true,
      data: [
        {
          vehicleId: "fake-ctt-001",
          licensePlate: "DD-33-EE",
          make: "Renault",
          model: "Clio",
          category: "Passeio",
          provider: "CTTPortagens",
          status: "ATIVO",
          source: "TEST",
          createdAt: "2024-03-01T10:00:00Z",
          updatedAt: new Date().toISOString(),
          linkedAt: "2024-03-01T10:00:00Z"
        }
      ] as any
    };
  }

  /** Get toll transactions - fake demo data */
  async getTollTransactions(connectionId: string): Promise<any> {
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "CTTPortagens", connectionId } };
    }
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: { code: "CONNECTION_FAILED", message: "Connection not found", providerId: "CTTPortagens", connectionId } };
    }
    return {
      success: true,
      data: [
        {
          transactionId: "fake-ctt-tx-001",
          provider: "CTTPortagens",
          vehicle: { vehicleId: "fake-ctt-001", licensePlate: "EE-44-FF", make: "Peugeot", model: "208", category: "Passeio", provider: "CTTPortagens", status: "ATIVO", source: "TEST", createdAt: "2024-03-01T10:00:00Z", updatedAt: new Date().toISOString() },
          licensePlate: "EE-44-FF",
          date: "2024-03-15T16:45:00Z",
          tollRoad: "A1",
          concession: "BRISA",
          entryPoint: "Lisboa",
          exitPoint: "Leiria",
          amount: 12.50,
          currency: "EUR",
          status: "CHARGED",
          paymentStatus: "NOT_PAID",
          source: "TEST",
          externalReference: "ctt-tx-20240315-001",
          createdAt: "2024-03-15T16:45:00Z",
          updatedAt: "2024-03-15T16:45:00Z"
        }
      ] as any
    };
  }

  /** Get toll debts - fake demo data */
  async getTollDebts(connectionId: string): Promise<any> {
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "CTTPortagens", connectionId } };
    }
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: { code: "CONNECTION_FAILED", message: "Connection not found", providerId: "CTTPortagens", connectionId } };
    }
    return {
      success: true,
      data: [
        {
          debtId: "fake-ctt-debt-001",
          provider: "CTTPortagens",
          vehicle: { vehicleId: "fake-ctt-001", licensePlate: "DD-33-EE", make: "Renault", model: "Clio", category: "Passeio", provider: "CTTPortagens", status: "ATIVO", source: "TEST", createdAt: "2024-03-01T10:00:00Z", updatedAt: new Date().toISOString() },
          amount: 12.50,
          currency: "EUR",
          dueDate: "2024-04-15",
          status: "PENDING",
          paymentReference: "MB-87654321",
          entityReference: "54321",
          source: "TEST",
          documentReference: "ctt-inv-202403-001",
          createdAt: "2024-03-15T16:45:00Z",
          updatedAt: "2024-03-15T16:45:00Z"
        }
      ] as any
    };
  }

  /** Get payments - fake demo data */
  async getPayments(connectionId: string): Promise<any> {
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "CTTPortagens", connectionId } };
    }
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: { code: "CONNECTION_FAILED", message: "Connection not found", providerId: "CTTPortagens", connectionId } };
    }
    return {
      success: true,
      data: [
        {
          paymentId: "fake-ctt-pay-001",
          amount: 12.50,
          currency: "EUR",
          date: "2024-04-10T10:00:00Z",
          status: "COMPLETED",
          paymentMethodType: "MULTIBANCO",
          reference: "MB-87654321",
          provider: "CTTPortagens",
          source: "TEST",
          receiptDocumentReference: "ctt-rec-20240410-001",
          createdAt: "2024-04-10T10:00:00Z",
          updatedAt: "2024-04-10T10:00:00Z"
        }
      ] as any
    };
  }

  /** Get invoices */
  async getInvoices(connectionId: string): Promise<any> {
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "CTTPortagens", connectionId } };
    }
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: { code: "CONNECTION_FAILED", message: "Connection not found", providerId: "CTTPortagens", connectionId } };
    }
    return {
      success: true,
      data: [
        {
          invoiceId: "fake-ctt-inv-001",
          provider: "CTTPortagens",
          amount: 12.50,
          currency: "EUR",
          issueDate: "2024-03-15",
          type: "INVOICE",
          externalReference: "ctt-inv-202403-001",
          status: "PAGA",
          paymentReference: "MB-87654321",
          createdAt: "2024-03-15T16:45:00Z",
          updatedAt: "2024-03-15T16:45:00Z"
        }
      ] as any
    };
  }

  /** Get receipts/documents */
  async getReceipts(connectionId: string): Promise<any> {
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "CTTPortagens", connectionId } };
    }
    return { success: true, data: [] };
  }

  /** Get documents */
  async getDocuments(connectionId: string): Promise<any> {
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "CTTPortagens", connectionId } };
    }
    return { success: true, data: [] };
  }

  /** Get notifications */
  async getNotifications(connectionId: string): Promise<any> {
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "CTTPortagens", connectionId } };
    }
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: { code: "CONNECTION_FAILED", message: "Connection not found", providerId: "CTTPortagens", connectionId } };
    }
    return {
      success: true,
      data: [
        {
          notificationId: "fake-ctt-notif-001",
          personId: connection.personId,
          provider: "CTTPortagens",
          type: "DEBITO",
          title: "Nova portagem em dívida",
          message: "Tem uma nova portagem em dívida na A1 no valor de 12,50€",
          priority: "ALTA",
          read: false,
          actionUrl: "/mobilidade/pendentes",
          relatedEntityId: "fake-ctt-debt-001",
          relatedEntityType: "DETIDO",
          createdAt: "2024-03-15T16:45:00Z"
        }
      ] as any
    };
  }

  /** Sync vehicles */
  async syncVehicles(connectionId: string): Promise<any> {
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "CTTPortagens", connectionId } };
    }
    return { success: true, data: { inserted: 1, updated: 0, errors: [] } };
  }

  /** Sync transactions */
  async syncTransactions(connectionId: string): Promise<any> {
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "CTTPortagens", connectionId } };
    }
    return { success: true, data: { inserted: 1, updated: 0, errors: [] } };
  }

  /** Sync debts */
  async syncDebts(connectionId: string): Promise<any> {
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "CTTPortagens", connectionId } };
    }
    return { success: true, data: { inserted: 1, updated: 0, errors: [] } };
  }

  /** Sync payments */
  async syncPayments(connectionId: string): Promise<any> {
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "CTTPortagens", connectionId } };
    }
    return { success: true, data: { inserted: 1, updated: 0, errors: [] } };
  }

  /** Sync documents */
  async syncDocuments(connectionId: string): Promise<any> {
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "CTTPortagens", connectionId } };
    }
    return { success: true, data: { inserted: 0, updated: 0, errors: [] } };
  }

  /** Sync notifications */
  async syncNotifications(connectionId: string): Promise<any> {
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "CTTPortagens", connectionId } };
    }
    return { success: true, data: { inserted: 1, updated: 0, errors: [] } };
  }
}

/** Factory for creating fake CTT Portagens providers */
export const FakeCTTPortagensProviderFactory: any = {
  create(providerId: any, type: any, config?: Record<string, unknown>): any {
    if (providerId !== "CTTPortagens") {
      throw new Error(`Invalid provider ID for Fake CTT Portagens factory: ${providerId}`);
    }
    if (type !== "FAKE") {
      throw new Error(`FakeCTTPortagensFactory only creates FAKE providers, got ${type}`);
    }
    const provider = new FakeCTTPortagensProvider(config as any);
    try {
      FakeCTTPortagensProvider.checkProductionSafety();
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
    }
    return provider;
  }
};

/** Register fake CTT Portagens provider in registry */
export const registerFakeCTTPortagensProvider = (registry: any): void => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_FAKE_PROVIDERS !== 'true') {
    throw new Error("PROVIDER_UNAVAILABLE: Fake providers cannot be registered in production");
  }
  const provider = FakeCTTPortagensProviderFactory.create("CTTPortagens", "FAKE");
  registry.register(provider);
};