import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { rateLimit, createRateLimitHeaders } from "@/lib/rate-limiter";

export async function POST(request: Request) {
  const rlResult = rateLimit(request, 'admin');
  const rateLimitHeaders = createRateLimitHeaders(rlResult);
  if (!rlResult.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: rateLimitHeaders });
  }

  const { organizationId } = await request.json();
  
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user has access to this organization
  const supabaseAdmin = (await import("@/lib/supabase/admin")).createAdminClient();
  const { data: membership } = await supabaseAdmin
    .from("org_memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Set the active organization cookie
  const cookieStore = await import("next/headers").then((m) => m.cookies());
  (await cookieStore).set("rpgos_active_org", organizationId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ success: true });
}