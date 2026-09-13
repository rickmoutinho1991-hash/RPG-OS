/**
 * RPG-OS Government Audit Center (FASE 10J-K)
 *
 * Extends existing audit with government-specific events.
 * Every external interaction produces an audit event.
 * Sources: USER, SYSTEM, AUTOMATION, GOVERNMENT_PROVIDER
 * Never logs secrets/tokens/passwords/private credentials.
 * Masks sensitive identifiers where appropriate.
 */

import type { GovernmentProviderId, GovernmentCapability, GovernmentProviderType, GovernmentEnvironment, GovernmentProviderStatus, GovernmentConnectionConfig, GovernmentConsent } from "./governmentIntegration";

/** Government audit action types */
export type GovernmentAuditAction =
  // Connection lifecycle
  | "GOV_CONNECTION_CREATED"
  | "GOV_CONNECTION_CONNECTED"
  | "GOV_CONNECTION_DISCONNECTED"
  | "GOV_CONNECTION_FAILED"
  | "GOV_CONNECTION_EXPIRED"
  | "GOV_CONNECTION_REVOKED"
  | "GOV_CONNECTION_SYNCED"
  // Consent lifecycle
  | "GOV_CONSENT_GRANTED"
  | "GOV_CONSENT_REVOKED"
  | "GOV_CONSENT_EXPIRED"
  | "GOV_CONSENT_RENEWED"
  // Document operations
  | "GOV_DOCUMENT_SUBMITTED"
  | "GOV_DOCUMENT_ACCEPTED"
  | "GOV_DOCUMENT_REJECTED"
  | "GOV_DOCUMENT_CANCELLED"
  | "GOV_DOCUMENT_STATUS_QUERIED"
  | "GOV_DOCUMENT_EXPORTED"
  // Reconciliation
  | "GOV_RECONCILIATION_RUN"
  | "GOV_RECONCILIATION_MISMATCH"
  | "GOV_RECONCILIATION_RESOLVED"
  // Deadlines
  | "GOV_DEADLINE_CREATED"
  | "GOV_DEADLINE_COMPLETED"
  | "GOV_DEADLINE_OVERDUE"
  | "GOV_DEADLINE_EXTENDED"
  // Authentication
  | "GOV_AUTH_INITIATED"
  | "GOV_AUTH_COMPLETED"
  | "GOV_AUTH_FAILED"
  | "GOV_IDENTITY_VERIFIED"
  // Security
  | "GOV_CREDENTIALS_ROTATED"
  | "GOV_PERMISSIONS_CHANGED"
  | "GOV_SCOPE_CHANGED"
  // Errors
  | "GOV_PROVIDER_ERROR"
  | "GOV_RATE_LIMITED"
  | "GOV_NETWORK_ERROR"
  | "GOV_VALIDATION_ERROR";

/** Audit source for government events */
export type GovernmentAuditSource =
  | "USER"
  | "SYSTEM"
  | "AUTOMATION"
  | "GOVERNMENT_PROVIDER";

/** Government audit event metadata */
export interface GovernmentAuditMetadata {
  organizationId: string;
  userId?: string;
  providerId: GovernmentProviderId;
  providerType: GovernmentProviderType;
  providerEnvironment: GovernmentEnvironment;
  connectionId?: string;
  consentId?: string;
  documentId?: string;
  documentType?: string;
  documentSeries?: string;
  documentNumber?: string;
  submissionId?: string;
  externalReference?: string;
  reconciliationBatchId?: string;
  deadlineId?: string;
  deadlineCategory?: string;
  scopes?: string[];
  capabilities?: GovernmentCapability[];
  errorCode?: string;
  errorMessage?: string;
  httpStatusCode?: number;
  latencyMs?: number;
  retryAttempt?: number;
  maxRetries?: number;
  idempotencyKey?: string;
  previousStatus?: GovernmentProviderStatus | string;
  newStatus?: GovernmentProviderStatus | string;
  maskedNif?: string;
  maskedNiss?: string;
  [key: string]: unknown;
}

/** Complete government audit event */
export interface GovernmentAuditEvent {
  id: string;
  timestamp: string;
  source: GovernmentAuditSource;
  action: GovernmentAuditAction;
  organizationId: string;
  userId?: string;
  metadata: GovernmentAuditMetadata;
}

/** Government audit query filters */
export interface GovernmentAuditQuery {
  organizationId?: string;
  userId?: string;
  providerId?: GovernmentProviderId;
  source?: GovernmentAuditSource;
  action?: GovernmentAuditAction;
  connectionId?: string;
  documentId?: string;
  startDate?: string;
  endDate?: string;
  hasError?: boolean;
  limit?: number;
  offset?: number;
}

/** Government audit statistics */
export interface GovernmentAuditStats {
  totalEvents: number;
  bySource: Record<GovernmentAuditSource, number>;
  byAction: Record<GovernmentAuditAction, number>;
  byProvider: Record<GovernmentProviderId, number>;
  errorsLast24h: number;
  successRate: number;
  averageLatencyMs: number;
  topErrors: Array<{ code: string; count: number }>;
}

/** Government audit service */
export class GovernmentAuditService {
  private events: GovernmentAuditEvent[] = [];

  /**
   * Logs a government audit event
   */
  log(event: Omit<GovernmentAuditEvent, "id" | "timestamp">): GovernmentAuditEvent {
    const now = new Date().toISOString();
    const auditEvent: GovernmentAuditEvent = {
      ...event,
      id: `gov_audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: now,
      metadata: this.sanitizeMetadata(event.metadata),
    };

    this.events.push(auditEvent);

    // In production: persist to database with RLS
    // await this.persistToDatabase(auditEvent);

    return auditEvent;
  }

  /**
   * Sanitizes metadata to remove sensitive information
   */
  private sanitizeMetadata(metadata: GovernmentAuditMetadata): GovernmentAuditMetadata {
    const sanitized = { ...metadata };

    // Remove any potential secrets
    const sensitiveKeys = [
      "password", "secret", "token", "credential", "privatekey",
      "certificate", "apikey", "clientsecret", "certificatepassword",
      "accesstoken", "refreshtoken", "authorization", "cookie",
    ];

    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(s => lowerKey.includes(s))) {
        delete (sanitized as Record<string, unknown>)[key];
      }
    }

    // Mask NIF if present
    if (sanitized.maskedNif) {
      const nif = sanitized.maskedNif.replace(/\D/g, "");
      if (nif.length === 9) {
        sanitized.maskedNif = `***${nif.slice(-3)}`;
      }
    }

    // Mask NISS if present
    if (sanitized.maskedNiss) {
      const niss = sanitized.maskedNiss.replace(/\D/g, "");
      if (niss.length >= 9) {
        sanitized.maskedNiss = `***${niss.slice(-5)}`;
      }
    }

    return sanitized;
  }

  /**
   * Convenience method: Connection created
   */
  logConnectionCreated(
    organizationId: string,
    userId: string,
    connection: { id: string; providerId: GovernmentProviderId; environment: string; scopes: string[] },
    source: GovernmentAuditSource = "USER"
  ): GovernmentAuditEvent {
    return this.log({
      source,
      action: "GOV_CONNECTION_CREATED",
      organizationId,
      userId,
      metadata: {
        organizationId,
        providerId: connection.providerId,
        providerType: "FAKE",
        providerEnvironment: connection.environment as any,
        connectionId: connection.id,
        scopes: connection.scopes,
      },
    });
  }

  /**
   * Convenience method: Connection connected
   */
  logConnectionConnected(
    organizationId: string,
    connectionId: string,
    providerId: GovernmentProviderId,
    environment: GovernmentEnvironment,
    providerType: GovernmentProviderType,
    source: GovernmentAuditSource = "SYSTEM"
  ): GovernmentAuditEvent {
    return this.log({
      source,
      action: "GOV_CONNECTION_CONNECTED",
      organizationId,
      metadata: {
        organizationId,
        providerId,
        providerType,
        providerEnvironment: environment,
        connectionId,
        previousStatus: "DISCONNECTED",
        newStatus: "CONNECTED",
      },
    });
  }

  /**
   * Convenience method: Connection failed
   */
  logConnectionFailed(
    organizationId: string,
    connectionId: string,
    providerId: GovernmentProviderId,
    environment: GovernmentEnvironment,
    providerType: GovernmentProviderType,
    error: string,
    errorCode?: string,
    source: GovernmentAuditSource = "SYSTEM"
  ): GovernmentAuditEvent {
    return this.log({
      source,
      action: "GOV_CONNECTION_FAILED",
      organizationId,
      metadata: {
        organizationId,
        providerId,
        providerType,
        providerEnvironment: environment,
        connectionId,
        errorCode: errorCode || "CONNECTION_FAILED",
        errorMessage: error,
        previousStatus: "CONNECTING",
        newStatus: "ERROR",
      },
    });
  }

  /**
   * Convenience method: Consent granted
   */
  logConsentGranted(
    organizationId: string,
    userId: string,
    consent: { id: string; providerId: GovernmentProviderId; scopes: string[]; expiresAt?: string },
    source: GovernmentAuditSource = "USER"
  ): GovernmentAuditEvent {
    return this.log({
      source,
      action: "GOV_CONSENT_GRANTED",
      organizationId,
      userId,
      metadata: {
        organizationId,
        providerId: consent.providerId,
        providerType: "FAKE",
        providerEnvironment: "development",
        consentId: consent.id,
        scopes: consent.scopes,
      },
    });
  }

  /**
   * Convenience method: Consent revoked
   */
  logConsentRevoked(
    organizationId: string,
    userId: string,
    consentId: string,
    providerId: GovernmentProviderId,
    reason?: string,
    source: GovernmentAuditSource = "USER"
  ): GovernmentAuditEvent {
    return this.log({
      source,
      action: "GOV_CONSENT_REVOKED",
      organizationId,
      userId,
      metadata: {
        organizationId,
        providerId,
        providerType: "FAKE",
        providerEnvironment: "development",
        consentId,
        errorMessage: reason,
      },
    });
  }

  /**
   * Convenience method: Document submitted
   */
  logDocumentSubmitted(
    organizationId: string,
    document: {
      id: string;
      type: string;
      series: string;
      number: string;
      totalCents: number;
    },
    submission: {
      submissionId: string;
      providerId: GovernmentProviderId;
      environment: GovernmentEnvironment;
      providerType: GovernmentProviderType;
      connectionId: string;
      idempotencyKey: string;
    },
    source: GovernmentAuditSource = "AUTOMATION"
  ): GovernmentAuditEvent {
    return this.log({
      source,
      action: "GOV_DOCUMENT_SUBMITTED",
      organizationId,
      metadata: {
        organizationId,
        providerId: submission.providerId,
        providerType: submission.providerType,
        providerEnvironment: submission.environment,
        connectionId: submission.connectionId,
        documentId: document.id,
        documentType: document.type,
        documentSeries: document.series,
        documentNumber: document.number,
        submissionId: submission.submissionId,
        idempotencyKey: submission.idempotencyKey,
      },
    });
  }

  /**
   * Convenience method: Document accepted
   */
  logDocumentAccepted(
    organizationId: string,
    documentId: string,
    submissionId: string,
    externalReference: string,
    providerId: GovernmentProviderId,
    providerType: GovernmentProviderType,
    source: GovernmentAuditSource = "GOVERNMENT_PROVIDER"
  ): GovernmentAuditEvent {
    return this.log({
      source,
      action: "GOV_DOCUMENT_ACCEPTED",
      organizationId,
      metadata: {
        organizationId,
        providerId,
        providerType,
        providerEnvironment: "production",
        documentId,
        submissionId,
        externalReference,
        previousStatus: "SUBMITTED",
        newStatus: "ACCEPTED",
      },
    });
  }

  /**
   * Convenience method: Document rejected
   */
  logDocumentRejected(
    organizationId: string,
    documentId: string,
    submissionId: string,
    error: string,
    providerId: GovernmentProviderId,
    providerType: GovernmentProviderType,
    errorCode?: string,
    source: GovernmentAuditSource = "GOVERNMENT_PROVIDER"
  ): GovernmentAuditEvent {
    return this.log({
      source,
      action: "GOV_DOCUMENT_REJECTED",
      organizationId,
      metadata: {
        organizationId,
        providerId,
        providerType,
        providerEnvironment: "production",
        documentId,
        submissionId,
        errorCode: errorCode || "REJECTED",
        errorMessage: error,
        previousStatus: "SUBMITTED",
        newStatus: "REJECTED",
      },
    });
  }

  /**
   * Convenience method: Reconciliation run
   */
  logReconciliationRun(
    organizationId: string,
    batch: {
      batchId: string;
      total: number;
      matched: number;
      mismatched: number;
      missingExternal: number;
      missingLocal: number;
      providerId: GovernmentProviderId;
    },
    source: GovernmentAuditSource = "AUTOMATION"
  ): GovernmentAuditEvent {
    return this.log({
      source,
      action: "GOV_RECONCILIATION_RUN",
      organizationId,
      metadata: {
        organizationId,
        providerId: batch.providerId,
        providerType: "FAKE",
        providerEnvironment: "development",
        reconciliationBatchId: batch.batchId,
        metadata: {
          total: batch.total,
          matched: batch.matched,
          mismatched: batch.mismatched,
          missingExternal: batch.missingExternal,
          missingLocal: batch.missingLocal,
        },
      },
    });
  }

  /**
   * Convenience method: Reconciliation mismatch
   */
  logReconciliationMismatch(
    organizationId: string,
    batchId: string,
    documentId: string,
    differences: Array<{ field: string; localValue: string | number; externalValue: string | number }>,
    providerId: GovernmentProviderId,
    source: GovernmentAuditSource = "AUTOMATION"
  ): GovernmentAuditEvent {
    return this.log({
      source,
      action: "GOV_RECONCILIATION_MISMATCH",
      organizationId,
      metadata: {
        organizationId,
        providerId,
        providerType: "FAKE",
        providerEnvironment: "development",
        reconciliationBatchId: batchId,
        documentId,
        metadata: { differences },
      },
    });
  }

  /**
   * Convenience method: Deadline created
   */
  logDeadlineCreated(
    organizationId: string,
    deadline: {
      id: string;
      ruleCode: string;
      category: string;
      dueDate: string;
    },
    source: GovernmentAuditSource = "SYSTEM"
  ): GovernmentAuditEvent {
    return this.log({
      source,
      action: "GOV_DEADLINE_CREATED",
      organizationId,
      metadata: {
        organizationId,
        providerId: "AT",
        providerType: "FAKE",
        providerEnvironment: "development",
        deadlineId: deadline.id,
        deadlineCategory: "OTHER",
        metadata: { rule_code: deadline.ruleCode },
      },
    });
  }

  /**
   * Convenience method: Deadline completed
   */
  logDeadlineCompleted(
    organizationId: string,
    deadlineId: string,
    userId: string,
    source: GovernmentAuditSource = "USER"
  ): GovernmentAuditEvent {
    return this.log({
      source,
      action: "GOV_DEADLINE_COMPLETED",
      organizationId,
      userId,
      metadata: {
        organizationId,
        providerId: "AT",
        providerType: "FAKE",
        providerEnvironment: "development",
        deadlineId,
      },
    });
  }

  /**
   * Convenience method: Authentication initiated
   */
  logAuthInitiated(
    organizationId: string,
    userId: string,
    providerId: GovernmentProviderId,
    transactionId: string,
    source: GovernmentAuditSource = "USER"
  ): GovernmentAuditEvent {
    return this.log({
      source,
      action: "GOV_AUTH_INITIATED",
      organizationId,
      userId,
      metadata: {
        organizationId,
        providerId,
        providerType: "FAKE",
        providerEnvironment: "development",
        metadata: { transaction_id: transactionId },
      },
    });
  }

  /**
   * Convenience method: Authentication completed
   */
  logAuthCompleted(
    organizationId: string,
    userId: string,
    providerId: GovernmentProviderId,
    nif: string,
    transactionId: string,
    source: GovernmentAuditSource = "GOVERNMENT_PROVIDER"
  ): GovernmentAuditEvent {
    const cleanNif = nif.replace(/\D/g, "");
    const maskedNif = cleanNif.length === 9 ? `***${cleanNif.slice(-3)}` : nif;

    return this.log({
      source,
      action: "GOV_AUTH_COMPLETED",
      organizationId,
      userId,
      metadata: {
        organizationId,
        providerId,
        providerType: "FAKE",
        providerEnvironment: "development",
        maskedNif,
        metadata: { transaction_id: transactionId },
      },
    });
  }

  /**
   * Convenience method: Provider error
   */
  logProviderError(
    organizationId: string,
    providerId: GovernmentProviderId,
    providerType: GovernmentProviderType,
    environment: GovernmentEnvironment,
    operation: string,
    error: string,
    errorCode?: string,
    httpStatus?: number,
    connectionId?: string,
    latencyMs?: number,
    retryAttempt?: number,
    maxRetries?: number,
    source: GovernmentAuditSource = "SYSTEM"
  ): GovernmentAuditEvent {
    return this.log({
      source,
      action: "GOV_PROVIDER_ERROR",
      organizationId,
      metadata: {
        organizationId,
        providerId,
        providerType,
        providerEnvironment: environment,
        connectionId,
        errorCode: errorCode || "PROVIDER_ERROR",
        errorMessage: error,
        httpStatusCode: httpStatus,
        latencyMs,
        retryAttempt,
        maxRetries,
        metadata: { operation },
      },
    });
  }

  /**
   * Query audit events
   */
  query(filters: GovernmentAuditQuery = {}): GovernmentAuditEvent[] {
    let results = [...this.events];

    if (filters.organizationId) {
      results = results.filter(e => e.organizationId === filters.organizationId);
    }
    if (filters.userId) {
      results = results.filter(e => e.userId === filters.userId);
    }
    if (filters.providerId) {
      results = results.filter(e => e.metadata.providerId === filters.providerId);
    }
    if (filters.source) {
      results = results.filter(e => e.source === filters.source);
    }
    if (filters.action) {
      results = results.filter(e => e.action === filters.action);
    }
    if (filters.connectionId) {
      results = results.filter(e => e.metadata.connectionId === filters.connectionId);
    }
    if (filters.documentId) {
      results = results.filter(e => e.metadata.documentId === filters.documentId);
    }
    if (filters.startDate) {
      results = results.filter(e => e.timestamp >= filters.startDate!);
    }
    if (filters.endDate) {
      results = results.filter(e => e.timestamp <= filters.endDate!);
    }
    if (filters.hasError) {
      results = results.filter(e => e.metadata.errorCode);
    }

    // Sort by timestamp descending
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    if (filters.offset) {
      results = results.slice(filters.offset);
    }
    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  /**
   * Get audit statistics
   */
  getStats(organizationId?: string, startDate?: string, endDate?: string): GovernmentAuditStats {
    let events = [...this.events];

    if (organizationId) {
      events = events.filter(e => e.organizationId === organizationId);
    }
    if (startDate) {
      events = events.filter(e => e.timestamp >= startDate!);
    }
    if (endDate) {
      events = events.filter(e => e.timestamp <= endDate!);
    }

    const stats: GovernmentAuditStats = {
      totalEvents: events.length,
      bySource: { USER: 0, SYSTEM: 0, AUTOMATION: 0, GOVERNMENT_PROVIDER: 0 },
      byAction: Object.fromEntries(
        (["GOV_CONNECTION_CREATED", "GOV_CONNECTION_CONNECTED", "GOV_CONNECTION_DISCONNECTED", "GOV_CONNECTION_FAILED", "GOV_CONNECTION_EXPIRED", "GOV_CONNECTION_REVOKED", "GOV_CONNECTION_SYNCED", "GOV_CONSENT_GRANTED", "GOV_CONSENT_REVOKED", "GOV_CONSENT_EXPIRED", "GOV_CONSENT_RENEWED", "GOV_DOCUMENT_SUBMITTED", "GOV_DOCUMENT_ACCEPTED", "GOV_DOCUMENT_REJECTED", "GOV_DOCUMENT_CANCELLED", "GOV_DOCUMENT_STATUS_QUERIED", "GOV_DOCUMENT_EXPORTED", "GOV_RECONCILIATION_RUN", "GOV_RECONCILIATION_MISMATCH", "GOV_RECONCILIATION_RESOLVED", "GOV_DEADLINE_CREATED", "GOV_DEADLINE_COMPLETED", "GOV_DEADLINE_OVERDUE", "GOV_DEADLINE_EXTENDED", "GOV_AUTH_INITIATED", "GOV_AUTH_COMPLETED", "GOV_AUTH_FAILED", "GOV_IDENTITY_VERIFIED", "GOV_CREDENTIALS_ROTATED"] as GovernmentAuditAction[]).map(a => [a, 0])
      ) as Record<GovernmentAuditAction, number>,
      byProvider: { AT: 0, EFATURA: 0, SEGURANCA_SOCIAL: 0, AUTENTICACAO_GOV: 0, CMD: 0, GOV_PT: 0 },
      errorsLast24h: 0,
      successRate: 0,
      averageLatencyMs: 0,
      topErrors: [],
    };

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    let totalLatency = 0;
    let latencyCount = 0;
    const errorCounts: Record<string, number> = {};

    for (const event of events) {
      stats.bySource[event.source]++;
      stats.byAction[event.action] = (stats.byAction[event.action] || 0) + 1;
      stats.byProvider[event.metadata.providerId] = (stats.byProvider[event.metadata.providerId] || 0) + 1;

      if (event.metadata.errorCode) {
        if (event.timestamp >= dayAgo) {
          stats.errorsLast24h++;
        }
        errorCounts[event.metadata.errorCode] = (errorCounts[event.metadata.errorCode] || 0) + 1;
      }

      if (event.metadata.latencyMs) {
        totalLatency += event.metadata.latencyMs;
        latencyCount++;
      }
    }

    const total = events.length;
    const errorEvents = events.filter(e => e.metadata.errorCode).length;
    stats.successRate = total > 0 ? Math.round(((total - errorEvents) / total) * 100) : 100;
    stats.averageLatencyMs = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0;

    // Top errors
    stats.topErrors = Object.entries(errorCounts)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return stats;
  }

  /**
   * Get all events (for testing)
   */
  getAllEvents(): GovernmentAuditEvent[] {
    return [...this.events];
  }

  /**
   * Clear events (for testing)
   */
  clear(): void {
    this.events = [];
  }
}

/** Instância global (para desenvolvimento) */
export const governmentAuditService = new GovernmentAuditService();

/** Helper para criar instância */
export function createGovernmentAuditService(): GovernmentAuditService {
  return new GovernmentAuditService();
}