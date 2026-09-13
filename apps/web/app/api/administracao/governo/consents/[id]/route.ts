import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { GovernmentProviderId } from "@rpg/core";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    if (!hasPermission(ctx.permissions, "government.manage")) {
      return NextResponse.json({ error: "Sem permissão para revogar consentimentos" }, { status: 403 });
    }

    const { id } = await params;
    const supabase = createAdminClient();
    const orgId = ctx.organization?.id;

    if (!orgId) return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 });

    // First verify the consent belongs to the organization
    const { data: consent, error: consentError } = await supabase
      .from("government_consents")
      .select("*")
      .eq("id", id)
      .eq("organization_id", orgId)
      .single();

    if (consentError || !consent) {
      return NextResponse.json({ error: "Consentimento não encontrado" }, { status: 404 });
    }

    // Update consent to revoked
    const { error } = await supabase
      .from("government_consents")
      .update({
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("[Government] Error revoking consent:", error);
      return NextResponse.json({ error: "Erro ao revogar consentimento" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, { status: 500 });
  }
}