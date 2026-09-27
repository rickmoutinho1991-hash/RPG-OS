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

function buildRequest() {
  return new NextRequest("http://localhost/api/devices/push", {
    method: "POST",
    body: JSON.stringify({ title: "Aviso", message: "Teste" }),
  });
}

describe("POST /api/devices/push", () => {
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

    const res = await POST(buildRequest());

    expect(res.status).toBe(401);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("403 sem permissão comunicacao.manage (broadcast para a fleet)", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      authCtx(["comunicacao.view"]),
    );

    const res = await POST(buildRequest());

    expect(res.status).toBe(403);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("200 e regista auditoria com comunicacao.manage", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      authCtx(["comunicacao.manage"]),
    );

    mockSupabase.from.mockImplementation((table: string) => {
      const chain: any = {
        insert: vi.fn(() => Promise.resolve({ error: null })),
        then: (resolve: (v: unknown) => void) => resolve({ error: null }),
      };
      return chain;
    });

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(mockSupabase.from).toHaveBeenCalledWith("audit_logs");
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});