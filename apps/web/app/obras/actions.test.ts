import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { addTaskAction, updateProjectProgressAction } from "./actions";
import { getClientById } from "@/app/clientes/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import { revalidatePath } from "next/cache";

const USER_1 = "11111111-1111-4111-8111-111111111111";
const USER_2 = "22222222-2222-4222-8222-222222222222";
const PROJ_1 = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

function makeSupabase(overrides: Record<string, unknown | null>) {
  const insertPayloads: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const updated: Array<string> = [];
  const eqCalls: Array<{ table: string; col: string; val: unknown }> = [];
  const orFilters: Array<{ table: string; filter: string }> = [];
  const from = vi.fn((table: string) => {
    const pushEq = (col: string, val: unknown) => {
      eqCalls.push({ table, col, val });
      return chain;
    };
    const chain: any = {
      select: vi.fn(() => chain),
      eq: pushEq,
      or: vi.fn((filter: string) => {
        orFilters.push({ table, filter });
        return chain;
      }),
      in: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: overrides[table] ?? null, error: null }),
      ),
      single: vi.fn(() =>
        Promise.resolve({ data: overrides[table] ?? null, error: null }),
      ),
      insert: vi.fn((payload: Record<string, unknown>) => {
        insertPayloads.push({ table, payload });
        return chain;
      }),
      update: vi.fn(() => {
        updated.push(table);
        return chain;
      }),
    };
    return chain;
  });
  return {
    from,
    insertPayloads,
    updatedTables: () => updated,
    eqCallsFor: (table: string, col: string) =>
      eqCalls.filter((c) => c.table === table && c.col === col).map((c) => c.val),
    orFiltersFor: (table: string) =>
      orFilters.filter((c) => c.table === table).map((c) => c.filter),
  };
}

function mockUser(id: string, companyId: string | null) {
  (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    id,
    email: "eu@example.com",
    companyId,
  });
}

function taskForm(): FormData {
  const form = new FormData();
  form.set("title", "Tarefa");
  return form;
}

describe("obras/actions - ACL de projeto (cross-tenant)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const noAccess = { success: false, error: "Sem acesso a este projeto." };

  it("adicionar tarefa sem sessao falha sem escrita", async () => {
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const supabase = makeSupabase({});
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await addTaskAction(PROJ_1, taskForm());

    expect(res).toEqual({ success: false, error: "Sessão não iniciada." });
    expect(supabase.insertPayloads.length).toBe(0);
  });

  it("adicionar tarefa a projeto de outra empresa falha sem escrita", async () => {
    mockUser(USER_1, "company-1");
    const supabase = makeSupabase({ projects: { company_id: "company-2", client_id: USER_2 } });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await addTaskAction(PROJ_1, taskForm());

    expect(res).toEqual(noAccess);
    expect(supabase.insertPayloads.length).toBe(0);
  });

  it("adicionar tarefa a projeto da propria empresa permite escrever", async () => {
    mockUser(USER_1, "company-1");
    const supabase = makeSupabase({ projects: { company_id: "company-1", client_id: USER_2 } });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await addTaskAction(PROJ_1, taskForm());

    expect(res.success).toBe(true);
    expect(supabase.insertPayloads.some((i) => i.table === "project_tasks")).toBe(true);
  });

  it("sem empresa, so o proprio (client_id) pode mutar o projeto", async () => {
    mockUser(USER_1, null);
    const supabase = makeSupabase({ projects: { company_id: null, client_id: USER_1 } });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await updateProjectProgressAction(PROJ_1, 50, "IN_PROGRESS");

    expect(res.success).toBe(true);
    expect(supabase.updatedTables()).toContain("projects");
  });

  it("sem empresa, projeto de outro utilizador nao pode ser alterado", async () => {
    mockUser(USER_1, null);
    const supabase = makeSupabase({ projects: { company_id: null, client_id: USER_2 } });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await updateProjectProgressAction(PROJ_1, 50);

    expect(res).toEqual(noAccess);
    expect(supabase.updatedTables().length).toBe(0);
  });
});

describe("clientes/actions - getClientById cross-tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("com empresa, projetos/cotacoes do cliente sao escopados à empresa do ator", async () => {
    mockUser(USER_1, "company-1");
    const supabase = makeSupabase({
      profiles: { user_id: USER_2, name: "Cliente", company_id: "company-1" },
      projects: [],
      quotes: [],
      audit_logs: [],
    });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await getClientById(USER_2);

    expect(res).not.toBeNull();
    expect(supabase.eqCallsFor("projects", "client_id")).toContain(USER_2);
    expect(supabase.eqCallsFor("projects", "company_id")).toContain("company-1");
    expect(supabase.eqCallsFor("quotes", "company_id")).toContain("company-1");
    // audit_logs do cliente escopados à empresa do ator (nunca o registo de
    // outra empresa para o mesmo utilizador partilhado).
    expect(
      supabase.orFiltersFor("audit_logs").some((f) => f.includes("company_id.eq.company-1")),
    ).toBe(true);
  });

  it("sem empresa, audit_logs do próprio não têm filter de empresa", async () => {
    mockUser(USER_1, null);
    const supabase = makeSupabase({ profiles: { user_id: USER_1, name: "Eu" } });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await getClientById(USER_1);

    expect(res).not.toBeNull();
    expect(supabase.eqCallsFor("audit_logs", "user_id")).toContain(USER_1);
    expect(supabase.orFiltersFor("audit_logs")).toHaveLength(0);
  });

  it("sem empresa, e recusado ver cliente que nao seja o proprio", async () => {
    mockUser(USER_1, null);
    const supabase = makeSupabase({});
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await getClientById(USER_2);

    expect(res).toBeNull();
  });
});