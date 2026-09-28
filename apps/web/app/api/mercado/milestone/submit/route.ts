import { submitMilestoneAction } from "@/app/mercado/actions";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, createRateLimitHeaders } from "@/lib/rate-limiter";

export async function POST(request: NextRequest) {
  const rlResult = rateLimit(request, 'payment');
  const rateLimitHeaders = createRateLimitHeaders(rlResult);
  if (!rlResult.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: rateLimitHeaders });
  }

  try {
    const formData = await request.formData();
    const result = await submitMilestoneAction(formData);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/mercado/milestone/submit] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}