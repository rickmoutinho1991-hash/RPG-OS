/**
 * RPG-OS Health Domain Types
 * 
 * Complete type definitions for the "A Minha Saúde" module.
 * All models aligned with official Portuguese SNS/SPMS data structures where available.
 * Unavailable fields are marked as optional with PREPARED_ONLY status.
 */

/** Health integration provider identifier */
export type HealthProviderId = "SNS24" | "SPMS" | "SNS";

/** Health provider implementation type */
export type HealthProviderType = "FAKE" | "SANDBOX" | "LIVE" | "PREPARED_ONLY";

/** Health provider environment */
export type HealthEnvironment = "development" | "sandbox" | "production";

/** Capability identifiers for health providers */
export type HealthCapability =
  | "READ_PROFILE"
  | "READ_PRESCRIPTIONS"
  | "READ_MEDICATIONS"
  | "READ_VACCINATIONS"
  | "READ_APPOINTMENTS"
  | "READ_EXAMS"
  | "READ_DOCUMENTS"
  | "READ_NOTIFICATIONS"
  | "SYNC_DATA"
  | "DOWNLOAD_DOCUMENT";

/** Health provider status */
export type HealthProviderStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "ERROR"
  | "EXPIRED"
  | "REVOKED"
  | "PREPARED_ONLY";

/** Health consent scope */
export type HealthConsentScope =
  | "health.read.profile"
  | "health.read.prescriptions"
  | "health.read.medications"
  | "health.read.vaccinations"
  | "health.read.appointments"
  | "health.read.exams"
  | "health.read.documents"
  | "health.read.notifications";

/** Connection configuration for a health provider */
export interface HealthConnectionConfig {
  connectionId: string;
  personId: string; // or organizationId for org context
  providerId: HealthProviderId;
  environment: HealthEnvironment;
  scopes: HealthConsentScope[];
  status: HealthProviderStatus;
  connectedAt: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  externalAccountReference?: string;
  metadata?: Record<string, unknown>;
}

/** Consent record for health data access */
export interface HealthConsent {
  consentId: string;
  personId: string; // or organizationId
  providerId: HealthProviderId;
  scopes: HealthConsentScope[];
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

/** Health profile - personal information from SNS */
export interface HealthProfile {
  personId: string;
  utenteNumber?: string; // Número de utente SNS
  fullName: string;
  birthDate: string;
  gender?: "M" | "F" | "O";
  nationality?: string;
  address?: string;
  postalCode?: string;
  locality?: string;
  phone?: string;
  email?: string;
  healthSubsystem?: string; // ADSE, SAMS, etc.
  doctorId?: string; // Médico de família
  healthcareUnit?: string; // Unidade de saúde
  lastUpdated: string;
}

/** Prescription status */
export type PrescriptionStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "CANCELLED"
  | "SUSPENDED"
  | "COMPLETED";

/** Prescription */
export interface Prescription {
  prescriptionId: string;
  personId: string;
  prescriptionNumber: string; // Número da receita
  status: PrescriptionStatus;
  medication: Medication;
  dosage: string;
  instructions?: string;
  prescribedDate: string;
  validFrom: string;
  validUntil: string;
  prescribedBy: {
    professionalId: string;
    name: string;
    specialty?: string;
    healthcareUnit: string;
  };
  dispensingInfo?: {
    pharmacyId?: string;
    dispensedDate?: string;
    dispensedQuantity?: number;
  };
  renewalInfo?: {
    isRenewable: boolean;
    renewalsRemaining?: number;
    lastRenewalDate?: string;
  };
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Medication */
export interface Medication {
  medicationId: string;
  name: string; // DCI or brand name
  strength?: string; // e.g., "500mg"
  form?: string; // comprimido, xarope, injeção, etc.
  route?: string; // oral, IV, tópico, etc.
  atcCode?: string; // Código ATC
  packageSize?: string; // e.g., "20 comprimidos"
  manufacturer?: string;
}

/** Vaccination record */
export interface VaccinationRecord {
  vaccinationId: string;
  personId: string;
  vaccine: Vaccine;
  dose: number; // dose number (1, 2, booster, etc.)
  administrationDate: string;
  administrationLocation?: HealthcareLocation;
  batchNumber?: string; // lote
  manufacturer?: string;
  status: "ADMINISTERED" | "SCHEDULED" | "CANCELLED" | "EXPIRED";
  administeredBy?: {
    professionalId: string;
    name: string;
  };
  nextDoseDate?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Vaccine */
export interface Vaccine {
  vaccineId: string;
  name: string; // e.g., "COVID-19 mRNA", "Gripe sazonal", "Hepatite B"
  targetDiseases: string[]; // doenças alvo
  manufacturer?: string;
  vaccineType?: "mRNA" | "vetor viral" | "proteína subunidade" | "inativada" | "atenuada";
  targetGroups?: string[]; // grupos alvo
  schedule?: VaccinationSchedule[];
}

/** Vaccination schedule */
export interface VaccinationSchedule {
  doseNumber: number;
  recommendedAge?: string; // e.g., "2 meses", "65 anos"
  intervalFromPrevious?: string; // e.g., "8 semanas"
  booster?: boolean;
}

/** Healthcare location */
export interface HealthcareLocation {
  unitId: string;
  name: string;
  type: "HOSPITAL" | "CENTRO_SAUDE" | "USF" | "FARMACIA" | "LABORATORIO" | "OUTRO";
  address: string;
  postalCode: string;
  locality: string;
  district?: string;
  phone?: string;
  email?: string;
}

/** Appointment status */
export type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW"
  | "RESCHEDULED";

/** Appointment type */
export type AppointmentType =
  | "CONSULTA_MEDICINA_GERAL"
  | "CONSULTA_ESPECIALIDADE"
  | "EXAME_COMPLEMENTAR"
  | "VACINACAO"
  | "URGENCIA"
  | "TELECONSULTA"
  | "OUTRO";

/** Appointment */
export interface HealthAppointment {
  appointmentId: string;
  personId: string;
  appointmentType: AppointmentType;
  status: AppointmentStatus;
  scheduledAt: string;
  confirmedAt?: string;
  cancelledAt?: string;
  healthcareUnit: HealthcareLocation;
  professional?: {
    professionalId: string;
    name: string;
    specialty?: string;
  };
  appointmentTypeDetail?: string; // e.g., "Consulta de Cardiologia"
  notes?: string;
  cancellationReason?: string;
  reminderSent?: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Exam status */
export type ExamStatus =
  | "REQUESTED"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "RESULTS_AVAILABLE";

/** Exam type */
export type ExamType =
  | "ANALISES_CLINICAS"
  | "RADIOLOGIA"
  | "CARDIOLOGIA"
  | "GASTROENTEROLOGIA"
  | "NEUROLOGIA"
  | "PATOLOGIA"
  | "OUTRO";

/** Exam */
export interface HealthExam {
  examId: string;
  personId: string;
  examType: ExamType;
  status: ExamStatus;
  name: string; // e.g., "Hemograma completo", "RX Tórax"
  requestedAt: string;
  scheduledAt?: string;
  performedAt?: string;
  healthcareUnit: HealthcareLocation;
  requestedBy?: {
    professionalId: string;
    name: string;
    specialty?: string;
  };
  performedBy?: {
    professionalId: string;
    name: string;
    specialty?: string;
  };
  resultDocumentId?: string; // reference to document
  resultSummary?: string; // brief summary, no sensitive data
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Health document type */
export type HealthDocumentType =
  | "RECEITA"
  | "RECEITUARIO_ELETRONICO"
  | "GUIA_TRATAMENTO"
  | "DECLARACAO"
  | "ATTESTADO"
  | "CERTIFICADO_VACINACAO"
  | "RELATORIO_EXAME"
  | "RELATORIO_CONSULTA"
  | "ALTA_HOSPITALAR"
  | "OUTRO";

/** Health document */
export interface HealthDocument {
  documentId: string;
  personId: string;
  documentType: HealthDocumentType;
  title: string;
  description?: string;
  fileUrl?: string; // secure URL
  fileSize?: number;
  mimeType?: string;
  issuedAt: string;
  issuedBy?: {
    professionalId: string;
    name: string;
    organization: string;
  };
  healthcareUnit?: HealthcareLocation;
  validFrom?: string;
  validUntil?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Health notification */
export interface HealthNotification {
  notificationId: string;
  personId: string;
  type: "APPOINTMENT_REMINDER" | "PRESCRIPTION_RENEWAL" | "EXAM_RESULT" | "VACCINATION_DUE" | "GENERAL";
  title: string;
  message: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  read: boolean;
  readAt?: string;
  actionUrl?: string;
  relatedEntityId?: string;
  relatedEntityType?: "APPOINTMENT" | "PRESCRIPTION" | "EXAM" | "VACCINATION" | "DOCUMENT";
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** Health provider metadata */
export interface HealthProviderMetadata {
  providerId: HealthProviderId;
  providerType: HealthProviderType;
  country: string;
  environment: HealthEnvironment;
  capabilities: HealthCapability[];
  authMethod: "OAUTH2" | "OAUTH2_PKCE" | "CERTIFICATE" | "NONE";
  status: HealthProviderStatus;
  version?: string;
  documentationUrl?: string;
  sandboxAvailable: boolean;
  liveAvailable: boolean;
  lastUpdated: string;
}

/** Health provider connection status */
export interface HealthConnectionStatus {
  connectionId: string;
  providerId: HealthProviderId;
  environment: HealthEnvironment;
  status: HealthProviderStatus;
  connectedAt?: string;
  expiresAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  scopes: HealthConsentScope[];
}

/** Health sync result */
export interface HealthSyncResult {
  syncId: string;
  personId: string;
  providerId: HealthProviderId;
  startedAt: string;
  completedAt?: string;
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED" | "PARTIAL";
  syncedEntities: {
    prescriptions: number;
    medications: number;
    vaccinations: number;
    appointments: number;
    exams: number;
    documents: number;
    notifications: number;
  };
  errors: string[];
  lastSyncAt?: string;
}

/** Health API response wrapper */
export type HealthResult<T> =
  | { success: true; data: T }
  | { success: false; error: HealthError };

export interface HealthError {
  code: HealthErrorCode;
  message: string;
  providerId: HealthProviderId;
  connectionId?: string;
  details?: Record<string, unknown>;
}

export type HealthErrorCode =
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

export function healthSuccess<T>(data: T): HealthResult<T> {
  return { success: true, data };
}

export function healthError<T>(
  code: HealthErrorCode,
  message: string,
  providerId: HealthProviderId,
  connectionId?: string,
  details?: Record<string, unknown>
): HealthResult<T> {
  return {
    success: false,
    error: {
      code,
      message,
      providerId,
      connectionId,
      details,
    },
  };
}

/** Health integration provider interface */
export interface HealthIntegrationProvider {
  readonly metadata: HealthProviderMetadata;

  supports(capability: HealthCapability): { supported: boolean; details?: string };

  getHealth(): Promise<{
    providerId: HealthProviderId;
    healthy: boolean;
    latencyMs?: number;
    message?: string;
    checkedAt: string;
    details?: Record<string, unknown>;
  }>;

  connect(config: HealthConnectionConfig): Promise<{
    success: boolean;
    connectionId: string;
    expiresAt?: string;
    error?: string;
  }>;

  disconnect(connectionId: string): Promise<{ success: boolean; error?: string }>;

  getConnectionStatus(connectionId: string): Promise<HealthConnectionStatus | null>;

  getProfile(connectionId: string): Promise<HealthResult<HealthProfile>>;

  getPrescriptions(connectionId: string): Promise<HealthResult<Prescription[]>>;

  getMedications(connectionId: string): Promise<HealthResult<Medication[]>>;

  getVaccinations(connectionId: string): Promise<HealthResult<VaccinationRecord[]>>;

  getAppointments(connectionId: string): Promise<HealthResult<HealthAppointment[]>>;

  getExams(connectionId: string): Promise<HealthResult<HealthExam[]>>;

  getDocuments(connectionId: string): Promise<HealthResult<HealthDocument[]>>;

  getNotifications(connectionId: string): Promise<HealthResult<HealthNotification[]>>;

  getDocument(connectionId: string, documentId: string): Promise<HealthResult<HealthDocument>>;

  downloadDocument(connectionId: string, documentId: string): Promise<HealthResult<{ fileUrl: string; expiresAt: string }>>;

  synchronize(connectionId: string): Promise<HealthResult<HealthSyncResult>>;
}

/** Provider registry */
export interface HealthProviderRegistry {
  register(provider: HealthIntegrationProvider): void;
  unregister(providerId: HealthProviderId): void;
  get(providerId: HealthProviderId): HealthIntegrationProvider | undefined;
  getAll(): HealthIntegrationProvider[];
  getByCapability(capability: HealthCapability): HealthIntegrationProvider[];
  getByType(type: HealthProviderType): HealthIntegrationProvider[];
  clear(): void;
}

/** Default provider registry implementation */
export class HealthProviderRegistryImpl {
  private providers = new Map<HealthProviderId, HealthIntegrationProvider>();

  register(provider: HealthIntegrationProvider): void {
    this.providers.set(provider.metadata.providerId, provider);
  }

  unregister(providerId: HealthProviderId): void {
    this.providers.delete(providerId);
  }

  get(providerId: HealthProviderId): HealthIntegrationProvider | undefined {
    return this.providers.get(providerId);
  }

  getAll(): HealthIntegrationProvider[] {
    return Array.from(this.providers.values());
  }

  getByCapability(capability: HealthCapability): HealthIntegrationProvider[] {
    return Array.from(this.providers.values()).filter((p) => p.supports(capability).supported);
  }

  getByType(type: HealthProviderType): HealthIntegrationProvider[] {
    return Array.from(this.providers.values()).filter((p) => p.metadata.providerType === type);
  }

  clear(): void {
    this.providers.clear();
  }
}

/** Factory for creating health providers */
export interface HealthProviderFactory {
  create(providerId: HealthProviderId, type: HealthProviderType, config?: Record<string, unknown>): HealthIntegrationProvider;
}