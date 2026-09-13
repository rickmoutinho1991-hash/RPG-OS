"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import {
  loadPortalDaQueixaData,
  PortalDaQueixa,
  type PortalReferenceRow,
} from "@/lib/reputation/portal";

export async function getPortalDaQueixaAction() {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: "UNAUTHENTICATED", data: null };
  if (!hasPermission(ctx.permissions, "reputation.view")) {
    return { ok: false, error: "FORBIDDEN", data: null };
  }
  const data = await loadPortalDaQueixaData({
    userId: ctx.user.id,
    companyId: null,
    organizationId: ctx.organization?.id ?? null,
    permissions: ctx.permissions,
  });
  const providerStatus = await PortalDaQueixa.getBrandMetrics();
  return { ok: true, data, providerStatus };
}

export async function savePortalConfigAction(input: { brandName?: string | null; profileUrl?: string | null }) {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.organization?.id) return { ok: false, error: "UNAUTHENTICATED_OR_ORG_REQUIRED" };
  if (!hasPermission(ctx.permissions, "reputation.manage")) return { ok: false, error: "FORBIDDEN" };

  const profileUrl = input.profileUrl?.trim() || null;
  const brandName = input.brandName?.trim() || null;
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("reputation_portal_config")
    .select("id")
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("reputation_portal_config")
      .update({
        brand_name: brandName,
        profile_url: profileUrl,
        status: profileUrl ? "CONFIGURED" : "NOT_CONFIGURED",
      })
      .eq("id", existing.id as string);
  } else {
    await supabase.from("reputation_portal_config").insert({
      organization_id: ctx.organization.id,
      brand_name: brandName,
      profile_url: profileUrl,
      status: profileUrl ? "CONFIGURED" : "NOT_CONFIGURED",
      api_provider: null,
    });
  }
  return { ok: true };
}

export async function addExternalReferenceAction(input: {
  referenceType: PortalReferenceRow["referenceType"];
  externalId?: string | null;
  referenceUrl?: string | null;
  summary?: string | null;
}) {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.organization?.id) return { ok: false, error: "UNAUTHENTICATED_OR_ORG_REQUIRED" };
  if (!hasPermission(ctx.permissions, "reputation.manage")) return { ok: false, error: "FORBIDDEN" };

  await createAdminClient()
    .from("reputation_external_references")
    .insert({
      organization_id: ctx.organization.id,
      reference_type: input.referenceType,
      external_id: input.externalId?.trim() || null,
      reference_url: input.referenceUrl?.trim() || null,
      summary: input.summary?.trim() || null,
    });

  return { ok: true };
}

export async function removeExternalReferenceAction(referenceId: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: "UNAUTHENTICATED" };
  if (!hasPermission(ctx.permissions, "reputation.manage")) return { ok: false, error: "FORBIDDEN" };

  await createAdminClient()
    .from("reputation_external_references")
    .delete()
    .eq("id", referenceId);
  return { ok: true };
}