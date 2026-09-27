import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/rbac";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/rbac", () => ({
  requireAuth: vi.fn(),
}));

function buildRequest(email: string) {
  return new NextRequest("http://localhost/api/rgpd/delete", {
    method: "POST",
    body: JSON.stringify({ email, confirmation: "CONFIRMAR_ELIMINACAO" }),
  });
}

describe("POST /api/rgpd/delete", () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = { from: vi.fn() };
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabase,
    );
    (vi.mocked(requireAuth) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      email: "titular@example.com",
      role: "EMPLOYEE",
      permissions: [],
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  function mockErase(opResults: Array<{ error: unknown }>) {
    let call = 0;
    mockSupabase.from.mockImplementation(() => {
      const chain: any = {
        select: vi.fn(() => chain),
        update: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        insert: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(() =>
          Promise.resolve({ data: { id: "target-1" }, error: null }),
        ),
        then: (resolve: (v: unknown) => void) => {
          const idx = call++;
          resolve({ error: opResults[idx]?.error ?? null });
        },
      };
      return chain;
    });
  }

  it("200 quando a anonimização corre sem erros", async () => {
    mockErase([{ error: null }, { error: null }, { error: null }, { error: null }]);

    const res = await POST(buildRequest("titular@example.com"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("500 quando alguma operação falha — erasure parcial não pode reportar sucesso", async () => {
    mockErase([{ error: null }, { error: "db down" }, { error: null }, { error: null }]);

    const res = await POST(buildRequest("titular@example.com"));

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/parcial/i);
  });
});