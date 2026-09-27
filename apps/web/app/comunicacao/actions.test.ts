import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startDmAction } from "./actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import { getSessionContext } from "@/lib/session";
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

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const ME = "11111111-1111-4111-8111-111111111111";
const COLLEAGUE = "22222222-2222-4222-8222-222222222222";

function makeSupabase(overrides: Record<string, unknown | null>) {
  const insertPayloads: Array<{ table: string; payload: unknown }> = [];
  const from = vi.fn((table: string) => {
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      is: vi.fn(() => chain),
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
      upsert: vi.fn((payload: Record<string, unknown>) => {
        insertPayloads.push({ table, payload });
        return chain;
      }),
    };
    return chain;
  });
  return { from, insertPayloads };
}

function session() {
  (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: ME, name: "Eu" },
    organization: { id: "org-1" },
    permissions: ["comunicacao.view"],
  });
}

function dmForm(): FormData {
  const form = new FormData();
  form.set("user_id", COLLEAGUE);
  return form;
}

describe("comunicacao/actions - startDmAction (colega obrigatório)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("envia DM sem colegialidade (sem org nem empresa) — recusado, sem escrita", async () => {
    session();
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: ME,
      email: "me@example.com",
    });
    const supabase = makeSupabase({});
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await startDmAction(dmForm());

    expect(res).toEqual({
      error: "Destinatário não é membro da sua organização nem da sua empresa.",
    });
    expect(supabase.insertPayloads.filter((i) => i.table === "comms_channels")).toHaveLength(0);
  });

  it("colega na mesma empresa (company_employees) pode receber DM", async () => {
    session();
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: ME,
      email: "me@example.com",
      companyId: "company-1",
    });
    const supabase = makeSupabase({
      org_memberships: null,
      company_employees: { id: "link" },
      comms_channels: null,
      single: { comms_channels: { id: "ch-1", slug: "dm-slug" } },
    });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await startDmAction(dmForm());

    expect(res).toEqual({ success: true, channelSlug: "dm-slug" });
    const created = supabase.insertPayloads.filter((i) => i.table === "comms_channels");
    expect(created).toHaveLength(1);
    const members = supabase.insertPayloads.filter((i) => i.table === "comms_channel_members");
    expect(members).toHaveLength(1);
    expect(JSON.stringify(members[0].payload)).toContain(ME);
    expect(JSON.stringify(members[0].payload)).toContain(COLLEAGUE);
  });

  it("colega na mesma organização (org_memberships ATIVO) pode receber DM", async () => {
    session();
    (vi.mocked(getCurrentUser) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: ME,
      email: "me@example.com",
      companyId: "company-1",
    });
    const supabase = makeSupabase({
      org_memberships: { id: "member-1" },
      company_employees: null,
      comms_channels: { id: "ch-0", slug: "dm-existing" },
    });
    (vi.mocked(createAdminClient) as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const res = await startDmAction(dmForm());

    expect(res).toEqual({ success: true, channelSlug: "dm-existing" });
    const created = supabase.insertPayloads.filter((i) => i.table === "comms_channels");
    expect(created).toHaveLength(0);
  });
});