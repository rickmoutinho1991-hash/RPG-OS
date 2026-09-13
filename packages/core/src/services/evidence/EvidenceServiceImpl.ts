/**
 * RPG-OS — Evidence Service Implementation
 *
 * Real upload, verify, and access-controlled evidence management.
 * Uses EvidenceGuard for hashing and access control.
 * Uses EvidenceStorageAdapter for file storage (abstracted).
 * Uses EvidenceRepository for record persistence (abstracted).
 *
 * IMPORTANT:
 * - SHA-256 is NOT legal proof. It proves integrity at time of computation.
 * - No storage provider is assumed. Adapter is injected.
 * - Files are NOT stored in the DB record. Only metadata + hash.
 * - Hash is computed over the content as-received (pre-storage).
 * - Access is deny-closed. No implicit access paths.
 */

import { sha256HexSync, canAccessEvidence } from "./EvidenceGuard";
import { generateStoragePath, DEFAULT_EVIDENCE_BUCKET } from "./EvidenceStorage";
import type { EvidenceStorageAdapter, StorageReference } from "./EvidenceStorage";
import type { EvidenceRepository } from "./EvidenceRepository";
import type {
  Evidence,
  EvidenceType,
  EvidenceCategory,
  EvidenceVisibility,
  EvidenceMetadata,
  EvidenceRelation,
  EvidenceSearchFilters,
  EvidenceSearchResult,
  EvidenceAuditEntry,
  UploadEvidenceInput,
} from "../../types/evidence";

export interface EvidenceServiceConfig {
  storage: EvidenceStorageAdapter;
  repository: EvidenceRepository;
  bucket?: string;
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
  now?: () => string;
  createId?: () => string;
}

export interface UploadEvidenceResult {
  evidence: Evidence;
  storageRef: StorageReference;
  events: EvidenceAuditEntry[];
}

export interface HashVerifyResult {
  valid: boolean;
  expectedHash: string;
  actualHash: string;
}

const DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const DEFAULT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "audio/mpeg",
  "text/plain",
  "text/csv",
  "application/json",
  "application/xml",
];

export class EvidenceServiceImpl {
  private storage: EvidenceStorageAdapter;
  private repository: EvidenceRepository;
  private bucket: string;
  private maxSizeBytes: number;
  private allowedMimeTypes: string[];
  private now: () => string;
  private createId: () => string;

  constructor(config: EvidenceServiceConfig) {
    this.storage = config.storage;
    this.repository = config.repository;
    this.bucket = config.bucket ?? DEFAULT_EVIDENCE_BUCKET;
    this.maxSizeBytes = config.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
    this.allowedMimeTypes = config.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES;
    this.now = config.now ?? (() => new Date().toISOString());
    this.createId = config.createId ?? (() => crypto.randomUUID());
  }

  /**
   * Upload evidence. Hash is computed over the content as-received.
   * Files go to storage; only metadata + hash are persisted in the record.
   */
  async upload(input: UploadEvidenceInput): Promise<UploadEvidenceResult> {
    this.validateUploadInput(input);

    if (!input.actorId || input.actorId.trim().length === 0) {
      throw new Error("Evidence upload requires an authenticated actor (actorId)");
    }
    if (input.actorId !== input.ownerId) {
      throw new Error(
        "Cannot upload evidence on behalf of another owner (actorId must match ownerId)",
      );
    }

    const contentHash = sha256HexSync(input.file.buffer);
    const timestamp = this.now();
    const evidenceId = this.createId();

    const storagePath = generateStoragePath({
      ownerId: input.ownerId,
      ownerType: input.ownerType,
      contentHash,
      originalName: input.file.originalName,
    });

    const storageRef = await this.storage.store({
      path: storagePath,
      bucket: this.bucket,
      content: input.file.buffer,
      mimeType: input.file.mimeType,
      originalName: input.file.originalName,
    });

    const evidence: Evidence = {
      id: evidenceId,
      type: input.type,
      category: input.category,
      title: input.title,
      description: input.description,
      ownerId: input.ownerId,
      ownerType: input.ownerType,
      relatedEntities: input.relatedEntities ?? [],
      file: {
        originalName: input.file.originalName,
        storedName: storagePath.split("/").pop() ?? input.file.originalName,
        mimeType: input.file.mimeType,
        sizeBytes: input.file.sizeBytes,
        storageBackend: storageRef.backend,
        storagePath: storageRef.path,
        storageBucket: storageRef.bucket,
      },
      hash: contentHash,
      hashAlgorithm: "SHA-256",
      visibility: input.visibility ?? "PRIVATE",
      authorizedViewers: input.authorizedViewers ?? [],
      status: "READY",
      tags: input.tags ?? [],
      metadata: this.buildMetadata(input.metadata),
      retention: {
        policyId: input.retentionPolicyId ?? "default",
        retentionDays: 365,
        autoDelete: false,
        legalHold: false,
      },
      auditTrail: [
        {
          id: this.createId(),
          timestamp,
          actorId: input.actorId,
          action: "UPLOADED",
          details: {
            mimeType: input.file.mimeType,
            sizeBytes: input.file.sizeBytes,
            hash: contentHash,
            hashAlgorithm: "SHA-256",
            storageBackend: storageRef.backend,
            storagePath: storageRef.path,
          },
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.repository.save(evidence);

    return {
      evidence,
      storageRef,
      events: evidence.auditTrail,
    };
  }

  /**
   * Get evidence by ID with access control.
   * Deny-closed: no access exists unless explicitly granted.
   */
  async getById(
    id: string,
    context: { actorId: string; organizationIds?: string[]; isPlatformAdmin?: boolean },
  ): Promise<Evidence | null> {
    const evidence = await this.repository.getById(id);
    if (!evidence) return null;

    const decision = canAccessEvidence(evidence, context);
    if (!decision.allowed) {
      throw new Error(`Evidence access denied: ${decision.reason}`);
    }

    return evidence;
  }

  /**
   * Search evidence with access control filtering.
   */
  async search(
    filters: EvidenceSearchFilters,
    context: { actorId: string; organizationIds?: string[]; isPlatformAdmin?: boolean },
  ): Promise<EvidenceSearchResult> {
    const result = await this.repository.search(filters);

    const accessible = result.items.filter((evidence) => {
      const decision = canAccessEvidence(evidence, context);
      return decision.allowed;
    });

    return {
      ...result,
      items: accessible,
      total: accessible.length,
    };
  }

  /**
   * Verify hash integrity of stored content.
   * NOTE: This proves integrity at time of verification, NOT legal proof.
   */
  async verifyHash(id: string): Promise<HashVerifyResult> {
    const evidence = await this.repository.getById(id);
    if (!evidence) throw new Error(`Evidence ${id} not found`);

    const content = await this.storage.retrieve(evidence.file.storagePath);
    if (!content) {
      return {
        valid: false,
        expectedHash: evidence.hash,
        actualHash: "CONTENT_NOT_FOUND",
      };
    }

    const actualHash = sha256HexSync(content);
    return {
      valid: actualHash === evidence.hash,
      expectedHash: evidence.hash,
      actualHash,
    };
  }

  /**
   * Update evidence metadata. Access control must be checked by the caller.
   */
  async updateMetadata(
    id: string,
    actorId: string,
    patch: Partial<EvidenceMetadata>,
  ): Promise<Evidence> {
    const existing = await this.repository.getById(id);
    if (!existing) throw new Error(`Evidence ${id} not found`);

    if (existing.ownerId !== actorId) {
      throw new Error("Only the evidence owner can update metadata");
    }

    const updatedMetadata: EvidenceMetadata = {
      ...existing.metadata,
      ...patch,
      custom: { ...existing.metadata.custom, ...(patch.custom ?? {}) },
    };

    return this.repository.update(id, {
      metadata: updatedMetadata,
      updatedAt: this.now(),
    });
  }

  /**
   * Change evidence visibility. Access control must be checked by the caller.
   */
  async changeVisibility(
    id: string,
    actorId: string,
    visibility: EvidenceVisibility,
    authorizedViewers?: string[],
  ): Promise<Evidence> {
    const existing = await this.repository.getById(id);
    if (!existing) throw new Error(`Evidence ${id} not found`);

    if (existing.ownerId !== actorId) {
      throw new Error("Only the evidence owner can change visibility");
    }

    return this.repository.update(id, {
      visibility,
      authorizedViewers: authorizedViewers ?? existing.authorizedViewers,
      updatedAt: this.now(),
    });
  }

  /**
   * Soft-delete or hard-delete evidence.
   * Hard delete only for owners. Soft delete sets status to DELETED.
   */
  async delete(id: string, actorId: string, permanent = false): Promise<void> {
    const existing = await this.repository.getById(id);
    if (!existing) throw new Error(`Evidence ${id} not found`);

    if (existing.ownerId !== actorId) {
      throw new Error("Only the evidence owner can delete evidence");
    }

    if (existing.retention.legalHold) {
      throw new Error("Cannot delete evidence under legal hold");
    }

    if (permanent) {
      await this.storage.delete(existing.file.storagePath);
      await this.repository.delete(id);
    } else {
      await this.repository.update(id, {
        status: "DELETED",
        deletedAt: this.now(),
        updatedAt: this.now(),
      });
    }
  }

  private validateUploadInput(input: UploadEvidenceInput): void {
    if (!input.title || input.title.trim().length === 0) {
      throw new Error("Evidence title is required");
    }
    if (!input.ownerId) {
      throw new Error("Evidence owner is required");
    }
    if (!input.file || !input.file.buffer || input.file.buffer.byteLength === 0) {
      throw new Error("Evidence file content is required");
    }
    if (input.file.sizeBytes > this.maxSizeBytes) {
      throw new Error(`File size exceeds limit of ${this.maxSizeBytes} bytes`);
    }
    if (!this.allowedMimeTypes.includes(input.file.mimeType)) {
      throw new Error(`MIME type ${input.file.mimeType} is not allowed`);
    }
    const hash = sha256HexSync(input.file.buffer);
    if (hash.length !== 64) {
      throw new Error("Failed to compute SHA-256 hash");
    }
  }

  private buildMetadata(partial?: Partial<EvidenceMetadata>): EvidenceMetadata {
    return {
      device: partial?.device,
      location: partial?.location,
      camera: partial?.camera,
      exif: partial?.exif,
      ocrText: partial?.ocrText,
      classification: partial?.classification,
      custom: partial?.custom ?? {},
    };
  }
}
