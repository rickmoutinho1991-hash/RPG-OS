import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getInvoicesList } from "./actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("faturacao/actions - P1 fail-closed", () => {
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

  function makeChain(): { chain: any; eq: ReturnType<typeof vi.fn> } {
    const eq = vi.fn(() => chain);
    const chain: any = {
      select: vi.fn(() => chain),
      order: vi.fn(() => chain),
      eq,
      neq: vi.fn(() => chain),
      or: vi.fn(() => chain),
      in: vi.fn(() => chain),
      maybeSingle: vi.fn(),
      single: vi.fn(),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => chain),
    };
    return { chain, eq };
  }

  it("sem companyId filtra por client_id (nunca query global)", async () => {
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      companyId: null,
    });

    const { chain, eq } = makeChain();
    mockSupabase.from.mockReturnValue(chain);

    await getInvoicesList();

    const eqCalls = eq.mock.calls as string[][];
    expect(eqCalls.some((c) => c[0] === "client_id" && c[1] === "user-1")).toBe(true);
    expect(eqCalls.some((c) => c[0] === "company_id")).toBe(false);
  });

  it("com companyId filtra por company_id", async () => {
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      companyId: "company-1",
    });

    const { chain, eq } = makeChain();
    mockSupabase.from.mockReturnValue(chain);

    await getInvoicesList();

    const eqCalls = eq.mock.calls as string[][];
    expect(eqCalls.some((c) => c[0] === "company_id" && c[1] === "company-1")).toBe(true);
    expect(eqCalls.some((c) => c[0] === "client_id")).toBe(false);
  });

  it("utilizador não autenticado devolve lista vazia sem tocar na BD", async () => {
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await getInvoicesList();

    expect(result).toEqual([]);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});