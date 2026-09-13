// RPG-OS — Storage seguro de anexos de reputação (FASE 3.1).
// Bucket privado `reputation-attachments` (nunca público): o upload é sempre
// server-side (service_role via createAdminClient) e o download é entregue
// apenas por signed URLs emitidas no servidor após verificação de visibilidade.
// Nunca usamos base64 nem guardamos conteúdo na BD — apenas storage_path.

import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES as ALLOWED_MIME_LIST,
  MAX_ATTACHMENT_SIZE_BYTES,
  REPUTATION_ATTACHMENTS_BUCKET,
} from "@/lib/reputation/constants";

export { MAX_ATTACHMENT_SIZE_BYTES, REPUTATION_ATTACHMENTS_BUCKET };

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set(ALLOWED_MIME_LIST);

const ALLOWED_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

export interface AttachmentFileMeta {
  name?: string | null;
  type?: string | null;
  size?: number | null;
}

export type AttachmentValidation =
  | { ok: true; cleanName: string; extension: string }
  | { ok: false; error: string };

/** Validação server-side (MIME, tamanho, nome saneado contra path traversal). */
export function validateAttachmentFile(file: AttachmentFileMeta): AttachmentValidation {
  const type = String(file.type ?? "").toLowerCase();
  const size = Number(file.size ?? 0);
  const name = String(file.name ?? "").trim();

  if (!type || !ALLOWED_ATTACHMENT_MIME_TYPES.has(type)) {
    return { ok: false, error: "Tipo de ficheiro não permitido (JPG, PNG, WEBP, PDF, TXT, DOC, DOCX)." };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: "Ficheiro vazio." };
  }
  if (size > MAX_ATTACHMENT_SIZE_BYTES) {
    return { ok: false, error: "Ficheiro demasiado grande (máximo 15 MB)." };
  }

  const extension = ALLOWED_EXTENSIONS[type] ?? "";
  const leaf = name.split(/[\\/]/).pop() ?? "anexo";
  const clean = leaf.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return { ok: true, cleanName: clean || "anexo", extension };
}

/** Upload server-side para o bucket privado. Path = {orgId}/{reviewId}/{uuid}{ext}. */
export async function uploadReviewAttachmentToStorage(
  organizationId: string,
  reviewId: string,
  extension: string,
  fileType: string,
  fileData: ArrayBuffer | Uint8Array,
): Promise<{ ok: true; storagePath: string } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const storagePath = `${organizationId}/${reviewId}/${randomUUID()}${extension}`;
  const { error } = await supabase.storage
    .from(REPUTATION_ATTACHMENTS_BUCKET)
    .upload(storagePath, fileData, { contentType: fileType, upsert: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, storagePath };
}

/** Signed URL (1h) para download — emitida apenas quando o requisitante pode ver o review. */
export async function createAttachmentSignedUrl(
  storagePath: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(REPUTATION_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error) return { ok: false, error: error.message };
  return { ok: true, url: data.signedUrl };
}

/** Remove um objeto do bucket (usado na eliminação de rascunhos). */
export async function removeReviewAttachmentFromStorage(storagePath: string): Promise<{ ok: boolean }> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(REPUTATION_ATTACHMENTS_BUCKET).remove([storagePath]);
  if (error) {
    console.error("[Reputação] Erro ao remover anexo do storage:", error.message);
    return { ok: false };
  }
  return { ok: true };
}