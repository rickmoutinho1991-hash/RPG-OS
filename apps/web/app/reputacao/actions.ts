"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import {
  canDeleteDraft,
  canManageReputation,
  canModerateReputation,
  canRequestDeleteReputation,
  canRespondReputation,
  canTransitionReputation,
  canViewReputationReview,
  hasPermission,
  moderationForSubmission,
  planReputationAutomation,
  validateReputationCreate,
  type ReputationActor,
  type ReputationEntryType,
  type ReputationModeration,
  type ReputationRelationType,
  type ReputationReviewInput,
  type ReputationStatus,
  type ReputationTargetType,
} from "@rpg/core";
import { recordAuditEvent } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import {
  createAttachmentSignedUrl,
  removeReviewAttachmentFromStorage,
  uploadReviewAttachmentToStorage,
  validateAttachmentFile,
} from "@/lib/reputation/storage";

// ---------------------------------------------------------------------------
// Server Actions do Centro de Reputação.
// O tenant é resolvido da sessão (nunca vem do cliente); as escritas validam
// permissões, estados e imutabilidade no núcleo; RLS/trigger mantidos como
// defesa em profundidade. Auditoria + notificações + workflows server-side.
// ---------------------------------------------------------------------------

export interface ReviewCreateInput {
  entryType: ReputationEntryType;
  relationType: ReputationRelationType;
  targetType: ReputationTargetType;
  targetUserId?: string | null;
  targetCompanyId?: string | null;
  targetProjectId?: string | null;
  targetServiceId?: string | null;
  targetLabel?: string | null;
  rating?: number | null;
  score10?: number | null;
  title: string;
  comment?: string | null;
  asDraft?: boolean;
}

function toActor(ctx: { userId: string; permissions: string[] }): ReputationActor {
  return { userId: ctx.userId, permissions: ctx.permissions };
}

function toReviewInput(row: Record<string, unknown>): ReputationReviewInput {
  return {
    id: String(row.id),
    authorUserId: String(row.author_user_id),
    organizationId: row.organization_id ? String(row.organization_id) : null,
    companyId: row.company_id ? String(row.company_id) : null,
    entryType: row.entry_type as ReputationReviewInput["entryType"],
    relationType: row.relation_type as ReputationReviewInput["relationType"],
    targetType: row.target_type as ReputationReviewInput["targetType"],
    targetUserId: row.target_user_id ? String(row.target_user_id) : null,
    targetCompanyId: row.target_company_id ? String(row.target_company_id) : null,
    targetProjectId: row.target_project_id ? String(row.target_project_id) : null,
    targetServiceId: row.target_service_id ? String(row.target_service_id) : null,
    targetLabel: row.target_label ? String(row.target_label) : null,
    rating: row.rating !== null && row.rating !== undefined ? Number(row.rating) : undefined,
    score10: row.score_10 !== null && row.score_10 !== undefined ? Number(row.score_10) : undefined,
    title: String(row.title ?? ""),
    comment: row.comment ? String(row.comment) : null,
    status: row.status as ReputationReviewInput["status"],
    moderation: row.moderation as ReputationReviewInput["moderation"],
    isPublic: row.is_public === true,
    responseDueAt: row.response_due_at ? String(row.response_due_at) : null,
    respondedAt: row.responded_at ? String(row.responded_at) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export interface ActorFlags {
  canRespond: boolean;
  canManage: boolean;
  canModerate: boolean;
  canEditDraft: boolean;
  canRequestDelete: boolean;
}

function computeActorFlags(actor: ReputationActor, review: ReputationReviewInput): ActorFlags {
  return {
    canRespond: canRespondReputation(actor, review),
    canManage: canManageReputation(actor),
    canModerate: canModerateReputation(actor),
    canEditDraft: canDeleteDraft(actor, review),
    canRequestDelete: canRequestDeleteReputation(actor, review),
  };
}

/** Evento na timeline da avaliação (escrita server-side). */
async function addReputationEvent(
  supabase: ReturnType<typeof createAdminClient>,
  review: ReputationReviewInput,
  action: string,
  metadata: Record<string, unknown>,
) {
  await supabase.from("reputation_events").insert({
    review_id: review.id,
    organization_id: review.organizationId,
    company_id: review.companyId,
    action,
    user_id: review.createdBy,
    metadata,
  });
}

/** Responsável de reputação do tenant (primeiro OWNER/CEO/ADMIN/FOUNDER ativo). */
async function resolveResponsibleUser(
  organizationId: string | null,
  excludeUserId: string,
): Promise<string | null> {
  if (!organizationId) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("org_memberships")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .in("role_key", ["OWNER", "FOUNDER", "ADMIN", "CEO"])
    .neq("user_id", excludeUserId)
    .limit(1)
    .maybeSingle();
  return data ? String((data as { user_id: string }).user_id) : null;
}

/** Executa o plano de automação (casos, notificações, tarefas) para uma avaliação submetida. */
async function executeReputationAutomation(
  review: ReputationReviewInput,
  responsibleUserId: string | null,
) {
  const actions = planReputationAutomation(review, {
    responsibleUserId,
    now: new Date().toISOString(),
  });
  const supabase = createAdminClient();
  const notifiedUserIds = new Set<string>();

  for (const action of actions) {
    if (action.type === "CREATE_CASE") {
      await supabase.from("reputation_cases").insert({
        review_id: review.id,
        organization_id: review.organizationId,
        company_id: review.companyId,
        case_type: action.caseType,
        status: action.caseType === "CRITICAL" ? "ESCALATED" : "OPEN",
        assignee_user_id: responsibleUserId,
        notes: action.notes ?? null,
      });
    } else if (action.type === "NOTIFY" && action.recipientUserId) {
      if (action.recipientUserId !== review.authorUserId) notifiedUserIds.add(action.recipientUserId);
      await notifyUser(
        action.recipientUserId,
        action.message ?? "Atualização de reputação",
        { category: review.rating !== null && review.rating !== undefined && review.rating <= 2 ? "URGENT" : "SUCCESS", link: "/reputacao" },
      );
    } else if (action.type === "CREATE_TASK" && action.recipientUserId) {
      await supabase.from("tasks").insert({
        title: action.taskTitle ?? `Resolver reclamação: ${review.title}`,
        status: "TODO",
        priority: "URGENT",
        due_date: action.taskDueAt ?? null,
        assignee_id: action.recipientUserId,
        created_by: review.createdBy,
        organization_id: review.organizationId,
      });
    }
  }

  // Notificações reais adicionais (FASE 3.1) — sem duplicar as do plano:
  //   • nova reclamação → responsável do tenant;
  //   • nova recomendação → responsável do tenant;
  //   • nova avaliação/reclamação que mencione um utilizador (target) → alvo.
  if (responsibleUserId && responsibleUserId !== review.authorUserId) {
    if (review.entryType === "COMPLAINT" && !notifiedUserIds.has(responsibleUserId)) {
      await notifyUser(
        responsibleUserId,
        `Nova reclamação: "${review.title}".`,
        { category: "WARNING", link: `/reputacao/${review.id}` },
      );
    } else if (review.entryType === "RECOMMENDATION" && !notifiedUserIds.has(responsibleUserId)) {
      await notifyUser(
        responsibleUserId,
        `Nova recomendação recebida: "${review.title}".`,
        { category: "SUCCESS", link: `/reputacao/${review.id}` },
      );
    }
  }
  if (review.targetUserId && review.targetUserId !== review.authorUserId) {
    await notifyUser(
      review.targetUserId,
      `Foste mencionado/a numa nova entrada: "${review.title}".`,
      { category: "WARNING", link: `/reputacao/${review.id}` },
    );
  }
}

// ---------------------------------------------------------------------------
// Leituras (com permissões do utilizador aplicadas por lado do servidor)
// ---------------------------------------------------------------------------

export async function getReputationBookAction(entryType: ReputationEntryType) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: "UNAUTHENTICATED", rows: [] };
  if (!hasPermission(ctx.permissions, "reputation.view")) {
    return { ok: false, error: "FORBIDDEN", rows: [] };
  }
  const supabase = createAdminClient();
  const scopeParts = [`author_user_id.eq.${ctx.user.id}`];
  if (ctx.organization?.id) scopeParts.push(`organization_id.eq.${ctx.organization.id}`);
  const q = supabase
    .from("reputation_reviews")
    .select("*")
    .eq("entry_type", entryType)
    .neq("status", "DRAFT")
    .order("created_at", { ascending: false });
  const scoped = scopeParts.length > 1 ? q.or(scopeParts.join(",")) : q;
  const { data, error } = await scoped;
  if (error) return { ok: false, error: error.message, rows: [] };

  const rows = ((data ?? []) as Record<string, unknown>[]).map(toReviewInput);
  const actor = toActor({ userId: ctx.user.id, permissions: ctx.permissions });

  const reviewIds = rows.map((r) => r.id);
  let responses: Array<Record<string, unknown>> = [];
  let comments: Array<Record<string, unknown>> = [];
  if (reviewIds.length > 0) {
    const [respRes, commentRes] = await Promise.all([
      supabase.from("reputation_responses").select("*").in("review_id", reviewIds).order("created_at", { ascending: true }),
      supabase.from("reputation_comments").select("*").in("review_id", reviewIds).order("created_at", { ascending: true }),
    ]);
    responses = (respRes.data ?? []) as Array<Record<string, unknown>>;
    comments = (commentRes.data ?? []) as Array<Record<string, unknown>>;
  }

  const authorIds = Array.from(new Set(rows.map((r) => r.authorUserId)));
  const names = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name")
      .in("user_id", authorIds);
    for (const p of (profiles ?? []) as Record<string, unknown>[]) {
      if (p.name) names.set(String(p.user_id), String(p.name));
    }
  }

  return {
    ok: true,
    rows: rows.map((r) => ({
      review: { ...r, authorName: r.authorName ?? names.get(r.authorUserId) ?? null },
      responses: responses.filter((x) => String(x.review_id) === r.id),
      commentCount: comments.filter((x) => String(x.review_id) === r.id).length,
      flags: computeActorFlags(actor, r),
    })),
  };
}

export async function getReputationDetailAction(reviewId: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: "UNAUTHENTICATED" };
  const supabase = createAdminClient();
  const { data } = await supabase.from("reputation_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (!data) return { ok: false, error: "NOT_FOUND" };
  const review = toReviewInput(data as Record<string, unknown>);
  const actor = toActor({ userId: ctx.user.id, permissions: ctx.permissions });
  const isIncluded =
    review.authorUserId === ctx.user.id ||
    (ctx.organization?.id !== null && ctx.organization?.id !== undefined && review.organizationId === ctx.organization.id);
  if (!isIncluded || !canViewReputationReview(actor, review)) {
    return { ok: false, error: "FORBIDDEN" };
  }

  const [respRes, commentRes, eventRes, attachRes, caseRes] = await Promise.all([
    supabase.from("reputation_responses").select("*").eq("review_id", reviewId).order("created_at", { ascending: true }),
    supabase.from("reputation_comments").select("*").eq("review_id", reviewId).order("created_at", { ascending: true }),
    supabase.from("reputation_events").select("*").eq("review_id", reviewId).order("created_at", { ascending: true }),
    supabase.from("reputation_attachments").select("*").eq("review_id", reviewId).order("created_at", { ascending: true }),
    supabase.from("reputation_cases").select("*").eq("review_id", reviewId).order("opened_at", { ascending: true }),
  ]);

  return {
    ok: true,
    review,
    responses: (respRes.data ?? []) as Record<string, unknown>[],
    comments: (commentRes.data ?? []) as Record<string, unknown>[],
    events: (eventRes.data ?? []) as Record<string, unknown>[],
    attachments: (attachRes.data ?? []) as Record<string, unknown>[],
    cases: (caseRes.data ?? []) as Record<string, unknown>[],
    flags: computeActorFlags(actor, review),
  };
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export async function createReviewAction(input: ReviewCreateInput) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: "UNAUTHENTICATED", reviewId: null };
  if (!hasPermission(ctx.permissions, "reputation.create")) {
    return { ok: false, error: "FORBIDDEN", reviewId: null };
  }

  const candidate = {
    entryType: input.entryType,
    relationType: input.relationType,
    targetType: input.targetType,
    rating: input.rating ?? null,
    score10: input.score10 ?? null,
    title: input.title ?? "",
    comment: input.comment ?? "",
    targetUserId: input.targetUserId ?? null,
    targetCompanyId: input.targetCompanyId ?? null,
    targetProjectId: input.targetProjectId ?? null,
  };
  const validation = validateReputationCreate(candidate);
  if (!validation.ok) {
    return { ok: false, error: validation.errors.join(" "), reviewId: null };
  }

  const reviewer: ReputationReviewInput = {
    id: "pending",
    authorUserId: ctx.user.id,
    organizationId: ctx.organization?.id ?? null,
    companyId: null,
    entryType: input.entryType,
    relationType: input.relationType,
    targetType: input.targetType,
    targetUserId: input.targetUserId ?? null,
    targetCompanyId: input.targetCompanyId ?? null,
    targetProjectId: input.targetProjectId ?? null,
    targetServiceId: input.targetServiceId ?? null,
    targetLabel: input.targetLabel ?? null,
    rating: input.rating ?? null,
    score10: input.score10 ?? null,
    title: String(input.title ?? "").trim(),
    comment: input.comment ?? null,
    status: "DRAFT",
    moderation: "MODERATION_REQUIRED",
    isPublic: false,
    responseDueAt: null,
    respondedAt: null,
    resolvedAt: null,
    createdBy: ctx.user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const content = `${reviewer.title} ${reviewer.comment ?? ""}`;
  const analysis = moderationForSubmission(content);
  const status: ReputationStatus = input.asDraft ? "DRAFT" : "SUBMITTED";

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("reputation_reviews")
    .insert({
      author_user_id: reviewer.authorUserId,
      organization_id: reviewer.organizationId,
      company_id: null,
      entry_type: reviewer.entryType,
      relation_type: reviewer.relationType,
      target_type: reviewer.targetType,
      target_user_id: reviewer.targetUserId,
      target_company_id: reviewer.targetCompanyId,
      target_project_id: reviewer.targetProjectId,
      target_service_id: reviewer.targetServiceId,
      target_label: reviewer.targetLabel,
      rating: reviewer.rating ?? null,
      score_10: reviewer.score10 ?? null,
      title: reviewer.title,
      comment: reviewer.comment,
      status,
      moderation: analysis.moderation,
      created_by: ctx.user.id,
      metadata: analysis.flags.length > 0 ? { moderation_flags: analysis.flags } : {},
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message, reviewId: null };

  const inserted = toReviewInput(data as Record<string, unknown>);

  await addReputationEvent(supabase, inserted, "CREATE", { entry_type: inserted.entryType });
  if (status === "SUBMITTED") {
    await addReputationEvent(supabase, inserted, "SUBMIT", {
      moderation: analysis.moderation,
      flags: analysis.flags,
    });
  }

  await recordAuditEvent({
    userId: ctx.user.id,
    companyId: inserted.companyId,
    organizationId: inserted.organizationId ?? undefined,
    action: status === "DRAFT" ? "reputation.draft_created" : "reputation.created",
    module: "reputation",
    entityType: "reputation_reviews",
    entityId: inserted.id,
    metadata: {
      entryType: inserted.entryType,
      relationType: inserted.relationType,
      moderation: analysis.moderation,
    },
  });

  if (status === "SUBMITTED") {
    const responsible = await resolveResponsibleUser(inserted.organizationId, ctx.user.id);
    await executeReputationAutomation(inserted, responsible);
  }

  return { ok: true, review: inserted, reviewId: inserted.id };
}

// ---------------------------------------------------------------------------
// Respostas, comentários, estado, moderação, anexos e eliminação
// ---------------------------------------------------------------------------

async function loadReviewScoped(reviewId: string): Promise<{
  ctx: NonNullable<Awaited<ReturnType<typeof getSessionContext>>>;
  supabase: ReturnType<typeof createAdminClient>;
  review: ReputationReviewInput;
  actor: ReputationActor;
} | null> {
  const ctx = await getSessionContext();
  if (!ctx) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("reputation_reviews")
    .select("*")
    .eq("id", reviewId)
    .maybeSingle();
  if (!data) return null;
  const review = toReviewInput(data as Record<string, unknown>);
  const inScope =
    review.authorUserId === ctx.user.id ||
    (ctx.organization?.id !== null && ctx.organization?.id !== undefined && review.organizationId === ctx.organization.id);
  if (!inScope) return null;
  return { ctx, supabase, review, actor: toActor({ userId: ctx.user.id, permissions: ctx.permissions }) };
}

export async function respondToReviewAction(reviewId: string, content: string) {
  const loaded = await loadReviewScoped(reviewId);
  if (!loaded) return { ok: false, error: "UNAUTHENTICATED_OR_NOT_FOUND" };
  const { ctx, supabase, review, actor } = loaded;
  if (!canRespondReputation(actor, review)) return { ok: false, error: "FORBIDDEN" };
  const text = content?.trim();
  if (!text || text.length === 0) return { ok: false, error: "CONTEUDO_VAZIO" };

  const official = canManageReputation(actor);
  const { error } = await supabase.from("reputation_responses").insert({
    review_id: review.id,
    organization_id: review.organizationId,
    company_id: review.companyId,
    author_user_id: ctx.user.id,
    official,
    content: text,
  });
  if (error) return { ok: false, error: error.message };

  if (["SUBMITTED", "UNDER_REVIEW", "IN_PROGRESS"].includes(review.status)) {
    await supabase
      .from("reputation_reviews")
      .update({ status: "RESPONDED", responded_at: review.respondedAt ?? new Date().toISOString() })
      .eq("id", review.id);
  }

  await addReputationEvent(supabase, review, "RESPOND", { official });
  await recordAuditEvent({
    userId: ctx.user.id,
    companyId: review.companyId,
    organizationId: review.organizationId ?? undefined,
    action: "reputation.responded",
    module: "reputation",
    entityType: "reputation_reviews",
    entityId: review.id,
  });
  await notifyUser(
    review.authorUserId,
    `Recebeste uma resposta à tua "${review.title}".`,
    { category: "WARNING", link: `/reputacao` },
  );

  return { ok: true };
}

export async function addCommentAction(reviewId: string, content: string) {
  const loaded = await loadReviewScoped(reviewId);
  if (!loaded) return { ok: false, error: "UNAUTHENTICATED_OR_NOT_FOUND" };
  const { ctx, supabase, review, actor } = loaded;
  if (!canViewReputationReview(actor, review)) return { ok: false, error: "FORBIDDEN" };
  const text = content?.trim();
  if (!text || text.length === 0) return { ok: false, error: "CONTEUDO_VAZIO" };

  await supabase.from("reputation_comments").insert({
    review_id: review.id,
    organization_id: review.organizationId,
    company_id: review.companyId,
    author_user_id: ctx.user.id,
    content: text,
  });
  await addReputationEvent(supabase, review, "COMMENT", { author: ctx.user.id });
  return { ok: true };
}

export async function setReviewStatusAction(reviewId: string, status: ReputationStatus) {
  const loaded = await loadReviewScoped(reviewId);
  if (!loaded) return { ok: false, error: "UNAUTHENTICATED_OR_NOT_FOUND" };
  const { ctx, supabase, review, actor } = loaded;

  const transition = canTransitionReputation(review.status, status, actor, review);
  if (!transition.allowed) return { ok: false, error: transition.reason ?? "TRANSICAO_INVALIDA" };

  const patch: Record<string, unknown> = { status };
  if (["RESOLVED", "CLOSED"].includes(status)) patch.resolved_at = new Date().toISOString();
  const { error } = await supabase.from("reputation_reviews").update(patch).eq("id", review.id);
  if (error) return { ok: false, error: error.message };

  await addReputationEvent(supabase, review, "STATUS_CHANGE", { from: review.status, to: status });
  await recordAuditEvent({
    userId: ctx.user.id,
    companyId: review.companyId,
    organizationId: review.organizationId ?? undefined,
    action: "reputation.status_changed",
    module: "reputation",
    entityType: "reputation_reviews",
    entityId: review.id,
    metadata: { from: review.status, to: status },
  });

  if (["RESOLVED", "CLOSED"].includes(status)) {
    await notifyUser(review.authorUserId, `A tua "${review.title}" foi marcada como ${status === "RESOLVED" ? "resolvida" : "fechada"}.`, {
      category: "SUCCESS",
      link: `/reputacao`,
    });
  }

  return { ok: true };
}

export async function moderateReviewAction(reviewId: string, moderation: ReputationModeration) {
  const loaded = await loadReviewScoped(reviewId);
  if (!loaded) return { ok: false, error: "UNAUTHENTICATED_OR_NOT_FOUND" };
  const { ctx, supabase, review, actor } = loaded;
  if (!canModerateReputation(actor)) return { ok: false, error: "FORBIDDEN" };

  await supabase.from("reputation_reviews").update({ moderation }).eq("id", review.id);
  await addReputationEvent(supabase, review, "MODERATE", { moderation });
  await recordAuditEvent({
    userId: ctx.user.id,
    companyId: review.companyId,
    organizationId: review.organizationId ?? undefined,
    action: "reputation.moderated",
    module: "reputation",
    entityType: "reputation_reviews",
    entityId: review.id,
    metadata: { moderation },
  });
  await notifyUser(review.authorUserId, `A tua "${review.title}" foi alvo de moderação (${moderation}).`, {
    category: "WARNING",
    link: `/reputacao`,
  });
  return { ok: true };
}

export async function requestDeleteReviewAction(reviewId: string) {
  const loaded = await loadReviewScoped(reviewId);
  if (!loaded) return { ok: false, error: "UNAUTHENTICATED_OR_NOT_FOUND" };
  const { ctx, supabase, review, actor } = loaded;
  if (!canRequestDeleteReputation(actor, review)) return { ok: false, error: "FORBIDDEN" };

  await addReputationEvent(supabase, review, "DELETE_REQUEST", { requestedBy: ctx.user.id });
  await recordAuditEvent({
    userId: ctx.user.id,
    companyId: review.companyId,
    organizationId: review.organizationId ?? undefined,
    action: "reputation.delete_requested",
    module: "reputation",
    entityType: "reputation_reviews",
    entityId: review.id,
  });
  return { ok: true };
}

export async function deleteDraftAction(reviewId: string) {
  const loaded = await loadReviewScoped(reviewId);
  if (!loaded) return { ok: false, error: "UNAUTHENTICATED_OR_NOT_FOUND" };
  const { ctx, supabase, review, actor } = loaded;
  if (!canDeleteDraft(actor, review)) return { ok: false, error: "FORBIDDEN" };

  const { data: attachments } = await supabase
    .from("reputation_attachments")
    .select("storage_path")
    .eq("review_id", review.id);
  for (const a of (attachments ?? []) as Array<{ storage_path: string | null }>) {
    if (a.storage_path) await removeReviewAttachmentFromStorage(a.storage_path);
  }
  await supabase.from("reputation_attachments").delete().eq("review_id", review.id);

  await supabase.from("reputation_reviews").delete().eq("id", review.id);
  await recordAuditEvent({
    userId: ctx.user.id,
    companyId: review.companyId,
    organizationId: review.organizationId ?? undefined,
    action: "reputation.draft_deleted",
    module: "reputation",
    entityType: "reputation_reviews",
    entityId: review.id,
  });
  return { ok: true };
}

export async function attachReviewFileAction(reviewId: string, file: File) {
  const loaded = await loadReviewScoped(reviewId);
  if (!loaded) return { ok: false, error: "UNAUTHENTICATED_OR_NOT_FOUND" };
  const { ctx, supabase, review, actor } = loaded;
  const isAuthor = review.authorUserId === ctx.user.id;
  if (!isAuthor && !canManageReputation(actor)) return { ok: false, error: "FORBIDDEN" };

  const validation = validateAttachmentFile(file);
  if (!validation.ok) return { ok: false, error: validation.error };

  const fileData = await file.arrayBuffer();
  const uploaded = await uploadReviewAttachmentToStorage(
    review.organizationId ?? "no-org",
    review.id,
    validation.extension,
    file.type,
    fileData,
  );
  if (!uploaded.ok) return { ok: false, error: uploaded.error };

  const analysis = moderationForSubmission(`anexo: ${validation.cleanName} ${file.type}`);
  const { error } = await supabase.from("reputation_attachments").insert({
    review_id: review.id,
    organization_id: review.organizationId,
    company_id: review.companyId,
    upload_name: validation.cleanName,
    storage_path: uploaded.storagePath,
    mime_type: file.type,
    size_bytes: file.size,
    is_suspicious: analysis.flags.includes("SUSPICIOUS_ATTACHMENT"),
    created_by: ctx.user.id,
  });
  if (error) {
    await removeReviewAttachmentFromStorage(uploaded.storagePath);
    return { ok: false, error: error.message };
  }
  await addReputationEvent(supabase, review, "ATTACH", { uploadName: validation.cleanName });
  return { ok: true, name: validation.cleanName };
}

export async function getAttachmentSignedUrlAction(attachmentId: string) {
  const supabase = createAdminClient();
  const { data: att } = await supabase
    .from("reputation_attachments")
    .select("id, review_id, storage_path, upload_name")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!att || !att.storage_path) return { ok: false, error: "NOT_FOUND", url: null };

  const loaded = await loadReviewScoped(String((att as { review_id: string }).review_id));
  if (!loaded) return { ok: false, error: "FORBIDDEN", url: null };
  if (!canViewReputationReview(loaded.actor, loaded.review)) return { ok: false, error: "FORBIDDEN", url: null };

  const signed = await createAttachmentSignedUrl(String((att as { storage_path: string }).storage_path));
  if (!signed.ok) return { ok: false, error: signed.error, url: null };
  return { ok: true, url: signed.url, name: String((att as { upload_name: string }).upload_name) };
}