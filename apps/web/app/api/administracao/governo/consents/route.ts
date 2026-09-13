import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { GovernmentProviderId, GovernmentConsent, validateConsentRequest } from "@rpg/core";
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id?: string }> }
) {
  const { result, headers } = getRateLimitHeaders(request);
  
  if (!result.allowed) {
    return rateLimitedResponse('Too Many Requests', 429, headers);
  }

  // CSRF Protection for browser mutations
  const csrfValid = await validateCsrfToken(request);
  if (!csrfValid) {
    return csrfErrorResponse(headers);
  }

  try {
    const ctx = await getSessionContext();
    if (!ctx) return rateLimitedResponse("Não autenticado", 401, headers);

    if (!hasPermission(ctx.permissions, "government.manage")) {
      return rateLimitedResponse("Sem permissão para gerir consentimentos", 403, headers);
    }

    const body = await request.json();
    const { provider_id, scopes, expires_at, source } = body;

    if (!provider_id || !scopes || !Array.isArray(scopes)) {
      return rateLimitedResponse("Dados inválidos: provider_id e scopes são obrigatórios", 400, headers);
    }

    const supabase = createAdminClient();
    const orgId = ctx.organization?.id;

    if (!orgId) return rateLimitedResponse("Organização não encontrada", 404, headers);

    // Validate consent request
    const validation = validateConsentRequest({ provider_id, scopes, expires_at });
    if (!validation.valid) {
      return rateLimitedResponse(validation.errors[0], 400, headers);
    }

    const consentId = `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const { data, error } = await supabase
      .from("government_consents")
      .insert({
        id: consentId,
        organization_id: orgId,
        user_id: ctx.user?.id,
        provider_id: provider_id as GovernmentProviderId,
        scopes,
        granted_at: new Date().toISOString(),
        expires_at: expires_at || undefined,
        source: source || "USER",
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
      console.error("[Government] Error creating consent:", error);
      return rateLimitedResponse("Erro ao criar consentimento", 500, headers);
    }

    return NextResponse.json(data, { status: 201, headers });
  } catch (err) {
    return rateLimitedResponse(err instanceof Error ? err.message : "Erro desconhecido", 500, headers);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id?: string }> }
) {
  const { result, headers } = getRateLimitHeaders(request);
  
  if (!result.allowed) {
    return rateLimitedResponse('Too Many Requests', 429, headers);
  }

  try {
    const ctx = await getSessionContext();
    if (!ctx) return rateLimitedResponse("Não autenticado", 401, headers);

    if (!hasPermission(ctx.permissions, "government.view")) {
      return rateLimitedResponse("Sem permissão", 403, headers);
    }

    const supabase = createAdminClient();
    const orgId = ctx.organization?.id;

    if (!orgId) return rateLimitedResponse("Organização não encontrada", 404, headers);

    const { data, error } = await supabase
      .from("government_consents")
      .select("*")
      .eq("organization_id", orgId)
      .order("granted_at", { ascending: false });

    if (error) {
      console.error("[Government] Error fetching consents:", error);
      return rateLimitedResponse("Erro ao buscar consentimentos", 500, headers);
    }

    return NextResponse.json(data || [], { headers });
  } catch (err) {
    return rateLimitedResponse(err instanceof Error ? err.message : "Erro desconhecido", 500, headers);
  }
}