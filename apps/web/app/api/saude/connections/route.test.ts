import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
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

function buildPost() {
  return new NextRequest("http://localhost/api/saude/connections", {
    method: "POST",
    body: JSON.stringify({
      provider_id: "SNS24",
      environment: "sandbox",
      scopes: ["health.read.profile"],
    }),
  });
}

describe("GET /api/saude/connections", () => {
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

    const res = await GET();

    expect(res.status).toBe(401);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("403 sem permissão saude.view", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      authCtx(["basico.view"]),
    );

    const res = await GET();

    expect(res.status).toBe(403);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("200 com saude.view, filtrando apenas os dados da própria pessoa", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      authCtx(["saude.view"]),
    );

    mockSupabase.from.mockImplementation(() => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => Promise.resolve({ data: [{ id: "conn-1" }], error: null })),
      };
      return chain;
    });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(mockSupabase.from).toHaveBeenCalledWith("health_connections");
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe("POST /api/saude/connections", () => {
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

  it("403 sem permissão saude.manage", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      authCtx(["saude.view"]),
    );

    const res = await POST(buildPost());

    expect(res.status).toBe(403);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("201 com saude.manage cria ligação apenas para a própria pessoa", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      authCtx(["saude.view", "saude.manage"]),
    );

    let inserted: unknown = null;
    mockSupabase.from.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        single: vi.fn(() =>
          table === "health_consents"
            ? Promise.resolve({
                data: { scopes: ["health.read.profile"], expires_at: null },
                error: null,
              })
            : Promise.resolve({
                data: { id: "health_conn_1", person_id: "user-1", provider_id: "SNS24" },
                error: null,
              }),
        ),
        insert: vi.fn((payload: unknown) => {
          inserted = payload;
          return chain;
        }),
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      };
      return chain;
    });

    const res = await POST(buildPost());

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("health_conn_1");
    expect(body.person_id).toBe("user-1");
    expect(inserted).toMatchObject({
      person_id: "user-1",
      provider_id: "SNS24",
    });

    const consentCalls = mockSupabase.from.mock.calls.filter(
      (c: unknown[]) => c[0] === "health_consents",
    );
    expect(consentCalls.length).toBe(1);
  });
});