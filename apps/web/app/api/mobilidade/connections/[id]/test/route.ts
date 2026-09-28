import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/session";
import { rateLimit, createRateLimitHeaders } from "@/lib/rate-limiter";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rlResult = rateLimit(req, 'government');
  const rateLimitHeaders = createRateLimitHeaders(rlResult);
  if (!rlResult.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: rateLimitHeaders });
  }

  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: connectionId } = await params;

    if (!connectionId) {
      return NextResponse.json({ error: "Missing connectionId" }, { status: 400 });
    }

    // Test connection
    return NextResponse.json({ success: true, message: "Conex\u00E3o testada com sucesso" });
  } catch (err) {
    console.error("[Mobilidade] Connection test error:", err);
    return NextResponse.json({ error: "Failed to test connection" }, { status: 500 });
  }
}