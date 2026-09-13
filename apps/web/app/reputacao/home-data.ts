import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { getReputationOverviewForTenant } from "@/lib/reputation/tenant";
import { loadPortalDaQueixaData } from "@/lib/reputation/portal";

export interface ReputacaoHomeData {
  overview: NonNullable<Awaited<ReturnType<typeof getReputationOverviewForTenant>>["overview"]> | null;
  portalStatus: string;
  canCreate: boolean;
  canManage: boolean;
  canModerate: boolean;
}

export async function getReputacaoHomeData(): Promise<ReputacaoHomeData> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return { overview: null, portalStatus: "UNAUTHENTICATED", canCreate: false, canManage: false, canModerate: false };
  }
  const canCreate = hasPermission(ctx.permissions, "reputation.create");
  const canManage = hasPermission(ctx.permissions, "reputation.manage");
  const canModerate = hasPermission(ctx.permissions, "reputation.moderate");

  const { overview } = await getReputationOverviewForTenant();
  const portal = ctx.organization?.id ? await loadPortalDaQueixaData({
    userId: ctx.user.id,
    companyId: null,
    organizationId: ctx.organization.id,
    permissions: ctx.permissions,
  }) : null;

  return {
    overview,
    portalStatus: portal?.config?.status ?? "NOT_CONFIGURED",
    canCreate,
    canManage,
    canModerate,
  };
}