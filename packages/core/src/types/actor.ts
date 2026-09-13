/**
 * RPG-OS — Universal Actor & Identity Foundation
 *
 * Foundation for: HUMAN, ORGANIZATION, AI_AGENT, SYSTEM, EXTERNAL_SERVICE
 * Identity ≠ Role ≠ Permission ≠ Capability ≠ Tenant
 */

export type ActorType =
  | "HUMAN"
  | "ORGANIZATION"
  | "AI_AGENT"
  | "SYSTEM"
  | "EXTERNAL_SERVICE";

export type ActorStatus =
  | "ACTIVE"
  | "INVITED"
  | "SUSPENDED"
  | "REMOVED"
  | "PENDING_VERIFICATION";

/** Universal Actor — any entity that can act in the system */
export interface UniversalActor {
  id: string;
  type: ActorType;
  status: ActorStatus;
  /** Display name / legal name */
  name: string;
  /** Unique handle/slug for organizations and AI agents */
  slug?: string;
  /** Primary contact email */
  email?: string;
  /** Tax number (NIF/NIPC) — only for fiscal actors */
  taxNumber?: string;
  /** Verification status for fiscal/legal actors */
  verificationStatus?: "UNVERIFIED" | "VERIFIED" | "PENDING" | "REJECTED";
  /** Metadata for extensibility */
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  /** Soft delete */
  deletedAt?: string;
}

/** Human actor — extends UniversalActor with person-specific fields */
export interface HumanActor extends UniversalActor {
  type: "HUMAN";
  /** Given name */
  firstName: string;
  /** Family name */
  lastName: string;
  /** Phone number */
  phone?: string;
  /** Date of birth */
  birthDate?: string;
  /** Nationality */
  nationality?: string;
  /** Address reference */
  addressId?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Preferred language */
  locale?: string;
  /** Timezone */
  timezone?: string;
}

/** Organization actor — company, non-profit, public entity, etc. */
export interface OrganizationActor extends UniversalActor {
  type: "ORGANIZATION";
  /** Legal form */
  legalForm?: string;
  /** Registration number (conservatória) */
  registrationNumber?: string;
  /** Commercial name (if different from legal) */
  tradeName?: string;
  /** Parent organization (for groups/holdings) */
  parentOrganizationId?: string;
  /** Plan tier */
  planTier?: string;
  /** Settings JSON */
  settings: Record<string, unknown>;
}

/** AI Agent actor — controlled, auditable, capability-bound */
export interface AIActor extends UniversalActor {
  type: "AI_AGENT";
  /** Owner (human or organization) */
  ownerId: string;
  /** Purpose/skill set */
  purpose: string;
  /** Capabilities granted to this agent */
  capabilities: string[];
  /** Data scopes this agent can access */
  dataScopes: string[];
  /** Tools this agent can invoke */
  tools: string[];
  /** Risk level */
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  /** Approval policy for actions */
  approvalPolicy: AIApprovalPolicy;
  /** Audit policy */
  auditPolicy: AIAuditPolicy;
  /** Model/provider info */
  modelInfo?: {
    provider: string;
    model: string;
    version: string;
  };
}

/** System actor — internal processes, cron jobs, webhooks */
export interface SystemActor extends UniversalActor {
  type: "SYSTEM";
  /** Component/service name */
  component: string;
  /** Permissions granted */
  permissions: string[];
}

/** External service actor — third-party integrations */
export interface ExternalServiceActor extends UniversalActor {
  type: "EXTERNAL_SERVICE";
  /** Service identifier */
  serviceId: string;
  /** Provider name */
  provider: string;
  /** Scopes granted */
  scopes: string[];
  /** Environment */
  environment: "development" | "staging" | "production";
}

/** AI Approval Policy — gates for critical actions */
export interface AIApprovalPolicy {
  /** Actions requiring explicit human approval */
  requireApproval: string[];
  /** Actions requiring admin approval */
  requireAdminApproval: string[];
  /** Maximum amount for financial actions without approval (cents) */
  maxAutoAmountCents?: number;
  /** Whether agent can delegate to other agents */
  canDelegate: boolean;
  /** Custom rules (JSONLogic or similar) */
  customRules?: Record<string, unknown>;
}

/** AI Audit Policy — what gets logged */
export interface AIAuditPolicy {
  /** Log all tool invocations */
  logToolCalls: boolean;
  /** Log all data access */
  logDataAccess: boolean;
  /** Log all decisions */
  logDecisions: boolean;
  /** Retention period in days */
  retentionDays: number;
  /** Send alerts for high-risk actions */
  alertOnHighRisk: boolean;
}

/** Actor Context — resolved context for a session */
export interface ActorContext {
  /** The actor itself */
  actor: UniversalActor;
  /** Active roles in current context */
  roles: ActorRole[];
  /** Effective permissions */
  permissions: string[];
  /** Capabilities available */
  capabilities: string[];
  /** Data scopes accessible */
  dataScopes: string[];
  /** Current tenant context */
  tenant?: ActorTenantContext;
  /** Session metadata */
  session: ActorSessionContext;
}

/** Actor Role — role assignment in a context */
export interface ActorRole {
  id: string;
  actorId: string;
  /** Context type */
  contextType: "PLATFORM" | "ORGANIZATION" | "PROJECT" | "TEAM" | "MARKETPLACE";
  /** Context ID */
  contextId: string;
  /** Role key */
  roleKey: string;
  /** Custom role ID if applicable */
  customRoleId?: string;
  /** Status */
  status: "ACTIVE" | "INVITED" | "SUSPENDED" | "REMOVED";
  /** Validity period */
  validFrom?: string;
  validUntil?: string;
  /** Permissions override */
  permissionsOverride?: string[];
  /** Department/team */
  departmentId?: string;
  teamId?: string;
}

/** Tenant context for multi-tenancy */
export interface ActorTenantContext {
  /** Tenant type */
  type: "PERSONAL" | "ORGANIZATION" | "PLATFORM";
  /** Tenant ID */
  id: string;
  /** Tenant name */
  name: string;
  /** Tax number if applicable */
  taxNumber?: string;
  /** Whether this is the primary tenant */
  isPrimary: boolean;
}

/** Session context */
export interface ActorSessionContext {
  sessionId: string;
  ip?: string;
  userAgent?: string;
  deviceId?: string;
  createdAt: string;
  lastActivityAt: string;
  /** MFA verified */
  mfaVerified: boolean;
  /** Auth method used */
  authMethod: "password" | "magic_link" | "cmd" | "cartao_cidadao" | "sso" | "api_key";
}

/** Identity verification levels */
export type VerificationLevel =
  | "NONE"
  | "EMAIL"
  | "PHONE"
  | "DOCUMENT"
  | "CMD"
  | "CARTAO_CIDADAO"
  | "AUTENTICACAO_GOV"
  | "MANUAL_REVIEW";

/** Identity claim */
export interface IdentityClaim {
  type: "email" | "phone" | "nif" | "address" | "document" | "biometric";
  value: string;
  verified: boolean;
  verifiedAt?: string;
  verificationMethod?: VerificationLevel;
  expiresAt?: string;
}

/** Actor capability — what an actor CAN do (distinct from permission) */
export interface ActorCapability {
  id: string;
  actorId: string;
  /** Capability key */
  key: string;
  /** Human-readable label */
  label: string;
  /** Description */
  description?: string;
  /** Category */
  category: string;
  /** Risk level */
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  /** Whether this capability requires approval */
  requiresApproval: boolean;
  /** Approval policy override */
  approvalPolicy?: AIApprovalPolicy;
  /** Granted by */
  grantedBy: string;
  /** Granted at */
  grantedAt: string;
  /** Expires at */
  expiresAt?: string;
  /** Status */
  status: "ACTIVE" | "SUSPENDED" | "REVOKED" | "EXPIRED";
}

/** Type guards */
export function isHumanActor(actor: UniversalActor): actor is HumanActor {
  return actor.type === "HUMAN";
}

export function isOrganizationActor(actor: UniversalActor): actor is OrganizationActor {
  return actor.type === "ORGANIZATION";
}

export function isAIActor(actor: UniversalActor): actor is AIActor {
  return actor.type === "AI_AGENT";
}

export function isSystemActor(actor: UniversalActor): actor is SystemActor {
  return actor.type === "SYSTEM";
}

export function isExternalServiceActor(actor: UniversalActor): actor is ExternalServiceActor {
  return actor.type === "EXTERNAL_SERVICE";
}