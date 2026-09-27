import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInvoiceAction } from "./actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import { recordAuditEvent } from "@/lib/audit";
import { revalidatePath } from "next/cache";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const ME = "11111111-1111-4111-8111-111111111111";

function makeSupabase(overrides: Record<string, unknown | null>) {
  const insertPayloads: Array<{ table: string; payload: unknown }> = [];
  const from = vi.fn((table: string) => {
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      or: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: overrides[table] ?? null, error: null }),
      ),
      single: vi.fn(() =>
        Promise.resolve({
          data: (overrides.single as Record<string, unknown> | undefined)?.[table] ?? overrides[table] ?? null,
          error: null,
        }),
      ),
      insert: vi.fn((payload: Record<string, unknown>) => {
        insertPayloads.push({ table, payload });
        return chain;
      }),
    };
    return chain;
  });
  return { from, insertPayloads };
}

const validInvoice: Parameters<typeof createInvoiceAction>[0] = {
  clientEmail: "cliente.novo@example.com",
  invoiceType: "FT",
  items: [{ description: "Serviço", unit: "un", quantity: 1, unitPrice: 100, vatRate: 23 }],
};

describe("faturacao/actions - cliente sem conta (criação segura)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("cria utilizador/perfil consumidor sem NIF fabricado e com auditoria", async () => {
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: ME,
      email: "empresa@example.com",
      companyId: "company-1",
    });
    const supabase = makeSupabase({
      users: null,
      invoices: { id: "inv-1" },
      single: { users: { id: "guest-1" } },
    });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await createInvoiceAction(validInvoice);

    expect(res.success).toBe(true);

    const usersInserts = supabase.insertPayloads.filter((i) => i.table === "users");
    expect(usersInserts).toHaveLength(1);
    expect(usersInserts[0].payload).toMatchObject({
      email: "cliente.novo@example.com",
    });

    const profileInserts = supabase.insertPayloads.filter((i) => i.table === "profiles");
    expect(profileInserts).toHaveLength(1);
    const profile = profileInserts[0].payload as Record<string, unknown>;
    expect(profile.tax_number).toBeNull();
    expect(profile.tax_number).not.toBe("999999990");
    expect(profile.company_id).toBe("company-1");

    expect(vi.mocked(recordAuditEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "INVOICE_GUEST_CREATED", entityId: "guest-1" }),
    );
  });

  it("reutiliza utilizador já existente para o email (sem novo users/profile)", async () => {
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: ME,
      email: "empresa@example.com",
      companyId: "company-1",
    });
    const supabase = makeSupabase({
      users: { id: "existing-user" },
      invoices: { id: "inv-2" },
    });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await createInvoiceAction(validInvoice);

    expect(res.success).toBe(true);
    const usersInserts = supabase.insertPayloads.filter((i) => i.table === "users");
    const profileInserts = supabase.insertPayloads.filter((i) => i.table === "profiles");
    expect(usersInserts).toHaveLength(0);
    expect(profileInserts).toHaveLength(0);
  });

  it("email inválido nunca cria contas", async () => {
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: ME,
      email: "empresa@example.com",
      companyId: "company-1",
    });
    const supabase = makeSupabase({
      users: null,
      invoices: { id: "inv-3" },
    });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await createInvoiceAction({ ...validInvoice, clientEmail: "sem-arroba" });

    expect(res.success).toBe(false);
    const usersInserts = supabase.insertPayloads.filter((i) => i.table === "users");
    expect(usersInserts).toHaveLength(0);
  });
});