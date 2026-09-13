"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import {
  buildReputationMetrics,
  hasPermission,
  type ReputationReviewInput,
} from "@rpg/core";
import { loadReputationReviews } from "@/lib/reputation/tenant";

function monthOf(value: string): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function getReputationMetricsAction() {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: "UNAUTHENTICATED", data: null };
  if (!hasPermission(ctx.permissions, "reputation.view")) return { ok: false, error: "FORBIDDEN", data: null };

  const reputationCtx = {
    userId: ctx.user.id,
    companyId: null,
    organizationId: ctx.organization?.id ?? null,
    permissions: ctx.permissions,
  };
  const reviews = await loadReputationReviews(reputationCtx);
  const metrics = buildReputationMetrics(reviews);

  const visible = reviews.filter(
    (r) => r.status !== "DRAFT" && r.status !== "REJECTED" && r.moderation === "APPROVED",
  );
  const byTarget = new Map<
    string,
    { label: string; avg: number; count: number; complaints: number }
  >();
  for (const r of visible) {
    const label = r.targetLabel ?? r.authorName ?? r.targetType;
    const cur = byTarget.get(label) ?? { label, avg: 0, count: 0, complaints: 0 };
    if (r.rating !== null && r.rating !== undefined) {
      cur.avg = (cur.avg * cur.count + r.rating) / (cur.count + 1);
    }
    cur.count += 1;
    if (r.entryType === "COMPLAINT") cur.complaints += 1;
    byTarget.set(label, cur);
  }

  const supabase = createAdminClient();
  const period = monthOf(new Date().toISOString());
  const orgId = ctx.organization?.id ?? null;

  // Snapshot mensal (best-effort; guarda histórico para o gráfico).
  try {
    if (orgId) {
      await supabase
        .from("reputation_scores")
        .delete()
        .eq("organization_id", orgId)
        .eq("period", period)
        .is("subject_type", null);
      await supabase.from("reputation_scores").insert({
        organization_id: orgId,
        company_id: null,
        subject_type: null,
        subject_id: null,
        period,
        avg_rating: metrics.globalRating,
        review_count: metrics.reviewCount,
        complaint_count: metrics.complaintsOpen,
        praise_count: metrics.praises,
        recommendation_count: metrics.recommendations,
        resolution_rate: metrics.resolutionRate,
        avg_response_hours: metrics.avgResponseHours,
        distribution: metrics.starDistribution,
      });
    }
  } catch {
    // Snapshot não bloqueia a página.
  }

  const { data: scoreRows } = orgId
    ? await supabase
        .from("reputation_scores")
        .select("*")
        .eq("organization_id", orgId)
        .is("subject_type", null)
        .order("period", { ascending: true })
    : { data: [] };

  return {
    ok: true,
    data: {
      metrics,
      byTarget: Array.from(byTarget.values()).sort((a, b) => b.avg - a.avg || b.count - a.count),
      history: ((scoreRows as Record<string, unknown>[] | null) ?? []).map((r) => ({
        period: String(r.period),
        avgRating: r.avg_rating ? Number(r.avg_rating) : null,
        reviewCount: Number(r.review_count ?? 0),
        resolutionRate: r.resolution_rate ? Number(r.resolution_rate) : null,
      })),
      reviews: reviews as ReputationReviewInput[],
    },
  };
}