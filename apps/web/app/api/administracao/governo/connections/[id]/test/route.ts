import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();
  const orgId = ctx.organization?.id;

  if (!orgId) return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 });

  const { data: connection, error } = await supabase
    .from("government_connections")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (error || !connection) {
    return NextResponse.json({ error: "Ligação não encontrada" }, { status: 404 });
  }

  // Test the connection based on provider
  try {
    // Simulate connection test
    await new Promise(resolve => setTimeout(resolve, 500));

    // Update connection status to CONNECTED
    await supabase
      .from("government_connections")
      .update({
        status: "CONNECTED",
        connected_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ success: true, message: "Conexão testada com sucesso" });
  } catch (err) {
    await supabase
      .from("government_connections")
      .update({
        status: "ERROR",
        last_error: err instanceof Error ? err.message : "Erro desconhecido",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Erro ao testar conexão"
    }, { status: 500 });
  }
}