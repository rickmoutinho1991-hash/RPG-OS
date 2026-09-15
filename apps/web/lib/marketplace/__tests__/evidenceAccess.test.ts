import { describe, it, expect, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEvidenceDownload } from "@/lib/marketplace/evidence";

vi.mock("@/lib/supabase/admin");

describe("Mercado Evidence - P7c access control", () => {
  it("não-parte descarrega evidência -> acesso negado (deny-closed) (e)", async () => {
    const evidencePayload = {
      id: "ev-1",
      type: "DOCUMENT",
      category: "MILESTONE",
      title: "Evidência",
      ownerId: "provider-1",
      ownerType: "HUMAN",
      relatedEntities: [{ entityType: "MILESTONE", entityId: "milestone-1", relation: "PROVES" }],
      file: {
        originalName: "evidencia-milestone-1234abcd.pdf",
        storedName: "evidencia-milestone-1234abcd.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        storageBackend: "S3",
        storagePath: "HUMAN/provider-1/abcdef/hash.pdf",
        storageBucket: "marketplace-evidence",
      },
      hash: "abc",
      hashAlgorithm: "SHA-256",
      visibility: "PARTIES",
      authorizedViewers: ["client-1"],
      status: "READY",
      tags: [],
      metadata: { custom: {} },
      retention: { policyId: "default", retentionDays: 365, autoDelete: false, legalHold: false },
      auditTrail: [],
      createdAt: "2026-09-15T10:00:00Z",
      updatedAt: "2026-09-15T10:00:00Z",
    };
    const row = {
      id: "ev-1",
      owner_id: "provider-1",
      related_entity_type: "MILESTONE",
      related_entity_id: "milestone-1",
      visibility: "PARTIES",
      authorized_viewers: ["client-1"],
      title: "Evidência",
      category: "MILESTONE",
      type: "DOCUMENT",
      status: "READY",
      hash: "abc",
      hash_algorithm: "SHA-256",
      storage_path: "HUMAN/provider-1/abcdef/hash.pdf",
      storage_bucket: "marketplace-evidence",
      mime_type: "application/pdf",
      size_bytes: 100,
      original_name: "hash.pdf",
      payload: evidencePayload,
      created_at: "2026-09-15T10:00:00Z",
      updated_at: "2026-09-15T10:00:00Z",
      expires_at: null,
      deleted_at: null,
    };

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "evidence") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
              })),
            })),
          };
        }
        return {};
      }),
    };
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const result = await getEvidenceDownload("ev-1", "other-user");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Acesso negado");
    }
  });
});