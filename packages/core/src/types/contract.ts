/**
 * RPG-OS — Contract Domain Foundation
 *
 * QUOTE → ACCEPTANCE → CONTRACT → SIGNATURE → EXECUTION
 * Versioned, auditable, with approval gates.
 * Never claiming legal qualification without verified mechanism.
 */

import type { UniversalActor } from "./actor";
import type { MarketplaceEventType } from "./marketplace";

/** Contract types */
export type ContractType =
  | "SERVICE_AGREEMENT"
  | "PRODUCT_SALE"
  | "RENTAL"
  | "EMPLOYMENT"
  | "PARTNERSHIP"
  | "NDA"
  | "LICENSE"
  | "SUBCONTRACTOR"
  | "MAINTENANCE"
  | "CONSULTING"
  | "CUSTOM";

/** Contract status */
export type ContractStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "PENDING_SIGNATURE"
  | "SIGNED"
  | "ACTIVE"
  | "SUSPENDED"
  | "TERMINATED"
  | "EXPIRED"
  | "DISPUTED"
  | "ARCHIVED";

/** Signature type */
export type SignatureType =
  | "SIMPLE"           // Click-to-accept, email confirmation
  | "ELECTRONIC"       // Electronic signature (eIDAS simple)
  | "ADVANCED"         // Advanced electronic signature (eIDAS)
  | "QUALIFIED"        // Qualified electronic signature (eIDAS)
  | "DIGITAL"          // Digital signature with certificate
  | "HANDWRITTEN"      // Physical/wet signature
  | "WITNESSED";       // Witnessed signature

/** Signature status */
export type SignatureStatus =
  | "PENDING"
  | "SENT"
  | "VIEWED"
  | "SIGNED"
  | "DECLINED"
  | "EXPIRED"
  | "REVOKED";

/** Party role in contract */
export type PartyRole =
  | "CLIENT"
  | "PROVIDER"
  | "BUYER"
  | "SELLER"
  | "EMPLOYER"
  | "EMPLOYEE"
  | "PARTNER"
  | "GUARANTOR"
  | "WITNESS"
  | "NOTARY";

/** Contract party */
export interface ContractParty {
  id: string;
  actorId: string;
  role: PartyRole;
  /** Legal name */
  legalName: string;
  /** Tax number */
  taxNumber?: string;
  /** Address */
  address?: ContractAddress;
  /** Contact */
  contact: ContractContact;
  /** Signing order (for sequential signing) */
  signingOrder: number;
  /** Whether this party has signed */
  signed: boolean;
  /** Signature details */
  signature?: ContractSignature;
  /** Custom fields */
  customFields?: Record<string, unknown>;
}

export interface ContractAddress {
  street: string;
  number?: string;
  complement?: string;
  postalCode: string;
  city: string;
  district?: string;
  country: string;
}

export interface ContractContact {
  email: string;
  phone?: string;
  mobile?: string;
}

/** Contract signature */
export interface ContractSignature {
  id: string;
  partyId: string;
  type: SignatureType;
  status: SignatureStatus;
  /** Signature image/data */
  signatureData?: string;
  /** Certificate info for qualified signatures */
  certificate?: SignatureCertificate;
  /** Timestamp */
  signedAt?: string;
  /** IP address */
  ip?: string;
  /** User agent */
  userAgent?: string;
  /** Device info */
  deviceInfo?: string;
  /** Geolocation */
  geolocation?: { lat: number; lng: number };
  /** Audit trail */
  auditTrail: SignatureAuditEntry[];
}

export interface SignatureCertificate {
  issuer: string;
  serialNumber: string;
  subject: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
}

export interface SignatureAuditEntry {
  timestamp: string;
  action: "CREATED" | "SENT" | "VIEWED" | "SIGNED" | "DECLINED" | "EXPIRED" | "REVOKED";
  ip?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

/** Contract milestone */
export interface ContractMilestone {
  id: string;
  title: string;
  description?: string;
  /** Due date */
  dueDate: string;
  /** Amount due at this milestone (cents) */
  amountCents: number;
  currency: string;
  /** Deliverables required */
  deliverables: ContractMilestoneDeliverable[];
  /** Acceptance criteria */
  acceptanceCriteria: string[];
  /** Status */
  status: "PENDING" | "IN_PROGRESS" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "PAID";
  /** Evidence submitted */
  evidence: ContractMilestoneEvidence[];
  /** Approval */
  approval?: ContractMilestoneApproval;
  /** Payment reference */
  paymentReference?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractMilestoneDeliverable {
  id: string;
  name: string;
  description?: string;
  type: "DOCUMENT" | "CODE" | "DESIGN" | "REPORT" | "PHYSICAL" | "OTHER";
  required: boolean;
  submittedAt?: string;
  evidenceId?: string;
}

export interface ContractMilestoneEvidence {
  id: string;
  deliverableId: string;
  type: "DOCUMENT" | "IMAGE" | "VIDEO" | "LINK" | "CODE" | "OTHER";
  url: string;
  description?: string;
  submittedBy: string;
  submittedAt: string;
  hash?: string;
}

export interface ContractMilestoneApproval {
  approvedBy: string;
  approvedAt: string;
  notes?: string;
  evidenceReviewed: string[];
}

/** Contract version */
export interface ContractVersion {
  id: string;
  contractId: string;
  version: number;
  /** Full contract content */
  content: ContractContent;
  /** Changes from previous version */
  changes: ContractChange[];
  /** Created by */
  createdBy: string;
  createdAt: string;
  /** Status of this version */
  status: "DRAFT" | "PROPOSED" | "ACCEPTED" | "REJECTED" | "SUPERSEDED";
  /** Hash for integrity */
  contentHash: string;
}

export interface ContractContent {
  /** Template used */
  templateId?: string;
  /** Title */
  title: string;
  /** Preamble/recitals */
  preamble?: string;
  /** Sections */
  sections: ContractSection[];
  /** Annexes */
  annexes: ContractAnnex[];
  /** Definitions */
  definitions: Record<string, string>;
  /** Governing law */
  governingLaw?: string;
  /** Jurisdiction */
  jurisdiction?: string;
  /** Language */
  language: string;
}

export interface ContractSection {
  id: string;
  number: string;
  title: string;
  content: string;
  /** Sub-sections */
  subsections?: ContractSection[];
  /** Whether this section is negotiable */
  negotiable: boolean;
}

export interface ContractAnnex {
  id: string;
  label: string;
  title: string;
  content: string;
  /** Referenced document */
  documentId?: string;
}

export interface ContractChange {
  type: "ADDED" | "REMOVED" | "MODIFIED" | "MOVED";
  sectionId?: string;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  description: string;
  proposedBy: string;
  proposedAt: string;
}

/** Main contract entity */
export interface Contract {
  id: string;
  /** Type */
  type: ContractType;
  /** Title */
  title: string;
  /** Description */
  description?: string;
  /** Parties */
  parties: ContractParty[];
  /** Current version */
  currentVersion: number;
  /** All versions */
  versions: ContractVersion[];
  /** Milestones */
  milestones: ContractMilestone[];
  /** Financial terms */
  financial: ContractFinancials;
  /** Status */
  status: ContractStatus;
  /** Dates */
  dates: ContractDates;
  /** Governing law & jurisdiction */
  governingLaw?: string;
  jurisdiction?: string;
  /** Language */
  language: string;
  /** Tags */
  tags: string[];
  /** Source marketplace order/request */
  sourceOrderId?: string;
  sourceRequestId?: string;
  /** Template used */
  templateId?: string;
  /** Custom fields */
  customFields: Record<string, unknown>;
  /** Settings */
  settings: ContractSettings;
  /** Audit trail */
  auditTrail: ContractAuditEntry[];
  createdAt: string;
  updatedAt: string;
  signedAt?: string;
  effectiveAt?: string;
  terminatedAt?: string;
}

export interface ContractFinancials {
  currency: string;
  /** Total contract value */
  totalValueCents: number;
  /** Payment schedule */
  paymentSchedule: ContractPaymentScheduleItem[];
  /** Deposit */
  deposit?: {
    amountCents: number;
    dueDate: string;
    paid: boolean;
    paidAt?: string;
  };
  /** Retention */
  retention?: {
    percentage: number;
    releasedAt?: string;
  };
  /** Penalties */
  penalties: ContractPenalty[];
  /** Invoicing */
  invoicing: InvoicingTerms;
}

export interface ContractPaymentScheduleItem {
  id: string;
  description: string;
  amountCents: number;
  dueDate: string;
  /** Trigger: milestone completion, date, event */
  trigger: "MILESTONE" | "DATE" | "EVENT";
  triggerReference?: string;
  status: "PENDING" | "DUE" | "PAID" | "OVERDUE" | "PARTIAL";
  paidAt?: string;
  paidAmountCents?: number;
}

export interface ContractPenalty {
  id: string;
  trigger: string;
  type: "FIXED" | "PERCENTAGE" | "DAILY";
  amountCents?: number;
  percentage?: number;
  dailyAmountCents?: number;
  maxAmountCents?: number;
  gracePeriodDays?: number;
}

export interface InvoicingTerms {
  /** Who issues invoices */
  issuer: "CLIENT" | "PROVIDER" | "AUTO";
  /** Invoice timing */
  timing: "MILESTONE" | "MONTHLY" | "QUARTERLY" | "ON_DEMAND";
  /** Payment terms */
  paymentTermsDays: number;
  /** VAT handling */
  vatHandling: "INCLUDED" | "EXCLUDED" | "REVERSE_CHARGE";
  /** Invoice template */
  templateId?: string;
}

export interface ContractDates {
  /** When contract was created */
  createdAt: string;
  /** When contract becomes effective */
  effectiveAt?: string;
  /** When contract expires */
  expiresAt?: string;
  /** When contract was signed by all parties */
  signedAt?: string;
  /** When contract was terminated */
  terminatedAt?: string;
  /** Auto-renewal */
  autoRenew: boolean;
  renewalNoticeDays?: number;
}

export interface ContractSettings {
  /** Allow amendments */
  allowAmendments: boolean;
  /** Require all parties to approve amendments */
  requireAllPartyApproval: boolean;
  /** Allow early termination */
  allowEarlyTermination: boolean;
  /** Termination notice days */
  terminationNoticeDays: number;
  /** Auto-archive after completion */
  autoArchive: boolean;
  archiveAfterDays?: number;
  /** Confidentiality level */
  confidentiality: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  /** Whether contract is template */
  isTemplate: boolean;
}

export interface ContractAuditEntry {
  id: string;
  timestamp: string;
  actorId: string;
  action: string;
  details: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
}

/** Contract template */
export interface ContractTemplate {
  id: string;
  name: string;
  description?: string;
  type: ContractType;
  category: string;
  /** Template content */
  content: ContractContent;
  /** Variables that can be filled */
  variables: TemplateVariable[];
  /** Required parties */
  requiredParties: PartyRole[];
  /** Default financial terms */
  defaultFinancials: Partial<ContractFinancials>;
  /** Default settings */
  defaultSettings: Partial<ContractSettings>;
  /** Created by */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Version */
  version: number;
  /** Published */
  published: boolean;
  /** Usage count */
  usageCount: number;
  /** Tags */
  tags: string[];
}

export interface TemplateVariable {
  id: string;
  key: string;
  label: string;
  type: "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "CURRENCY" | "SELECT" | "PARTY" | "BOOLEAN";
  description?: string;
  required: boolean;
  defaultValue?: unknown;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    options?: string[];
  };
}

/** Contract negotiation */
export interface ContractNegotiation {
  id: string;
  contractId: string;
  /** Version being negotiated */
  versionId: string;
  /** Proposed changes */
  proposedChanges: ProposedChange[];
  /** Status */
  status: "OPEN" | "IN_PROGRESS" | "AGREED" | "REJECTED" | "WITHDRAWN";
  /** Initiator */
  initiatorId: string;
  /** Participants */
  participants: NegotiationParticipant[];
  /** Messages */
  messages: NegotiationMessage[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface ProposedChange {
  id: string;
  sectionId: string;
  field: string;
  proposedValue: unknown;
  currentValue: unknown;
  rationale: string;
  proposedBy: string;
  status: "PROPOSED" | "ACCEPTED" | "REJECTED" | "COUNTERED";
}

export interface NegotiationParticipant {
  actorId: string;
  role: "INITIATOR" | "PARTICIPANT" | "MEDIATOR" | "OBSERVER";
  joinedAt: string;
}

export interface NegotiationMessage {
  id: string;
  authorId: string;
  content: string;
  type: "COMMENT" | "PROPOSAL" | "ACCEPTANCE" | "REJECTION" | "COUNTER_PROPOSAL";
  relatedChangeId?: string;
  createdAt: string;
}

/** Contract events */
export type ContractEventType =
  | "CONTRACT_CREATED"
  | "CONTRACT_VERSION_CREATED"
  | "CONTRACT_SENT_FOR_SIGNATURE"
  | "CONTRACT_SIGNED"
  | "CONTRACT_FULLY_SIGNED"
  | "CONTRACT_ACTIVATED"
  | "CONTRACT_MILESTONE_DUE"
  | "CONTRACT_MILESTONE_SUBMITTED"
  | "CONTRACT_MILESTONE_APPROVED"
  | "CONTRACT_MILESTONE_PAID"
  | "CONTRACT_AMENDMENT_PROPOSED"
  | "CONTRACT_AMENDMENT_ACCEPTED"
  | "CONTRACT_TERMINATED"
  | "CONTRACT_EXPIRED"
  | "CONTRACT_DISPUTED"
  | "CONTRACT_ARCHIVED";

export interface ContractEvent {
  id: string;
  type: ContractEventType;
  contractId: string;
  actorId: string;
  payload: Record<string, unknown>;
  timestamp: string;
  correlationId?: string;
}

/** Signature request */
export interface SignatureRequest {
  id: string;
  contractId: string;
  versionId: string;
  partyId: string;
  type: SignatureType;
  /** Signing URL */
  signingUrl?: string;
  /** Expires at */
  expiresAt: string;
  /** Reminders sent */
  remindersSent: number;
  /** Status */
  status: SignatureStatus;
  /** Sent at */
  sentAt?: string;
  /** Completed at */
  completedAt?: string;
  /** Metadata */
  metadata: Record<string, unknown>;
}

/** Contract workflow */
export interface ContractWorkflow {
  id: string;
  contractId: string;
  /** Steps */
  steps: WorkflowStep[];
  /** Current step */
  currentStep: number;
  /** Status */
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: "SIGNATURE" | "APPROVAL" | "PAYMENT" | "MILESTONE" | "NOTIFICATION" | "CUSTOM";
  /** Assigned party */
  assignedTo?: string;
  /** Status */
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "SKIPPED";
  /** Completed at */
  completedAt?: string;
  /** Result */
  result?: Record<string, unknown>;
  /** Error if failed */
  error?: string;
}