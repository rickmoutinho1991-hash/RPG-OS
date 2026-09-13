import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const ctx = await getSessionContext();
    if (!ctx) {
      return NextResponse.json(
        { connected: false, reason: "not_authenticated" },
        { status: 401 }
      );
    }

    const supabase = createAdminClient();
    const personId = ctx.user.id;
    const orgId = ctx.organization?.id;

    const query = supabase
      .from("health_connections")
      .select("*")
      .eq("provider_id", "SNS24")
      .eq("person_id", personId);

    if (orgId) {
      query.eq("organization_id", orgId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("[Health] Error fetching status:", error);
      return NextResponse.json(
        { connected: false, error: "Erro ao verificar status" },
        { status: 500 }
      );
    }

    const hasConnection = data && data.length > 0;

    return NextResponse.json({
      connected: hasConnection,
      provider: "SNS24",
      environment: "production",
      status: hasConnection ? "CONNECTED" : "NOT_REGISTERED",
      message: hasConnection ? "SNS 24 provider está configurado" : "SNS 24 provider não configurado",
    });
  } catch (error) {
    console.error("[Saúde] Status check failed:", error);
    return NextResponse.json(
      { connected: false, error: "Failed to check connection status" },
      { status: 500 }
    );
  }
}