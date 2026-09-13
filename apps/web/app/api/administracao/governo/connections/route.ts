import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { rateLimit, createRateLimitHeaders } from "@/lib/rate-limiter";
import { validateCsrfToken } from "@/lib/csrf";

function getRateLimitHeaders(request: NextRequest) {
  const rlResult = rateLimit(request, 'government');
  return { result: rlResult, headers: createRateLimitHeaders(rlResult) };
}

function rateLimitedResponse(error: string, status: number, headers: Record<string, string>) {
  return NextResponse.json({ error }, { status, headers });
}

function csrfErrorResponse(headers: Record<string, string>) {
  return NextResponse.json(
    { 
      error: 'CSRF token validation failed',
      message: 'Invalid or missing CSRF token. Include x-csrf-token header.',
    },
    { status: 403, headers }
  );
}

export async function GET(request: NextRequest) {
  const { result, headers } = getRateLimitHeaders(request);
  
  if (!result.allowed) {
    return rateLimitedResponse('Too Many Requests', 429, headers);
  }

  const ctx = await getSessionContext();
  if (!ctx) return rateLimitedResponse("Não autenticado", 401, headers);

  if (!hasPermission(ctx.permissions, "government.view")) {
    return rateLimitedResponse("Sem permissão", 403, headers);
  }

  const supabase = createAdminClient();
  const orgId = ctx.organization?.id;

  if (!orgId) return rateLimitedResponse("Organização não encontrada", 404, headers);

  const { data, error } = await supabase
    .from("government_connections")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Government] Error fetching connections:", error);
    return rateLimitedResponse("Erro ao buscar ligações", 500, headers);
  }

  return NextResponse.json(data || [], { headers });
}

export async function POST(request: NextRequest) {
  const { result, headers } = getRateLimitHeaders(request);
  
  if (!result.allowed) {
    return rateLimitedResponse('Too Many Requests', 429, headers);
  }

  // CSRF Protection for browser mutations
  const csrfValid = await validateCsrfToken(request);
  if (!csrfValid) {
    return csrfErrorResponse(headers);
  }

  const ctx = await getSessionContext();
  if (!ctx) return rateLimitedResponse("Não autenticado", 401, headers);

  if (!hasPermission(ctx.permissions, "government.manage")) {
    return rateLimitedResponse("Sem permissão para gerir ligações", 403, headers);
  }

  const body = await request.json();
  const { provider_id, environment, scopes, provider_config } = body;

  if (!provider_id || !environment || !scopes || !Array.isArray(scopes)) {
    return rateLimitedResponse("Dados inválidos", 400, headers);
  }

  const supabase = createAdminClient();
  const orgId = ctx.organization?.id;

  if (!orgId) return rateLimitedResponse("Organização não encontrada", 404, headers);

  const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const { data, error } = await supabase
    .from("government_connections")
    .insert({
      id: connectionId,
      organization_id: orgId,
      user_id: ctx.user?.id,
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
    console.error("[Government] Error creating connection:", error);
    return rateLimitedResponse("Erro ao criar ligação", 500, headers);
  }

  return NextResponse.json(data, { status: 201, headers });
}