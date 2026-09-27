import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/rbac";

const { requestMbWayPayment } = vi.hoisted(() => ({ requestMbWayPayment: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/rbac", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@rpg/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@rpg/core")>();
  return {
    ...actual,
    SibsPaymentGatewayAdapter: vi.fn(function MockMbWayGateway() {
      return { requestMbWayPayment };
    }),
  };
});

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/sibs/mbway", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/sibs/mbway", () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = { from: vi.fn() };
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabase,
    );
    (vi.mocked(requireAuth) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      companyId: "company-1",
      role: "EMPLOYEE",
      permissions: [],
      email: "user@example.com",
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  function mockInvoice(invoice: unknown) {
    mockSupabase.from.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        order: vi.fn(() => chain),
        maybeSingle: vi.fn(() =>
          Promise.resolve(
            table === "invoices"
              ? { data: invoice, error: null }
              : { data: null, error: { message: "not found" } },
          ),
        ),
        insert: vi.fn(() => Promise.resolve({ error: null })),
        then: (resolve: (v: unknown) => void) => resolve({ error: null }),
      };
      return chain;
    });
  }

  it("403 quando a fatura não pertence ao ator (IDOR)", async () => {
    mockInvoice({ id: "inv-1", company_id: "company-X", client_id: "other-user" });
    requestMbWayPayment.mockResolvedValue({ success: false });

    const res = await POST(
      buildRequest({ phoneNumber: "912345678", amount: 100, invoiceId: "inv-1" }),
    );

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/Fatura não pertence/);
    expect(requestMbWayPayment).not.toHaveBeenCalled();
  });

  it("404 quando a fatura não existe", async () => {
    mockInvoice(null);

    const res = await POST(
      buildRequest({ phoneNumber: "912345678", amount: 100, invoiceId: "inv-999" }),
    );

    expect(res.status).toBe(404);
    expect(requestMbWayPayment).not.toHaveBeenCalled();
  });

  it("prossegue com o gateway quando a fatura é da empresa do ator", async () => {
    mockInvoice({ id: "inv-1", company_id: "company-1", client_id: null });
    requestMbWayPayment.mockResolvedValue({ success: false });

    const res = await POST(
      buildRequest({ phoneNumber: "912345678", amount: 100, invoiceId: "inv-1" }),
    );

    expect(res.status).toBe(503);
    expect(requestMbWayPayment).toHaveBeenCalledTimes(1);
  });
});