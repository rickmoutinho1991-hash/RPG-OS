"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import { startApproval, resolveCompanyReviewer } from "@/lib/workflows";
import { recordAuditEvent } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export interface DocumentItem {
  id: string;
  category: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: string;
  ownerName: string;
  ownerEmail: string;
  fileUrl?: string;
  issuedAt?: string;
  expiresAt?: string;
  uploadedAt: string;
}

export async function getDocumentsList(params?: {
  status?: string;
  category?: string;
}): Promise<DocumentItem[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  try {
    let query = supabase
      .from("documents")
      .select(`
        id,
        type,
        file_name,
        size,
        mime_type,
        status,
        issued_at,
        expires_at,
        uploaded_at,
        company_id,
        owner_user_id,
        users(id, email, profiles(name))
      `)
      .order("uploaded_at", { ascending: false });

    if (user.companyId) {
      query = query.or(`company_id.eq.${user.companyId},owner_user_id.eq.${user.id}`);
    } else {
      query = query.eq("owner_user_id", user.id);
    }

    if (params?.status) {
      query = query.eq("status", params.status);
    }
    if (params?.category) {
      query = query.eq("type", params.category);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((d: any) => {
      const profile = d.users?.profiles;
      const name = Array.isArray(profile) ? profile[0]?.name : profile?.name;

      return {
        id: d.id,
        category: d.type,
        fileName: d.file_name,
        fileSize: Number(d.size),
        mimeType: d.mime_type,
        status: d.status,
        ownerName: name || "Utilizador",
        ownerEmail: d.users?.email || "Sem email",
        issuedAt: d.issued_at,
        expiresAt: d.expires_at,
        uploadedAt: d.uploaded_at,
      };
    });
  } catch {
    return [];
  }
}

export async function createDocumentAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sessão não iniciada. Inicie sessão para carregar documentos." };
  }

  const supabase = createAdminClient();

  const userEmail = String(formData.get("user_email") ?? "").trim().toLowerCase();
  const documentType = String(formData.get("type") ?? "IDENTITY_CARD").trim();
  const fileInput = formData.get("file") as File | null;
  const fileNameManual = String(formData.get("file_name") ?? "").trim();
  const issuedAt = String(formData.get("issued_at") ?? "").trim() || null;
  const expiresAt = String(formData.get("expires_at") ?? "").trim() || null;

  const fileName = fileInput && fileInput.name ? fileInput.name : (fileNameManual || "documento.pdf");
  const mimeType = fileInput && fileInput.type ? fileInput.type : (fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  const fileSize = fileInput && fileInput.size > 0 ? fileInput.size : (1024 * 1024 * 2);

  try {
    let resolvedOwnerId = user.id;

    if (userEmail && userEmail !== user.email.toLowerCase()) {
      const { data: targetUser } = await supabase
        .from("users")
        .select("id")
        .eq("email", userEmail)
        .maybeSingle();

      if (targetUser) {
        resolvedOwnerId = targetUser.id;
      }
    }

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        owner_user_id: resolvedOwnerId,
        company_id: user.companyId || null,
        type: documentType,
        file_name: fileName,
        mime_type: mimeType,
        size: fileSize,
        issued_at: issuedAt,
        expires_at: expiresAt,
        status: "PENDING",
      })
      .select("id")
      .single();

    if (docError || !doc) {
      return { success: false, error: docError?.message || "Erro ao registar documento." };
    }

    if (fileInput && fileInput.size > 0) {
      const fileBytes = await fileInput.arrayBuffer();
      const storagePath = `${doc.id}_${fileName}`;
      await supabase.storage
        .from("documents")
        .upload(storagePath, fileBytes, {
          contentType: mimeType,
          upsert: true,
        });
    }

    // AUDIT → SANITIZE → AUDIT LOG → INTEGRITY HASH (lib/audit)
    await recordAuditEvent({
      userId: user.id,
      companyId: user.companyId || null,
      action: "DOCUMENT_UPLOADED",
      module: "DOCUMENTS",
      entityType: "DOCUMENT",
      entityId: doc.id,
      metadata: { fileName, type: documentType, ownerId: resolvedOwnerId },
    });

    revalidatePath("/documentos");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro no carregamento.",
    };
  }
}

export async function verifyDocumentAction(
  documentId: string,
  newStatus: "VERIFIED" | "REJECTED",
  rejectionReason?: string,
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { success: false, error: "Sessão não iniciada." };
  }

  const supabase = createAdminClient();

  try {
    const { error } = await supabase
      .from("documents")
      .update({ status: newStatus })
      .eq("id", documentId);

    if (error) return { success: false, error: error.message };

    await supabase.from("document_verifications").insert({
      document_id: documentId,
      status: newStatus,
      rejection_reason: rejectionReason || null,
      verified_by: currentUser.id,
      verified_at: new Date().toISOString(),
    });

    // AUDIT → SANITIZE → AUDIT LOG → INTEGRITY HASH (lib/audit)
    await recordAuditEvent({
      userId: currentUser.id,
      companyId: currentUser.companyId || null,
      action: "DOCUMENT_VERIFIED",
      module: "DOCUMENTS",
      entityType: "DOCUMENT",
      entityId: documentId,
      metadata: { status: newStatus, rejectionReason },
    });

    revalidatePath("/documentos");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao atualizar estado." };
  }
}
export async function submitDocumentForApprovalAction(
  documentId: string,
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { success: false, error: "Sessão não iniciada." };
  }

  const supabase = createAdminClient();

  try {
    const { data: doc } = await supabase
      .from("documents")
      .select("id, owner_user_id, company_id, file_name, status")
      .eq("id", documentId)
      .maybeSingle();

    if (!doc) return { success: false, error: "Documento não encontrado." };
    if (doc.status !== "PENDING") {
      return { success: false, error: "Só documentos pendentes podem ser submetidos." };
    }

    // Tenant isolation: o documento tem de pertencer à empresa do utilizador.
    if (
      doc.owner_user_id !== currentUser.id &&
      (!doc.company_id || doc.company_id !== currentUser.companyId)
    ) {
      return { success: false, error: "Sem acesso a este documento." };
    }

    // Aprovador organizacional por defeito: um gestor/administrador da empresa
    // (a organização de plataforma pode não existir ainda para documentos legados).
    const approverId = doc.company_id
      ? await resolveCompanyReviewer(doc.company_id)
      : null;

    return await startApproval({
      title: `Verificação de documento: ${doc.file_name}`,
      summary: "Documento submetido no fluxo de verificação documental.",
      entityType: "DOCUMENT",
      entityId: doc.id,
      organizationId: doc.company_id ?? null,
      requestedBy: currentUser.id,
      approverId,
      metadata: { fileName: doc.file_name },
    });
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao submeter o documento.",
    };
  }
}
