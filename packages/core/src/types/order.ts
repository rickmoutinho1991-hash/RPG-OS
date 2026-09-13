/**
 * RPG-OS — Order & Milestone Foundation
 *
 * ORDER → MILESTONE → EVIDENCE → REVIEW → APPROVAL → PAYMENT
 * Supports: service orders, product orders, project orders, rental orders
 */

import type { UniversalActor } from "./actor";
import type { PaymentStatus } from "./payment";
import type { EvidenceType, EvidenceStatus } from "./evidence";

/** Order types */
export type OrderType =
  | "SERVICE"
  | "PRODUCT"
  | "PROJECT"
  | "RENTAL"
  | "SUBSCRIPTION"
  | "MARKETPLACE";

/** Order status */
export type OrderStatus =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "PAYMENT_PROCESSING"
  | "PAID"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "MILESTONE_DUE"
  | "MILESTONE_SUBMITTED"
  | "MILESTONE_UNDER_REVIEW"
  | "MILESTONE_APPROVED"
  | "MILESTONE_REJECTED"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "DISPUTED"
  | "ON_HOLD";

/** Milestone status */
export type MilestoneStatus =
  | "PENDING"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "REVISION_REQUESTED"
  | "PAID"
  | "SKIPPED"
  | "CANCELLED";

/** Milestone trigger type */
export type MilestoneTrigger =
  | "DATE"
  | "PREVIOUS_MILESTONE"
  | "MANUAL"
  | "EVENT"
  | "CLIENT_APPROVAL"
  | "PROVIDER_SUBMISSION";

/** Order */
export interface Order {
  id: string;
  /** Type */
  type: OrderType;
  /** Order number (human-readable) */
  orderNumber: string;
  /** Title */
  title: string;
  /** Description */
  description?: string;
  /** Parties */
  clientId: string;
  providerId?: string;
  /** Source */
  sourceType: "MARKETPLACE" | "DIRECT" | "CONTRACT" | "MANUAL";
  sourceId?: string;
  /** Financial */
  financial: OrderFinancials;
  /** Timeline */
  timeline: OrderTimeline;
  /** Milestones */
  milestones: OrderMilestone[];
  /** Current milestone index */
  currentMilestoneIndex: number;
  /** Status */
  status: OrderStatus;
  /** Items */
  items: OrderItem[];
  /** Settings */
  settings: OrderSettings;
  /** Tags */
  tags: string[];
  /** Custom fields */
  customFields: Record<string, unknown>;
  /** Audit trail */
  auditTrail: OrderAuditEntry[];
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface OrderFinancials {
  currency: string;
  /** Subtotal */
  subtotalCents: number;
  /** Tax */
  taxCents: number;
  /** Discount */
  discountCents: number;
  /** Total */
  totalCents: number;
  /** Amount paid */
  paidCents: number;
  /** Amount due */
  dueCents: number;
  /** Payment schedule */
  paymentSchedule: PaymentScheduleItem[];
  /** Payment status */
  paymentStatus: PaymentStatus;
  /** Platform fee */
  platformFeeCents: number;
  /** Provider payout */
  providerPayoutCents: number;
  /** Invoices */
  invoiceIds: string[];
}

export interface PaymentScheduleItem {
  id: string;
  description: string;
  amountCents: number;
  dueDate: string;
  trigger: MilestoneTrigger;
  triggerReference?: string;
  status: "PENDING" | "DUE" | "PAID" | "OVERDUE" | "PARTIAL";
  paidAt?: string;
  paidAmountCents?: number;
  paymentId?: string;
}

export interface OrderTimeline {
  /** Estimated start */
  estimatedStartDate?: string;
  /** Estimated end */
  estimatedEndDate?: string;
  /** Actual start */
  actualStartDate?: string;
  /** Actual end */
  actualEndDate?: string;
  /** Timezone */
  timezone: string;
  /** Buffer days */
  bufferDays: number;
}

export interface OrderItem {
  id: string;
  /** Type */
  type: "SERVICE" | "PRODUCT" | "MATERIAL" | "LABOR" | "EQUIPMENT" | "FEE" | "DISCOUNT" | "TAX";
  /** Description */
  description: string;
  /** Quantity */
  quantity: number;
  /** Unit */
  unit: string;
  /** Unit price (cents) */
  unitPriceCents: number;
  /** Tax rate */
  taxRate: number;
  /** Discount */
  discountCents: number;
  /** Total (cents) */
  totalCents: number;
  /** Linked milestone */
  milestoneId?: string;
  /** Metadata */
  metadata: Record<string, unknown>;
}

export interface OrderSettings {
  /** Auto-advance milestones on approval */
  autoAdvanceMilestones: boolean;
  /** Require client approval for milestones */
  requireClientApproval: boolean;
  /** Allow milestone revisions */
  allowRevisions: boolean;
  /** Max revision rounds */
  maxRevisions: number;
  /** Auto-release payment on approval */
  autoReleasePayment: boolean;
  /** Grace period for approvals (days) */
  approvalGracePeriodDays: number;
  /** Allow client to cancel */
  allowClientCancellation: boolean;
  /** Cancellation policy */
  cancellationPolicy: CancellationPolicy;
  /** Warranty */
  warranty?: WarrantyTerms;
  /** Support/SLA */
  sla?: SLATerms;
}

export interface CancellationPolicy {
  /** Allow cancellation */
  allowed: boolean;
  /** Notice period (days) */
  noticePeriodDays: number;
  /** Refund policy */
  refundPolicy: "FULL" | "PARTIAL" | "NONE" | "CUSTOM";
  /** Custom refund rules */
  customRules?: string;
  /** Cancellation fee */
  feeCents?: number;
  feePercentage?: number;
}

export interface WarrantyTerms {
  durationMonths: number;
  /** What's covered */
  coverage: string[];
  /** What's not covered */
  exclusions: string[];
  /** Claim process */
  claimProcess: string;
}

export interface SLATerms {
  /** Response time (hours) */
  responseTimeHours: number;
  /** Resolution time (hours) */
  resolutionTimeHours: number;
  /** Availability */
  availability: number; // percentage
  /** Penalties for breach */
  penalties: SLAPenalty[];
}

export interface SLAPenalty {
  trigger: string;
  type: "FIXED" | "PERCENTAGE";
  amountCents?: number;
  percentage?: number;
}

export interface OrderAuditEntry {
  id: string;
  timestamp: string;
  actorId: string;
  action: string;
  details: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
}

/** Order Milestone */
export interface OrderMilestone {
  id: string;
  orderId: string;
  /** Sequence number */
  sequence: number;
  /** Title */
  title: string;
  /** Description */
  description?: string;
  /** Type */
  type: "DELIVERABLE" | "PAYMENT" | "APPROVAL" | "REVIEW" | "MEETING" | "INSPECTION" | "OTHER";
  /** Trigger */
  trigger: MilestoneTrigger;
  /** Trigger reference (date, milestone ID, event name) */
  triggerReference?: string;
  /** Due date */
  dueDate?: string;
  /** Scheduled date */
  scheduledDate?: string;
  /** Started at */
  startedAt?: string;
  /** Submitted at */
  submittedAt?: string;
  /** Approved at */
  approvedAt?: string;
  /** Status */
  status: MilestoneStatus;
  /** Amount due at this milestone (cents) */
  amountCents: number;
  currency: string;
  /** Payment status */
  paymentStatus: PaymentStatus;
  /** Payment reference */
  paymentReference?: string;
  /** Deliverables required */
  deliverables: MilestoneDeliverable[];
  /** Acceptance criteria */
  acceptanceCriteria: string[];
  /** Evidence submitted */
  evidence: MilestoneEvidence[];
  /** Reviews */
  reviews: MilestoneReview[];
  /** Approval */
  approval?: MilestoneApproval;
  /** Assigned to */
  assignedTo?: string;
  /** Responsible party */
  responsibleParty: "CLIENT" | "PROVIDER" | "BOTH" | "SYSTEM";
  /** Dependencies */
  dependsOn: string[]; // milestone IDs
  /** Blocking reason */
  blockingReason?: string;
  /** Notes */
  notes?: string;
  /** Custom fields */
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneDeliverable {
  id: string;
  milestoneId: string;
  name: string;
  description?: string;
  type: "DOCUMENT" | "CODE" | "DESIGN" | "REPORT" | "PHYSICAL" | "MEETING" | "INSPECTION" | "OTHER";
  required: boolean;
  /** Expected format */
  expectedFormat?: string;
  /** Size limit (bytes) */
  sizeLimitBytes?: number;
  /** Submitted evidence */
  evidenceId?: string;
  submittedAt?: string;
  status: "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED";
}

export interface MilestoneEvidence {
  id: string;
  milestoneId: string;
  deliverableId?: string;
  type: EvidenceType;
  /** Title */
  title: string;
  description?: string;
  /** URL or content */
  url?: string;
  content?: string;
  /** File info */
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  /** Hash for integrity */
  hash?: string;
  /** Submitted by */
  submittedBy: string;
  submittedAt: string;
  /** Status */
  status: EvidenceStatus;
  /** Review */
  review?: EvidenceReview;
  /** Metadata */
  metadata: Record<string, unknown>;
}

export interface EvidenceReview {
  reviewedBy: string;
  reviewedAt: string;
  status: "APPROVED" | "REJECTED" | "REVISION_REQUESTED";
  notes?: string;
  score?: number; // 1-5
}

export interface MilestoneReview {
  id: string;
  milestoneId: string;
  reviewerId: string;
  /** Review type */
  type: "CLIENT_APPROVAL" | "PROVIDER_SELF_REVIEW" | "THIRD_PARTY" | "AUTO";
  /** Status */
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED";
  /** Score */
  score?: number;
  /** Comments */
  comments?: string;
  /** Criteria scores */
  criteriaScores?: Record<string, number>;
  /** Evidence reviewed */
  evidenceReviewed: string[];
  reviewedAt?: string;
  /** Due by */
  dueBy?: string;
}

export interface MilestoneApproval {
  approvedBy: string;
  approvedAt: string;
  /** Approval type */
  type: "CLIENT" | "PROVIDER" | "AUTO" | "SYSTEM";
  /** Evidence reviewed */
  evidenceReviewed: string[];
  /** Notes */
  notes?: string;
  /** Conditions */
  conditions?: string[];
}

/** Order events */
export type OrderEventType =
  | "ORDER_CREATED"
  | "ORDER_CONFIRMED"
  | "ORDER_PAID"
  | "ORDER_STARTED"
  | "MILESTONE_CREATED"
  | "MILESTONE_SCHEDULED"
  | "MILESTONE_STARTED"
  | "MILESTONE_SUBMITTED"
  | "MILESTONE_UNDER_REVIEW"
  | "MILESTONE_APPROVED"
  | "MILESTONE_REJECTED"
  | "MILESTONE_REVISION_REQUESTED"
  | "MILESTONE_PAID"
  | "MILESTONE_SKIPPED"
  | "ORDER_COMPLETED"
  | "ORDER_CANCELLED"
  | "ORDER_REFUNDED"
  | "ORDER_DISPUTED"
  | "ORDER_ON_HOLD"
  | "EVIDENCE_SUBMITTED"
  | "EVIDENCE_APPROVED"
  | "EVIDENCE_REJECTED"
  | "REVIEW_SUBMITTED"
  | "PAYMENT_RELEASED";

export interface OrderEvent {
  id: string;
  type: OrderEventType;
  orderId: string;
  actorId: string;
  milestoneId?: string;
  payload: Record<string, unknown>;
  timestamp: string;
  correlationId?: string;
}

/** Order workflow */
export interface OrderWorkflow {
  id: string;
  orderId: string;
  /** Steps */
  steps: OrderWorkflowStep[];
  /** Current step */
  currentStep: number;
  /** Status */
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
}

export interface OrderWorkflowStep {
  id: string;
  name: string;
  type: "PAYMENT" | "MILESTONE" | "EVIDENCE" | "REVIEW" | "APPROVAL" | "PAYMENT_RELEASE" | "NOTIFICATION" | "CUSTOM";
  /** Assigned to */
  assignedTo?: string;
  /** Milestone reference */
  milestoneId?: string;
  /** Status */
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "SKIPPED";
  /** Started at */
  startedAt?: string;
  /** Completed at */
  completedAt?: string;
  /** Result */
  result?: Record<string, unknown>;
  /** Error */
  error?: string;
}

/** Order template */
export interface OrderTemplate {
  id: string;
  name: string;
  description?: string;
  type: OrderType;
  /** Default items */
  defaultItems: Omit<OrderItem, "id">[];
  /** Default milestones */
  defaultMilestones: Omit<OrderMilestone, "id" | "orderId" | "createdAt" | "updatedAt">[];
  /** Default settings */
  defaultSettings: Partial<OrderSettings>;
  /** Default financials */
  defaultFinancials: Partial<OrderFinancials>;
  /** Variables */
  variables: OrderTemplateVariable[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  published: boolean;
  usageCount: number;
}

export interface OrderTemplateVariable {
  id: string;
  key: string;
  label: string;
  type: "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "CURRENCY" | "SELECT" | "BOOLEAN";
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

/** Order events for event-driven architecture */
export interface OrderCreatedEvent {
  type: "ORDER_CREATED";
  orderId: string;
  clientId: string;
  providerId?: string;
  totalCents: number;
  currency: string;
  timestamp: string;
}

export interface OrderPaidEvent {
  type: "ORDER_PAID";
  orderId: string;
  paymentId: string;
  amountCents: number;
  timestamp: string;
}

export interface MilestoneSubmittedEvent {
  type: "MILESTONE_SUBMITTED";
  orderId: string;
  milestoneId: string;
  submittedBy: string;
  evidenceCount: number;
  timestamp: string;
}

export interface MilestoneApprovedEvent {
  type: "MILESTONE_APPROVED";
  orderId: string;
  milestoneId: string;
  approvedBy: string;
  amountReleasedCents: number;
  timestamp: string;
}

export interface OrderCompletedEvent {
  type: "ORDER_COMPLETED";
  orderId: string;
  completedBy: string;
  timestamp: string;
}