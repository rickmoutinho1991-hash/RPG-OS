"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { getCurrentUser } from "@/lib/supabase/auth";
import { recordAuditEvent } from "@/lib/audit";
import { hasPermission, isValidPortugueseNif } from "@rpg/core";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// AT connections — registo administrativo (SEM conectividade, SEM segredos).
// - Leitura/criação: fiscal.manage; revogação: fiscal.admin.
// - Company e NIF derivam sempre do perfil/empresa server-side.
// - Consentimento government_consents (provider AT) criado junto.
// - Nenhum valor secreto é aceite nem devolvido aqui (só D4 os manipulará).
// ---------------------------------------------------------------------------

export type AtEnvironment = "TEST" | "PRODUCTION";

export interface AtConnectionView {
  id: string;
  nif: string;
  environment: AtEnvironment;
  status: string;
  consent_id: string | null;
  cert_expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
  /** Kinds com referência Vault associada (metadata; nunca valores). */
  refsConfigured: Array<
    "wfaUsername" | "wfaPassword" | "certificate" | "privateKey" | "chain"
  >;
}

async function authorizedActor(requiredPermission: "fiscal.manage" | "fiscal.admin") {
  const session = await getSessionContext();
  if (!session) return { ok: false as const, error: "UNAUTHENTICATED" as const };
  if (!hasPermission(session.permissions, requiredPermission)) {
    return { ok: false as const, error: "FORBIDDEN" as const };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "UNAUTHENTICATED" as const };
  return { ok: true as const, session, user };
}

async function actorCompany() {
  const auth = await authorizedActor("fiscal.manage");
  if (!auth.ok || !auth.user.companyId) return { auth, company: null as null | { id: string; legal_name: string; tax_number: string } };
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("companies")
    .select("id,legal_name,tax_number")
    .eq("id", auth.user.companyId)
    .maybeSingle();
  if (!data || !isValidPortugueseNif(String(data.tax_number ?? ""))) return { auth, company: null };
  return {
    auth,
    company: { id: String(data.id), legal_name: String(data.legal_name), tax_number: String(data.tax_number) },
  };
}

/** Lista conexões da empresa do actor (metadata, sem segredos). */
export async function listAtConnections(): Promise<AtConnectionView[]> {
  const { auth, company } = await actorCompany();
  if (!auth.ok || !company) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("at_connections")
    .select("id,nif,environment,status,consent_id,cert_not_after,created_at,revoked_at,wfa_user_secret_ref,wfa_pass_secret_ref,cert_secret_ref,key_secret_ref,chain_secret_ref")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    nif: String(r.nif),
    environment: String(r.environment) as AtEnvironment,
    status: String(r.status),
    consent_id: r.consent_id ? String(r.consent_id) : null,
    cert_expires_at: r.cert_not_after ? String(r.cert_not_after) : null,
    created_at: String(r.created_at),
    revoked_at: r.revoked_at ? String(r.revoked_at) : null,
    refsConfigured: (
      [
        ["wfaUsername", r.wfa_user_secret_ref],
        ["wfaPassword", r.wfa_pass_secret_ref],
        ["certificate", r.cert_secret_ref],
        ["privateKey", r.key_secret_ref],
        ["chain", r.chain_secret_ref],
      ] as const
    )
      .filter(([, v]) => !!v)
      .map(([k]) => k),
  }));
}

export interface AtConnectionResult {
  ok: boolean;
  error?: string;
  connectionId?: string;
}

/**
 * Cria registo de conexão (NOT_CONNECTED) + consentimento explícito.
 * NIF = tax_number da empresa (server-side). Idempotente por UNIQUE.
 */
export async function createAtConnection(environment: AtEnvironment): Promise<AtConnectionResult> {
  const { auth, company } = await actorCompany();
  if (!auth.ok) return auth;
  if (environment !== "TEST" && environment !== "PRODUCTION") {
    return { ok: false, error: "INVALID_ENVIRONMENT" };
  }
  if (!company) return { ok: false, error: "NO_COMPANY" };
  const orgId = auth.session.organization?.id ?? null;
  if (!orgId) return { ok: false, error: "NO_ORGANIZATION" };

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("at_connections")
    .select("id,status")
    .eq("company_id", company.id)
    .eq("environment", environment)
    .maybeSingle();
  if (existing) return { ok: true, connectionId: String((existing as Record<string, unknown>).id) };

  const { data: consent, error: consentError } = await supabase
    .from("government_consents")
    .insert({
      organization_id: orgId,
      user_id: auth.user.id,
      provider_id: "AT",
      scopes: ["at.documents.submit", "at.documents.query"],
      source: "user",
      audit_metadata: { purpose: "at_connection_setup", environment },
    })
    .select("id")
    .single();
  if (consentError) throw consentError;

  const { data: inserted, error } = await supabase
    .from("at_connections")
    .insert({
      company_id: company.id,
      nif: company.tax_number,
      environment,
      status: "NOT_CONNECTED",
      consent_id: String((consent as Record<string, unknown>).id),
      created_by: auth.user.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  await recordAuditEvent({
    userId: auth.user.id,
    companyId: company.id,
    organizationId: orgId,
    action: "at.connection.created",
    module: "FISCAL",
    entityType: "AT_CONNECTION",
    entityId: String((inserted as Record<string, unknown>).id),
    metadata: { environment },
  });
  revalidatePath("/administracao/at");
  return { ok: true, connectionId: String((inserted as Record<string, unknown>).id) };
}

/** Revoga conexão (fiscal.admin). Segredos (quando existirem) seguem política própria. */
export async function revokeAtConnection(connectionId: string): Promise<AtConnectionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };
  if (!hasPermission(session.permissions, "fiscal.admin")) {
    return { ok: false, error: "FORBIDDEN" };
  }
  const user = await getCurrentUser();
  if (!user?.companyId) return { ok: false, error: "FORBIDDEN" };

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("at_connections")
    .select("id,company_id,organization_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (!row) return { ok: false, error: "NOT_FOUND" };
  if (String((row as Record<string, unknown>).company_id) !== user.companyId) {
    return { ok: false, error: "FORBIDDEN" };
  }
  const { error } = await supabase
    .from("at_connections")
    .update({ status: "REVOKED", updated_at: new Date().toISOString() })
    .eq("id", connectionId);
  if (error) throw error;
  await recordAuditEvent({
    userId: user.id,
    companyId: user.companyId,
    organizationId: null,
    action: "at.connection.revoked",
    module: "FISCAL",
    entityType: "AT_CONNECTION",
    entityId: connectionId,
    metadata: {},
  });
  revalidatePath("/administracao/at");
  return { ok: true, connectionId };
}
