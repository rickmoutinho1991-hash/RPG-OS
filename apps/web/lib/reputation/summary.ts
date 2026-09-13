// RPG-OS — Servidor: carrega a reputação de um alvo (só dados do tenant da sessão).
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { loadReputationReviews } from "@/lib/reputation/tenant";
import type { ReputationReviewInput } from "@rpg/core";

export type ReputationSubject =
  | { key: "employee"; id: string; label: string }
  | { key: "company"; id: string; label: string }
  | { key: "project"; id: string; label: string }
  | { key: "service"; id: string; label: string }
  | { key: "customer"; id: string; label: string };

export async function loadReputationSummaryForSubject(
  subject: ReputationSubject,
): Promise<ReputationReviewInput[] | null> {
  const ctx = await getSessionContext();
  if (!ctx || !hasPermission(ctx.permissions, "reputation.view")) return null;

  const reputationCtx = {
    userId: ctx.user.id,
    companyId: null,
    organizationId: ctx.organization?.id ?? null,
    permissions: ctx.permissions,
  };
  const reviews = await loadReputationReviews(reputationCtx);
  if (reviews.length === 0) return [];

  const label = subject.label?.trim().toLowerCase();
  return reviews.filter((r) => {
    if (r.status === "DRAFT" || r.status === "REJECTED") return false;
    switch (subject.key) {
      case "employee":
        return r.targetType === "EMPLOYEE" && (r.targetUserId === subject.id || (label && r.targetLabel?.toLowerCase() === label));
      case "company":
        return r.targetType === "COMPANY" && (r.targetCompanyId === subject.id || (label && r.targetLabel?.toLowerCase() === label));
      case "project":
        return r.targetType === "PROJECT" && (r.targetProjectId === subject.id || (label && r.targetLabel?.toLowerCase() === label));
      case "service":
        return r.targetType === "SERVICE" && (r.targetServiceId === subject.id || (label && r.targetLabel?.toLowerCase() === label));
      case "customer":
        return r.targetType === "CUSTOMER" && (r.targetUserId === subject.id || (label && r.targetLabel?.toLowerCase() === label));
      default:
        return false;
    }
  });
}