import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDocumentAction } from "./actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import { recordAuditEvent } from "@/lib/audit";

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

function formData(userEmail?: string): FormData {
  const form = new FormData();
  if (userEmail !== undefined) form.set("user_email", userEmail);
  form.set("type", "IDENTITY_CARD");
  form.set("file_name", "doc.pdf");
  return form;
}

function makeSupabase(overrides: Record<string, unknown | null>) {
  const insertPayloads: Array<Record<string, unknown>> = [];
  const from = vi.fn((table: string) => {
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      or: vi.fn(() => chain),
      order: vi.fn(() => chain),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: overrides[table] ?? null, error: null }),
      ),
      single: vi.fn(() =>
        Promise.resolve({ data: overrides[table] ?? null, error: null }),
      ),
      insert: vi.fn((payload: Record<string, unknown>) => {
        insertPayloads.push(payload);
        return chain;
      }),
      update: vi.fn(() => chain),
    };
    return chain;
  });
  return {
    from,
    inserts: insertPayloads,
    insertedDocument: () =>
      insertPayloads.find((p) => p.owner_user_id !== undefined) ?? null,
  };
}

describe("documentos/actions - atribuicao fail-closed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("upload sem email de terceiro atribui ao proprio usuario", async () => {
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      email: "eu@example.com",
      companyId: null,
    });

    const supabase = makeSupabase({ documents: { id: "doc-1" } });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await createDocumentAction(formData());

    expect(res.success).toBe(true);
    expect(supabase.insertedDocument()?.owner_user_id).toBe("user-1");
    expect(supabase.from).not.toHaveBeenCalledWith("users");
    expect(supabase.from).not.toHaveBeenCalledWith("company_employees");
  });

  it("sem empresa, nao permite atribuir documento a outro utilizador", async () => {
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      email: "eu@example.com",
      companyId: null,
    });

    const supabase = makeSupabase({ users: { id: "user-2" } });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await createDocumentAction(formData("outro@example.com"));

    expect(res.success).toBe(false);
    expect(supabase.insertedDocument()).toBeNull();
  });

  it("email desconhecido falha de forma honesta (fail-closed)", async () => {
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      email: "eu@example.com",
      companyId: "company-1",
    });

    const supabase = makeSupabase({ users: null });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await createDocumentAction(formData("ninguem@example.com"));

    expect(res.success).toBe(false);
    expect(supabase.insertedDocument()).toBeNull();
  });

  it("membro da mesma empresa pode ser titular do documento", async () => {
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      email: "eu@example.com",
      companyId: "company-1",
    });

    const supabase = makeSupabase({
      users: { id: "user-2" },
      company_employees: { id: "emp-link-1" },
      documents: { id: "doc-1" },
    });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await createDocumentAction(formData("membro@example.com"));

    expect(res.success).toBe(true);
    expect(supabase.insertedDocument()?.owner_user_id).toBe("user-2");
    expect(supabase.insertedDocument()?.company_id).toBe("company-1");
  });

  it("outro utilizador fora da empresa e recusado", async () => {
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      email: "eu@example.com",
      companyId: "company-1",
    });

    const supabase = makeSupabase({
      users: { id: "user-3" },
      company_employees: null,
    });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await createDocumentAction(formData("externo@example.com"));

    expect(res.success).toBe(false);
    expect(supabase.insertedDocument()).toBeNull();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});