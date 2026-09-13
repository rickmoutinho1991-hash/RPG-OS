/**
 * RPG-OS — Audit Foundation
 *
 * Immutable audit trail for all critical actions.
 * Cross-domain, tamper-evident, privacy-aware.
 */

import { createHash } from "node:crypto";

/** SHA-256 hex de uma string (permite encadear o audit log). */
export function auditSha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Sanitização de metadata: nunca guardar segredos em audit/nomes de campos. */
const SECRET_KEYS =
  /password|passwd|secret|token|api[_-]?key|private[_-]?key|authorization|bearer|cvv|cvc|card[_-]?number|iban|pin|credential/i;

export function sanitizeAuditMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (SECRET_KEYS.test(key)) {
      output[key] = "[REDACTED]";
      continue;
    }
    if (typeof value === "string" && value.length > 8 && SECRET_KEYS.test(value)) {
      output[key] = "[REDACTED]";
      continue;
    }
    if (Array.isArray(value)) {
      output[key] = value.map((v) =>
        typeof v === "object" && v !== null
          ? sanitizeAuditMetadata(v as Record<string, unknown>)
          : v,
      );
      continue;
    }
    if (typeof value === "object" && value !== null) {
      output[key] = sanitizeAuditMetadata(value as Record<string, unknown>);
      continue;
    }
    output[key] = value;
  }
  return output;
}

/** Persistência do audit log. Em produção mapeia para a tabela audit_logs. */
export interface AuditLogRepository {
  persist(entries: AuditLogEntry[]): Promise<void>;
  query(query: AuditQuery): Promise<AuditLogEntry[]>;
}

/** Repositório em memória (testes). Não é a produção. */
export class InMemoryAuditLogRepository implements AuditLogRepository {
  private entries: AuditLogEntry[] = [];

  async persist(newEntries: AuditLogEntry[]): Promise<void> {
    this.entries.push(...newEntries);
  }

  async query(query: AuditQuery): Promise<AuditLogEntry[]> {
    let items = [...this.entries];
    if (query.actorId) items = items.filter((e) => e.actor.id === query.actorId);
    if (query.module) items = items.filter((e) => e.module === query.module);
    if (query.entityType) items = items.filter((e) => e.entityType === query.entityType);
    if (query.entityId) items = items.filter((e) => e.entityId === query.entityId);
    if (query.action) items = items.filter((e) => e.action === query.action);
    if (query.category) items = items.filter((e) => e.category === query.category);
    if (query.severity) items = items.filter((e) => e.severity === query.severity);
    if (query.result) items = items.filter((e) => e.result === query.result);
    if (query.correlationId) {
      items = items.filter((e) => e.correlationId === query.correlationId);
    }
    if (query.fromDate) {
      items = items.filter((e) => e.timestamp >= query.fromDate!);
    }
    if (query.toDate) {
      items = items.filter((e) => e.timestamp <= query.toDate!);
    }
    if (query.tags && query.tags.length > 0) {
      items = items.filter((e) => query.tags!.some((t) => e.tags.includes(t)));
    }
    items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (query.offset) items = items.slice(query.offset);
    if (query.limit) items = items.slice(0, query.limit);
    return items;
  }
}

/** Ações de auditoria canónicas do ecossistema (Marketplace Phase 2). */
export const AUDIT_ACTION = {
  ACTOR_CREATED: "ACTOR_CREATED",
  ROLE_ASSIGNED: "ROLE_ASSIGNED",
  PERMISSION_GRANTED: "PERMISSION_GRANTED",
  PERMISSION_REVOKED: "PERMISSION_REVOKED",
  MARKETPLACE_REQUEST_CREATED: "MARKETPLACE_REQUEST_CREATED",
  QUOTE_CREATED: "QUOTE_CREATED",
  QUOTE_ACCEPTED: "QUOTE_ACCEPTED",
  ORDER_CREATED: "ORDER_CREATED",
  CONTRACT_CREATED: "CONTRACT_CREATED",
  CONTRACT_VERSION_CREATED: "CONTRACT_VERSION_CREATED",
  SIGNATURE_CREATED: "SIGNATURE_CREATED",
  CONTRACT_ACTIVATED: "CONTRACT_ACTIVATED",
  PAYMENT_CREATED: "PAYMENT_CREATED",
  PAYMENT_CONFIRMED: "PAYMENT_CONFIRMED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  REFUND_CREATED: "REFUND_CREATED",
  MILESTONE_CREATED: "MILESTONE_CREATED",
  MILESTONE_SUBMITTED: "MILESTONE_SUBMITTED",
  MILESTONE_APPROVED: "MILESTONE_APPROVED",
  MILESTONE_REJECTED: "MILESTONE_REJECTED",
  EVIDENCE_UPLOADED: "EVIDENCE_UPLOADED",
  EVIDENCE_ACCESSED: "EVIDENCE_ACCESSED",
  DISPUTE_OPENED: "DISPUTE_OPENED",
  DISPUTE_RESOLVED: "DISPUTE_RESOLVED",
  AI_ACTION_PROPOSED: "AI_ACTION_PROPOSED",
  AI_ACTION_APPROVED: "AI_ACTION_APPROVED",
  AI_ACTION_EXECUTED: "AI_ACTION_EXECUTED",
  AI_ACTION_DENIED: "AI_ACTION_DENIED",
} as const;

export type AuditActionKey = keyof typeof AUDIT_ACTION;

/** Audit event severity */
export type AuditSeverity = "INFO" | "WARNING" | "CRITICAL" | "SECURITY";

/** Audit event category */
export type AuditCategory =
  | "AUTH"
  | "AUTHORIZATION"
  | "DATA_ACCESS"
  | "DATA_MODIFICATION"
  | "CONFIGURATION"
  | "FINANCIAL"
  | "FISCAL"
  | "CONTRACT"
  | "PAYMENT"
  | "MARKETPLACE"
  | "AI"
  | "SECURITY"
  | "COMPLIANCE"
  | "ADMIN"
  | "SYSTEM";

/** Audit log entry */
export interface AuditLogEntry {
  id: string;
  /** Timestamp */
  timestamp: string;
  /** Actor who performed the action */
  actor: AuditActor;
  /** Action performed */
  action: string;
  /** Module/domain */
  module: string;
  /** Entity type */
  entityType: string;
  /** Entity ID */
  entityId: string;
  /** Previous state (for modifications) */
  previousState?: Record<string, unknown>;
  /** New state (for modifications) */
  newState?: Record<string, unknown>;
  /** Severity */
  severity: AuditSeverity;
  /** Category */
  category: AuditCategory;
  /** Result */
  result: "SUCCESS" | "FAILURE" | "PARTIAL";
  /** Error message if failed */
  errorMessage?: string;
  /** Correlation ID for tracing related events */
  correlationId?: string;
  /** Causation ID (what triggered this) */
  causationId?: string;
  /** IP address */
  ip?: string;
  /** User agent */
  userAgent?: string;
  /** Device ID */
  deviceId?: string;
  /** Session ID */
  sessionId?: string;
  /** Request ID */
  requestId?: string;
  /** Metadata */
  metadata: Record<string, unknown>;
  /** Tags for filtering */
  tags: string[];
}

/** Actor info in audit log (minimal, no secrets) */
export interface AuditActor {
  id: string;
  type: "HUMAN" | "ORGANIZATION" | "AI_AGENT" | "SYSTEM" | "EXTERNAL_SERVICE";
  name: string;
  email?: string;
  roles: string[];
  organizationId?: string;
}

/** Audit query filters */
export interface AuditQuery {
  actorId?: string;
  actorType?: AuditActor["type"];
  module?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  category?: AuditCategory;
  severity?: AuditSeverity;
  result?: AuditLogEntry["result"];
  fromDate?: string;
  toDate?: string;
  correlationId?: string;
  causationId?: string;
  sessionId?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: "timestamp" | "severity";
  sortOrder?: "asc" | "desc";
}

/** Audit statistics */
export interface AuditStats {
  totalEvents: number;
  byCategory: Record<AuditCategory, number>;
  bySeverity: Record<AuditSeverity, number>;
  byResult: Record<AuditLogEntry["result"], number>;
  byModule: Record<string, number>;
  byActor: Record<string, number>;
  failedActions: number;
  securityEvents: number;
}

/** Audit retention policy */
export interface AuditRetentionPolicy {
  category: AuditCategory;
  retentionDays: number;
  archiveAfterDays?: number;
  deleteAfterDays?: number;
}

/** Audit configuration */
export interface AuditConfig {
  enabled: boolean;
  /** Minimum severity to log */
  minSeverity: AuditSeverity;
  /** Categories to log */
  categories: AuditCategory[];
  /** Modules to exclude */
  excludedModules: string[];
  /** Actions to exclude */
  excludedActions: string[];
  /** Whether to log data access (read) events */
  logDataAccess: boolean;
  /** Whether to log successful events */
  logSuccess: boolean;
  /** Whether to log failures */
  logFailures: boolean;
  /** Batch size for writes */
  batchSize: number;
  /** Flush interval in ms */
  flushIntervalMs: number;
  /** Retention policies */
  retentionPolicies: AuditRetentionPolicy[];
  /** Whether to compute hash chain for tamper evidence */
  computeHashChain: boolean;
}

/** Default audit configuration */
export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  enabled: true,
  minSeverity: "INFO",
  categories: [
    "AUTH",
    "AUTHORIZATION",
    "DATA_ACCESS",
    "DATA_MODIFICATION",
    "CONFIGURATION",
    "FINANCIAL",
    "FISCAL",
    "CONTRACT",
    "PAYMENT",
    "MARKETPLACE",
    "AI",
    "SECURITY",
    "COMPLIANCE",
    "ADMIN",
    "SYSTEM",
  ],
  excludedModules: [],
  excludedActions: ["health_check", "ping", "keep_alive"],
  logDataAccess: true,
  logSuccess: true,
  logFailures: true,
  batchSize: 100,
  flushIntervalMs: 5000,
  retentionPolicies: [
    { category: "AUTH", retentionDays: 2555 }, // 7 years
    { category: "AUTHORIZATION", retentionDays: 2555 },
    { category: "DATA_ACCESS", retentionDays: 1095 }, // 3 years
    { category: "DATA_MODIFICATION", retentionDays: 2555 },
    { category: "CONFIGURATION", retentionDays: 2555 },
    { category: "FINANCIAL", retentionDays: 3650 }, // 10 years
    { category: "FISCAL", retentionDays: 3650 },
    { category: "CONTRACT", retentionDays: 3650 },
    { category: "PAYMENT", retentionDays: 3650 },
    { category: "MARKETPLACE", retentionDays: 3650 },
    { category: "AI", retentionDays: 1095 },
    { category: "SECURITY", retentionDays: 2555 },
    { category: "COMPLIANCE", retentionDays: 3650 },
    { category: "ADMIN", retentionDays: 2555 },
    { category: "SYSTEM", retentionDays: 1095 },
  ],
  computeHashChain: true,
};

/** Audit service — main entry point for logging */
export class AuditService {
  private config: AuditConfig;
  private buffer: AuditLogEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private hashChain: string = "";
  private initialized = false;
  private repository: AuditLogRepository;
  private persisted: AuditLogEntry[] = [];

  constructor(
    config: Partial<AuditConfig> = {},
    repository: AuditLogRepository = new InMemoryAuditLogRepository(),
  ) {
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config };
    this.repository = repository;
  }

  /** Initialize the audit service */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load last hash from storage
    this.hashChain = await this.loadLastHash();

    // Start flush timer
    this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs);

    this.initialized = true;
  }

  /** Log an audit event */
  async log(entry: Omit<AuditLogEntry, "id" | "timestamp">): Promise<string> {
    if (!this.config.enabled) return "";

    // Check severity filter
    if (!this.shouldLog(entry.severity)) return "";

    // Check category filter
    if (!this.config.categories.includes(entry.category)) return "";

    // Check excluded modules/actions
    if (this.config.excludedModules.includes(entry.module)) return "";
    if (this.config.excludedActions.includes(entry.action)) return "";

    // Check data access logging
    if (entry.action === "view" || entry.action === "read") {
      if (!this.config.logDataAccess) return "";
    }

    // Check success/failure logging
    if (entry.result === "SUCCESS" && !this.config.logSuccess) return "";
    if (entry.result === "FAILURE" && !this.config.logFailures) return "";

    const sanitizedMetadata = sanitizeAuditMetadata(entry.metadata ?? {});

    const auditEntry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
      metadata: sanitizedMetadata,
    };

    // Add hash chain for tamper evidence
    if (this.config.computeHashChain) {
      const chainHash = this.computeHash(auditEntry);
      auditEntry.metadata = {
        ...auditEntry.metadata,
        hashChain: chainHash,
      };
      this.hashChain = chainHash;
    }

    // Add to buffer
    this.buffer.push(auditEntry);

    // Flush if buffer full
    if (this.buffer.length >= this.config.batchSize) {
      await this.flush();
    }

    return auditEntry.id;
  }

  /** Log authentication event */
  async logAuth(
    actor: AuditActor,
    action: "LOGIN" | "LOGOUT" | "LOGIN_FAILED" | "MFA_SUCCESS" | "MFA_FAILED" | "PASSWORD_RESET" | "SESSION_EXPIRED",
    result: AuditLogEntry["result"],
    details: {
      ip?: string;
      userAgent?: string;
      deviceId?: string;
      sessionId?: string;
      errorMessage?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    return this.log({
      actor,
      action,
      module: "auth",
      entityType: "session",
      entityId: details.sessionId || "unknown",
      category: "AUTH",
      severity: result === "FAILURE" ? "WARNING" : "INFO",
      result,
      errorMessage: details.errorMessage,
      ip: details.ip,
      userAgent: details.userAgent,
      deviceId: details.deviceId,
      sessionId: details.sessionId,
      metadata: details.metadata || {},
      tags: ["auth"],
    });
  }

  /** Log authorization event */
  async logAuthorization(
    actor: AuditActor,
    permission: string,
    resource: { type: string; id: string },
    result: AuditLogEntry["result"],
    details: {
      ip?: string;
      sessionId?: string;
      errorMessage?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    return this.log({
      actor,
      action: "authorization_check",
      module: "authorization",
      entityType: resource.type,
      entityId: resource.id,
      category: "AUTHORIZATION",
      severity: result === "FAILURE" ? "WARNING" : "INFO",
      result,
      errorMessage: details.errorMessage,
      ip: details.ip,
      sessionId: details.sessionId,
      metadata: {
        permission,
        ...details.metadata,
      },
      tags: ["authorization", permission],
    });
  }

  /** Log data access */
  async logDataAccess(
    actor: AuditActor,
    action: "view" | "read" | "export" | "download" | "list",
    resource: { type: string; id: string },
    result: AuditLogEntry["result"],
    details: {
      ip?: string;
      sessionId?: string;
      errorMessage?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    return this.log({
      actor,
      action,
      module: resource.type.split("_")[0] || "data",
      entityType: resource.type,
      entityId: resource.id,
      category: "DATA_ACCESS",
      severity: "INFO",
      result,
      errorMessage: details.errorMessage,
      ip: details.ip,
      sessionId: details.sessionId,
      metadata: details.metadata || {},
      tags: ["data_access", action],
    });
  }

  /** Log data modification */
  async logDataModification(
    actor: AuditActor,
    action: "create" | "edit" | "delete" | "restore",
    resource: { type: string; id: string },
    previousState: Record<string, unknown> | undefined,
    newState: Record<string, unknown> | undefined,
    result: AuditLogEntry["result"],
    details: {
      ip?: string;
      sessionId?: string;
      errorMessage?: string;
      correlationId?: string;
      causationId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    const severity = action === "delete" ? "WARNING" : "INFO";

    return this.log({
      actor,
      action,
      module: resource.type.split("_")[0] || "data",
      entityType: resource.type,
      entityId: resource.id,
      category: "DATA_MODIFICATION",
      severity,
      result,
      previousState,
      newState,
      errorMessage: details.errorMessage,
      ip: details.ip,
      sessionId: details.sessionId,
      correlationId: details.correlationId,
      causationId: details.causationId,
      metadata: details.metadata || {},
      tags: ["data_modification", action],
    });
  }

  /** Log financial event */
  async logFinancial(
    actor: AuditActor,
    action: string,
    resource: { type: string; id: string },
    amountCents: number,
    currency: string,
    result: AuditLogEntry["result"],
    details: {
      ip?: string;
      sessionId?: string;
      errorMessage?: string;
      correlationId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    return this.log({
      actor,
      action,
      module: "financial",
      entityType: resource.type,
      entityId: resource.id,
      category: "FINANCIAL",
      severity: "INFO",
      result,
      errorMessage: details.errorMessage,
      ip: details.ip,
      sessionId: details.sessionId,
      correlationId: details.correlationId,
      metadata: {
        amountCents,
        currency,
        ...details.metadata,
      },
      tags: ["financial", action],
    });
  }

  /** Log fiscal event */
  async logFiscal(
    actor: AuditActor,
    action: string,
    resource: { type: string; id: string },
    result: AuditLogEntry["result"],
    details: {
      ip?: string;
      sessionId?: string;
      errorMessage?: string;
      correlationId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    return this.log({
      actor,
      action,
      module: "fiscal",
      entityType: resource.type,
      entityId: resource.id,
      category: "FISCAL",
      severity: "INFO",
      result,
      errorMessage: details.errorMessage,
      ip: details.ip,
      sessionId: details.sessionId,
      correlationId: details.correlationId,
      metadata: details.metadata || {},
      tags: ["fiscal", action],
    });
  }

  /** Log contract event */
  async logContract(
    actor: AuditActor,
    action: string,
    contractId: string,
    result: AuditLogEntry["result"],
    details: {
      ip?: string;
      sessionId?: string;
      errorMessage?: string;
      correlationId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    return this.log({
      actor,
      action,
      module: "contracts",
      entityType: "contract",
      entityId: contractId,
      category: "CONTRACT",
      severity: "INFO",
      result,
      errorMessage: details.errorMessage,
      ip: details.ip,
      sessionId: details.sessionId,
      correlationId: details.correlationId,
      metadata: details.metadata || {},
      tags: ["contract", action],
    });
  }

  /** Log payment event */
  async logPayment(
    actor: AuditActor,
    action: string,
    paymentId: string,
    amountCents: number,
    currency: string,
    result: AuditLogEntry["result"],
    details: {
      ip?: string;
      sessionId?: string;
      errorMessage?: string;
      correlationId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    return this.log({
      actor,
      action,
      module: "payments",
      entityType: "payment",
      entityId: paymentId,
      category: "PAYMENT",
      severity: "INFO",
      result,
      errorMessage: details.errorMessage,
      ip: details.ip,
      sessionId: details.sessionId,
      correlationId: details.correlationId,
      metadata: {
        amountCents,
        currency,
        ...details.metadata,
      },
      tags: ["payment", action],
    });
  }

  /** Log AI event */
  async logAI(
    actor: AuditActor,
    agentId: string,
    action: string,
    toolId?: string,
    result: AuditLogEntry["result"] = "SUCCESS",
    details: {
      ip?: string;
      sessionId?: string;
      errorMessage?: string;
      correlationId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    return this.log({
      actor,
      action,
      module: "ai",
      entityType: "agent",
      entityId: agentId,
      category: "AI",
      severity: "INFO",
      result,
      errorMessage: details.errorMessage,
      ip: details.ip,
      sessionId: details.sessionId,
      correlationId: details.correlationId,
      metadata: {
        toolId,
        ...details.metadata,
      },
      tags: ["ai", action, toolId || "unknown"],
    });
  }

  /** Log security event */
  async logSecurity(
    actor: AuditActor,
    action: string,
    result: AuditLogEntry["result"],
    details: {
      ip?: string;
      userAgent?: string;
      deviceId?: string;
      sessionId?: string;
      errorMessage?: string;
      correlationId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    return this.log({
      actor,
      action,
      module: "security",
      entityType: "security_event",
      entityId: crypto.randomUUID(),
      category: "SECURITY",
      severity: "SECURITY",
      result,
      errorMessage: details.errorMessage,
      ip: details.ip,
      userAgent: details.userAgent,
      deviceId: details.deviceId,
      sessionId: details.sessionId,
      correlationId: details.correlationId,
      metadata: details.metadata || {},
      tags: ["security", action],
    });
  }

  /** Query audit logs */
  async query(query: AuditQuery): Promise<AuditLogEntry[]> {
    return this.repository.query(query);
  }

  /** Get audit statistics */
  async getStats(fromDate?: string, toDate?: string): Promise<AuditStats> {
    // TODO: Implement with actual data source
    return {
      totalEvents: 0,
      byCategory: {} as Record<AuditCategory, number>,
      bySeverity: {} as Record<AuditSeverity, number>,
      byResult: {} as Record<AuditLogEntry["result"], number>,
      byModule: {},
      byActor: {},
      failedActions: 0,
      securityEvents: 0,
    };
  }

  /** Verify hash chain integrity */
  async verifyIntegrity(fromDate?: string, toDate?: string): Promise<{
    valid: boolean;
    brokenAt?: string;
    entriesChecked: number;
  }> {
    let entries = this.persisted;
    if (fromDate) entries = entries.filter((e) => e.timestamp >= fromDate);
    if (toDate) entries = entries.filter((e) => e.timestamp <= toDate);

    let previous = "";
    for (const entry of entries) {
      const expected = auditSha256Hex(
        JSON.stringify({
          id: entry.id,
          timestamp: entry.timestamp,
          actorId: entry.actor.id,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          previousHash: previous,
        }),
      );
      const stored = (entry.metadata ?? {}).hashChain;
      if (stored !== expected) {
        return { valid: false, brokenAt: entry.id, entriesChecked: entries.length };
      }
      previous = expected;
    }

    return { valid: true, entriesChecked: entries.length };
  }

  /** Export audit logs for compliance (GDPR Art. 20) */
  async export(query: AuditQuery): Promise<AuditLogEntry[]> {
    return this.query(query);
  }

  /** Flush buffer to storage */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    // Persist to the repository (in production: audit_logs table)
    await this.repository.persist(entries);
    this.persisted.push(...entries);

    // Save last hash (chain already advanced at log time)
    await this.saveLastHash(this.hashChain);
  }

  /** Shutdown gracefully */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  private shouldLog(severity: AuditSeverity): boolean {
    const levels: Record<AuditSeverity, number> = {
      INFO: 0,
      WARNING: 1,
      CRITICAL: 2,
      SECURITY: 3,
    };
    return levels[severity] >= levels[this.config.minSeverity];
  }

  private computeHash(entry: AuditLogEntry): string {
    return auditSha256Hex(
      JSON.stringify({
        id: entry.id,
        timestamp: entry.timestamp,
        actorId: entry.actor.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        previousHash: this.hashChain,
      }),
    );
  }

  /** Expõe as entradas persistidas (útil para testes/verificação). */
  getPersistedEntries(): AuditLogEntry[] {
    return [...this.persisted];
  }

  private async loadLastHash(): Promise<string> {
    // TODO: Load from storage
    return "";
  }

  private async saveLastHash(hash: string): Promise<void> {
    // TODO: Save to storage
  }
}

/** Default audit service instance */
export const auditService = new AuditService();

/** Audit decorator for automatic logging */
export function audit(
  options: {
    action: string;
    module: string;
    entityType: string;
    getEntityId: (args: unknown[]) => string;
    category?: AuditCategory;
    severity?: AuditSeverity;
    getPreviousState?: (args: unknown[]) => Record<string, unknown> | undefined;
    getNewState?: (args: unknown[], result: unknown) => Record<string, unknown> | undefined;
  }
) {
  return function (target: object, propertyKey: string, descriptor: TypedPropertyDescriptor<any>) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const actor = (this as any).actor || (args[0] as any)?.actor;
      const entityId = options.getEntityId(args);
      let previousState: Record<string, unknown> | undefined;
      let result: any;
      let error: Error | undefined;

      if (options.getPreviousState) {
        previousState = options.getPreviousState(args);
      }

      try {
        result = await originalMethod.apply(this, args);
        return result;
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
        throw err;
      } finally {
        const newState = options.getNewState ? options.getNewState(args, result) : undefined;

        await auditService.logDataModification(
          actor || { id: "unknown", type: "SYSTEM", name: "System", roles: [] },
          propertyKey as any,
          { type: options.entityType, id: entityId },
          previousState,
          newState,
          error ? "FAILURE" : "SUCCESS",
          {
            errorMessage: error?.message,
            metadata: { method: propertyKey },
          }
        );
      }
    };

    return descriptor;
  };
}