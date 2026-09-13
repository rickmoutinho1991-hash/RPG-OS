import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Lista notificações do utilizador autenticado. */
export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ notifications: data ?? [] });
}

/** Marca notificações como lidas. */
export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const ids: string[] | "ALL" = body?.ids ?? "ALL";

  const supabase = createAdminClient();
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", ctx.user.id)
    .is("read_at", null);

  if (Array.isArray(ids) && ids.length > 0) {
    query = query.in("id", ids);
  }

  await query;
  return NextResponse.json({ success: true });
}
