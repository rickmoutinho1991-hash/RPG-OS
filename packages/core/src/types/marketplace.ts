/**
 * RPG-OS — Marketplace Domain Foundation
 *
 * Transaction platform, not classifieds.
 * Supports: BUY, SELL, OFFER_SERVICE, REQUEST_SERVICE, REQUEST_QUOTE, PROVIDE_QUOTE, BOOK, ADJUDICATE, CONTRACT, PAY, EXECUTE, VERIFY, ACCEPT, REVIEW, WARRANTY, DISPUTE
 */

import type { UniversalActor } from "./actor";

/** Marketplace participant roles */
export type MarketplaceRole = "BUYER" | "SELLER" | "PROVIDER" | "CLIENT" | "BROKER";

/** Listing types */
export type ListingType = "PRODUCT" | "SERVICE" | "RENTAL" | "JOB" | "PROJECT";

/** Listing status */
export type ListingStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "ACTIVE"
  | "PAUSED"
  | "EXPIRED"
  | "SOLD"
  | "REMOVED"
  | "REJECTED";

/** Request status */
export type RequestStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "QUOTES_RECEIVED"
  | "ADJUDICATING"
  | "ADJUDICATED"
  | "CONTRACTING"
  | "CONTRACTED"
  | "EXECUTING"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED";

/** Marketplace quote status (domain-specific lifecycle) */
export type MarketplaceQuoteStatus =
  | "DRAFT"
  | "SENT"
  | "VIEWED"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "WITHDRAWN"
  | "CONVERTED_TO_CONTRACT";

/** Marketplace order status (domain-specific lifecycle) */
export type MarketplaceOrderStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_PROCESSING"
  | "PAID"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "MILESTONE_DUE"
  | "MILESTONE_SUBMITTED"
  | "MILESTONE_APPROVED"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED"
  | "DISPUTED";

/** Category hierarchy */
export interface MarketplaceCategory {
  id: string;
  slug: string;
  name: string;
  description?: string;
  parentId?: string;
  icon?: string;
  /** Whether this category requires professional verification */
  requiresVerification: boolean;
  /** Required licenses/certifications */
  requiredCertifications?: string[];
  /** Sort order */
  sortOrder: number;
  /** Active */
  active: boolean;
  children?: MarketplaceCategory[];
}

/** Service area / location */
export interface ServiceArea {
  id: string;
  name: string;
  /** Postal codes covered */
  postalCodes?: string[];
  /** Districts covered */
  districts?: string[];
  /** Radius from center (km) */
  radiusKm?: number;
  /** Center coordinates */
  center?: { lat: number; lng: number };
}

/** Provider profile */
export interface ProviderProfile {
  id: string;
  actorId: string;
  /** Display name */
  displayName: string;
  /** Tagline */
  tagline?: string;
  /** Description */
  description: string;
  /** Categories this provider serves */
  categories: string[];
  /** Service areas */
  serviceAreas: string[];
  /** Verification status */
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  /** Verified at */
  verifiedAt?: string;
  /** Verification documents */
  verificationDocuments: string[];
  /** Licenses/certifications */
  licenses: ProviderLicense[];
  /** Portfolio images */
  portfolio: ProviderPortfolioItem[];
  /** Rating */
  rating: ProviderRating;
  /** Response time */
  avgResponseTimeHours?: number;
  /** Completion rate */
  completionRate?: number;
  /** Languages */
  languages: string[];
  /** Availability schedule */
  availability?: ProviderAvailability;
  /** Settings */
  settings: ProviderSettings;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderLicense {
  id: string;
  type: string;
  number: string;
  issuedBy: string;
  issuedAt: string;
  expiresAt?: string;
  verified: boolean;
}

export interface ProviderPortfolioItem {
  id: string;
  title: string;
  description?: string;
  images: string[];
  category: string;
  completedAt: string;
  clientReference?: string;
}

export interface ProviderRating {
  overall: number;
  count: number;
  breakdown: {
    quality: number;
    communication: number;
    timeliness: number;
    value: number;
  };
  recentReviews: ProviderReview[];
}

export interface ProviderReview {
  id: string;
  orderId: string;
  clientId: string;
  rating: number;
  comment?: string;
  categories: Record<string, number>;
  createdAt: string;
  verified: boolean;
}

export interface ProviderAvailability {
  timezone: string;
  schedule: WeeklySchedule[];
  exceptions: AvailabilityException[];
}

export interface WeeklySchedule {
  dayOfWeek: number; // 0-6
  slots: TimeSlot[];
}

export interface TimeSlot {
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface AvailabilityException {
  date: string; // YYYY-MM-DD
  slots?: TimeSlot[];
  unavailable?: boolean;
}

export interface ProviderSettings {
  autoAcceptQuotes: boolean;
  maxQuoteValueCents?: number;
  preferredPaymentMethods: string[];
  requireDeposit: boolean;
  depositPercentage?: number;
  warrantyMonths?: number;
  instantBooking: boolean;
}

/** Client/Buyer profile */
export interface ClientProfile {
  id: string;
  actorId: string;
  /** Preferences */
  preferences: ClientPreferences;
  /** Saved searches */
  savedSearches: SavedSearch[];
  /** Favorite providers */
  favoriteProviders: string[];
  /** Rating as buyer */
  rating: ClientRating;
  createdAt: string;
  updatedAt: string;
}

export interface ClientPreferences {
  preferredCategories: string[];
  preferredLocation?: ServiceArea;
  budgetRange?: { min: number; max: number };
  currency: string;
  language: string;
  notifications: NotificationPreferences;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
  quoteReceived: boolean;
  orderUpdates: boolean;
  messages: boolean;
  marketing: boolean;
}

export interface SavedSearch {
  id: string;
  name: string;
  criteria: SearchCriteria;
  alertsEnabled: boolean;
  createdAt: string;
}

export interface SearchCriteria {
  query?: string;
  category?: string;
  location?: ServiceArea;
  priceRange?: { min: number; max: number };
  ratingMin?: number;
  availability?: "now" | "today" | "this_week" | "any";
  verifiedOnly: boolean;
}

export interface ClientRating {
  overall: number;
  count: number;
  asBuyer: {
    rating: number;
    count: number;
  };
}

/** Listing / Offer */
export interface MarketplaceListing {
  id: string;
  providerId: string;
  type: ListingType;
  categoryId: string;
  title: string;
  slug: string;
  description: string;
  /** Short description for cards */
  shortDescription?: string;
  /** Pricing */
  pricing: ListingPricing;
  /** Images */
  images: ListingImage[];
  /** Videos */
  videos?: ListingVideo[];
  /** Attributes (dynamic based on category) */
  attributes: Record<string, unknown>;
  /** Location */
  location: ListingLocation;
  /** Service area for services */
  serviceAreas?: string[];
  /** Availability */
  availability: ListingAvailability;
  /** Status */
  status: ListingStatus;
  /** SEO */
  seo: ListingSEO;
  /** Stats */
  stats: ListingStats;
  /** Moderation */
  moderation: ListingModeration;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  expiresAt?: string;
}

export interface ListingPricing {
  type: "FIXED" | "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY" | "QUOTE" | "NEGOTIABLE";
  amountCents: number;
  currency: string;
  /** For quote-based */
  minQuoteCents?: number;
  maxQuoteCents?: number;
  /** What's included */
  includes?: string[];
  /** What's not included */
  excludes?: string[];
  /** Discount */
  discount?: {
    percentage?: number;
    amountCents?: number;
    validUntil?: string;
  };
}

export interface ListingImage {
  id: string;
  url: string;
  alt?: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface ListingVideo {
  id: string;
  url: string;
  thumbnailUrl?: string;
  duration?: number;
}

export interface ListingLocation {
  address?: string;
  postalCode?: string;
  city?: string;
  district?: string;
  coordinates?: { lat: number; lng: number };
  /** For services: remote/on-site */
  serviceMode?: "REMOTE" | "ON_SITE" | "BOTH";
}

export interface ListingAvailability {
  type: "ALWAYS" | "SCHEDULE" | "ON_DEMAND" | "SEASONAL";
  schedule?: WeeklySchedule[];
  leadTimeHours?: number;
  advanceBookingDays?: number;
}

export interface ListingSEO {
  metaTitle?: string;
  metaDescription?: string;
  keywords: string[];
}

export interface ListingStats {
  views: number;
  inquiries: number;
  quotesSent: number;
  orders: number;
  conversionRate: number;
  avgResponseTimeHours: number;
}

export interface ListingModeration {
  status: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
  moderatedAt?: string;
  moderatedBy?: string;
  rejectionReason?: string;
  flags: ModerationFlag[];
}

export interface ModerationFlag {
  id: string;
  type: "SPAM" | "INAPPROPRIATE" | "MISLEADING" | "DUPLICATE" | "POLICY_VIOLATION";
  reportedBy?: string;
  reason?: string;
  status: "OPEN" | "REVIEWED" | "DISMISSED" | "ACTION_TAKEN";
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

/** Service Request */
export interface ServiceRequest {
  id: string;
  clientId: string;
  categoryId: string;
  title: string;
  description: string;
  /** Budget */
  budget: RequestBudget;
  /** Location */
  location: ServiceRequestLocation;
  /** Urgency */
  urgency: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  /** Desired timeline */
  desiredStartDate?: string;
  desiredEndDate?: string;
  /** Attachments */
  attachments: RequestAttachment[];
  /** Status */
  status: RequestStatus;
  /** Quotes received */
  quotes: ServiceQuote[];
  /** Adjudicated quote */
  adjudicatedQuoteId?: string;
  /** Moderation */
  moderation: RequestModeration;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  expiresAt?: string;
}

export interface RequestBudget {
  type: "FIXED" | "RANGE" | "NEGOTIABLE";
  amountCents?: number;
  minCents?: number;
  maxCents?: number;
  currency: string;
}

export interface ServiceRequestLocation {
  address?: string;
  postalCode?: string;
  city?: string;
  district?: string;
  coordinates?: { lat: number; lng: number };
  serviceMode?: "REMOTE" | "ON_SITE" | "BOTH";
}

export interface RequestAttachment {
  id: string;
  type: "IMAGE" | "DOCUMENT" | "VIDEO";
  url: string;
  name: string;
  description?: string;
}

export interface ServiceQuote {
  id: string;
  requestId: string;
  providerId: string;
  /** Quote details */
  items: ServiceQuoteItem[];
  /** Totals */
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  /** Validity */
  validUntil: string;
  /** Terms */
  terms?: string;
  /** Warranty */
  warrantyMonths?: number;
  /** Status */
  status: MarketplaceQuoteStatus;
  /** Timeline */
  estimatedStartDate?: string;
  estimatedDurationDays?: number;
  /** Response to client questions */
  responseToQuestions?: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  viewedAt?: string;
  respondedAt?: string;
}

export interface ServiceQuoteItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  taxRate: number;
  totalCents: number;
}

export interface RequestModeration {
  status: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
  moderatedAt?: string;
  moderatedBy?: string;
  rejectionReason?: string;
}

export interface ModerationAction {
  id: string;
  entityType: "LISTING" | "REQUEST" | "QUOTE" | "REVIEW" | "PROVIDER" | "CLIENT";
  entityId: string;
  action: "APPROVE" | "REJECT" | "FLAG" | "REMOVE" | "SUSPEND" | "WARN";
  reason: string;
  moderatorId: string;
  createdAt: string;
}

/** Search and discovery */
export interface SearchFilters {
  query?: string;
  categories?: string[];
  location?: ServiceArea;
  priceRange?: { min: number; max: number };
  ratingMin?: number;
  verifiedOnly?: boolean;
  availability?: "now" | "today" | "this_week" | "any";
  serviceMode?: "REMOTE" | "ON_SITE" | "BOTH";
  providerId?: string;
  sortBy?: "relevance" | "rating" | "price_asc" | "price_desc" | "newest" | "distance";
  page?: number;
  pageSize?: number;
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: SearchFacets;
}

export interface SearchFacets {
  categories: FacetCount[];
  locations: FacetCount[];
  priceRanges: FacetCount[];
  ratings: FacetCount[];
}

export interface FacetCount {
  value: string;
  label: string;
  count: number;
}

/** Trust & Safety */
export interface TrustSignal {
  id: string;
  entityType: "PROVIDER" | "CLIENT" | "LISTING" | "QUOTE";
  entityId: string;
  type: "VERIFICATION" | "REVIEW" | "COMPLETION" | "CERTIFICATION" | "BADGE" | "INSURANCE" | "GUARANTEE";
  label: string;
  description?: string;
  icon?: string;
  verified: boolean;
  verifiedAt?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface Dispute {
  id: string;
  orderId: string;
  initiatorId: string;
  respondentId: string;
  type: "QUALITY" | "TIMELINE" | "PAYMENT" | "SCOPE" | "COMMUNICATION" | "OTHER";
  description: string;
  evidence: DisputeEvidence[];
  status: "OPEN" | "MEDIATION" | "ARBITRATION" | "RESOLVED" | "CLOSED";
  resolution?: DisputeResolution;
  mediatorId?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface DisputeEvidence {
  id: string;
  type: "MESSAGE" | "DOCUMENT" | "IMAGE" | "VIDEO" | "LINK";
  url?: string;
  content?: string;
  submittedBy: string;
  submittedAt: string;
}

export interface DisputeResolution {
  type: "REFUND_FULL" | "REFUND_PARTIAL" | "REDO_WORK" | "COMPENSATION" | "MUTUAL_AGREEMENT" | "OTHER";
  description: string;
  amountCents?: number;
  agreedByInitiator: boolean;
  agreedByRespondent: boolean;
  resolvedAt: string;
}

/** Marketplace events for event-driven architecture */
export type MarketplaceEventType =
  | "LISTING_CREATED"
  | "LISTING_PUBLISHED"
  | "LISTING_PAUSED"
  | "LISTING_EXPIRED"
  | "REQUEST_CREATED"
  | "REQUEST_PUBLISHED"
  | "REQUEST_ADJUDICATED"
  | "QUOTE_SENT"
  | "QUOTE_VIEWED"
  | "QUOTE_ACCEPTED"
  | "QUOTE_REJECTED"
  | "QUOTE_EXPIRED"
  | "ORDER_CREATED"
  | "ORDER_PAID"
  | "ORDER_CONFIRMED"
  | "MILESTONE_CREATED"
  | "MILESTONE_SUBMITTED"
  | "MILESTONE_APPROVED"
  | "ORDER_COMPLETED"
  | "ORDER_CANCELLED"
  | "ORDER_ACCEPTED"
  | "ORDER_REJECTED"
  | "REVIEW_CREATED"
  | "REVIEW_RECEIVED"
  | "WARRANTY_ACTIVATED"
  | "WARRANTY_CLAIM_OPENED"
  | "WARRANTY_CLAIM_DECIDED"
  | "DISPUTE_OPENED"
  | "DISPUTE_RESPONDED"
  | "DISPUTE_RESOLVED"
  | "AI_PROPOSAL_CREATED"
  | "AI_PROPOSAL_APPROVED"
  | "AI_PROPOSAL_DENIED"
  | "PROVIDER_VERIFIED";

export interface MarketplaceEvent {
  id: string;
  type: MarketplaceEventType;
  actorId: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  timestamp: string;
  correlationId?: string;
}

/* ─── Marketplace Phase 2 — Transacional ───────────────────────────────── */

/** Kind de request comercial (não é oferta de produto). */
export type RequestKind = "BUY_REQUEST" | "SERVICE_REQUEST" | "QUOTE_REQUEST";

/** Registo de adjudicação — auditável e imutável após criação. */
export interface AdjudicationRecord {
  id: string;
  requestId: string;
  quoteId: string;
  /** Quem adjudicou (sempre o client/owner do request). */
  adjudicatedBy: string;
  /** Contexto da decisão (ex.: "client selected quote"). */
  context: string;
  /** Referência de versão imutável da quote. */
  quoteVersion: string;
  /** Preço adjudicado (inteiro, cents). */
  priceCents: number;
  currency: string;
  /** Condições acordadas (snapshot). */
  conditions: string[];
  createdAt: string;
}

/** Decisão de aceitação do cliente (≠ assinatura de contrato). */
export type AcceptanceDecision = "ACCEPT" | "REJECT" | "REQUEST_REVISION";

export interface AcceptanceRecord {
  id: string;
  orderId: string;
  clientId: string;
  decision: AcceptanceDecision;
  reason?: string;
  acceptedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Review de reputação — ligado a um order concluído, uma vez por par. */
export interface MarketplaceReview {
  id: string;
  orderId: string;
  /** Quem escreveu (cliente). */
  reviewerId: string;
  /** Sobre quem (provider). */
  revieweeId: string;
  /** 1..5 (inteiro). */
  rating: number;
  comment?: string;
  /** Categorias: quality/communication/timeliness/value (1..5). */
  categories: Record<string, number>;
  createdAt: string;
  verified: boolean;
}

/** Garantia de serviço — janela e cobertura, com referência ao order/contrato. */
export interface Warranty {
  id: string;
  orderId: string;
  contractId?: string;
  providerId: string;
  clientId: string;
  warrantyPeriodMonths: number;
  startDate: string;
  endDate: string;
  coverage: string;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
}

export type WarrantyClaimStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "ACCEPTED"
  | "REJECTED"
  | "CLOSED";

export interface WarrantyClaim {
  id: string;
  warrantyId: string;
  orderId: string;
  clientId: string;
  description: string;
  status: WarrantyClaimStatus;
  openedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  resolution?: string;
  createdAt: string;
  updatedAt: string;
}

/* ─── Marketplace AI Agent ─────────────────────────────────────────────── */

export type AiMarketplaceCapability =
  | "REQUEST_CLARIFY"
  | "REQUEST_STRUCTURE"
  | "LISTING_SUGGEST"
  | "PROVIDER_SEARCH"
  | "QUOTE_COMPARE"
  | "QUOTE_EXPLAIN"
  | "CONTRACT_PREPARE"
  | "MILESTONE_REMIND"
  | "EVIDENCE_REQUEST"
  | "STATUS_EXPLAIN";

export type AiProposalStatus = "PROPOSED" | "APPROVED" | "DENIED" | "EXECUTED";

/**
 * Proposta da AI. A AI recomenda/prepara/coordena; um humano aprova e um
 * ator autorizado executa. NUNCA a AI adjudica, assina, confirma pagamento,
 * liberta fundos, altera preço, aceita disputa ou altera permissões.
 */
export interface AiProposal {
  id: string;
  kind: AiMarketplaceCapability;
  /** Actor AI que propôs. */
  aiActorId: string;
  /** Tenante/org do recurso-alvo (server-derived no momento da proposta). */
  organizationId?: string;
  targetEntityType: string;
  targetEntityId?: string;
  payload: Record<string, unknown>;
  rationale: string;
  requiresHumanApproval: boolean;
  status: AiProposalStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  /** Ator que executou a ação após aprovação (humano/sistema autorizado). */
  executedBy?: string;
  executedAt?: string;
}