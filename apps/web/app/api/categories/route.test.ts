import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

function chainReturning(result: unknown) {
  const order = vi.fn(() => Promise.resolve(result));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, order };
}

describe("GET /api/categories", () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = { from: vi.fn() };
    (vi.mocked(createClient) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("200 devolve o catálogo público ativo via cliente RLS (sem service_role)", async () => {
    mockSupabase.from.mockReturnValue(
      chainReturning({ data: [{ id: "1", name: "Limpezas" }], error: null }),
    );

    const res = await GET();

    expect(res.status).toBe(200);
    expect(mockSupabase.from).toHaveBeenCalledWith("categories");
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Limpezas");
  });

  it("500 quando a query falha", async () => {
    mockSupabase.from.mockReturnValue(
      chainReturning({ data: null, error: { message: "boom" } }),
    );

    const res = await GET();

    expect(res.status).toBe(500);
  });
});