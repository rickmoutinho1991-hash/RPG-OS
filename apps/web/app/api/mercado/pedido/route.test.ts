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
  form.set("title", "Pedido de teste");
  form.set("description", "Descrição do pedido");
  form.set("categoryId", "cat-1");
  form.set("budgetType", "FIXED");
  form.set("budgetAmountCents", "1000");
  form.set("budgetCurrency", "EUR");
  return form;
}

describe("POST /api/mercado/pedido", () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = { from: vi.fn() };
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabase,
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("401 quando não autenticado", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(new NextRequest("http://localhost/api/mercado/pedido", {
      method: "POST",
      body: buildFormData(),
    }));

    expect(res.status).toBe(401);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("403 sem permissão marketplace.requests.create e nunca toca a BD", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      authCtx(["marketplace.view"]),
    );

    const res = await POST(new NextRequest("http://localhost/api/mercado/pedido", {
      method: "POST",
      body: buildFormData(),
    }));

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/permiss/);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("cria o pedido quando o ator tem a permissão", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      authCtx(["marketplace.requests.create"]),
    );

    mockSupabase.from.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        insert: vi.fn(() => Promise.resolve({ error: null })),
        update: vi.fn(() => chain),
        then: (resolve: (v: unknown) => void) => resolve({ error: null }),
      };
      return chain;
    });

    const res = await POST(new NextRequest("http://localhost/api/mercado/pedido", {
      method: "POST",
      body: buildFormData(),
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockSupabase.from).toHaveBeenCalledWith("service_requests");
  });
});