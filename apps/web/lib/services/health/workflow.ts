/**
 * RPG-OS Health Workflow Service
 * 
 * Orchestrates health data workflows, consent management, and synchronization.
 * Uses the health provider abstraction for SNS24/SPMS integration.
 */

import {
  HealthConnectionConfig,
  HealthConsent,
  HealthConsentScope,
  HealthProviderId,
  HealthProviderType,
  HealthEnvironment,
  HealthSyncResult,
  healthSuccess,
  healthError,
  HealthErrorCode,
  HealthIntegrationProvider,
  HealthProviderRegistry,
} from "./types";
import { SNS24Provider, FakeSNS24Provider, healthProviderRegistry, registerDefaultHealthProviders } from "./provider";
import { createAdminClient } from "../../supabase/admin";

/** In-memory storage for development (production uses database) */
interface HealthStorage {
  connections: Map<string, HealthConnectionConfig>;
  consents: Map<string, HealthConsent>;
  syncHistory: Map<string, any>;
}

function createStorage(): HealthStorage {
  return {
    connections: new Map(),
    consents: new Map(),
    syncHistory: new Map(),
  };
}

/**
 * Health Workflow Service
 * Orchestrates health data operations, consent management, and SNS24 integration.
 */
export class HealthWorkflowService {
  private storage: HealthStorage;
  private provider: HealthIntegrationProvider;

  constructor(provider?: HealthIntegrationProvider) {
    this.storage = createStorage();
    this.provider = provider ?? new (require("./provider").FakeSNS24Provider)();

    // Register default providers if not already registered
    if (healthProviderRegistry.getAll().length === 0) {
      registerDefaultHealthProviders();
    }
  }

  /**
   * Creates a health connection for a person
   */
  async createConnection(config: HealthConnectionConfig): Promise<{ success: boolean; connectionId?: string; error?: string }> {
    // Validate consent exists for required scopes
    const consent = await this.getValidConsent(config.personId, config.providerId, config.scopes);
    if (!consent) {
      return {
        success: false,
        error: "Missing or invalid consent for requested scopes",
      };
    }

    // Verify person belongs to organization (if org context)
    if (config.metadata && (config.metadata as any).organizationId) {
      const hasAccess = await this.verifyPersonOrganizationAccess(config.personId, (config.metadata as any).organizationId);
      if (!hasAccess) {
        return { success: false, error: "Person does not belong to specified organization" };
      }
    }

    const connectionId = `health_conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const connectionConfig = {
      ...config,
      connectionId,
      status: "DISCONNECTED" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store connection
    this.storage.connections.set(connectionId, connectionConfig);

    // Attempt to connect
    const result = await this.provider.connect(connectionConfig);

    // Update connection status
    const stored = this.storage.connections.get(connectionId);
    if (stored) {
      stored.status = result.success ? "CONNECTED" : "ERROR";
      stored.lastError = result.error;
      if (result.expiresAt) stored.expiresAt = result.expiresAt;
      this.storage.connections.set(connectionId, stored);
    }

    // Log audit event
    await this.logAuditEvent({
      action: "HEALTH_CONNECTION_CREATED",
      providerId: connectionConfig.providerId,
      personId: connectionConfig.personId,
      metadata: {
        connectionId,
        scopes: connectionConfig.scopes,
        environment: connectionConfig.environment,
        success: result.success,
      },
    });

    return result;
  }

  /**
   * Gets a health connection
   */
  async getConnection(connectionId: string): Promise<HealthConnectionConfig | null> {
    return this.storage.connections.get(connectionId) ?? null;
  }

  /**
   * Lists health connections for a person
   */
  async listConnections(personId: string, providerId?: string): Promise<HealthConnectionConfig[]> {
    const connections: HealthConnectionConfig[] = [];
    for (const conn of this.storage.connections.values()) {
      if (conn.personId === personId && (!providerId || conn.providerId === providerId)) {
        connections.push(conn);
      }
    }
    return connections.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Updates a health connection
   */
  async updateConnection(connectionId: string, updates: Partial<HealthConnectionConfig>): Promise<{ success: boolean; error?: string }> {
    const connection = this.storage.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: "Connection not found" };
    }

    const updated = { ...connection, ...updates, updatedAt: new Date().toISOString() };
    this.storage.connections.set(connectionId, updated);

    return { success: true };
  }

  /**
   * Deletes a health connection
   */
  async deleteConnection(connectionId: string): Promise<{ success: boolean; error?: string }> {
    const connection = this.storage.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: "Connection not found" };
    }

    // Disconnect from provider
    await this.provider.disconnect(connectionId);

    // Remove from storage
    this.storage.connections.delete(connectionId);

    await this.logAuditEvent({
      action: "HEALTH_CONNECTION_DELETED",
      providerId: connection.providerId,
      personId: connection.personId,
      metadata: { connectionId },
    });

    return { success: true };
  }

  /**
   * Grants consent for health data access
   */
  async grantConsent(consent: Omit<HealthConsent, "consentId" | "grantedAt" | "auditMetadata"> & { auditMetadata: HealthConsent["auditMetadata"] }): Promise<{ success: boolean; consentId?: string; error?: string }> {
    // Validate scopes
    if (!consent.scopes || consent.scopes.length === 0) {
      return { success: false, error: "At least one scope is required" };
    }

    const consentId = `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const fullConsent: HealthConsent = {
      consentId,
      ...consent,
      grantedAt: now,
      auditMetadata: {
        ...consent.auditMetadata,
        sessionId: consent.auditMetadata.sessionId || `sess_${Date.now()}`,
      },
    };

    this.storage.consents.set(consentId, fullConsent);

    await this.logAuditEvent({
      action: "HEALTH_CONSENT_GRANTED",
      providerId: consent.providerId,
      personId: consent.personId,
      metadata: {
        consentId,
        scopes: consent.scopes,
        expiresAt: consent.expiresAt,
        source: consent.source,
      },
    });

    return { success: true, consentId };
  }

  /**
   * Revokes consent
   */
  async revokeConsent(consentId: string, personId: string): Promise<{ success: boolean; error?: string }> {
    const consent = this.storage.consents.get(consentId);
    if (!consent) {
      return { success: false, error: "Consent not found" };
    }

    if (consent.personId !== personId) {
      return { success: false, error: "Unauthorized to revoke this consent" };
    }

    const now = new Date().toISOString();
    consent.revokedAt = now;

    await this.logAuditEvent({
      action: "HEALTH_CONSENT_REVOKED",
      providerId: consent.providerId,
      personId,
      metadata: { consentId, scopes: consent.scopes },
    });

    return { success: true };
  }

  /**
   * Gets valid consent for scopes
   */
  async getValidConsent(personId: string, providerId: string, scopes: HealthConsentScope[]): Promise<HealthConsent | null> {
    const now = new Date();
    for (const consent of this.storage.consents.values()) {
      if (
        consent.personId === personId &&
        consent.providerId === providerId &&
        !consent.revokedAt &&
        (!consent.expiresAt || new Date(consent.expiresAt) > now) &&
        scopes.every(scope => consent.scopes.includes(scope))
      ) {
        return consent;
      }
    }
    return null;
  }

  /**
   * Lists consents for a person
   */
  async listConsents(personId: string, providerId?: string): Promise<HealthConsent[]> {
    const consents: HealthConsent[] = [];
    for (const consent of this.storage.consents.values()) {
      if (consent.personId === personId && (!providerId || consent.providerId === providerId)) {
        consents.push(consent);
      }
    }
    return consents.sort((a, b) => new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime());
  }

  /**
   * Syncs health data for a person
   */
  async syncPersonData(personId: string, providerId: HealthProviderId = "SNS24"): Promise<{ success: boolean; syncId?: string; error?: string; details?: any }> {
    const connections = await this.listConnections(personId, providerId);
    const connected = connections.find(c => c.status === "CONNECTED" && c.providerId === providerId);

    if (!connected) {
      return { success: false, error: "No active connection found for provider" };
    }

    const syncId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startedAt = new Date().toISOString();

    try {
      const result = await this.provider.synchronize(connected.connectionId);

      if (!result.success) {
        return { success: false, error: result.error.message };
      }

      const syncRecord = {
        syncId,
        personId,
        providerId,
        startedAt: result.data.startedAt,
        completedAt: result.data.completedAt,
        status: result.data.status,
        syncedEntities: result.data.syncedEntities,
        errors: result.data.errors,
        lastSyncAt: result.data.lastSyncAt,
      };

      this.storage.syncHistory.set(syncId, syncRecord);

      await this.logAuditEvent({
        action: "HEALTH_SYNC_COMPLETED",
        providerId,
        personId,
        metadata: { syncId, status: result.data.status, entities: result.data.syncedEntities },
      });

      return { success: true, syncId, details: result.data };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Sync failed" };
    }
  }

  /**
   * Gets health profile
   */
  async getProfile(personId: string, providerId: HealthProviderId = "SNS24"): Promise<any> {
    const connections = await this.listConnections(personId, providerId);
    const connected = connections.find(c => c.status === "CONNECTED" && c.providerId === providerId);

    if (!connected) {
      return { success: false, error: "No active connection" };
    }

    return this.provider.getProfile(connected.connectionId);
  }

  /**
   * Gets prescriptions
   */
  async getPrescriptions(personId: string, providerId: HealthProviderId = "SNS24"): Promise<any> {
    const connections = await this.listConnections(personId, providerId);
    const connected = connections.find(c => c.status === "CONNECTED" && c.providerId === providerId);

    if (!connected) {
      return { success: false, error: "No active connection" };
    }

    return this.provider.getPrescriptions(connected.connectionId);
  }

  /**
   * Gets vaccinations
   */
  async getVaccinations(personId: string, providerId: HealthProviderId = "SNS24"): Promise<any> {
    const connections = await this.listConnections(personId, providerId);
    const connected = connections.find(c => c.status === "CONNECTED" && c.providerId === providerId);

    if (!connected) {
      return { success: false, error: "No active connection" };
    }

    return this.provider.getVaccinations(connected.connectionId);
  }

  /**
   * Gets appointments
   */
  async getAppointments(personId: string, providerId: HealthProviderId = "SNS24"): Promise<any> {
    const connections = await this.listConnections(personId, providerId);
    const connected = connections.find(c => c.status === "CONNECTED" && c.providerId === providerId);

    if (!connected) {
      return { success: false, error: "No active connection" };
    }

    return this.provider.getAppointments(connected.connectionId);
  }

  /**
   * Gets exams
   */
  async getExams(personId: string, providerId: HealthProviderId = "SNS24"): Promise<any> {
    const connections = await this.listConnections(personId, providerId);
    const connected = connections.find(c => c.status === "CONNECTED" && c.providerId === providerId);

    if (!connected) {
      return { success: false, error: "No active connection" };
    }

    return this.provider.getExams(connected.connectionId);
  }

  /**
   * Gets documents
   */
  async getDocuments(personId: string, providerId: HealthProviderId = "SNS24"): Promise<any> {
    const connections = await this.listConnections(personId, providerId);
    const connected = connections.find(c => c.status === "CONNECTED" && c.providerId === providerId);

    if (!connected) {
      return { success: false, error: "No active connection" };
    }

    return this.provider.getDocuments(connected.connectionId);
  }

  /**
   * Gets notifications
   */
  async getNotifications(personId: string, providerId: HealthProviderId = "SNS24"): Promise<any> {
    const connections = await this.listConnections(personId, providerId);
    const connected = connections.find(c => c.status === "CONNECTED" && c.providerId === providerId);

    if (!connected) {
      return { success: false, error: "No active connection" };
    }

    return this.provider.getNotifications(connected.connectionId);
  }

  /**
   * Verifies person belongs to organization
   */
  private async verifyPersonOrganizationAccess(personId: string, organizationId: string): Promise<boolean> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("org_memberships")
      .select("id")
      .eq("user_id", personId)
      .eq("organization_id", organizationId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    return !error && !!data;
  }

  /**
   * Logs audit event
   */
  private async logAuditEvent(event: {
    action: string;
    providerId: string;
    personId: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    try {
      const supabase = createAdminClient();
      const { error } = await supabase.from("health_audit_logs").insert({
        action: event.action,
        provider_id: event.providerId,
        person_id: event.personId,
        metadata: event.metadata,
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.error("[Health] Failed to log audit event:", error);
      }
    } catch (err) {
      console.error("[Health] Audit logging failed:", err);
    }
  }
}

/** Factory for creating health workflow service */
export function createHealthWorkflowService(provider?: any): HealthWorkflowService {
  return new HealthWorkflowService(provider);
}

/** Global instance for development */
export const healthWorkflowService = new HealthWorkflowService();