import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";
import { getSessionContext } from "@/lib/session";

vi.mock("@/lib/session", () => ({
  getSessionContext: vi.fn(),
}));

describe("GET /api/session-context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("401 quando anónimo (não devolve 200 com null)", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("200 com o contexto quando autenticado", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user-1" },
      organization: null,
      permissions: ["inicio.view"],
      availableOrganizations: [],
    });

    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.id).toBe("user-1");
  });
});