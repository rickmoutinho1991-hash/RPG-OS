import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const supabase = createAdminClient();

    const { data: contracts, error } = await supabase
      .from("contracts")
      .select(`
        *,
        contract_milestones (*),
        service_requests (
          title,
          description,
          client_id,
          category_id
        )
      `)
      .or(`client_id.eq.${ctx.user.id},provider_id.eq.${ctx.user.id}`)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ contracts: contracts || [] });
  } catch (err) {
    console.error("[api/mercado/contracts] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}