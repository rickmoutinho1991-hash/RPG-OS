/**
 * RPG-OS "A Minha Vida" Cross-Domain Types
 * 
 * Types for the cross-domain layer that aggregates capabilities from
 * existing domains (Finance, Health, Mobility, Fiscal, Government, Documents).
 * 
 * Key principle: LifeItem references sources via sourceEntityId + sourceDomain,
 * never duplicating sensitive entity data. Statuses respect original domain
 * capabilities (PREPARED_ONLY, MANUAL, LIVE, UNAVAILABLE).
 */

// Life domain identifiers
export type LifeDomain = 
  | "finance" 
  | "mobility" 
  | "health" 
  | "fiscal" 
  | "documents" 
  | "government" 
  | "social_security";

// Life item type identifiers
export type LifeItemType = 
  | "pending_toll_debt"
  | "invoice_due"
  | "toll_debt_detected"
  | "appointment_available"
  | "prescription_expires"
  | "document_received"
  | "tax_deadline"
  | "consent_revoked"
  | "custom";

// Life item status reflecting real capability status
export type LifeItemStatus = 
  | "LIVE"
  | "PREPARED_ONLY"
  | "MANUAL" 
  | "UNAVAILABLE";

// Life item action supported per capability
export type LifeAction = 
  | "view"
  | "consult"
  | "connect_learn"
  | "consult_manually"
  | "pay"
  | "validate"
  | "download"
  | "none";

// Life event type for timeline
export type LifeEventType = 
  | "invoice_received"
  | "toll_debt_detected"
  | "appointment_scheduled"
  | "prescription_expires"
  | "document_uploaded"
  | "tax_filing_due"
  | "consent_revoked"
  | "custom";

// Life priority computed from deterministic rules
export type LifePriority = 
  | "high"
  | "medium" 
  | "low"
  | "info";

// Life consent confidence level
export type LifeCapabilityConfidence = 
  | "verified"
  | "prepared_only" 
  | "manual"
  | "unavailable";

// Life privacy level
export type LifePrivacyLevel = 
  | "public"
  | "personal" 
  | "sensitive";

// Life item — cross-domain abstraction
// References source via sourceEntityId + sourceDomain, never copies entity data
export interface LifeItem {
  id: string;
  domain: LifeDomain;
  type: LifeItemType;
  title: string;
  description?: string;
  priority: LifePriority;
  status: LifeItemStatus;
  source: "OFFICIAL" | "MANUAL" | "SYSTEM";
  sourceEntityId: string; // ID in the source domain
  sourceDomain: LifeDomain; // which domain owns this entity
  timestamp: string;
  dueDate?: string;
  capability: string; // which capability reveals this (e.g. "mobility.read.debts")
  capabilityConfidence: LifeCapabilityConfidence;
  action: LifeAction;
  privacyLevel: LifePrivacyLevel;
}

// Life event — cross-domain timeline entry
export interface LifeEvent {
  id: string;
  domain: LifeDomain;
  type: LifeEventType;
  title: string;
  domainTitle: string;
  sourceEntityId: string;
  timestamp: string;
  status: "upcoming" | "today" | "past" | "overdue";
  relatedLifeItemId?: string;
}

// Life priority computation result (deterministic, no AI)
export interface LifePriorityResult {
  priority: LifePriority;
  factors: {
    urgency: "high" | "medium" | "low" | "none";
    dueDateWithin: "48h" | "7d" | "30d" | "none";
    impact: "high" | "low";
    actionability: "high" | "low";
    sourceConfidence: LifeCapabilityConfidence;
  };
}

// Source model — minimal reference, no data duplication
export interface LifeSourceRef {
  sourceEntityId: string;
  sourceDomain: LifeDomain;
  capability: string;
  capabilityConfidence: LifeCapabilityConfidence;
  lastVerified?: string;
}

// Privacy model — control what's surface-level vs drill-in
export interface LifePrivacyContext {
  level: LifePrivacyLevel;
  disclosedFields: string[]; // what's safe to show at surface level
  requiresDrillIn: boolean; // whether user needs to drill into source domain
  auditTrailRequired: boolean;
}

// Consent model — consent follows the data
export interface LifeConsentRef {
  consentId: string;
  domain: LifeDomain;
  scopes: string[];
  grantedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  source: "PERSON" | "ADMIN" | "SYSTEM";
}

// Security model — domain boundary enforcement
export interface LifeSecurityContext {
  domainBoundaries: LifeDomain[];
  authorizationRequired: boolean;
  consentEnforced: boolean;
  providerSafety: "PREPARED_ONLY" | "LIVE" | "MANUAL" | "UNAVAILABLE";
  canActivateProvider: boolean;
}

// Example LifeItem — conceptual, adapted to project types
/**
 * Example: Pending toll debt from CTT (PREPARED_ONLY status)
 * 
 * {
 *   id: "life-item-001",
 *   domain: "mobility",
 *   type: "pending_toll_debt",
 *   title: "Dívida de portagem CTT em aberto",
 *   priority: "high",
 *   status: "PREPARED_ONLY",
 *   source: "MANUAL",
 *   sourceEntityId: "debt-ctt-001",
 *   sourceDomain: "mobility",
 *   timestamp: "2026-09-04T10:00:00Z",
 *   dueDate: "2026-10-01",
 *   capability: "mobility.read.debts",
 *   capabilityConfidence: "prepared_only",
 *   action: "consult_manually",
 *   privacyLevel: "personal"
 * }
 * 
 * Note: status is PREPARED_ONLY — never faked as LIVE.
 * action is consult_manually — respecting the real capability.
 * capabilityConfidence is prepared_only — telling the user the limitation.
 */

/**
 * Example: Due invoice from Finance (LIVE status)
 * 
 * {
 *   id: "life-item-002",
 *   domain: "finance",
 *   type: "invoice_due",
 *   title: "Fatura da elétrica vence em 3 dias",
 *   priority: "high",
 *   status: "LIVE",
 *   source: "OFFICIAL",
 *   sourceEntityId: "invoice-ef-012",
 *   sourceDomain: "finance",
 *   timestamp: "2026-09-02T09:00:00Z",
 *   dueDate: "2026-09-07",
 *   capability: "finance.read.invoices",
 *   capabilityConfidence: "verified",
 *   action: "pay",
 *   privacyLevel: "personal"
 * }
 * 
 * Note: status is LIVE — real integration available.
 * action is pay — supported by LIVE finance integration.
 * capabilityConfidence is verified — full trust on this capability.
 */