import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { paymentEngine } from "@rpg/core";
import { checkWebhookReplay } from "@/lib/webhook-replay-protection";

vi.mock("@/lib/rate-limiter", () => ({
  rateLimit: vi.fn(() => ({ allowed: true, remaining: 10, limit: 50, resetAt: 0 })),
  createRateLimitHeaders: vi.fn(() => ({})),
}));

vi.mock("@/lib/body-size-limit", () => ({
  checkBodySizeLimit: vi.fn(() => ({ allowed: true })),
  createBodySizeLimitResponse: vi.fn(),
}));

vi.mock("@/lib/webhook-replay-protection", () => ({
  checkWebhookReplay: vi.fn(() => ({ allowed: true, eventId: "STRIPE_CONNECT:evt_1" })),
}));

vi.mock("@rpg/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@rpg/core")>();
  return {
    ...actual,
    paymentEngine: {
      processWebhook: vi.fn(),
    },
  };
});

function buildRequest(overrides: { provider?: string; body?: unknown; signature?: string } = {}) {
  const { provider = "STRIPE_CONNECT", body = { id: "evt_1", type: "PAYMENT_SUCCEEDED" }, signature } = overrides;
  const headers: Record<string, string> = { "x-payment-provider": provider };
  if (signature) headers["x-signature"] = signature;
  return new NextRequest("http://localhost/api/webhooks/payments", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/webhooks/payments", () => {
  let engineMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    engineMock = (paymentEngine.processWebhook as unknown as ReturnType<typeof vi.fn>);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("rejeita provider não suportado sem processar", async () => {
    const res = await POST(buildRequest({ provider: "UNKNOWN" as string }));
    expect(res.status).toBe(400);
    expect(engineMock).not.toHaveBeenCalled();
    expect(checkWebhookReplay).not.toHaveBeenCalled();
  });

  it("NÃO marca replay protection quando a assinatura é inválida", async () => {
    engineMock.mockResolvedValue({ success: false, error: "Invalid webhook signature" });

    const res = await POST(buildRequest({ signature: "bad" }));

    expect(res.status).toBe(400);
    // Ordem correta: verificação de autenticidade ANTES do dedup cache.
    expect(engineMock).toHaveBeenCalledTimes(1);
    expect(checkWebhookReplay).not.toHaveBeenCalled();
  });

  it("marca replay protection e responde sucesso após verificação válida", async () => {
    engineMock.mockResolvedValue({ success: true, eventId: "evt_1" });

    const res = await POST(buildRequest({ signature: "good" }));

    expect(res.status).toBe(200);
    expect(checkWebhookReplay).toHaveBeenCalledTimes(1);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("rejeita evento duplicado com 409 depois da verificação", async () => {
    engineMock.mockResolvedValue({ success: true, eventId: "evt_1" });
    vi.mocked(checkWebhookReplay).mockReturnValue({
      allowed: false,
      eventId: "STRIPE_CONNECT:evt_1",
      reason: "Duplicate webhook event detected (replay attack prevention)",
    });

    const res = await POST(buildRequest({ signature: "good" }));

    expect(res.status).toBe(409);
    // A verificação aconteceu (o engine foi chamado) mas o evento não é duplicado-aceite.
    expect(engineMock).toHaveBeenCalledTimes(1);
  });
});