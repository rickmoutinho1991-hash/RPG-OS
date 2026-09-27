import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyDocumentAction, createDocumentAction } from "./actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import { getSessionContext } from "@/lib/session";
import { recordAuditEvent } from "@/lib/audit";
import { revalidatePath } from "next/cache";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSessionContext: vi.fn(),
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
  const updatedTables: string[] = [];
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
      update: vi.fn(() => {
        updatedTables.push(table);
        return chain;
      }),
    };
    return chain;
  });
  return {
    from,
    inserts: insertPayloads,
    updatedTables,
    insertedDocument: () =>
      insertPayloads.find(
        (p) =>
          p.owner_user_id !== undefined ||
          p.document_id !== undefined ||
          p.status !== undefined,
      ) ?? null,
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

describe("documentos/actions - verifyDocumentAction RBAC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  function mockSupabaseWithDoc(ownerUserId: string, companyId: string) {
    const supabase = makeSupabase({
      documents: { id: "doc-1", owner_user_id: ownerUserId, company_id: companyId },
    });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    return supabase;
  }

  it("documento proprio mantem self-service sem gate de permissao", async () => {
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      email: "eu@example.com",
      companyId: "company-1",
    });

    const supabase = mockSupabaseWithDoc("user-1", "company-1");

    const res = await verifyDocumentAction("doc-1", "VERIFIED");

    expect(res.success).toBe(true);
    expect(getSessionContext).not.toHaveBeenCalled();
    expect(supabase.updatedTables).toContain("documents");
    expect(supabase.from).toHaveBeenCalledWith("document_verifications");
  });

  it("documento de terceiro sem documentos.manage e recusado (sem escrita)", async () => {
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      email: "eu@example.com",
      companyId: "company-1",
    });
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user-1" },
      permissions: ["documentos.view", "tarefas.view"],
    });

    const supabase = mockSupabaseWithDoc("user-2", "company-1");

    const res = await verifyDocumentAction("doc-1", "VERIFIED");

    expect(res.success).toBe(false);
    expect(supabase.updatedTables).not.toContain("documents");
    expect(supabase.from).not.toHaveBeenCalledWith("document_verifications");
  });

  it("documento de terceiro sem sessao de org e recusado", async () => {
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      email: "eu@example.com",
      companyId: "company-1",
    });
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const supabase = mockSupabaseWithDoc("user-2", "company-1");

    const res = await verifyDocumentAction("doc-1", "VERIFIED");

    expect(res.success).toBe(false);
    expect(supabase.updatedTables).not.toContain("documents");
  });

  it("documento de terceiro com documentos.manage e permitido", async () => {
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      email: "eu@example.com",
      companyId: "company-1",
    });
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user-1" },
      permissions: ["documentos.view", "documentos.manage"],
    });

    const supabase = mockSupabaseWithDoc("user-2", "company-1");

    const res = await verifyDocumentAction("doc-1", "REJECTED", "Documento ilegível");

    expect(res.success).toBe(true);
    expect(supabase.updatedTables).toContain("documents");
    expect(supabase.from).toHaveBeenCalledWith("document_verifications");
    expect(revalidatePath).toHaveBeenCalled();
  });
});