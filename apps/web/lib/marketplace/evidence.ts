/**
 * RPG-OS — Evidências de Marketplace (P7c).
 *
 * Bridge entre o core EvidenceServiceImpl e o Supabase:
 *  - EvidenceStorageAdapter sobre o bucket privado `marketplace-evidence`
 *    (upload/leitura sempre server-side via service_role);
 *  - EvidenceRepository sobre a tabela `evidence`;
 *  - helpers de upload ligado ao milestone e de acesso para download.
 *
 * Princípios:
 *  - nunca base64 em colunas de texto: o conteúdo fica APENAS no bucket;
 *  - nome do objeto derivado do milestone (nunca do nome original do cliente);
 *  - scoping às duas partes (client/provider) em leitura/download;
 *  - validações fail-closed (MIME + tamanho) antes de qualquer escrita.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  EvidenceServiceImpl,
  type Evidence,
  type EvidenceRepository,
  type EvidenceSearchFilters,
  type EvidenceSearchResult,
  type EvidenceStorageAdapter,
} from "@rpg/core";

export const MARKETPLACE_EVIDENCE_BUCKET = "marketplace-evidence";
export const MAX_EVIDENCE_SIZE_BYTES = 15 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export interface EvidenceFileInput {
  name: string | null;
  type: string | null;
  size: number | null;
  buffer: Uint8Array;
}

export type EvidenceValidation =
  | { ok: true; mimeType: string; extension: string }
  | { ok: false; error: string };

/** Validação fail-closed (MIME + tamanho) — nunca confiar no cliente. */
export function validateEvidenceFile(file: EvidenceFileInput): EvidenceValidation {
  const type = String(file.type ?? "").toLowerCase();
  const size = Number(file.size ?? 0);

  if (!type || !ALLOWED_MIME_TYPES.has(type)) {
    return { ok: false, error: "Tipo de ficheiro não permitido (PDF, JPG, PNG, WEBP)." };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: "Ficheiro vazio." };
  }
  if (size > MAX_EVIDENCE_SIZE_BYTES) {
    return { ok: false, error: "Ficheiro demasiado grande (máximo 15 MB)." };
  }

  const extension = EXTENSION_BY_MIME[type];
  if (!extension) {
    return { ok: false, error: "Tipo de ficheiro não permitido." };
  }
  return { ok: true, mimeType: type, extension };
}

/** Storage adapter sobre o bucket privado (Supabase storage, service_role). */
export class SupabaseEvidenceStorage implements EvidenceStorageAdapter {
  private readonly client = () => createAdminClient();

  async store(input: {
    path: string;
    bucket: string;
    content: Uint8Array;
    mimeType: string;
    originalName: string;
  }): Promise<{
    path: string;
    bucket: string;
    backend: "S3" | "GCS" | "AZURE_BLOB" | "LOCAL" | "IPFS" | "DATABASE";
    sizeBytes: number;
    storedAt: string;
  }> {
    const { error } = await this.client()
      .storage.from(input.bucket)
      .upload(input.path, input.content, {
        contentType: input.mimeType,
        upsert: false,
      });
    if (error) throw new Error(`Evidence storage upload failed: ${error.message}`);
    return {
      path: input.path,
      bucket: input.bucket,
      backend: "S3",
      sizeBytes: input.content.byteLength,
      storedAt: new Date().toISOString(),
    };
  }

  async retrieve(path: string): Promise<Uint8Array | null> {
    const { data, error } = await this.client()
      .storage.from(MARKETPLACE_EVIDENCE_BUCKET)
      .download(path);
    if (error) return null;
    return new Uint8Array(await data.arrayBuffer());
  }

  async delete(path: string): Promise<boolean> {
    const { error } = await this.client()
      .storage.from(MARKETPLACE_EVIDENCE_BUCKET)
      .remove([path]);
    return !error;
  }

  async exists(path: string): Promise<boolean> {
    const content = await this.retrieve(path);
    return content !== null;
  }
}

interface EvidenceRow {
  id: string;
  owner_id: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  visibility: string;
  authorized_viewers: string[];
  title: string;
  category: string;
  type: string;
  status: string;
  hash: string;
  hash_algorithm: string;
  storage_path: string;
  storage_bucket: string;
  mime_type: string;
  size_bytes: number;
  original_name: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  deleted_at: string | null;
}

function rowToEvidence(row: EvidenceRow): Evidence {
  return (row.payload as unknown as Evidence) ?? {
    id: row.id,
    type: row.type as Evidence["type"],
    category: row.category as Evidence["category"],
    title: row.title,
    ownerId: row.owner_id,
    ownerType: "HUMAN",
    relatedEntities: [],
    file: {
      originalName: row.original_name ?? row.storage_path.split("/").pop() ?? row.id,
      storedName: row.storage_path.split("/").pop() ?? row.id,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      storageBackend: "S3",
      storagePath: row.storage_path,
      storageBucket: row.storage_bucket,
    },
    hash: row.hash,
    hashAlgorithm: (row.hash_algorithm as Evidence["hashAlgorithm"]) ?? "SHA-256",
    visibility: row.visibility as Evidence["visibility"],
    authorizedViewers: row.authorized_viewers,
    status: row.status as Evidence["status"],
    tags: [],
    metadata: { custom: {} },
    retention: { policyId: "", retentionDays: 0, autoDelete: false, legalHold: false },
    auditTrail: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
  };
}

/** Repository sobre a tabela `evidence`. */
export class SupabaseEvidenceRepository implements EvidenceRepository {
  private readonly client = () => createAdminClient();

  async save(evidence: Evidence): Promise<void> {
    const { error } = await this.client().from("evidence").upsert({
      id: evidence.id,
      owner_id: evidence.ownerId,
      related_entity_type: evidence.relatedEntities[0]?.entityType ?? null,
      related_entity_id: evidence.relatedEntities[0]?.entityId ?? null,
      visibility: evidence.visibility,
      authorized_viewers: evidence.authorizedViewers,
      title: evidence.title,
      category: evidence.category,
      type: evidence.type,
      status: evidence.status,
      hash: evidence.hash,
      hash_algorithm: evidence.hashAlgorithm,
      storage_path: evidence.file.storagePath,
      storage_bucket: evidence.file.storageBucket ?? MARKETPLACE_EVIDENCE_BUCKET,
      mime_type: evidence.file.mimeType,
      size_bytes: evidence.file.sizeBytes,
      original_name: evidence.file.originalName,
      payload: evidence as unknown as Record<string, unknown>,
      created_at: evidence.createdAt || new Date().toISOString(),
      updated_at: evidence.updatedAt || new Date().toISOString(),
      expires_at: evidence.expiresAt ?? null,
      deleted_at: evidence.deletedAt ?? null,
    });
    if (error) throw new Error(`Evidence repository save failed: ${error.message}`);
  }

  async update(id: string, patch: Partial<Evidence>): Promise<Evidence> {
    const existing = await this.getById(id);
    if (!existing) throw new Error(`Evidence ${id} not found`);
    const merged: Evidence = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    await this.save(merged);
    return merged;
  }

  async getById(id: string): Promise<Evidence | null> {
    const { data, error } = await this.client()
      .from("evidence")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return rowToEvidence(data as EvidenceRow);
  }

  async search(filters: EvidenceSearchFilters): Promise<EvidenceSearchResult> {
    let q = this.client().from("evidence").select("*");
    if (filters.ownerId) q = q.eq("owner_id", filters.ownerId);
    if (filters.type) q = q.eq("type", filters.type);
    if (filters.category) q = q.eq("category", filters.category);
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.visibility) q = q.eq("visibility", filters.visibility);
    if (filters.relatedEntityType && filters.relatedEntityId) {
      q = q.eq("related_entity_type", filters.relatedEntityType);
      q = q.eq("related_entity_id", filters.relatedEntityId);
    }
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) throw new Error(`Evidence search failed: ${error.message}`);
    const items = ((data ?? []) as EvidenceRow[]).map(rowToEvidence);
    return {
      items,
      total: items.length,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? (items.length || 20),
      totalPages: 1,
      facets: { types: [], categories: [], statuses: [], tags: [] },
    };
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await this.client().from("evidence").delete().eq("id", id);
    return !error;
  }
}

export function buildMarketplaceEvidenceService(): EvidenceServiceImpl {
  return new EvidenceServiceImpl({
    storage: new SupabaseEvidenceStorage(),
    repository: new SupabaseEvidenceRepository(),
    bucket: MARKETPLACE_EVIDENCE_BUCKET,
    maxSizeBytes: MAX_EVIDENCE_SIZE_BYTES,
    allowedMimeTypes: [...ALLOWED_MIME_TYPES],
  });
}

export interface UploadMilestoneEvidenceInput {
  milestoneId: string;
  providerId: string;
  partyIds: string[];
  file: EvidenceFileInput;
  milestoneTitle: string;
}

/**
 * Upload server-side de evidência ligada ao milestone.
 * Nome do objeto derivado do milestone — nunca do nome original do cliente.
 */
export async function uploadMilestoneEvidence(
  input: UploadMilestoneEvidenceInput,
): Promise<{ ok: true; evidence: Evidence } | { ok: false; error: string }> {
  const validation = validateEvidenceFile(input.file);
  if (!validation.ok) return { ok: false, error: validation.error };

  const service = buildMarketplaceEvidenceService();
  try {
    const storedName = `evidencia-milestone-${input.milestoneId.slice(0, 8)}${validation.extension}`;
    const result = await service.upload({
      type: "DOCUMENT",
      category: "MILESTONE",
      title: `Evidência de entrega — ${input.milestoneTitle}`,
      actorId: input.providerId,
      ownerId: input.providerId,
      ownerType: "HUMAN",
      file: {
        originalName: storedName,
        mimeType: validation.mimeType,
        sizeBytes: input.file.buffer.byteLength,
        buffer: input.file.buffer,
      },
      relatedEntities: [
        { entityType: "MILESTONE", entityId: input.milestoneId, relation: "PROVES" },
      ],
      visibility: "PARTIES",
      authorizedViewers: input.partyIds,
      tags: ["mercado", "milestone"],
    });
    return { ok: true, evidence: result.evidence };
  } catch (err) {
    console.error("[Evidence] Upload de evidência falhou:", err);
    return { ok: false, error: "Erro ao guardar a evidência." };
  }
}

export interface DowloadableEvidence {
  evidence: Evidence;
  content: Uint8Array;
}

/**
 * Obtém o ficheiro de evidência para download, com autorização server-side.
 * O core (canAccessEvidence) é deny-closed: só o dono ou as partes acessam.
 */
export async function getEvidenceDownload(
  evidenceId: string,
  actorId: string,
): Promise<{ ok: true; file: DowloadableEvidence } | { ok: false; error: string }> {
  const service = buildMarketplaceEvidenceService();
  let evidence: Evidence;
  try {
    const found = await service.getById(evidenceId, { actorId });
    if (!found) return { ok: false, error: "Evidência não encontrada." };
    evidence = found;
  } catch {
    return { ok: false, error: "Acesso negado." };
  }

  const storage = new SupabaseEvidenceStorage();
  const content = await storage.retrieve(evidence.file.storagePath);
  if (!content) return { ok: false, error: "Evidência não encontrada." };

  return { ok: true, file: { evidence, content } };
}