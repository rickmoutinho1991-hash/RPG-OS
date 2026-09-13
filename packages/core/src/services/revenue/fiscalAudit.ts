/**
 * RPG-OS Fiscal Audit Events (FASE 10I-I)
 *
 * Extends audit system with fiscal-specific events.
 * Every fiscal integration action generates an audit event.
 * Source distinguishes: USER, SYSTEM, AUTOMATION, GOVERNMENT_PROVIDER
 * Never logs secrets, tokens or credentials.
 */

import type { AuditLogEntry } from "../../types/audit";

/** Fiscal audit action types */
export type FiscalAuditAction =
  | "FISCAL_DOCUMENT_CREATED"
  | "FISCAL_DOCUMENT_ISSUED"
  | "FISCAL_DOCUMENT_CANCELLED"
  | "FISCAL_DOCUMENT_SUBMITTED"
  | "FISCAL_DOCUMENT_ACCEPTED"
  | "FISCAL_DOCUMENT_REJECTED"
  | "FISCAL_DOCUMENT_RECONCILED"
  | "FISCAL_DOCUMENT_MISMATCH"
  | "FISCAL_EXPORT_CREATED"
  | "FISCAL_SERIES_CREATED"
  | "FISCAL_SERIES_UPDATED"
  | "TAX_AUTHORITY_VALIDATION"
  | "TAX_AUTHORITY_SUBMISSION"
  | "TAX_AUTHORITY_STATUS_QUERY"
  | "TAX_AUTHORITY_CANCELLATION"
  | "IDEMPOTENCY_KEY_GENERATED";

/** Audit event source */
export type AuditSource = "USER" | "SYSTEM" | "AUTOMATION" | "GOVERNMENT_PROVIDER";

/** Fiscal audit event metadata */
export interface FiscalAuditMetadata {
  /** Organization ID */
  organizationId: string;
  /** Document ID (if applicable) */
  documentId?: string;
  /** Document type (FT, FS, FR, NC, ND) */
  documentType?: string;
  /** Series */
  series?: string;
  /** Document number */
  documentNumber?: string;
  /** Customer NIF */
  customerNif?: string;
  /** Total amount in cents */
  totalCents?: number;
  /** VAT amount in cents */
  vatCents?: number;
  /** Status before action */
  previousStatus?: string;
  /** Status after action */
  newStatus?: string;
  /** External reference (ATCUD, submission ID, etc.) */
  externalReference?: string;
  /** Error message (if failed) */
  error?: string;
  /** Reconciliation batch ID (if applicable) */
  reconciliationBatchId?: string;
  /** Whether this is a retry */
  isRetry?: boolean;
  /** Attempt number */
  attempt?: number;
  /** Username (for logging) */
  userName?: string;
  /** Entity ID for export/series */
  entityId?: string;
  /** Differences for mismatch events */
  differences?: Array<{ field: string; localValue: string | number; externalValue: string | number }>;
  /** Allow additional properties for flexibility */
  [key: string]: unknown;
}

/** Complete fiscal audit event */
export interface FiscalAuditEvent extends Omit<AuditLogEntry, "action" | "metadata"> {
  action: FiscalAuditAction;
  module: "fiscal";
  entityType: "invoice" | "series" | "export" | "reconciliation" | "tax_authority";
  source: AuditSource;
  metadata: FiscalAuditMetadata;
}

/**
 * Creates a fiscal audit event
 */
export function createFiscalAuditEvent(
  action: FiscalAuditAction,
  userId: string,
  organizationId: string,
  metadata: Partial<FiscalAuditMetadata> = {},
  source: AuditSource = "SYSTEM",
): FiscalAuditEvent {
  const now = new Date().toISOString();
  const eventId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    id: eventId,
    userId,
    userName: metadata.userName,
    companyId: organizationId,
    action,
    module: "fiscal",
    entityType: getEntityTypeForAction(action),
    entityId: metadata.documentId ?? metadata.reconciliationBatchId ?? organizationId,
    timestamp: now,
    source,
    metadata: {
      organizationId,
      ...metadata,
    } as FiscalAuditMetadata,
  };
}

/**
 * Maps action to entity type
 */
function getEntityTypeForAction(action: FiscalAuditAction): FiscalAuditEvent["entityType"] {
  if (action === "FISCAL_DOCUMENT_RECONCILED" || action === "FISCAL_DOCUMENT_MISMATCH") {
    return "reconciliation";
  }
  if (action.startsWith("FISCAL_DOCUMENT") || action.startsWith("TAX_AUTHORITY")) {
    return "invoice";
  }
  if (action.startsWith("FISCAL_SERIES")) {
    return "series";
  }
  if (action === "FISCAL_EXPORT_CREATED") {
    return "export";
  }
  return "tax_authority";
}

/**
 * Sanitizes metadata to remove sensitive data
 * Never logs secrets, tokens, credentials, or full credit card numbers
 */
export function sanitizeFiscalMetadata(metadata: FiscalAuditMetadata): FiscalAuditMetadata {
  const sanitized = { ...metadata };

  // Remove any fields that might contain secrets
  const sensitiveKeys = [
    "password",
    "secret",
    "token",
    "credential",
    "privatekey",
    "certificate",
    "apikey",
    "clientsecret",
    "certificatepassword",
  ];

  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((s) => lowerKey.includes(s))) {
      delete (sanitized as Record<string, unknown>)[key];
    }
  }

  // Mask NIF if needed (keep last 3 digits)
  if (sanitized.customerNif && sanitized.customerNif.length === 9) {
    sanitized.customerNif = `***${sanitized.customerNif.slice(-3)}`;
  }

  return sanitized;
}

/**
 * Fiscal audit logger interface
 * Implementations can write to database, file, or external logging service
 */
export interface FiscalAuditLogger {
  /** Log a fiscal audit event */
  log(event: FiscalAuditEvent): Promise<void>;
  /** Query audit events */
  query(criteria: {
    organizationId?: string;
    action?: FiscalAuditAction;
    entityId?: string;
    startDate?: string;
    endDate?: string;
    source?: AuditSource;
    limit?: number;
  }): Promise<FiscalAuditEvent[]>;
}

/**
 * In-memory fiscal audit logger (for development/testing)
 */
export class InMemoryFiscalAuditLogger implements FiscalAuditLogger {
  private events: FiscalAuditEvent[] = [];

  async log(event: FiscalAuditEvent): Promise<void> {
    const sanitizedEvent = {
      ...event,
      metadata: sanitizeFiscalMetadata(event.metadata),
    };
    this.events.push(sanitizedEvent);
  }

  async query(criteria: {
    organizationId?: string;
    action?: FiscalAuditAction;
    entityId?: string;
    startDate?: string;
    endDate?: string;
    source?: AuditSource;
    limit?: number;
  }): Promise<FiscalAuditEvent[]> {
    let results = [...this.events];

    if (criteria.organizationId) {
      results = results.filter((e) => e.metadata.organizationId === criteria.organizationId);
    }
    if (criteria.action) {
      results = results.filter((e) => e.action === criteria.action);
    }
    if (criteria.entityId) {
      results = results.filter((e) => e.entityId === criteria.entityId);
    }
    if (criteria.startDate) {
      results = results.filter((e) => e.timestamp >= criteria.startDate!);
    }
    if (criteria.endDate) {
      results = results.filter((e) => e.timestamp <= criteria.endDate!);
    }
    if (criteria.source) {
      results = results.filter((e) => e.source === criteria.source);
    }

    // Sort by timestamp descending
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (criteria.limit) {
      results = results.slice(0, criteria.limit);
    }

    return results;
  }

  /** Get all events (for testing) */
  getAll(): FiscalAuditEvent[] {
    return [...this.events];
  }

  /** Clear all events (for testing) */
  clear(): void {
    this.events = [];
  }
}

/**
 * Pre-defined event creators for common fiscal actions
 */
export const FiscalAuditEvents = {
  /** Document created as draft */
  documentCreated: (
    userId: string,
    organizationId: string,
    document: { id: string; type: string; series: string; number: string; customerNif: string; totalCents: number },
  ) =>
    createFiscalAuditEvent(
      "FISCAL_DOCUMENT_CREATED",
      userId,
      organizationId,
      {
        documentId: document.id,
        documentType: document.type,
        series: document.series,
        documentNumber: document.number,
        customerNif: document.customerNif,
        totalCents: document.totalCents,
      },
      "USER",
    ),

  /** Document issued (sent to customer) */
  documentIssued: (
    userId: string,
    organizationId: string,
    document: { id: string; type: string; series: string; number: string; atcud?: string },
  ) =>
    createFiscalAuditEvent(
      "FISCAL_DOCUMENT_ISSUED",
      userId,
      organizationId,
      {
        documentId: document.id,
        documentType: document.type,
        series: document.series,
        documentNumber: document.number,
        externalReference: document.atcud,
        previousStatus: "draft",
        newStatus: "issued",
      },
      "USER",
    ),

  /** Document cancelled */
  documentCancelled: (
    userId: string,
    organizationId: string,
    document: { id: string; type: string; series: string; number: string; reason: string },
  ) =>
    createFiscalAuditEvent(
      "FISCAL_DOCUMENT_CANCELLED",
      userId,
      organizationId,
      {
        documentId: document.id,
        documentType: document.type,
        series: document.series,
        documentNumber: document.number,
        error: document.reason,
        previousStatus: "issued",
        newStatus: "cancelled",
      },
      "USER",
    ),

  /** Document submitted to tax authority */
  documentSubmitted: (
    userId: string,
    organizationId: string,
    document: { id: string; type: string; series: string; number: string; submissionId: string; attempt?: number },
  ) =>
    createFiscalAuditEvent(
      "FISCAL_DOCUMENT_SUBMITTED",
      userId,
      organizationId,
      {
        documentId: document.id,
        documentType: document.type,
        series: document.series,
        documentNumber: document.number,
        externalReference: document.submissionId,
        previousStatus: "issued",
        newStatus: "submitted",
        isRetry: (document.attempt ?? 1) > 1,
        attempt: document.attempt,
      },
      "AUTOMATION",
    ),

  /** Document accepted by tax authority */
  documentAccepted: (
    organizationId: string,
    document: { id: string; type: string; series: string; number: string; atcud: string; hash: string },
  ) =>
    createFiscalAuditEvent(
      "FISCAL_DOCUMENT_ACCEPTED",
      "system",
      organizationId,
      {
        documentId: document.id,
        documentType: document.type,
        series: document.series,
        documentNumber: document.number,
        externalReference: document.atcud,
        previousStatus: "submitted",
        newStatus: "accepted",
      },
      "GOVERNMENT_PROVIDER",
    ),

  /** Document rejected by tax authority */
  documentRejected: (
    organizationId: string,
    document: { id: string; type: string; series: string; number: string; error: string },
  ) =>
    createFiscalAuditEvent(
      "FISCAL_DOCUMENT_REJECTED",
      "system",
      organizationId,
      {
        documentId: document.id,
        documentType: document.type,
        series: document.series,
        documentNumber: document.number,
        error: document.error,
        previousStatus: "submitted",
        newStatus: "rejected",
      },
      "GOVERNMENT_PROVIDER",
    ),

  /** Document reconciled */
  documentReconciled: (
    userId: string,
    organizationId: string,
    document: { id: string; type: string; series: string; number: string },
    reconciliationBatchId: string,
  ) =>
    createFiscalAuditEvent(
      "FISCAL_DOCUMENT_RECONCILED",
      userId,
      organizationId,
      {
        documentId: document.id,
        documentType: document.type,
        series: document.series,
        documentNumber: document.number,
        reconciliationBatchId,
        newStatus: "reconciled",
      },
      "USER",
    ),

  /** Reconciliation mismatch detected */
  documentMismatch: (
    organizationId: string,
    document: { id: string; type: string; series: string; number: string },
    differences: Array<{ field: string; localValue: string | number; externalValue: string | number }>,
  ) =>
    createFiscalAuditEvent(
      "FISCAL_DOCUMENT_MISMATCH",
      "system",
      organizationId,
      {
        documentId: document.id,
        documentType: document.type,
        series: document.series,
        documentNumber: document.number,
        metadata: { differences } as any,
      },
      "AUTOMATION",
    ),

  /** SAF-T export created */
  exportCreatedEvent: (
    userId: string,
    organizationId: string,
    exportData: { id: string; fiscalYear: number; documentCount: number; totalNetCents: number; totalVatCents: number },
  ) =>
    createFiscalAuditEvent(
      "FISCAL_EXPORT_CREATED",
      userId,
      organizationId,
      {
        entityId: exportData.id,
        documentId: exportData.id,
        totalCents: exportData.totalNetCents + exportData.totalVatCents,
        vatCents: exportData.totalVatCents,
      },
      "USER",
    ),

  /** Fiscal series created */
  seriesCreated: (
    userId: string,
    organizationId: string,
    series: { id: string; type: string; code: string; fiscalYear: number; startingNumber: number },
  ) =>
    createFiscalAuditEvent(
      "FISCAL_SERIES_CREATED",
      userId,
      organizationId,
      {
        entityId: series.id,
        documentType: series.type,
        series: series.code,
        documentNumber: String(series.startingNumber),
      },
      "USER",
    ),

  /** Tax authority validation performed */
  taxAuthorityValidation: (
    organizationId: string,
    document: { id: string; type: string; series: string; number: string },
    result: { valid: boolean; status: string; errors?: string[] },
  ) =>
    createFiscalAuditEvent(
      "TAX_AUTHORITY_VALIDATION",
      "system",
      organizationId,
      {
        documentId: document.id,
        documentType: document.type,
        series: document.series,
        documentNumber: document.number,
        error: result.errors?.join(", "),
        newStatus: result.status,
      },
      "GOVERNMENT_PROVIDER",
    ),

  /** Idempotency key generated */
  idempotencyKeyGenerated: (
    organizationId: string,
    document: { id: string; type: string; series: string; number: string },
    operation: string,
    attempt: number,
    idempotencyKey: string,
  ) =>
    createFiscalAuditEvent(
      "IDEMPOTENCY_KEY_GENERATED",
      "system",
      organizationId,
      {
        documentId: document.id,
        documentType: document.type,
        series: document.series,
        documentNumber: document.number,
        externalReference: idempotencyKey,
        attempt,
      },
      "AUTOMATION",
    ),
};