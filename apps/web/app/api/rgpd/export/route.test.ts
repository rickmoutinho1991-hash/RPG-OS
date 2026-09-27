import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/rbac";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/rbac", () => ({
  requireAuth: vi.fn(),
}));

describe("GET /api/rgpd/export", () => {
  let mockSupabase: any;
  const eqCalls: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    eqCalls.length = 0;
    mockSupabase = { from: vi.fn() };
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabase,
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  function mockUser(role: string, email: string) {
    (vi.mocked(requireAuth) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      email,
      name: "Ator",
      role,
      permissions: [],
      companyId: undefined,
    });
  }

  function mockQueryResult(rows: unknown[]) {
    mockSupabase.from.mockImplementation(() => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn((col: string, val: unknown) => {
          eqCalls.push(`${col}=${val}`);
          return chain;
        }),
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: rows, error: null }),
      };
      return chain;
    });
  }

  it("403 para outro email mesmo com diferença de caixa (normalizado)", async () => {
    mockUser("EMPLOYEE", "eu@example.com");
    mockQueryResult([]);

    const res = await GET(
      new NextRequest("http://localhost/api/rgpd/export?email=Outro%40Example.com"),
    );

    expect(res.status).toBe(403);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("autoriza o próprio email independentemente da caixa usada (trim+lowercase)", async () => {
    mockUser("EMPLOYEE", "Eu@Example.com");
    mockQueryResult([{ id: "user-1", email: "eu@example.com" }]);

    const res = await GET(
      new NextRequest("http://localhost/api/rgpd/export?email=Eu%40Example.com%20"),
    );

    expect(res.status).toBe(200);
    // O filtro da query usa o MESMO valor normalizado utilizado na autorização.
    expect(eqCalls).toContain("email=eu@example.com");
  });

  it("admin pode exportar qualquer email", async () => {
    mockUser("ADMIN", "eu@example.com");
    mockQueryResult([{ id: "user-2", email: "admin-alvo@example.com" }]);

    const res = await GET(
      new NextRequest("http://localhost/api/rgpd/export?email=Admin-Alvo%40Example.com"),
    );

    expect(res.status).toBe(200);
    expect(eqCalls).toContain("email=admin-alvo@example.com");
  });
});