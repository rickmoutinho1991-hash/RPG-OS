import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/session";
import { rateLimit, applyRateLimitHeaders } from "@/lib/rate-limiter";
import { runAtTestHandshake } from "@/lib/at/handshakeHarness";

/**
 * POST /api/administracao/at/connections/[id]/test
 * Teste de conectividade AT (ambiente TEST, sem efeitos fiscais).
 * Rate limited; readiness gate + autorização completa dentro do harness.
 * Nunca afirma sucesso sem resposta oficial válida.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const limited = rateLimit(request, "government");
  if (!limited.allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Demasiados pedidos. Tente mais tarde." }, { status: 429 }),
      limited,
    );
  }

  const { id } = await params;
  try {
    const result = await runAtTestHandshake(id);
    const status = result.connectivity?.status ?? "UNKNOWN";
    const http = result.readiness !== "READY" ? 502 : status === "CONNECTED" ? 200 : status === "UNKNOWN" ? 504 : 502;
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          ...(result.connectivity ?? {
            status: "UNKNOWN" as const,
            operation: "fatshare.Invoices" as const,
            environment: "TEST" as const,
            connectionId: id,
          }),
          readiness: result.readiness,
          readinessReasons: result.readinessReasons,
          handshake: result.handshake,
        },
        { status: http },
      ),
      limited,
    );
  } catch (err) {
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          status: "UNKNOWN",
          operation: "fatshare.Invoices",
          environment: "TEST",
          connectionId: id,
          detail: err instanceof Error ? err.message.slice(0, 120) : "UNKNOWN",
        },
        { status: 500 },
      ),
      limited,
    );
  }
}
