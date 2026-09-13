import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { HealthProviderId, HealthConsentScope, HealthEnvironment } from "@rpg/core";

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (!hasPermission(ctx.permissions, "health.view")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const personId = ctx.user.id;
  const orgId = ctx.organization?.id;

  const query = supabase
    .from("health_connections")
    .select("*")
    .eq("person_id", personId);

  if (orgId) {
    query.eq("organization_id", orgId);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("[Health] Error fetching connections:", error);
    return NextResponse.json({ error: "Erro ao buscar ligações" }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (!hasPermission(ctx.permissions, "health.manage")) {
    return NextResponse.json({ error: "Sem permissão para gerir ligações de saúde" }, { status: 403 });
  }

  const body = await request.json();
  const { provider_id, environment, scopes, provider_config } = body;

  if (!provider_id || !environment || !scopes || !Array.isArray(scopes)) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  // Validate provider
  const validProviders: HealthProviderId[] = ["SNS24", "SPMS", "SNS"];
  if (!validProviders.includes(provider_id)) {
    return NextResponse.json({ error: "Provider inválido" }, { status: 400 });
  }

  // Validate environment
  const validEnvironments: HealthEnvironment[] = ["development", "sandbox", "production"];
  if (!validEnvironments.includes(environment)) {
    return NextResponse.json({ error: "Ambiente inválido" }, { status: 400 });
  }

  // Validate scopes
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

  // Verify consent exists for requested scopes
  const { data: consent, error: consentError } = await supabase
    .from("health_consents")
    .select("*")
    .eq("person_id", personId)
    .eq("provider_id", provider_id)
    .is("revoked_at", null)
    .single();

  if (consentError || !consent) {
    return NextResponse.json({ 
      error: "Consentimento necessário para os scopes solicitados" 
    }, { status: 403 });
  }

  // Check if consent covers all requested scopes
  const hasAllScopes = scopes.every(scope => consent.scopes.includes(scope));
  if (!hasAllScopes) {
    return NextResponse.json({ 
      error: "Consentimento não cobre todos os scopes solicitados" 
    }, { status: 403 });
  }

  // Check if consent expired
  if (consent.expires_at && new Date(consent.expires_at) < new Date()) {
    return NextResponse.json({ 
      error: "Consentimento expirado" 
    }, { status: 403 });
  }

  // Verify user belongs to organization
  if (orgId) {
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("id")
      .eq("organization_id", orgId)
      .eq("user_id", ctx.user.id)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ 
        error: "Não pertence a esta organização" 
      }, { status: 403 });
    }
  }

  const connectionId = `health_conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const { data, error } = await supabase
    .from("health_connections")
    .insert({
      id: connectionId,
      person_id: personId,
      organization_id: orgId,
      provider_id,
      environment,
      scopes,
      status: "DISCONNECTED",
      provider_config: provider_config || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("[Health] Error creating connection:", error);
    return NextResponse.json({ error: "Erro ao criar ligação" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}