/**
 * RPG-OS — Audit de mutações de memória (M3): a rota /api/memories audita
 * POST/DELETE com {action, key, kind, actorId} e NUNCA o value (dado pessoal).
 * Falha de audit não bloqueia a mutação (política M3) — resposta mantém 200.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MEMORY_ENTRY_SET, MEMORY_ENTRY_DELETED } from "@rpg/core";
import { POST, DELETE } from "@/app/api/memories/route";

const { upsertSpy, deleteSpy, auditSpy } = vi.hoisted(() => ({
  upsertSpy: vi.fn(async (_input: Record<string, unknown>) => undefined),
  deleteSpy: vi.fn(async (_userId: string, _key: string) => undefined),
  auditSpy: vi.fn(async (_input: Record<string, unknown>) => ({
    auditId: "audit-1",
    integrityHash: "audit-hash-1",
  })),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
  },
}));

vi.mock("@/lib/session", () => ({
  getSessionContext: vi.fn(async () => ({ user: { id: "user-test-42" } })),
}));

vi.mock("@/lib/memory/supabaseStore", () => ({
  SupabaseMemoryStore: class {
    async getUserMemories() {
      return [];
    }
    async upsertMemory(input: Record<string, unknown>) {
      return upsertSpy(input);
    }
    async deleteMemory(userId: string, key: string) {
      return deleteSpy(userId, key);
    }
  },
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: (input: Record<string, unknown>) => auditSpy(input),
}));

function payloadOfCall(index: number): Record<string, unknown> {
  return auditSpy.mock.calls[index][0];
}

beforeEach(() => {
  upsertSpy.mockClear();
  deleteSpy.mockClear();
  auditSpy.mockClear();
});

describe("POST /api/memories → MEMORY_ENTRY_SET", () => {
  it("audita payload {action, key, kind, actorId} sem nunca gravar o value", async () => {
    const request = new Request("http://localhost/api/memories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: "muted_categories",
        kind: "preference",
        value: { maracuja_secret: ["finance"], pin_pessoal_777: "nao-pode-aparecer" },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });

    expect(upsertSpy).toHaveBeenCalledOnce();
    expect(auditSpy).toHaveBeenCalledOnce();

    const payload = payloadOfCall(0);
    expect(payload.action).toBe(MEMORY_ENTRY_SET);
    expect(payload.module).toBe("memory");
    expect(payload.entityType).toBe("memory_entry");
    expect(payload.userId).toBe("user-test-42");
    expect(payload.metadata).toEqual({ key: "muted_categories", kind: "preference" });

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("maracuja_secret");
    expect(serialized).not.toContain("pin_pessoal_777");
  });

  it("audit a lançar erro → mutação prossegue e resposta mantém 200", async () => {
    auditSpy.mockRejectedValueOnce(new Error("audit_db_indisponivel"));

    const request = new Request("http://localhost/api/memories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "theme", kind: "preference", value: { dark: true } }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(upsertSpy).toHaveBeenCalledOnce();
    expect(auditSpy).toHaveBeenCalledOnce();
  });
});

describe("DELETE /api/memories → MEMORY_ENTRY_DELETED", () => {
  it("audita payload {action, key, actorId} sem value", async () => {
    const request = new Request("http://localhost/api/memories", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "muted_categories" }),
    });

    const response = await DELETE(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });

    expect(deleteSpy).toHaveBeenCalledOnce();
    expect(auditSpy).toHaveBeenCalledOnce();

    const payload = payloadOfCall(0);
    expect(payload.action).toBe(MEMORY_ENTRY_DELETED);
    expect(payload.module).toBe("memory");
    expect(payload.entityType).toBe("memory_entry");
    expect(payload.metadata).toEqual({ key: "muted_categories" });
    expect(JSON.stringify(payload)).not.toContain("value");
  });
});