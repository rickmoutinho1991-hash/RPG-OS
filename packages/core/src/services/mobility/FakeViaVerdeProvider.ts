/**
 * RPG-OS Fake Via Verde Provider
 * 
 * Fake provider for Via Verde - ONLY for tests/development.
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

/** Fake Via Verde Provider - ONLY for tests/development */
export class FakeViaVerdeProvider implements MobilityIntegrationProvider {
  readonly metadata: MobilityProviderMetadata;
  private readonly connections = new Map<string, any>();

  constructor(config?: Partial<{ apiEndpoint: string; clientId: string; clientSecret: string }>) {
    this.metadata = {
      providerId: "ViaVerde",
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
      documentationUrl: "https://www.viaverde.pt",
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
  supports(capability: MobilityCapability): { supported: boolean; details?: string } {
    const isSupported = this.metadata.capabilities.includes(capability);
    return {
      supported: isSupported,
      details: isSupported ? "Supported in fake provider (development only)" : "Not implemented in fake provider"
    };
  }

  /** Get connection status - fake implementation */
  async getConnectionStatus(connectionId: string): Promise<any> {
    try {
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: (err as Error).message, providerId: "ViaVerde", connectionId } };
    }
    const connection = this.connections.get(connectionId);
    if (!connection) return null;
    return {
      success: true,
      data: {
        connectionId,
        provider: "ViaVerde",
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
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed in production", providerId: "ViaVerde", connectionId: config.connectionId } };
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
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: (err as Error).message, providerId: "ViaVerde", connectionId } };
    }
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: { code: "CONNECTION_FAILED", message: "Connection not found", providerId: "ViaVerde", connectionId } };
    }
    return {
      success: true,
      data: [
        {
          vehicleId: "fake-vv-001",
          licensePlate: "AA-11-BB",
          make: "Toyota",
          model: "Corolla",
          category: "Passeio",
          provider: "ViaVerde",
          status: "ATIVO",
          source: "TEST",
          createdAt: "2024-01-15T10:00:00Z",
          updatedAt: new Date().toISOString(),
          linkedAt: "2024-01-15T10:00:00Z"
        },
        {
          vehicleId: "fake-vv-002",
          licensePlate: "CC-22-DD",
          make: "Volkswagen",
          model: "Golf",
          category: "Passeio",
          provider: "ViaVerde",
          status: "ATIVO",
          source: "TEST",
          createdAt: "2024-02-20T14:30:00Z",
          updatedAt: new Date().toISOString(),
          linkedAt: "2024-02-20T14:30:00Z"
        }
      ] as any
    };
  }

  /** Get toll transactions - fake demo data */
  async getTollTransactions(connectionId: string): Promise<any> {
    try {
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "ViaVerde", connectionId } };
    }
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: { code: "CONNECTION_FAILED", message: "Connection not found", providerId: "ViaVerde", connectionId } };
    }
    return {
      success: true,
      data: [
        {
          transactionId: "fake-tx-001",
          provider: "ViaVerde",
          vehicle: { vehicleId: "fake-vv-001", licensePlate: "AA-11-BB", make: "Toyota", model: "Corolla", category: "Passeio", provider: "ViaVerde", status: "ATIVO", source: "TEST", createdAt: "2024-01-15T10:00:00Z", updatedAt: new Date().toISOString() },
          licensePlate: "AA-11-BB",
          date: "2024-01-20T08:30:00Z",
          tollRoad: "A23",
          concession: "BRISA",
          entryPoint: "Abrantes",
          exitPoint: "Torres Novas",
          amount: 3.85,
          currency: "EUR",
          status: "CHARGED",
          paymentStatus: "FULLY_PAID",
          source: "TEST",
          externalReference: "vv-tx-20240120-001",
          createdAt: "2024-01-20T08:30:00Z",
          updatedAt: "2024-01-20T08:30:00Z"
        }
      ] as any
    };
  }

  /** Get toll debts - fake demo data */
  async getTollDebts(connectionId: string): Promise<any> {
    try {
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "ViaVerde", connectionId } };
    }
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: { code: "CONNECTION_FAILED", message: "Connection not found", providerId: "ViaVerde", connectionId } };
    }
    return {
      success: true,
      data: [
        {
          debtId: "fake-debt-001",
          provider: "ViaVerde",
          vehicle: { vehicleId: "fake-vv-001", licensePlate: "AA-11-BB", make: "Toyota", model: "Corolla", category: "Passeio", provider: "ViaVerde", status: "ATIVO", source: "TEST", createdAt: "2024-01-15T10:00:00Z", updatedAt: new Date().toISOString() },
          amount: 8.45,
          currency: "EUR",
          dueDate: "2024-02-15",
          status: "PENDING",
          paymentReference: "MB-12345678",
          entityReference: "12345",
          source: "TEST",
          documentReference: "inv-202401-001",
          createdAt: "2024-01-25T10:00:00Z",
          updatedAt: "2024-01-25T10:00:00Z"
        }
      ] as any
    };
  }

  /** Get payments - fake demo data */
  async getPayments(connectionId: string): Promise<any> {
    try {
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "ViaVerde", connectionId } };
    }
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: { code: "CONNECTION_FAILED", message: "Connection not found", providerId: "ViaVerde", connectionId } };
    }
    return {
      success: true,
      data: [
        {
          paymentId: "fake-pay-001",
          amount: 8.45,
          currency: "EUR",
          date: "2024-02-10T14:30:00Z",
          status: "COMPLETED",
          paymentMethodType: "MB_WAY",
          reference: "MB-12345678",
          provider: "ViaVerde",
          source: "TEST",
          receiptDocumentReference: "rec-20240210-001",
          createdAt: "2024-02-10T14:30:00Z",
          updatedAt: "2024-02-10T14:30:00Z"
        }
      ] as any
    };
  }

  /** Get invoices - fake demo data */
  async getInvoices(connectionId: string): Promise<any> {
    try {
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "ViaVerde", connectionId } };
    }
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: { code: "CONNECTION_FAILED", message: "Connection not found", providerId: "ViaVerde", connectionId } };
    }
    return {
      success: true,
      data: [
        {
          invoiceId: "fake-inv-001",
          provider: "ViaVerde",
          amount: 8.45,
          currency: "EUR",
          issueDate: "2024-01-25",
          type: "INVOICE",
          externalReference: "inv-202401-001",
          status: "PAGA",
          paymentReference: "MB-12345678",
          createdAt: "2024-01-25T10:00:00Z",
          updatedAt: "2024-01-25T10:00:00Z"
        }
      ] as any
    };
  }

  /** Get receipts/documents */
  async getReceipts(connectionId: string): Promise<any> {
    try {
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "ViaVerde", connectionId } };
    }
    return { success: true, data: [] };
  }

  /** Get documents */
  async getDocuments(connectionId: string): Promise<any> {
    try {
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "ViaVerde", connectionId } };
    }
    return { success: true, data: [] };
  }

  /** Get notifications */
  async getNotifications(connectionId: string): Promise<any> {
    try {
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "ViaVerde", connectionId } };
    }
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: { code: "CONNECTION_FAILED", message: "Connection not found", providerId: "ViaVerde", connectionId } };
    }
    return {
      success: true,
      data: [
        {
          notificationId: "fake-notif-001",
          personId: connection.personId,
          provider: "ViaVerde",
          type: "TRANSACTION",
          title: "Nova transação de portagem",
          message: "Foi registada uma nova transação na A23 no valor de 3,85€",
          priority: "NORMAL",
          read: false,
          actionUrl: "/mobilidade/portagens",
          relatedEntityId: "fake-tx-001",
          relatedEntityType: "TRANSACAO",
          createdAt: "2024-01-20T08:30:00Z"
        }
      ] as any
    };
  }

  /** Sync vehicles */
  async syncVehicles(connectionId: string): Promise<any> {
    try {
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "ViaVerde", connectionId } };
    }
    return { success: true, data: { inserted: 1, updated: 0, errors: [] } };
  }

  /** Sync transactions */
  async syncTransactions(connectionId: string): Promise<any> {
    try {
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "ViaVerde", connectionId } };
    }
    return { success: true, data: { inserted: 1, updated: 0, errors: [] } };
  }

  /** Sync debts */
  async syncDebts(connectionId: string): Promise<any> {
    try {
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "ViaVerde", connectionId } };
    }
    return { success: true, data: { inserted: 1, updated: 0, errors: [] } };
  }

  /** Sync payments */
  async syncPayments(connectionId: string): Promise<any> {
    try {
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "ViaVerde", connectionId } };
    }
    return { success: true, data: { inserted: 1, updated: 0, errors: [] } };
  }

  /** Sync documents */
  async syncDocuments(connectionId: string): Promise<any> {
    try {
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "ViaVerde", connectionId } };
    }
    return { success: true, data: { inserted: 0, updated: 0, errors: [] } };
  }

  /** Sync notifications */
  async syncNotifications(connectionId: string): Promise<any> {
    try {
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      return { success: false, error: { code: "FAKE_NOT_ALLOWED", message: "Fake provider not allowed", providerId: "ViaVerde", connectionId } };
    }
    return { success: true, data: { inserted: 1, updated: 0, errors: [] } };
  }
}

/** Factory for creating fake Via Verde providers */
export const FakeViaVerdeProviderFactory: any = {
  create(providerId: any, type: any, config?: Record<string, unknown>): any {
    if (providerId !== "ViaVerde") {
      throw new Error(`Invalid provider ID for Fake Via Verde factory: ${providerId}`);
    }
    if (type !== "FAKE") {
      throw new Error(`FakeViaVerdeFactory only creates FAKE providers, got ${type}`);
    }
    const provider = new FakeViaVerdeProvider(config as any);
    // Production safety check
    try {
      FakeViaVerdeProvider.checkProductionSafety();
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
    }
    return provider;
  }
};

/** Register fake Via Verde provider in registry */
export const registerFakeViaVerdeProvider = (registry: any): void => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_FAKE_PROVIDERS !== 'true') {
    throw new Error("PROVIDER_UNAVAILABLE: Fake providers cannot be registered in production");
  }
  const provider = FakeViaVerdeProviderFactory.create("ViaVerde", "FAKE");
  registry.register(provider);
};