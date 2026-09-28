import { NextResponse } from "next/server";
import { AtTaxAuthorityAdapter } from "@rpg/core";
import { rateLimit, createRateLimitHeaders } from "@/lib/rate-limiter";

export async function POST(request: Request) {
  const rlResult = rateLimit(request, 'government');
  const rateLimitHeaders = createRateLimitHeaders(rlResult);
  if (!rlResult.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: rateLimitHeaders });
  }

  try {
    const body = await request.json();
    const nif = String(body.nif || "").replace(/\s/g, "");

    const adapter = new AtTaxAuthorityAdapter();
    const result = await adapter.validateTaxNumber({ taxNumber: nif });

    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erro na validação local do NIF.",
      },
      { status: 400 },
    );
  }
}
