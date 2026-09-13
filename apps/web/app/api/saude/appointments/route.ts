import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (!hasPermission(ctx.permissions, "health.view")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const personId = ctx.user.id;
  const orgId = ctx.organization?.id;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let query = supabase
    .from("health_appointments")
    .select("*")
    .eq("person_id", personId);

  if (orgId) {
    query.eq("organization_id", orgId);
  }

  if (status) {
    query.eq("status", status);
  }

  const { data, error } = await query.order("scheduled_at", { ascending: false });

  if (error) {
    console.error("[Health] Error fetching appointments:", error);
    return NextResponse.json({ error: "Erro ao buscar consultas" }, { status: 500 });
  }

  return NextResponse.json(data || []);
}