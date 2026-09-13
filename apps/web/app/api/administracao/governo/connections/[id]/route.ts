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

  if (!hasPermission(ctx.permissions, "government.view")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const orgId = ctx.organization?.id;

  if (!orgId) return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 });

  const { data, error } = await supabase
    .from("government_connections")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Ligação não encontrada" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (!hasPermission(ctx.permissions, "government.manage")) {
    return NextResponse.json({ error: "Sem permissão para gerir ligações" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { environment, scopes, provider_config } = body;

  const supabase = createAdminClient();
  const orgId = ctx.organization?.id;

  if (!orgId) return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 });

  const { data, error } = await supabase
    .from("government_connections")
    .update({
      environment,
      scopes,
      provider_config,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", orgId)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Ligação não encontrada" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (!hasPermission(ctx.permissions, "government.manage")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const orgId = ctx.organization?.id;

  if (!orgId) return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 });

  const { error } = await supabase
    .from("government_connections")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (error) {
    return NextResponse.json({ error: "Erro ao eliminar" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}