"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { getCurrentUser } from "@/lib/supabase/auth";
import { recordAuditEvent } from "@/lib/audit";
import { decideInvoiceRouting, hasPermission } from "@rpg/core";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Fiscal routing assignment: destino explícito (organization) de uma invoice.
// - Auth + fiscal.admin server-side. Sem permissão: nada é revelado.
// - company deriva da invoice (server-side); sem company => NO_ROUTE.
// - destino pedido é intenção; autoridade vem de memberships ACTIVE +
//   vínculo company_organizations ACTIVE (decisão pura testada).
// - Sem fan-out, sem primary, sem sessão como destino, sem INSERT no inbox.
// ---------------------------------------------------------------------------

export interface RoutingAssignmentView {
  id: string;
  organization_id: string;
  organization_name: string | null;
  status: "ASSIGNED" | "REVOKED";
  created_at: string;
}

function sessionOrgIds(
  session: NonNullable<Awaited<ReturnType<typeof getSessionContext>>>,
): string[] {
  const ids = new Set<string>();
  if (session.organization?.id) ids.add(session.organization.id);
  for (const o of session.availableOrganizations ?? []) {
    if (o?.id) ids.add(o.id);
  }
  return [...ids];
}

async function authorizedActor() {
  const session = await getSessionContext();
  if (!session) return { ok: false as const, error: "UNAUTHENTICATED" as const };
  if (!hasPermission(session.permissions, "fiscal.admin")) {
    return { ok: false as const, error: "FORBIDDEN" as const };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "UNAUTHENTICATED" as const };
  return { ok: true as const, session, user };
}

async function loadInvoiceCompany(invoiceId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("invoices")
    .select("company_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!data) return null;
  return (data.company_id as string | null) ?? null;
}

/** Assignment ACTIVE atual da invoice (null = UNASSIGNED = NO ROUTE). */
export async function getInvoiceRouting(
  invoiceId: string,
): Promise<RoutingAssignmentView | null> {
  const auth = await authorizedActor();
  if (!auth.ok) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("invoice_routing_assignments")
    .select("id,organization_id,status,created_at,organizations(name)")
    .eq("invoice_id", invoiceId)
    .eq("status", "ASSIGNED")
    .maybeSingle();
  if (!data) return null;
  // Visível só se a org destino for das memberships do actor.
  if (!sessionOrgIds(auth.session).includes(String(data.organization_id))) {
    return null;
  }
  const org = data.organizations as { name?: string } | null;
  return {
    id: String(data.id),
    organization_id: String(data.organization_id),
    organization_name: org?.name ?? null,
    status: "ASSIGNED",
    created_at: String(data.created_at),
  };
}

/** Orgs elegíveis: membership ACTIVE + vínculo ACTIVE com a company da invoice. */
export async function listRoutableOrganizations(
  invoiceId: string,
): Promise<Array<{ id: string; name: string }>> {
  const auth = await authorizedActor();
  if (!auth.ok) return [];
  const companyId = await loadInvoiceCompany(invoiceId);
  if (!companyId) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("company_organizations")
    .select("organization_id,organizations(id,name)")
    .eq("company_id", companyId)
    .eq("status", "ACTIVE");
  const memberIds = new Set(sessionOrgIds(auth.session));
  const out: Array<{ id: string; name: string }> = [];
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const orgId = String(r.organization_id);
    if (!memberIds.has(orgId)) continue;
    const org = r.organizations as { id?: string; name?: string } | null;
    out.push({ id: orgId, name: org?.name ?? orgId });
  }
  return out;
}

export interface RoutingResult {
  ok: boolean;
  error?: string;
  reactivated?: boolean;
}

export async function assignInvoiceRouting(
  invoiceId: string,
  organizationId: string,
): Promise<RoutingResult> {
  const auth = await authorizedActor();
  if (!auth.ok) return auth;
  if (!invoiceId || !organizationId) return { ok: false, error: "INVALID_ID" };

  const supabase = createAdminClient();
  const companyId = await loadInvoiceCompany(invoiceId);
  const [{ data: link }, { data: existing }] = await Promise.all([
    companyId
      ? supabase
          .from("company_organizations")
          .select("id")
          .eq("company_id", companyId)
          .eq("organization_id", organizationId)
          .eq("status", "ACTIVE")
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("invoice_routing_assignments")
      .select("id,status,organization_id")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const activeExisting = ((existing ?? []) as Array<Record<string, unknown>>).find(
    (r) => String(r.status) === "ASSIGNED",
  );
  // Mesmo destino já atribuído => o estado existente relevante é ASSIGNED;
  // destino diferente (ou histórico) => REVOKED/ausente para a decisão.
  const sameOrgActive =
    activeExisting && String(activeExisting.organization_id) === organizationId;
  const decision = decideInvoiceRouting({
    actorCompanyId: auth.user.companyId ?? null,
    invoiceCompanyId: companyId,
    memberOrgIds: sessionOrgIds(auth.session),
    requestedOrgId: organizationId,
    linkActive: Boolean(link),
    existingStatus: sameOrgActive
      ? "ASSIGNED"
      : (((existing ?? []) as Array<Record<string, unknown>>).length > 0 ? "REVOKED" : null),
    action: "assign",
  });
  if (!decision.ok) return decision;

  const now = new Date().toISOString();
  if (decision.mode === "noop-assigned") return { ok: true };
  if (activeExisting && String(activeExisting.organization_id) !== organizationId) {
    // Reassignment: revoga o destino anterior, preserva histórico. Nunca duplica.
    await supabase
      .from("invoice_routing_assignments")
      .update({ status: "REVOKED", revoked_at: now, revoked_by: auth.user.id, updated_at: now })
      .eq("id", String(activeExisting.id))
      .eq("status", "ASSIGNED");
  }
  const { data: inserted, error } = await supabase
    .from("invoice_routing_assignments")
    .insert({
      invoice_id: invoiceId,
      company_id: companyId as string,
      organization_id: organizationId,
      status: "ASSIGNED",
      created_by: auth.user.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  await recordAuditEvent({
    userId: auth.user.id,
    companyId: companyId,
    organizationId,
    action:
      decision.mode === "reassign" ? "routing.reassigned" : "routing.assigned",
    module: "FISCAL",
    entityType: "INVOICE_ROUTING",
    entityId: String(inserted.id),
    metadata: { invoiceId },
  });
  revalidatePath(`/faturacao/${invoiceId}`);
  return { ok: true, reactivated: decision.mode === "reassign" };
}

export async function revokeInvoiceRouting(
  invoiceId: string,
): Promise<RoutingResult> {
  const auth = await authorizedActor();
  if (!auth.ok) return auth;
  if (!invoiceId) return { ok: false, error: "INVALID_ID" };

  const supabase = createAdminClient();
  const companyId = await loadInvoiceCompany(invoiceId);
  const { data: rows } = await supabase
    .from("invoice_routing_assignments")
    .select("id,status,organization_id")
    .eq("invoice_id", invoiceId)
    .eq("status", "ASSIGNED")
    .maybeSingle();
  // Sem assignment: no-op idempotente (nada a revogar).
  if (!rows) return { ok: true };
  const decision = decideInvoiceRouting({
    actorCompanyId: auth.user.companyId ?? null,
    invoiceCompanyId: companyId,
    memberOrgIds: sessionOrgIds(auth.session),
    requestedOrgId: String(rows.organization_id),
    linkActive: true,
    existingStatus: "ASSIGNED",
    action: "revoke",
  });
  if (!decision.ok) return decision;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("invoice_routing_assignments")
    .update({ status: "REVOKED", revoked_at: now, revoked_by: auth.user.id, updated_at: now })
    .eq("id", String((rows as Record<string, unknown>).id))
    .eq("status", "ASSIGNED");
  if (error) throw error;
  await recordAuditEvent({
    userId: auth.user.id,
    companyId,
    organizationId: String((rows as Record<string, unknown>).organization_id),
    action: "routing.revoked",
    module: "FISCAL",
    entityType: "INVOICE_ROUTING",
    entityId: String((rows as Record<string, unknown>).id),
    metadata: { invoiceId },
  });
  revalidatePath(`/faturacao/${invoiceId}`);
  return { ok: true };
}
