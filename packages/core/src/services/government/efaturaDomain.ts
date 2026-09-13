/**
 * RPG-OS e-Fatura Domain (FASE 12)
 *
 * Complete domain model for e-Fatura workflow.
 * Extends existing Invoice and government types.
 * Does not duplicate existing types - reuses and extends.
 */

import type { Invoice, InvoiceType } from "../../types/invoice";
import type { GovernmentProviderId, GovernmentProviderType, GovernmentEnvironment } from "./governmentIntegration";

/** e-Fatura document status - extends existing fiscal states */
export type EFaturaDocumentStatus =
  | "DRAFT"                 // Rascunho local
  | "IMPORTED"              // Importado manualmente (JSON/CSV)
  | "VALIDATED"             // Validado (NIF, totals, VAT, etc.)
  | "READY"                 // Pronto para submissão
  | "SUBMITTED"             // Submetido ao provedor
  | "PENDING"               // Aguardando resposta AT/e-Fatura
  | "ACCEPTED"              // Aceito pela AT/e-Fatura
  | "REJECTED"              // Rejeitado pela AT/e-Fatura
  | "DUPLICATE"             // Duplicado detectado
  | "CANCELLED"             // Cancelado (após submissão)
  | "RECONCILED";           // Reconciliado com resposta AT

/** Valid lifecycle transitions for e-Fatura documents */
export type EFaturaTransition =
  | "import"          // DRAFT -> IMPORTED
  | "validate"        // IMPORTED -> VALIDATED
  | "ready"           // VALIDATED -> READY
  | "submit"          // READY -> SUBMITTED
  | "receive_status"  // SUBMITTED -> PENDING
  | "accept"          // PENDING -> ACCEPTED
  | "reject"          // PENDING -> REJECTED
  | "duplicate"       // Any -> DUPLICATE
  | "cancel"          // SUBMITTED/PENDING -> CANCELLED
  | "reconcile"       // ACCEPTED -> RECONCILED
  | "retry"           // REJECTED -> READY (after correction)

/** Validates an e-Fatura state transition */
export function validateEFaturaTransition(
  from: EFaturaDocumentStatus,
  to: EFaturaDocumentStatus
): { valid: boolean; error?: string } {
  const validTransitions: Record<EFaturaDocumentStatus, EFaturaDocumentStatus[]> = {
    DRAFT: ["IMPORTED"],
    IMPORTED: ["VALIDATED", "DUPLICATE"],
    VALIDATED: ["READY", "DUPLICATE"],
    READY: ["SUBMITTED", "DUPLICATE"],
    SUBMITTED: ["PENDING", "CANCELLED"],
    PENDING: ["ACCEPTED", "REJECTED", "CANCELLED"],
    ACCEPTED: ["RECONCILED"],
    REJECTED: ["VALIDATED"], // Can go back to validated after correction
    DUPLICATE: [],
    CANCELLED: [],
    RECONCILED: [],
  };

  const allowed = validTransitions[from] || [];
  if (!allowed.includes(to)) {
    return { valid: false, error: `Transição inválida: ${from} -> ${to}` };
  }
  return { valid: true, error: undefined };
}

/** Canonical fingerprint for duplicate detection */
export interface EFaturaFingerprint {
  /** Hash único do documento */
  hash: string;
  /** Componentes usados para gerar o hash */
  components: {
    organizationId: string;
    invoiceType: InvoiceType;
    series: string;
    documentNumber: string;
    issueDate: string;
    customerNif: string;
    totalCents: number;
    supplierNif?: string;
  };
  /** Timestamp de geração */
  generatedAt: string;
}

/** Gera fingerprint canônico para detecção de duplicatas */
export function generateEFaturaFingerprint(doc: {
  organizationId: string;
  invoiceType: InvoiceType;
  series: string;
  documentNumber: string;
  issueDate: string;
  customerNif: string;
  totalCents: number;
  supplierNif?: string;
}): EFaturaFingerprint {
  // Normaliza valores antes do hash
  const normalized = {
    organizationId: doc.organizationId.trim(),
    invoiceType: doc.invoiceType.trim() as InvoiceType,
    series: doc.series.trim(),
    documentNumber: doc.documentNumber.trim().padStart(3, "0"),
    issueDate: doc.issueDate.split("T")[0], // Apenas data
    customerNif: doc.customerNif.replace(/\D/g, ""), // Apenas dígitos
    totalCents: doc.totalCents,
    supplierNif: doc.supplierNif?.replace(/\D/g, "") ?? "",
  };

  // Gera string canônica
  const canonical = Object.values(normalized).join("|");

  // Hash simples determinístico (em produção usar crypto.subtle.digest)
  let hash = 0;
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash << 5) - hash) + canonical.charCodeAt(i);
    hash |= 0;
  }
  const hashHex = Math.abs(hash).toString(16).padStart(8, "0");

  return {
    hash: `EFAT-${hashHex}`,
    components: normalized,
    generatedAt: new Date().toISOString(),
  };
}

/** e-Fatura document model */
export interface EFaturaDocument {
  id: string;
  organizationId: string;
  invoiceId?: string; // Referência ao Invoice interno
  status: EFaturaDocumentStatus;
  invoiceType: InvoiceType;
  series: string;
  documentNumber: string;
  issueDate: string;
  customerNif: string;
  customerName: string;
  supplierNif?: string;
  supplierName?: string;
  totalCents: number;
  netCents: number;
  vatCents: number;
  vatBreakdown: Array<{ rate: string; ratePercent: number; amountCents: number; baseCents: number }>;
  atcud?: string;
  qrCode?: string;
  qrCodeData?: string;
  hash?: string;
  fingerprint: EFaturaFingerprint;
  fingerprintHash: string; // Para busca rápida de duplicatas
  providerId?: GovernmentProviderId;
  providerType?: GovernmentProviderType;
  providerEnvironment?: GovernmentEnvironment;
  connectionId?: string;
  idempotencyKey?: string;
  submissionId?: string;
  externalReference?: string;
  error?: string;
  errorCode?: string;
  retryCount: number;
  lastAttemptAt?: string;
  lastSyncAt?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  reconciledAt?: string;
  dueDate?: string;
  metadata?: Record<string, unknown>;
}

/** Resultado de validação de documento e-Fatura */
export interface EFaturaValidationResult {
  valid: boolean;
  documentId: string;
  errors: string[];
  warnings: string[];
  fingerprint?: EFaturaFingerprint;
}

/** Resultado de importação manual */
export interface EFaturaImportResult {
  documentId: string;
  status: "IMPORTED" | "VALIDATED" | "REJECTED" | "DUPLICATE";
  fingerprint?: EFaturaFingerprint;
  validation?: EFaturaValidationResult;
  error?: string;
}

/** Resultado de submissão em lote */
export interface EFaturaBatchImportResult {
  total: number;
  processed: number;
  imported: number;
  validated: number;
  duplicates: number;
  rejected: number;
  results: EFaturaImportResult[];
}

/** Configuração de importação manual */
export interface EFaturaImportConfig {
  /** Formato do arquivo: JSON ou CSV */
  format: "JSON" | "CSV";
  /** Validar apenas (não persistir) */
  validateOnly?: boolean;
  /** Permitir sobrescrever duplicatas */
  allowOverwrite?: boolean;
}

/** Resultado de submissão */
export interface EFaturaSubmissionResult {
  documentId: string;
  submissionId: string;
  status: "SUBMITTED" | "PENDING" | "ACCEPTED" | "REJECTED" | "ERROR";
  externalReference?: string;
  atcud?: string;
  error?: string;
  errorCode?: string;
}

/** Resultado de sincronização de status */
export interface EFaturaSyncResult {
  documentId: string;
  previousStatus: EFaturaDocumentStatus;
  newStatus: EFaturaDocumentStatus;
  externalReference?: string;
  atcud?: string;
  error?: string;
  syncedAt: string;
}

/** Evento de webhook e-Fatura */
export interface EFaturaWebhookEvent {
  eventId: string;
  providerId: GovernmentProviderId;
  eventType: "DOCUMENT_ACCEPTED" | "DOCUMENT_REJECTED" | "DOCUMENT_CANCELLED" | "STATUS_CHANGED";
  documentId: string;
  externalReference: string;
  status: EFaturaDocumentStatus;
  atcud?: string;
  error?: string;
  receivedAt: string;
  payload: Record<string, unknown>;
}

/** Tipo de evento de webhook e-Fatura */
export type EFaturaWebhookEventType = EFaturaWebhookEvent["eventType"];

/** Configuração de sincronização */
export interface EFaturaSyncConfig {
  /** Intervalo de polling em ms (padrão: 5 min) */
  pollIntervalMs?: number;
  /** Máximo de tentativas de retry */
  maxRetries?: number;
  /** Delay entre retries em ms */
  retryDelayMs?: number;
}

/** Estado do provedor para e-Fatura */
export interface EFaturaProviderStatus {
  providerId: GovernmentProviderId;
  connected: boolean;
  capabilities: string[];
  lastSyncAt?: string;
  lastError?: string;
}

/** Service interface para operações e-Fatura */
export interface EFaturaService {
  /** Valida documento e-Fatura */
  validate(doc: Partial<EFaturaDocument>): Promise<EFaturaValidationResult>;

  /** Importa documento manualmente (JSON) */
  import(doc: Partial<EFaturaDocument>, config?: EFaturaImportConfig): Promise<EFaturaImportResult>;

  /** Importa múltiplos documentos em lote */
  importBatch(docs: Partial<EFaturaDocument>[], config?: EFaturaImportConfig): Promise<EFaturaBatchImportResult>;

  /** Submete documento ao provedor */
  submit(doc: EFaturaDocument, idempotencyKey: string): Promise<EFaturaSubmissionResult>;

  /** Submete múltiplos documentos em lote */
  submitBatch(docs: EFaturaDocument[], idempotencyKeys: string[]): Promise<EFaturaSubmissionResult[]>;

  /** Sincroniza status com provedor */
  sync(doc: EFaturaDocument): Promise<EFaturaSyncResult>;

  /** Sincroniza múltiplos documentos */
  syncBatch(docs: EFaturaDocument[]): Promise<EFaturaSyncResult[]>;

  /** Processa webhook do provedor */
  processWebhook(event: EFaturaWebhookEvent): Promise<{ success: boolean; error?: string }>;

  /** Reconcilia documento aceito */
  reconcile(docId: string): Promise<{ success: boolean; error?: string }>;

  /** Obtém status do provedor */
  getProviderStatus(): Promise<EFaturaProviderStatus>;

  /** Gera fingerprint canônico */
  generateFingerprint(doc: EFaturaDocument): EFaturaFingerprint;

  /** Verifica duplicata por fingerprint */
  checkDuplicate(fingerprintHash: string): Promise<EFaturaDocument | null>;
}

export { EFaturaDocumentStatus as EFaturaStatus };