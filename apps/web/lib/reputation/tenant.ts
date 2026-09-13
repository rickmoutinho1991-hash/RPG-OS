import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import {
  hasPermission,
  buildReputationOverview,
  askReputationAssistant,
  type ReputationReviewInput,
} from "@rpg/core";

// ---------------------------------------------------------------------------
// Camada segura do Centro de Reputação, Avaliações e Reclamações.
// O tenant (organização da sessão) é SEMPRE resolvido no servidor — nunca
// confiar em organization_id/company_id vindos do cliente. As leituras usam o
// client admin (server-side) com scope explícito (applyReputationScope) aplicado
// a TODAS as tabelas; as escritas são validadas no núcleo (permissões + estados +
// imutabilidade) e registadas em audit/notifications. RLS + trigger mantidos.
// ---------------------------------------------------------------------------

export interface ReputationTenantContext {
  userId: string;
  companyId: string | null;
  organizationId: string | null;
  permissions: string[];
}

export async function resolveReputationTenant(): Promise<ReputationTenantContext | null> {
  const session = await getSessionContext();
  if (!session) return null;
  return {
    userId: session.user.id,
    companyId: null,
    organizationId: session.organization?.id ?? null,
    permissions: session.permissions,
  };
}

export function applyReputationScope(
  query: any,
  ctx: Pick<ReputationTenantContext, "userId" | "companyId" | "organizationId">,
) {
  const parts: string[] = [];
  if (ctx.organizationId) parts.push(`organization_id.eq.${ctx.organizationId}`);
  if (ctx.companyId) parts.push(`company_id.eq.${ctx.companyId}`);
  parts.push(`author_user_id.eq.${ctx.userId}`);
  return query.or(parts.join(","));
}

function toReputationReviewInput(row: Record<string, unknown>): ReputationReviewInput {
  return {
    id: String(row.id),
    authorUserId: String(row.author_user_id),
    authorName: row.author_name ? String(row.author_name) : null,
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

/** Carrega as avaliações/de reclamações no scope do tenant (ou devolve [] sem permissão de vista). */
export async function loadReputationReviews(
  ctx: ReputationTenantContext,
  options?: { includeDrafts?: boolean },
): Promise<ReputationReviewInput[]> {
  if (!hasPermission(ctx.permissions, "reputation.view")) return [];

  const supabase = createAdminClient();
  const base = supabase
    .from("reputation_reviews")
    .select("*")
    .order("created_at", { ascending: false });
  const scoped = applyReputationScope(base, ctx);
  const finalized = options?.includeDrafts ? scoped : scoped.neq("status", "DRAFT");

  const { data, error } = await finalized;
  if (error) {
    console.error("[Reputação] Erro ao carregar avaliações:", error.message);
    return [];
  }
  const rows = (data ?? []) as Record<string, unknown>[];

  // Nomes dos autores (para as respostas do assistente e listagens).
  const authorIds = Array.from(new Set(rows.map((r) => String(r.author_user_id))));
  const authorNames = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name")
      .in("user_id", authorIds);
    for (const p of (profiles ?? []) as Record<string, unknown>[]) {
      if (p.name) authorNames.set(String(p.user_id), String(p.name));
    }
  }

  return rows
    .map((r) => {
      const mapped = toReputationReviewInput(r);
      const name = authorNames.get(mapped.authorUserId);
      if (name) mapped.authorName = name;
      return mapped;
    })
    .filter((r) => (options?.includeDrafts ? true : r.status !== "DRAFT"));
}

export interface ReputationOverviewResult {
  overview: {
    metrics: ReturnType<typeof buildReputationOverview>["metrics"];
    recent: ReputationReviewInput[];
    activeComplaints: ReputationReviewInput[];
    praise: ReputationReviewInput[];
    recommendations: ReputationReviewInput[];
    all: ReputationReviewInput[];
  } | null;
}

/** Visão geral do Centro de Reputação (server-side, escopada ao tenant da sessão). */
export async function getReputationOverviewForTenant(): Promise<ReputationOverviewResult> {
  const ctx = await resolveReputationTenant();
  if (!ctx) return { overview: null };
  try {
    const reviews = await loadReputationReviews(ctx, { includeDrafts: false });
    const built = buildReputationOverview(reviews);
    return {
      overview: {
        metrics: built.metrics,
        recent: built.recent,
        activeComplaints: built.activeComplaints,
        praise: built.praise,
        recommendations: built.recommendations,
        all: reviews,
      },
    };
  } catch (err) {
    console.error("[Reputação] Erro ao carregar a visão geral:", err);
    return { overview: null };
  }
}

/** Entrada segura do assistente de reputação (usado por /ia e /vida). */
export async function provideReputationAssistantAnswer(
  question: string,
): Promise<{ answer: string; intent: string }> {
  const ctx = await resolveReputationTenant();
  if (!ctx) {
    return { answer: "Inicia sessão para consultar a tua reputação.", intent: "UNAUTHENTICATED" };
  }
  try {
    const reviews = await loadReputationReviews(ctx);
    const res = askReputationAssistant(question, { reviews });
    return { answer: res.answer, intent: res.intent };
  } catch (err) {
    console.error("[Reputação] Erro no assistente:", err);
    return { answer: "Ocorreu um erro ao consultar os dados de reputação. Tenta novamente.", intent: "ERROR" };
  }
}