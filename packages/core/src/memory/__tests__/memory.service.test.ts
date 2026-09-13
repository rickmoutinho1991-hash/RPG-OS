import { describe, it, expect } from "vitest";
import { MemoryService } from "../service";
import {
  isMemoryKind,
  type MemoryStore,
  type UserMemory,
} from "../types";

const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

class InMemoryMemoryStore implements MemoryStore {
  private rows: UserMemory[] = [];
  private nextId = 1;

  async getUserMemories(actorId: string): Promise<UserMemory[]> {
    return this.rows
      .filter((r) => r.userId === actorId)
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async upsertMemory(input: {
    userId: string;
    key: string;
    value: Record<string, unknown>;
    kind: UserMemory["kind"];
  }): Promise<void> {
    const existing = this.rows.find(
      (r) => r.userId === input.userId && r.key === input.key,
    );
    if (existing) {
      existing.value = input.value;
      existing.kind = input.kind;
      existing.updatedAt = new Date(Date.now() + this.nextId * 1000).toISOString();
      this.nextId += 1;
      return;
    }
    this.rows.push({
      id: `mem-${this.nextId}`,
      userId: input.userId,
      key: input.key,
      value: input.value,
      kind: input.kind,
      updatedAt: new Date(Date.now() + this.nextId * 1000).toISOString(),
    });
    this.nextId += 1;
  }

  async deleteMemory(userId: string, key: string): Promise<void> {
    this.rows = this.rows.filter(
      (r) => !(r.userId === userId && r.key === key),
    );
  }
}

function freshService(): MemoryService {
  return new MemoryService(new InMemoryMemoryStore());
}

describe("MemoryService", () => {
  it("set + get: persiste e devolve memórias do ator", async () => {
    const svc = freshService();

    await svc.set(ACTOR, "iluminacao", { note: "Led quente, dimmer 60%" }, "preference");
    await svc.set(ACTOR, "checked-in", { note: "Febre? ler câmara fria 07:30" }, "context");
    await svc.set(OTHER_ACTOR, "outro", { note: "não deve aparecer" }, "fact");

    const memories = await svc.get(ACTOR);

    expect(memories).toHaveLength(2);
    const keys = memories.map((m) => m.key).sort();
    expect(keys).toEqual(["checked-in", "iluminacao"]);
    expect(memories.every((m) => m.userId === ACTOR)).toBe(true);
  });

  it("set: sobrescreve a mesma key (upsert), sem duplicar", async () => {
    const svc = freshService();

    await svc.set(ACTOR, "iluminacao", { note: "v1" }, "preference");
    await svc.set(ACTOR, "iluminacao", { note: "v2" }, "fact");

    const memories = await svc.get(ACTOR);

    expect(memories).toHaveLength(1);
    expect(memories[0].value.note).toBe("v2");
    expect(memories[0].kind).toBe("fact");
  });

  it("delete: remove memória por key", async () => {
    const svc = freshService();

    await svc.set(ACTOR, "a", { note: "1" }, "fact");
    await svc.set(ACTOR, "b", { note: "2" }, "context");
    await svc.delete(ACTOR, "a");

    const memories = await svc.get(ACTOR);
    expect(memories.map((m) => m.key)).toEqual(["b"]);
  });

  it("fail-closed: actorId vazio/em branco é rejeitado em get/set/delete", async () => {
    const svc = freshService();

    await expect(svc.get("")).rejects.toThrow("Ator em falta.");
    await expect(svc.get("   ")).rejects.toThrow("Ator em falta.");
    await expect(
      svc.set("", "k", { note: "1" }, "fact"),
    ).rejects.toThrow("Ator em falta.");
    await expect(
      svc.set("  ", "k", { note: "1" }, "fact"),
    ).rejects.toThrow("Ator em falta.");
    await expect(svc.delete("", "k")).rejects.toThrow("Ator em falta.");
  });

  it("fail-closed: kind inválido e valor null/array/vazio são rejeitados", async () => {
    const svc = freshService();
    const uid = ACTOR;
    const badKind = "memory" as "fact";

    expect(isMemoryKind("preference")).toBe(true);
    expect(isMemoryKind("fact")).toBe(true);
    expect(isMemoryKind("context")).toBe(true);
    expect(isMemoryKind("memory")).toBe(false);

    await expect(
      svc.set(uid, "k", { note: "x" }, badKind),
    ).rejects.toThrow("Kind inválido.");
    await expect(
      svc.set(uid, "k", null as unknown as Record<string, unknown>, "fact"),
    ).rejects.toThrow("Valor inválido");
    await expect(
      svc.set(uid, "k", [] as unknown as Record<string, unknown>, "fact"),
    ).rejects.toThrow("Valor inválido");
    await expect(
      svc.set(uid, "k", {} as Record<string, unknown>, "fact"),
    ).rejects.toThrow("Valor inválido");
    await expect(svc.set(uid, "", { note: "x" }, "fact")).rejects.toThrow(
      "Key inválida",
    );
  });
});