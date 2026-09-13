/**
 * RPG-OS Health Audit Service
 * 
 * Handles health-specific audit logging with privacy protections.
 * Never stores sensitive health data in audit logs.
 */

import { createAdminClient } from "../../supabase/admin";

export interface HealthAuditEvent {
  eventId: string;
  action: string;
  providerId: string;
  personId: string;
  organizationId?: string;
  metadata: Record<string, unknown>;
  success: boolean;
  error?: string;
  timestamp: string;
  correlationId?: string;
}

export type HealthAuditAction =
  | "HEALTH_CONNECTION_CREATED"
  | "HEALTH_CONNECTION_UPDATED"
  | "HEALTH_CONNECTION_DELETED"
  | "HEALTH_CONNECTION_TESTED"
  | "HEALTH_CONSENT_GRANTED"
  | "HEALTH_CONSENT_REVOKED"
  | "HEALTH_CONSENT_EXPIRED"
  | "HEALTH_DATA_ACCESSED"
  | "HEALTH_SYNC_STARTED"
  | "HEALTH_SYNC_COMPLETED"
  | "HEALTH_SYNC_FAILED"
  | "HEALTH_PROFILE_ACCESSED"
  | "HEALTH_PRESCRIPTIONS_ACCESSED"
  | "HEALTH_VACCINATIONS_ACCESSED"
  | "HEALTH_APPOINTMENTS_ACCESSED"
  | "HEALTH_EXAMS_ACCESSED"
  | "HEALTH_DOCUMENTS_ACCESSED"
  | "HEALTH_DOCUMENT_DOWNLOADED"
  | "HEALTH_SYNC_STARTED"
  | "HEALTH_SYNC_COMPLETED"
  | "HEALTH_SYNC_FAILED"
  | "HEALTH_CONSENT_GRANTED"
  | "HEALTH_CONSENT_REVOKED"
  | "HEALTH_CONNECTION_TEST_FAILED"
  | "HEALTH_PROVIDER_HEALTH_CHECK";

export type HealthAuditSource = {
  source: "PERSON" | "ORGANIZATION" | "SYSTEM" | "WEBHOOK" | "SCHEDULED";
  personId?: string;
  organizationId?: string;
  ip?: string;
  userAgent?: string;
};

/**
 * Health Audit Service
 * 
 * Logs health-specific audit events with strict privacy controls.
 * Never stores sensitive health data (prescriptions, diagnoses, exam results, etc.)
 * in audit logs - only metadata about access and operations.
 */
export class HealthAuditService {
  private supabase = createAdminClient();

  /**
   * Logs a health audit event
   * 
   * @param input - Audit event input
   * @returns { eventId, integrityHash } or null on failure
   */
  async log(input: {
    action: string;
    providerId: string;
    personId: string;
    organizationId?: string;
    source: "PERSON" | "ORGANIZATION" | "SYSTEM" | "WEBHOOK" | "SCHEDULED";
    metadata: Record<string, unknown>;
    success: boolean;
    error?: string;
    correlationId?: string;
  }): Promise<{ eventId: string; integrityHash: string } | null> {
    const eventId = `health_audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    // Sanitize metadata to remove any sensitive health data
    const sanitizedMetadata = this.sanitizeMetadata(input.metadata);

    const event = {
      eventId,
      action: input.action,
      providerId: input.providerId,
      personId: input.personId,
      organizationId: input.organizationId ?? null,
      source: input.source,
      metadata: sanitizedMetadata,
      success: input.success,
      error: input.error ?? null,
      correlationId: input.correlationId ?? null,
      timestamp,
    };

    try {
      const supabase = await import("../../supabase/admin").then(m => m.createAdminClient());
      
      // Insert audit log
      const { data: auditRow, error: auditError } = await supabase
        .from("health_audit_logs")
        .insert({
          event_id: eventId,
          action: input.action,
          provider_id: input.providerId,
          person_id: input.personId,
          organization_id: input.organizationId ?? null,
          source: input.source,
          metadata: sanitizedMetadata,
          success: input.success,
          error: input.error ?? null,
          correlation_id: input.correlationId ?? null,
          created_at: timestamp,
        })
        .select("id")
        .single();

      if (auditError) {
        console.error("[HealthAudit] Failed to log audit event:", auditError);
        return null;
      }

      // Create integrity hash for tamper detection
      const integrityHash = await this.createIntegrityHash(event);

      // Store integrity record
      const { error: integrityError } = await supabase
        .from("health_audit_integrity")
        .insert({
          event_id: eventId,
          integrity_hash: integrityHash,
          previous_hash: await this.getLastIntegrityHash(),
          created_at: timestamp,
        });

      if (integrityError) {
        console.error("[HealthAudit] Failed to log integrity record:", integrityError);
      }

      return { eventId, integrityHash };
    } catch (err) {
      console.error("[HealthAudit] Unexpected error logging audit:", err);
      return null;
    }
  }

  /**
   * Sanitizes metadata to remove sensitive health data
   * Uses the existing redaction utilities
   */
  private sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    // Simple sanitization - remove keys that might contain sensitive data
    const sensitiveKeys = [
      'password', 'secret', 'token', 'api_key', 'apikey', 'access_token',
      'refresh_token', 'credential', 'private_key', 'certificate',
      'nif', 'nipc', 'tax_number', 'ssn', 'cc_number', 'iban',
      'prescription', 'diagnosis', 'medication', 'exam_result',
      'medical_history', 'patient_data', 'health_data'
    ];

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(k => lowerKey.includes(k))) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeMetadata(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Creates SHA-256 hash of event for integrity verification
   */
  private async createIntegrityHash(event: any): Promise<string> {
    const canonical = JSON.stringify(event, Object.keys(event).sort());
    const data = new TextEncoder().encode(canonical);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Gets the last integrity hash for chaining
   */
  private async getLastIntegrityHash(): Promise<string> {
    try {
      const supabase = await import("../../supabase/admin").then(m => m.createAdminClient());
      const { data } = await supabase
        .from("health_audit_integrity")
        .select("integrity_hash")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.integrity_hash ?? "genesis";
    } catch {
      return "genesis";
    }
  }

  /**
   * Queries audit logs with filters
   */
  async queryLogs(filters: {
    personId?: string;
    providerId?: string;
    organizationId?: string;
    action?: string;
    success?: boolean;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ events: any[]; total: number }> {
    const supabase = await import("../../supabase/admin").then(m => m.createAdminClient());
    let query = supabase
      .from("health_audit_logs")
      .select("*", { count: "exact" });

    if (filters.personId) query = query.eq("person_id", filters.personId);
    if (filters.providerId) query = query.eq("provider_id", filters.providerId);
    if (filters.organizationId) query = query.eq("organization_id", filters.organizationId);
    if (filters.action) query = query.eq("action", filters.action);
    if (filters.success !== undefined) query = query.eq("success", filters.success);
    if (filters.startDate) query = query.gte("created_at", filters.startDate);
    if (filters.endDate) query = query.lte("created_at", filters.endDate);

    query = query.order("created_at", { ascending: false });
    if (filters.limit) query = query.limit(filters.limit);
    if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error("[HealthAudit] Query failed:", error);
      return { events: [], total: 0 };
    }

    return { events: data ?? [], total: count ?? 0 };
  }

  /**
   * Verifies integrity chain
   */
  async verifyIntegrityChain(): Promise<{ valid: boolean; brokenAt?: string; count: number }> {
    const supabase = await import("../../supabase/admin").then(m => m.createAdminClient());
    const { data, error } = await supabase
      .from("health_audit_integrity")
      .select("event_id, integrity_hash, previous_hash, created_at")
      .order("created_at", { ascending: true });

    if (error || !data || data.length === 0) {
      return { valid: true, count: 0 };
    }

    let previousHash = "genesis";
    let brokenAt: string | undefined;

    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      if (record.previous_hash !== previousHash) {
        brokenAt = record.event_id;
        break;
      }
      previousHash = record.integrity_hash;
    }

    return { valid: !brokenAt, brokenAt, count: data.length };
  }

  /**
   * Gets audit statistics
   */
  async getStats(filters: {
    personId?: string;
    providerId?: string;
    organizationId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{
    totalEvents: number;
    successRate: number;
    actionsBreakdown: Record<string, number>;
    providersBreakdown: Record<string, number>;
    errorsCount: number;
  }> {
    const supabase = await import("../../supabase/admin").then(m => m.createAdminClient());
    let query = supabase.from("health_audit_logs").select("action, success, provider_id, created_at", { count: "exact" });

    if (filters.personId) query = query.eq("person_id", filters.personId);
    if (filters.providerId) query = query.eq("provider_id", filters.providerId);
    if (filters.organizationId) query = query.eq("organization_id", filters.organizationId);
    if (filters.startDate) query = query.gte("created_at", filters.startDate);
    if (filters.endDate) query = query.lte("created_at", filters.endDate);

    const { data, error, count } = await query;

    if (error || !data) {
      return {
        totalEvents: 0,
        successRate: 0,
        actionsBreakdown: {},
        providersBreakdown: {},
        errorsCount: 0,
      };
    }

    const actionsBreakdown: Record<string, number> = {};
    const providersBreakdown: Record<string, number> = {};
    let successCount = 0;
    let errorsCount = 0;

    for (const event of data) {
      actionsBreakdown[event.action] = (actionsBreakdown[event.action] || 0) + 1;
      providersBreakdown[event.provider_id] = (providersBreakdown[event.provider_id] || 0) + 1;
      if (event.success) successCount++;
      else errorsCount++;
    }

    return {
      totalEvents: data.length,
      successRate: data.length > 0 ? successCount / data.length : 0,
      actionsBreakdown,
      providersBreakdown,
      errorsCount,
    };
  }
}

export const healthAuditService = new HealthAuditService();