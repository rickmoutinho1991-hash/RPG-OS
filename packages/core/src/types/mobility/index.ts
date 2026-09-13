/**
 * RPG-OS Mobility Domain Types
 * 
 * Complete type definitions for the "A Minha Mobilidade" module.
 * All models aligned with official Portuguese mobility services where available.
 * Unavailable fields are marked as optional with PREPARED_ONLY status.
 */

/** Mobility integration provider identifier */
export type MobilityProviderId = "ViaVerde" | "CTTPortagens" | "IMT";

/** Mobility provider implementation type */
export type MobilityProviderType = "FAKE" | "SANDBOX" | "LIVE" | "PREPARED_ONLY";

/** Mobility provider environment */
export type MobilityEnvironment = "development" | "sandbox" | "production";

/** Capability identifiers for mobility providers */
export type MobilityCapability =
  | "READ_PROFILE"
  | "READ_VEHICLES"
  | "READ_TOLL_TRANSACTIONS"
  | "READ_TOLL_DEBTS"
  | "READ_PAYMENTS"
  | "READ_INVOICES"
  | "READ_RECEIPTS"
  | "READ_DOCUMENTS"
  | "READ_NOTIFICATIONS"
  | "SYNC_VEHICLES"
  | "SYNC_TRANSACTIONS"
  | "SYNC_DEBTS"
  | "SYNC_PAYMENTS"
  | "SYNC_DOCUMENTS"
  | "GET_CONNECTION_STATUS";

/** Mobility provider status */
export type MobilityProviderStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "ERROR"
  | "EXPIRED"
  | "REVOKED"
  | "PREPARED_ONLY"
  | "FAKE";

/** Mobility consent scope */
export type MobilityConsentScope =
  | "mobility.read.profile"
  | "mobility.read.vehicles"
  | "mobility.read.tolls"
  | "mobility.read.debts"
  | "mobility.read.payments"
  | "mobility.read.documents"
  | "mobility.read.notifications";

/** Connection configuration for a mobility provider */
export interface MobilityConnectionConfig {
  connectionId: string;
  personId: string; // or organizationId for org context
  providerId: MobilityProviderId;
  environment: MobilityEnvironment;
  scopes: MobilityConsentScope[];
  status: MobilityProviderStatus;
  connectedAt: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  externalAccountReference?: string;
  metadata?: Record<string, unknown>;
}

/** Consent record for mobility data access */
export interface MobilityConsent {
  consentId: string;
  personId: string; // or organizationId
  providerId: MobilityProviderId;
  scopes: MobilityConsentScope[];
  grantedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  source: "PERSON" | "ADMIN" | "SYSTEM";
  auditMetadata: {
    ip?: string;
    userAgent?: string;
    sessionId?: string;
  };
}

/** Vehicle abstraction */
export interface MobilityVehicle {
  vehicleId: string;
  licensePlate: string;
  make: string;
  model: string;
  category: string; // ex: "Passeio", "Utilitário", "Motocicleta", "Caminhão"
  provider: MobilityProviderId;
  status: "ATIVO" | "INATIVO";
  source: "OFFICIAL" | "MANUAL";
  createdAt: string;
  updatedAt: string;
  linkedAt?: string; // When officially linked
}

/** Toll transaction */
export interface MobilityTollTransaction {
  transactionId: string;
  provider: MobilityProviderId;
  vehicle: MobilityVehicle;
  licensePlate: string;
  date: string;
  tollRoad: string; // ex: "A23", "A1", "A12"
  concession: string; // ex: "BRISA", "EP"
  entryPoint: string;
  exitPoint: string;
  amount: number;
  currency: string; // ex: "EUR"
  status: "PENDING" | "CHARGED" | "PAID" | "OVERDUE" | "CANCELLED" | "UNKNOWN";
  paymentStatus: "NOT_PAID" | "PARTIALLY_PAID" | "FULLY_PAID" | "DISPUTED";
  source: "OFFICIAL" | "MANUAL";
  externalReference?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Toll debt */
export interface MobilityTollDebt {
  debtId: string;
  provider: MobilityProviderId;
  vehicle: MobilityVehicle;
  amount: number;
  currency: string; // ex: "EUR"
  dueDate: string;
  status: "PENDING" | "OVERDUE" | "PARTIALLY_PAID" | "FULLY_PAID" | "DISPUTED" | "CANCELLED";
  paymentReference?: string;
  entityReference?: string; // Entidade de cobrança
  source: "OFFICIAL" | "MANUAL";
  documentReference?: string;
  createdAt: string;
  updatedAt: string;
}

/** Mobility payment */
export interface MobilityPayment {
  paymentId: string;
  transaction?: MobilityTollTransaction;
  debt?: MobilityTollDebt;
  amount: number;
  currency: string; // ex: "EUR"
  date: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED" | "CANCELLED";
  paymentMethodType: "MB_WAY" | "MULTIBANCO" | "CARTEIRA_DIGITAL" | "OUTRO";
  reference?: string;
  provider: MobilityProviderId;
  source: "OFFICIAL" | "MANUAL";
  receiptDocumentReference?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Toll invoice */
export interface MobilityInvoice {
  invoiceId: string;
  provider: MobilityProviderId;
  vehicle?: MobilityVehicle;
  debt?: MobilityTollDebt;
  amount: number;
  currency: string; // ex: "EUR"
  issueDate: string;
  type: "INVOICE" | "RECEIPT" | "CONFIRMATION";
  externalReference?: string;
  status: "EMITIDA" | "PAGA" | "VENCIDA" | "CANCELADA";
  paymentReference?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Mobility document */
export interface MobilityDocument {
  documentId: string;
  provider: MobilityProviderId;
  vehicle?: MobilityVehicle;
  debt?: MobilityTollDebt;
  invoice?: MobilityInvoice;
  documentType: "INVOICE" | "RECEIPT" | "CONFIRMATION" | "DECLARACAO" | "OUTRO";
  title: string;
  description?: string;
  issueDate: string;
  externalReference?: string;
  storageReference?: string; // secure reference
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Mobility notification */
export interface MobilityNotification {
  notificationId: string;
  personId: string;
  provider: MobilityProviderId;
  type: "TRIAGEM_VEICULO" | "TRANSACTION" | "DEBITO" | "PAGAMENTO" | "DOCUMENTO" | "GENERAL";
  title: string;
  message: string;
  priority: "LOW" | "NORMAL" | "ALTA";
  read: boolean;
  readAt?: string;
  actionUrl?: string;
  relatedEntityId?: string;
  relatedEntityType: "VEICULO" | "TRANSACAO" | "DETIDO" | "PAGAMENTO" | "DOCUMENTO";
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** Mobility integration status */
export interface MobilityIntegrationStatus {
  provider: MobilityProviderId;
  environment: MobilityEnvironment;
  status: MobilityProviderStatus;
  capabilities: MobilityCapability[];
  lastSync?: string;
  lastError?: string;
  syncProgress?: number; // 0-100
  registeredAt: string;
  lastUpdated: string;
}

/** Mobility provider metadata */
export interface MobilityProviderMetadata {
  providerId: MobilityProviderId;
  providerType: MobilityProviderType;
  country: string;
  environment: MobilityEnvironment;
  capabilities: MobilityCapability[];
  authMethod: "NONE" | "CREDENTIALS" | "OAUTH2" | "MANUAL";
  status: MobilityProviderStatus;
  version?: string;
  documentationUrl?: string;
  sandboxAvailable: boolean;
  liveAvailable: boolean;
  lastUpdated: string;
}

/** Health-like result wrapper for mobility */
export type MobilityResult<T> =
  | { success: true; data: T }
  | { success: false; error: MobilityError };

export interface MobilityError {
  code: MobilityErrorCode;
  message: string;
  providerId: MobilityProviderId;
  connectionId?: string;
  details?: Record<string, unknown>;
}

export type MobilityErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_CREDENTIALS"
  | "EXPIRED_CREDENTIALS"
  | "INSUFFICIENT_SCOPES"
  | "CONNECTION_FAILED"
  | "SYNC_FAILED"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "DUPLICATE_SYNC"
  | "IDENTITY_MISMATCH"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "CONSENT_REVOKED"
  | "PERSON_MISMATCH"
  | "TENANT_ISOLATION_VIOLATION"
  | "NOT_SUPPORTED"
  | "PREPARED_ONLY";

/** Factory for creating mobility providers */
export interface MobilityProviderFactory {
  create(providerId: MobilityProviderId, type: MobilityProviderType, config?: Record<string, unknown>): MobilityIntegrationProvider;
}

export interface MobilityIntegrationProvider {
  readonly metadata: MobilityProviderMetadata;

  supports(capability: MobilityCapability): { supported: boolean; details?: string };

  getConnectionStatus(connectionId: string): Promise<MobilityConnectionStatus>;

  connect(config: MobilityConnectionConfig): Promise<{
    success: boolean;
    connectionId: string;
    expiresAt?: string;
    error?: string;
  }>;

  disconnect(connectionId: string): Promise<{ success: boolean; error?: string }>;

  getVehicles(connectionId: string): Promise<MobilityResult<MobilityVehicle[]>>;

  getTollTransactions(connectionId: string): Promise<MobilityResult<MobilityTollTransaction[]>>;

  getTollDebts(connectionId: string): Promise<MobilityResult<MobilityTollDebt[]>>;

  getPayments(connectionId: string): Promise<MobilityResult<MobilityPayment[]>>;

  getInvoices(connectionId: string): Promise<MobilityResult<MobilityInvoice[]>>;

  getReceipts(connectionId: string): Promise<MobilityResult<MobilityDocument[]>>;

  getDocuments(connectionId: string): Promise<MobilityResult<MobilityDocument[]>>;

  getNotifications(connectionId: string): Promise<MobilityResult<MobilityNotification[]>>;

  syncVehicles(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>>;

  syncTransactions(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>>;

  syncDebts(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>>;

  syncPayments(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>>;

  syncDocuments(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>>;

  syncNotifications(connectionId: string): Promise<MobilityResult<{ inserted: number; updated: number; errors: string[] }>>;
}

/** Mobility connection status */
export interface MobilityConnectionStatus {
  connectionId: string;
  provider: MobilityProviderId;
  status: MobilityProviderStatus;
  connectedAt?: string;
  expiresAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  scopes: MobilityConsentScope[];
}

/** Provider registry */
export interface MobilityProviderRegistry {
  register(provider: MobilityIntegrationProvider): void;
  unregister(providerId: MobilityProviderId): void;
  get(providerId: MobilityProviderId): MobilityIntegrationProvider | undefined;
  getAll(): MobilityIntegrationProvider[];
  getByCapability(capability: MobilityCapability): MobilityIntegrationProvider[];
  getByType(type: string): MobilityIntegrationProvider[];
  clear(): void;
}