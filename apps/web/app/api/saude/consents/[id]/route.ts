import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (!hasPermission(ctx.permissions, "health.view")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const personId = ctx.user.id;
  const orgId = ctx.organization?.id;

  const { data, error } = await supabase
    .from("health_consents")
    .select("*")
    .eq("id", id)
    .eq("person_id", personId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Consentimento não encontrado" }, { status: 404 });
  }

  if (ctx.organization?.id && data.organization_id !== ctx.organization.id) {
    return NextResponse.json({ error: "Consentimento não encontrado" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (!hasPermission(ctx.permissions, "health.manage")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const personId = ctx.user.id;
  const orgId = ctx.organization?.id;

  // First verify the consent belongs to the person/org
  const { data: consent, error: consentError } = await supabase
    .from("health_consents")
    .select("organization_id")
    .eq("id", id)
    .eq("person_id", personId)
    .single();

  if (consentError || !consent) {
    return NextResponse.json({ error: "Consentimento não encontrado" }, { status: 404 });
  }

  if (orgId && consent.organization_id !== orgId) {
    return NextResponse.json({ error: "Consentimento não encontrado" }, { status: 404 });
  }

  // Revoke consent by setting revoked_at
  const { error } = await supabase
    .from("health_consents")
    .update({
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("person_id", personId);

  if (error) {
    return NextResponse.json({ error: "Erro ao revogar consentimento" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}