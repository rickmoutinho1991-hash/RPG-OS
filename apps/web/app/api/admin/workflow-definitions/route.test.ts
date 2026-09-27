import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";
import { getSessionContext } from "@/lib/session";
import { getWorkflowDefinitionsAction } from "@/app/administracao/actions";

vi.mock("@/lib/session", () => ({
  getSessionContext: vi.fn(),
}));

vi.mock("@/app/administracao/actions", () => ({
  getWorkflowDefinitionsAction: vi.fn(),
}));

function authCtx(permissions: string[]): unknown {
  return {
    user: { id: "user-1" },
    organization: { id: "org-1" },
    permissions,
    availableOrganizations: [],
  };
}

describe("GET /api/admin/workflow-definitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("401 quando não autenticado", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(getWorkflowDefinitionsAction).not.toHaveBeenCalled();
  });

  it("403 com apenas admin.view (sem workflows.manage) — sem lista vazia silenciosa", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      authCtx(["admin.view"]),
    );

    const res = await GET();

    expect(res.status).toBe(403);
    expect(getWorkflowDefinitionsAction).not.toHaveBeenCalled();
  });

  it("200 com workflows.manage, devolvendo as definições", async () => {
    (vi.mocked(getSessionContext) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      authCtx(["workflows.manage"]),
    );
    (vi.mocked(getWorkflowDefinitionsAction) as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      [{ id: "def-1", key: "aprovacao" }],
    );

    const res = await GET();

    expect(res.status).toBe(200);
    expect(getWorkflowDefinitionsAction).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.definitions).toHaveLength(1);
  });
});