/**
 * RPG-OS — Evidence Storage Abstraction
 *
 * Minimal interface for evidence file storage.
 * NOT a provider implementation — just the contract.
 * In production, maps to Supabase storage buckets (documents, project-photos).
 */

export interface StorageReference {
  path: string;
  bucket: string;
  backend: "S3" | "GCS" | "AZURE_BLOB" | "LOCAL" | "IPFS" | "DATABASE";
  sizeBytes: number;
  storedAt: string;
}

export interface StoreFileInput {
  path: string;
  bucket: string;
  content: Uint8Array;
  mimeType: string;
  originalName: string;
}

export interface EvidenceStorageAdapter {
  store(input: StoreFileInput): Promise<StorageReference>;
  retrieve(path: string): Promise<Uint8Array | null>;
  delete(path: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
}

/**
 * In-memory storage for tests. NOT for production.
 */
export class InMemoryEvidenceStorage implements EvidenceStorageAdapter {
  private files = new Map<string, Uint8Array>();

  async store(input: StoreFileInput): Promise<StorageReference> {
    this.files.set(input.path, new Uint8Array(input.content));
    return {
      path: input.path,
      bucket: input.bucket,
      backend: "LOCAL" as const,
      sizeBytes: input.content.byteLength,
      storedAt: new Date().toISOString(),
    };
  }

  async retrieve(path: string): Promise<Uint8Array | null> {
    const content = this.files.get(path);
    return content ? new Uint8Array(content) : null;
  }

  async delete(path: string): Promise<boolean> {
    return this.files.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
}

export const DEFAULT_EVIDENCE_BUCKET = "evidence";

export function generateStoragePath(params: {
  ownerId: string;
  ownerType: string;
  contentHash: string;
  originalName: string;
}): string {
  const hashPrefix = params.contentHash.slice(0, 8);
  const safeName = params.originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${params.ownerType}/${params.ownerId}/${hashPrefix}/${safeName}`;
}
