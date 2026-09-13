"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { getCurrentUser } from "@/lib/supabase/auth";
import { recordAuditEvent } from "@/lib/audit";
import { hasPermission, decideCompanyOrgLink } from "@rpg/core";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Company <-> Organization: vínculo formal e auditável.
// - Auth + fiscal.admin server-side (operação administrativa de alto impacto).
// - organization_id SEMPRE de memberships ACTIVE da sessão (nunca do client
//   como autoridade; o client envia intenção, o server valida).
// - company_id SEMPRE do perfil do actor (profiles.company_id); qualquer
//   outro valor é rejeitado — sem matching NIF/nome/email/UUID.
// - Sem INSERT automático, sem backfill, sem heurística.
// ---------------------------------------------------------------------------

export interface CompanyLinkRow {
  id: string;
  company_id: string;
  organization_id: string;
  organization_name: string | null;
  company_name: string | null;
  company_tax_number: string | null;
  status: "ACTIVE" | "REVOKED";
  created_at: string;
  revoked_at: string | null;
}

export interface ActorCompany {
  id: string;
  legal_name: string;
  tax_number: string;
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

/** Empresa do actor (única origem legítima de company_id). */
export async function getActorCompany(): Promise<ActorCompany | null> {
  const auth = await authorizedActor();
  if (!auth.ok || !auth.user.companyId) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("companies")
    .select("id,legal_name,tax_number")
    .eq("id", auth.user.companyId)
    .maybeSingle();
  if (!data) return null;
  return { id: String(data.id), legal_name: String(data.legal_name), tax_number: String(data.tax_number) };
}

/** Lista vínculos das organizações da sessão (sem expor outras orgs). */
export async function listCompanyLinks(): Promise<CompanyLinkRow[]> {
  const auth = await authorizedActor();
  if (!auth.ok) return [];
  const orgIds = sessionOrgIds(auth.session);
  if (orgIds.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("company_organizations")
    .select(
      "id,company_id,organization_id,status,created_at,revoked_at," +
        "organizations(name),companies(legal_name,tax_number)",
    )
    .in("organization_id", orgIds)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => {
    const org = r.organizations as { name?: string } | null;
    const comp = r.companies as { legal_name?: string; tax_number?: string } | null;
    return {
      id: String(r.id),
      company_id: String(r.company_id),
      organization_id: String(r.organization_id),
      organization_name: org?.name ?? null,
      company_name: comp?.legal_name ?? null,
      company_tax_number: comp?.tax_number ?? null,
      status: String(r.status) as "ACTIVE" | "REVOKED",
      created_at: String(r.created_at),
      revoked_at: r.revoked_at ? String(r.revoked_at) : null,
    };
  });
}

export interface LinkResult {
  ok: boolean;
  error?: string;
  linkId?: string;
  reactivated?: boolean;
}

/**
 * Cria (ou reativa) vínculo Company <-> Organization.
 * companyId TEM de ser a empresa do perfil do actor; organizationId TEM de
 * ser uma org com membership ACTIVE do actor. created_by/confirmed_by derivam
 * da sessão — valores do client são ignorados.
 */
export async function linkCompanyOrganization(
  companyId: string,
  organizationId: string,
): Promise<LinkResult> {
  const auth = await authorizedActor();
  if (!auth.ok) return auth;
  const supabase = createAdminClient();
  // Existência das entidades (NOT_FOUND honesto, antes da decisão).
  const [{ data: company }, { data: org }] = await Promise.all([
    supabase.from("companies").select("id").eq("id", companyId).maybeSingle(),
    supabase.from("organizations").select("id").eq("id", organizationId).maybeSingle(),
  ]);
  if (!company || !org) return { ok: false, error: "NOT_FOUND" };
  const { data: existing } = await supabase
    .from("company_organizations")
    .select("id,status")
    .eq("company_id", companyId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  // Decisão pura (testada): org ∈ memberships AND company == perfil.
  // Client envia intenção; autoridade vem da sessão.
  const decision = decideCompanyOrgLink({
    actorCompanyId: auth.user.companyId ?? null,
    requestedCompanyId: companyId,
    memberOrgIds: sessionOrgIds(auth.session),
    requestedOrgId: organizationId,
    existingStatus: existing ? (String(existing.status) as "ACTIVE" | "REVOKED") : null,
  });
  if (!decision.ok) return decision;
  const now = new Date().toISOString();
  if (decision.mode === "noop-active") {
    return { ok: true, linkId: String(existing!.id) };
  }
  if (decision.mode === "reactivate") {
    // REVOKED → reativa a mesma linha (preserva histórico + UNIQUE).
    const { error } = await supabase
      .from("company_organizations")
      .update({
        status: "ACTIVE",
        revoked_at: null,
        revoked_by: null,
        confirmed_at: now,
        confirmed_by: auth.user.id,
        updated_at: now,
      })
      .eq("id", existing!.id)
      .eq("status", "REVOKED");
    if (error) throw error;
    await recordAuditEvent({
      userId: auth.user.id,
      companyId: companyId,
      organizationId,
      action: "company.organization.linked",
      module: "ADMIN",
      entityType: "COMPANY_ORGANIZATION",
      entityId: String(existing!.id),
      metadata: { reactivated: true },
    });
    revalidatePath("/administracao/empresas");
    return { ok: true, linkId: String(existing!.id), reactivated: true };
  }

  const { data: inserted, error } = await supabase
    .from("company_organizations")
    .insert({
      company_id: companyId,
      organization_id: organizationId,
      status: "ACTIVE",
      created_by: auth.user.id,
      confirmed_at: now,
      confirmed_by: auth.user.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  await recordAuditEvent({
    userId: auth.user.id,
    companyId,
    organizationId,
    action: "company.organization.linked",
    module: "ADMIN",
    entityType: "COMPANY_ORGANIZATION",
    entityId: String(inserted.id),
    metadata: {},
  });
  revalidatePath("/administracao/empresas");
  return { ok: true, linkId: String(inserted.id) };
}

/** Revoga vínculo (ACTIVE → REVOKED). Nunca DELETE. */
export async function revokeCompanyLink(linkId: string): Promise<LinkResult> {
  const auth = await authorizedActor();
  if (!auth.ok) return auth;
  if (!linkId) return { ok: false, error: "INVALID_ID" };

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("company_organizations")
    .select("id,company_id,organization_id,status")
    .eq("id", linkId)
    .maybeSingle();
  if (!row) return { ok: false, error: "NOT_FOUND" };
  if (!sessionOrgIds(auth.session).includes(String(row.organization_id))) {
    return { ok: false, error: "FORBIDDEN" };
  }
  if (String(row.status) !== "ACTIVE") return { ok: true, linkId: String(row.id) };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("company_organizations")
    .update({ status: "REVOKED", revoked_at: now, revoked_by: auth.user.id, updated_at: now })
    .eq("id", linkId)
    .eq("status", "ACTIVE");
  if (error) throw error;
  await recordAuditEvent({
    userId: auth.user.id,
    companyId: String(row.company_id),
    organizationId: String(row.organization_id),
    action: "company.organization.revoked",
    module: "ADMIN",
    entityType: "COMPANY_ORGANIZATION",
    entityId: String(row.id),
    metadata: {},
  });
  revalidatePath("/administracao/empresas");
  return { ok: true, linkId: String(row.id) };
}
