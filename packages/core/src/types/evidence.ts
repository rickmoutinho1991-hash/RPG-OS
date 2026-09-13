/**
 * RPG-OS — Evidence Foundation
 *
 * PHOTO, VIDEO, DOCUMENT, MESSAGE, SIGNATURE, SYSTEM_EVENT
 * Hash-based integrity, access control, retention.
 * Never exposing private evidence to unauthorized actors.
 */

import type { UniversalActor } from "./actor";

/** Evidence types */
export type EvidenceType =
  | "PHOTO"
  | "VIDEO"
  | "DOCUMENT"
  | "MESSAGE"
  | "SIGNATURE"
  | "SYSTEM_EVENT"
  | "AUDIO"
  | "SCREENSHOT"
  | "LOCATION"
  | "BIOMETRIC"
  | "OTHER";

/** Evidence status */
export type EvidenceStatus =
  | "UPLOADING"
  | "UPLOADED"
  | "PROCESSING"
  | "READY"
  | "ARCHIVED"
  | "EXPIRED"
  | "DELETED"
  | "QUARANTINED";

/** Evidence visibility */
export type EvidenceVisibility =
  | "PRIVATE"           // Only owner and authorized parties
  | "PARTIES"           // Contract/order parties
  | "ORGANIZATION"      // Organization members
  | "PUBLIC"            // Anyone with link
  | "RESTRICTED";       // Specific actors only

/** Evidence category */
export type EvidenceCategory =
  | "CONTRACT"
  | "ORDER"
  | "MILESTONE"
  | "PAYMENT"
  | "DELIVERY"
  | "INSPECTION"
  | "COMMUNICATION"
  | "COMPLIANCE"
  | "INCIDENT"
  | "QUALITY"
  | "SAFETY"
  | "TRAINING"
  | "MEDICAL"
  | "LEGAL"
  | "FINANCIAL"
  | "OTHER";

/** Storage backend */
export type StorageBackend =
  | "S3"
  | "GCS"
  | "AZURE_BLOB"
  | "LOCAL"
  | "IPFS"
  | "DATABASE";

/** Evidence entity */
export interface Evidence {
  id: string;
  /** Type */
  type: EvidenceType;
  /** Category */
  category: EvidenceCategory;
  /** Title */
  title: string;
  /** Description */
  description?: string;
  /** Owner */
  ownerId: string;
  /** Owner type */
  ownerType: "HUMAN" | "ORGANIZATION" | "AI_AGENT" | "SYSTEM";
  /** Related entities */
  relatedEntities: EvidenceRelation[];
  /** File info */
  file: EvidenceFile;
  /** Hash for integrity (SHA-256) */
  hash: string;
  /** Hash algorithm */
  hashAlgorithm: "SHA-256" | "SHA-512" | "BLAKE3";
  /** Visibility */
  visibility: EvidenceVisibility;
  /** Authorized viewers (for RESTRICTED) */
  authorizedViewers: string[];
  /** Status */
  status: EvidenceStatus;
  /** Tags */
  tags: string[];
  /** Metadata */
  metadata: EvidenceMetadata;
  /** Retention */
  retention: EvidenceRetention;
  /** Processing */
  processing?: EvidenceProcessing;
  /** Audit trail */
  auditTrail: EvidenceAuditEntry[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  deletedAt?: string;
}

export interface EvidenceRelation {
  entityType: "ORDER" | "CONTRACT" | "MILESTONE" | "PAYMENT" | "DISPUTE" | "REVIEW" | "ACTOR" | "DOCUMENT";
  entityId: string;
  relation: "SUPPORTS" | "PROVES" | "REFERENCES" | "DERIVED_FROM" | "PART_OF";
}

export interface EvidenceFile {
  /** Original filename */
  originalName: string;
  /** Stored filename */
  storedName: string;
  /** MIME type */
  mimeType: string;
  /** Size in bytes */
  sizeBytes: number;
  /** Storage backend */
  storageBackend: StorageBackend;
  /** Storage path/key */
  storagePath: string;
  /** Storage bucket/container */
  storageBucket?: string;
  /** CDN URL */
  cdnUrl?: string;
  /** Thumbnail URL */
  thumbnailUrl?: string;
  /** Preview URL */
  previewUrl?: string;
  /** Dimensions (for images/videos) */
  dimensions?: {
    width: number;
    height: number;
  };
  /** Duration (for audio/video) */
  durationSeconds?: number;
  /** Pages (for documents) */
  pageCount?: number;
  /** Encoding */
  encoding?: string;
  /** Checksum (additional to hash) */
  checksum?: string;
}

export interface EvidenceMetadata {
  /** Device info */
  device?: {
    type: string;
    model?: string;
    os?: string;
    osVersion?: string;
    appVersion?: string;
  };
  /** Location */
  location?: {
    lat: number;
    lng: number;
    accuracy?: number;
    altitude?: number;
    heading?: number;
    speed?: number;
    timestamp: string;
  };
  /** Camera info (for photos/videos) */
  camera?: {
    make?: string;
    model?: string;
    aperture?: string;
    shutterSpeed?: string;
    iso?: number;
    focalLength?: string;
    flash?: boolean;
  };
  /** EXIF data (stripped or kept) */
  exif?: Record<string, unknown>;
  /** OCR text (for documents/images) */
  ocrText?: string;
  /** Classification */
  classification?: {
    category: string;
    confidence: number;
    labels: string[];
  };
  /** Custom fields */
  custom: Record<string, unknown>;
}

export interface EvidenceRetention {
  /** Retention policy ID */
  policyId: string;
  /** Retention period in days */
  retentionDays: number;
  /** Auto-delete after retention */
  autoDelete: boolean;
  /** Archive after days */
  archiveAfterDays?: number;
  /** Legal hold */
  legalHold: boolean;
  /** Legal hold reason */
  legalHoldReason?: string;
  /** Expires at */
  expiresAt?: string;
}

export interface EvidenceProcessing {
  /** Processing status */
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  /** Steps completed */
  steps: EvidenceProcessingStep[];
  /** Started at */
  startedAt?: string;
  /** Completed at */
  completedAt?: string;
  /** Error if failed */
  error?: string;
  /** Result */
  result?: Record<string, unknown>;
}

export interface EvidenceProcessingStep {
  name: "VIRUS_SCAN" | "THUMBNAIL" | "PREVIEW" | "OCR" | "CLASSIFICATION" | "COMPRESSION" | "ENCRYPTION" | "WATERMARK" | "CUSTOM";
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "SKIPPED";
  startedAt?: string;
  completedAt?: string;
  error?: string;
  output?: Record<string, unknown>;
}

export interface EvidenceAuditEntry {
  id: string;
  timestamp: string;
  actorId: string;
  action: "UPLOADED" | "VIEWED" | "DOWNLOADED" | "SHARED" | "MOVED" | "RENAMED" | "TAGGED" | "ARCHIVED" | "RESTORED" | "DELETED" | "LEGAL_HOLD" | "LEGAL_HOLD_RELEASED" | "RETENTION_CHANGED" | "VISIBILITY_CHANGED" | "METADATA_UPDATED" | "HASH_VERIFIED" | "HASH_MISMATCH";
  details: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  sessionId?: string;
}

/** Evidence collection (group of related evidence) */
export interface EvidenceCollection {
  id: string;
  name: string;
  description?: string;
  /** Owner */
  ownerId: string;
  /** Evidence IDs in collection */
  evidenceIds: string[];
  /** Visibility */
  visibility: EvidenceVisibility;
  /** Authorized viewers */
  authorizedViewers: string[];
  /** Tags */
  tags: string[];
  /** Status */
  status: "ACTIVE" | "ARCHIVED" | "SEALED";
  /** Seal info (for legal) */
  seal?: EvidenceSeal;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceSeal {
  sealedBy: string;
  sealedAt: string;
  hash: string;
  reason: string;
  witnesses: string[];
}

/** Evidence sharing */
export interface EvidenceShare {
  id: string;
  evidenceId: string;
  /** Shared by */
  sharedBy: string;
  /** Shared with */
  sharedWith: string[];
  /** Permission */
  permission: "VIEW" | "DOWNLOAD" | "COMMENT" | "ANNOTATE";
  /** Expires at */
  expiresAt?: string;
  /** Password protected */
  passwordProtected: boolean;
  /** Access log */
  accessLog: EvidenceShareAccess[];
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceShareAccess {
  actorId: string;
  action: "VIEWED" | "DOWNLOADED" | "PRINTED";
  timestamp: string;
  ip?: string;
  userAgent?: string;
}

/** Evidence verification */
export interface EvidenceVerification {
  id: string;
  evidenceId: string;
  /** Verification type */
  type: "HASH" | "SIGNATURE" | "TIMESTAMP" | "NOTARY" | "BLOCKCHAIN" | "THIRD_PARTY";
  /** Verifier */
  verifierId: string;
  /** Verifier name */
  verifierName: string;
  /** Result */
  result: "VALID" | "INVALID" | "PARTIAL" | "UNVERIFIABLE";
  /** Details */
  details: Record<string, unknown>;
  /** Certificate */
  certificate?: VerificationCertificate;
  verifiedAt: string;
  expiresAt?: string;
}

export interface VerificationCertificate {
  issuer: string;
  serialNumber: string;
  subject: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
}

/** Evidence search */
export interface EvidenceSearchFilters {
  ownerId?: string;
  ownerType?: Evidence["ownerType"];
  type?: EvidenceType;
  category?: EvidenceCategory;
  status?: EvidenceStatus;
  visibility?: EvidenceVisibility;
  tags?: string[];
  relatedEntityType?: EvidenceRelation["entityType"];
  relatedEntityId?: string;
  dateFrom?: string;
  dateTo?: string;
  sizeMin?: number;
  sizeMax?: number;
  hash?: string;
  legalHold?: boolean;
  textQuery?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "updatedAt" | "sizeBytes" | "title";
  sortOrder?: "asc" | "desc";
}

export interface EvidenceSearchResult {
  items: Evidence[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: {
    types: EvidenceFacetCount[];
    categories: EvidenceFacetCount[];
    statuses: EvidenceFacetCount[];
    tags: EvidenceFacetCount[];
  };
}

export interface EvidenceFacetCount {
  value: string;
  label: string;
  count: number;
}

/** Evidence events */
export type EvidenceEventType =
  | "EVIDENCE_UPLOADED"
  | "EVIDENCE_PROCESSED"
  | "EVIDENCE_VIEWED"
  | "EVIDENCE_DOWNLOADED"
  | "EVIDENCE_SHARED"
  | "EVIDENCE_TAGGED"
  | "EVIDENCE_ARCHIVED"
  | "EVIDENCE_DELETED"
  | "EVIDENCE_LEGAL_HOLD"
  | "EVIDENCE_VERIFIED"
  | "EVIDENCE_HASH_MISMATCH"
  | "EVIDENCE_RESTORED"
  | "EVIDENCE_EXPIRED";

export interface EvidenceEvent {
  id: string;
  type: EvidenceEventType;
  evidenceId: string;
  actorId: string;
  payload: Record<string, unknown>;
  timestamp: string;
  correlationId?: string;
}

/** Evidence service */
export class EvidenceService {
  /** Upload evidence */
  async upload(input: UploadEvidenceInput): Promise<Evidence> {
    // TODO: Implement
    throw new Error("Not implemented");
  }

  /** Get evidence by ID */
  async getById(id: string, actorId: string): Promise<Evidence | null> {
    // TODO: Implement with access control
    throw new Error("Not implemented");
  }

  /** Search evidence */
  async search(filters: EvidenceSearchFilters, actorId: string): Promise<EvidenceSearchResult> {
    // TODO: Implement with access control
    throw new Error("Not implemented");
  }

  /** Update evidence metadata */
  async updateMetadata(id: string, actorId: string, metadata: Partial<EvidenceMetadata>): Promise<Evidence> {
    // TODO: Implement
    throw new Error("Not implemented");
  }

  /** Change visibility */
  async changeVisibility(id: string, actorId: string, visibility: EvidenceVisibility, authorizedViewers?: string[]): Promise<Evidence> {
    // TODO: Implement
    throw new Error("Not implemented");
  }

  /** Delete evidence */
  async delete(id: string, actorId: string, permanent = false): Promise<void> {
    // TODO: Implement
    throw new Error("Not implemented");
  }

  /** Verify hash integrity */
  async verifyHash(id: string): Promise<{ valid: boolean; expectedHash: string; actualHash: string }> {
    // TODO: Implement
    throw new Error("Not implemented");
  }

  /** Create collection */
  async createCollection(input: CreateCollectionInput): Promise<EvidenceCollection> {
    // TODO: Implement
    throw new Error("Not implemented");
  }

  /** Share evidence */
  async share(input: ShareEvidenceInput): Promise<EvidenceShare> {
    // TODO: Implement
    throw new Error("Not implemented");
  }

  /** Request verification */
  async requestVerification(input: RequestVerificationInput): Promise<EvidenceVerification> {
    // TODO: Implement
    throw new Error("Not implemented");
  }

  /** Apply legal hold */
  async applyLegalHold(id: string, actorId: string, reason: string): Promise<Evidence> {
    // TODO: Implement
    throw new Error("Not implemented");
  }

  /** Release legal hold */
  async releaseLegalHold(id: string, actorId: string): Promise<Evidence> {
    // TODO: Implement
    throw new Error("Not implemented");
  }
}

export interface UploadEvidenceInput {
  type: EvidenceType;
  category: EvidenceCategory;
  title: string;
  description?: string;
  /** Ator autenticado que executa o upload (server-derived, nunca do cliente). */
  actorId: string;
  /** Dono do registo de evidência. Deve coincidir com actorId no upload. */
  ownerId: string;
  ownerType: Evidence["ownerType"];
  file: {
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    buffer: Buffer | Uint8Array;
  };
  relatedEntities?: EvidenceRelation[];
  visibility?: EvidenceVisibility;
  authorizedViewers?: string[];
  tags?: string[];
  retentionPolicyId?: string;
  metadata?: Partial<EvidenceMetadata>;
}

export interface CreateCollectionInput {
  name: string;
  description?: string;
  ownerId: string;
  evidenceIds: string[];
  visibility?: EvidenceVisibility;
  authorizedViewers?: string[];
  tags?: string[];
}

export interface ShareEvidenceInput {
  evidenceId: string;
  sharedBy: string;
  sharedWith: string[];
  permission: "VIEW" | "DOWNLOAD" | "COMMENT" | "ANNOTATE";
  expiresAt?: string;
  passwordProtected?: boolean;
}

export interface RequestVerificationInput {
  evidenceId: string;
  type: EvidenceVerification["type"];
  requestedBy: string;
  requiredBy?: string;
}

/** Default evidence service instance */
export const evidenceService = new EvidenceService();