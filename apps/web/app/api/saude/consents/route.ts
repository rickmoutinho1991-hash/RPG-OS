import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { HealthProviderId, HealthConsentScope } from "@rpg/core";

export async function POST(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (!hasPermission(ctx.permissions, "health.manage")) {
    return NextResponse.json({ error: "Sem permissão para gerir consentimentos" }, { status: 403 });
  }

  const body = await request.json();
  const { provider_id, scopes, expires_at, source } = body;

  if (!provider_id || !scopes || !Array.isArray(scopes)) {
    return NextResponse.json({ error: "Dados inválidos: provider_id e scopes são obrigatórios" }, { status: 400 });
  }

  const validProviders: HealthProviderId[] = ["SNS24", "SPMS", "SNS"];
  if (!validProviders.includes(provider_id)) {
    return NextResponse.json({ error: "Provider inválido" }, { status: 400 });
  }

  const validScopes: HealthConsentScope[] = [
    "health.read.profile",
    "health.read.prescriptions",
    "health.read.medications",
    "health.read.vaccinations",
    "health.read.appointments",
    "health.read.exams",
    "health.read.documents",
    "health.read.notifications",
  ];

  for (const scope of scopes) {
    if (!validScopes.includes(scope)) {
      return NextResponse.json({ error: `Scope inválido: ${scope}` }, { status: 400 });
    }
  }

  const supabase = createAdminClient();
  const personId = ctx.user.id;
  const orgId = ctx.organization?.id;

  if (orgId) {
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("id")
      .eq("organization_id", orgId)
      .eq("user_id", ctx.user.id)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Não pertence a esta organização" }, { status: 403 });
    }
  }

  const consentId = `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const { data, error } = await supabase
    .from("health_consents")
    .insert({
      id: consentId,
      person_id: personId,
      organization_id: orgId,
      provider_id: provider_id as HealthProviderId,
      scopes,
      granted_at: new Date().toISOString(),
      expires_at: expires_at || undefined,
      source: source || "PERSON",
      audit_metadata: {
        ip: request.headers.get("x-forwarded-for") ?? undefined,
        user_agent: request.headers.get("user-agent") ?? undefined,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("[Health] Error creating consent:", error);
    return NextResponse.json({ error: "Erro ao criar consentimento" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (!hasPermission(ctx.permissions, "health.view")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const personId = ctx.user.id;
  const orgId = ctx.organization?.id;

  let query = supabase
    .from("health_consents")
    .select("*")
    .eq("person_id", personId)
    .order("granted_at", { ascending: false });

  if (orgId) {
    query.eq("organization_id", orgId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[Health] Error fetching consents:", error);
    return NextResponse.json({ error: "Erro ao buscar consentimentos" }, { status: 500 });
  }

  return NextResponse.json(data || []);
}