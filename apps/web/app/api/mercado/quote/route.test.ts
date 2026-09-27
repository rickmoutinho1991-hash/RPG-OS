import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSessionContext: vi.fn(),
}));

function authCtx(permissions: string[]): unknown {
  return {
    user: { id: "user-1" },
    organization: null,
    permissions,
    availableOrganizations: [],
  };
}

function buildFormData(): FormData {
  const form = new FormData();
  form.set("requestId", "req-1");
  form.set("items", JSON.stringify([
    {
      description: "ServiÃ§o A",
      quantity: 2,
      unit: "h",
      unitPriceCents: 500,
      taxRate: 23,
    },
    {
      description: "ServiÃ§o B",
      quantity: 1,
      unit: "un",
      unitPriceCents: 100,
      taxRate: 0,
    },
  ]));
  form.set("subtotalCents", "1000");
  form.set("taxCents", "230");
  form.set("totalCents", "1230");
  form.set("currency", "EUR");
  form.set("validUntil", "2099-01-01T00:00:00.000Z");
  return form;
}

const publishedRequest = {
  id: "req-1",
  client_id: "client-1",
  category_id: "cat-1",
  title: "Pedido",
  description: "Desc",
  budget_type: "FIXED",
  budget_amount_cents: 10000,
  budget_min_cents: null,
  budget_max_cents: null,
  budget_currency: "EUR",
  urgency: "MEDIUM",
  desired_start_date: null,
  desired_end_date: null,
  location_service_mode: "BOTH",
  moderation_status: "APPROVED",
  status: "PUBLISHED",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("POST /api/mercado/quote", () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = { from: vi.fn() };
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabase
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("401 quando nÃ£o autenticado", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(new NextRequest("http://localhost/api/mercado/quote", {
      method: "POST",
      body: buildFormData(),
    }));

    expect(res.status).toBe(401);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("403 sem permissÃ£o marketplace.quotes.create e nunca toca a BD", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      authCtx([])
    );

    const res = await POST(new NextRequest("http://localhost/api/mercado/quote", {
      method: "POST",
      body: buildFormData(),
    }));

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/permiss/);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("processa a proposta quando o ator tem a permissÃ£o", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      authCtx(["marketplace.quotes.create"])
    );

    mockSupabase.from.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        single: vi.fn(() =>
          Promise.resolve(
            table === "service_requests"
              ? { data: publishedRequest, error: null }
              : { data: null, error: { message: "not found" } },
          ),
        ),
        insert: vi.fn(() => Promise.resolve({ error: null })),
        update: vi.fn(() => chain),
        then: (resolve: (v: unknown) => void) => resolve({ error: null }),
      };
      return chain;
    });

    const res = await POST(new NextRequest("http://localhost/api/mercado/quote", {
      method: "POST",
      body: buildFormData(),
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockSupabase.from).toHaveBeenCalledWith("service_requests");
    expect(mockSupabase.from).toHaveBeenCalledWith("service_quotes");
  });

  it("dono do pedido tenta cotar o próprio pedido -> 400 sem escrever", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      authCtx(["marketplace.quotes.create"]),
    );

    const ownRequest = { ...publishedRequest, client_id: "user-1" };
    mockSupabase.from.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        single: vi.fn(() =>
          Promise.resolve(
            table === "service_requests"
              ? { data: ownRequest, error: null }
              : { data: null, error: { message: "not found" } },
          ),
        ),
        insert: vi.fn(() => Promise.resolve({ error: null })),
        update: vi.fn(() => chain),
        then: (resolve: (v: unknown) => void) => resolve({ error: null }),
      };
      return chain;
    });

    const res = await POST(new NextRequest("http://localhost/api/mercado/quote", {
      method: "POST",
      body: buildFormData(),
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("próprio pedido");
    expect(mockSupabase.from).not.toHaveBeenCalledWith("service_quotes");
  });
});