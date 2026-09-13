/**
 * RPG-OS — composeBriefingLines: separação FACT/INFERENCIA/RECOMENDACAO (§38)
 * e briefing × memória (categorias silenciadas).
 * Função pura; nenhuma query, nenhuma rede, nenhum fake (exceto ports injectadas).
 */
import { describe, it, expect } from "vitest";
import {
  MemoryService,
  type MemoryStore,
  type SessionContext,
  type UserMemory,
} from "@rpg/core";
import {
  composeBriefingLines,
  loadMutedCategories,
  resolveMutedCategories,
  type ActionAlert,
} from "../actionCenter";

function alert(over: Partial<ActionAlert> & Pick<ActionAlert, "id" | "title">): ActionAlert {
  return {
    severity: "INFO",
    href: "/x",
    ...over,
  };
}

describe("composeBriefingLines", () => {
  it("separa fact / inference / recommendation em campos distintos", () => {
    const { lines } = composeBriefingLines([
      alert({
        id: "task-1",
        severity: "URGENT",
        title: "Tarefa atrasada",
        detail: "Fechar faturação",
        href: "/tarefas",
      }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].fact).toContain("Fechar faturação");
    expect(lines[0].inference).toMatch(/^Inferência:/);
    expect(lines[0].recommendation?.length).toBeGreaterThan(0);
    expect(lines[0].fact === lines[0].inference).toBe(false);
  });

  it("item sem inference (compromissos) mantém fact + recommendation", () => {
    const { lines } = composeBriefingLines([
      alert({
        id: "event-9",
        severity: "INFO",
        title: "Compromisso nas próximas 24 horas",
        detail: "Reunião equipa • 14/09/2026, 10:00",
        href: "/agenda",
      }),
    ]);
    expect(lines[0].inference).toBeUndefined();
    expect(lines[0].fact).toContain("Reunião equipa");
    expect(lines[0].recommendation).toBeTruthy();
  });

  it("lista vazia devolve lista vazia sem resumo", () => {
    const report = composeBriefingLines([]);
    expect(report.lines).toEqual([]);
    expect(report.summary).toBeUndefined();
  });

  it("preserva a ordem e o número de itens", () => {
    const items: ActionAlert[] = [
      alert({ id: "bill-overdue-1", severity: "URGENT", title: "Conta vencida", detail: "Eletricidade — 45,90 €" }),
      alert({ id: "wf-2", severity: "INFO", title: "Pedido à sua espera", detail: "ORCAMENTO" }),
      alert({ id: "doc-expiring-3", severity: "WARNING", title: "Documento a expirar", detail: "Cartão cidadão" }),
    ];
    const { lines } = composeBriefingLines(items);
    expect(lines.map((l) => l.id)).toEqual(["bill-overdue-1", "wf-2", "doc-expiring-3"]);
    expect(lines.map((l) => l.href)).toEqual(["/x", "/x", "/x"]);
  });

  it("item sem detalhe usa o título como fact", () => {
    const { lines } = composeBriefingLines([
      alert({ id: "notif-5", severity: "URGENT", title: "Tentativa de acesso detetada" }),
    ]);
    expect(lines[0].fact).toContain("Tentativa de acesso detetada");
  });
});

describe("briefing × memória", () => {
  it("categorias silenciadas removem itens e geram inferência no resumo", () => {
    const items: ActionAlert[] = [
      alert({ id: "bill-overdue-1", severity: "URGENT", title: "Conta vencida", detail: "Eletricidade — 45,90 €" }),
      alert({ id: "event-7", severity: "INFO", title: "Compromisso hoje", detail: "Reunião • 10:00" }),
      alert({ id: "task-2", severity: "WARNING", title: "Tarefa atrasada", detail: "Fechar faturação" }),
    ];
    const report = composeBriefingLines(items, {
      mutedCategories: ["bill", "task"],
    });
    expect(report.lines.map((l) => l.id)).toEqual(["event-7"]);
    expect(report.summary).toBe(
      "Segundo a tua memória: 2 categorias silenciadas.",
    );
  });

  it("categoria silenciada sem itens hoje não remove nada nem gera resumo", () => {
    const items: ActionAlert[] = [
      alert({ id: "task-2", severity: "WARNING", title: "Tarefa atrasada", detail: "Entregar relatório" }),
    ];
    const report = composeBriefingLines(items, {
      mutedCategories: ["wf", "doc"],
    });
    expect(report.lines).toHaveLength(1);
    expect(report.summary).toBeUndefined();
  });

  it("sem memórias ou erro do store → sem filtro (briefing nunca cai)", async () => {
    const ctx = { user: { id: "user-1" } } as unknown as SessionContext;

    expect(resolveMutedCategories([])).toEqual([]);

    const prefMemory: UserMemory = {
      id: "m1",
      userId: "user-1",
      key: "muted_categories",
      value: { categories: ["bill"] },
      kind: "preference",
      updatedAt: "2026-09-13T10:00:00.000Z",
    };
    expect(resolveMutedCategories([prefMemory])).toEqual(["bill"]);

    const emptyStore: MemoryStore = {
      getUserMemories: async () => [],
      upsertMemory: async () => {},
      deleteMemory: async () => {},
    };
    expect(await loadMutedCategories(ctx, new MemoryService(emptyStore))).toEqual([]);

    const failingStore: MemoryStore = {
      getUserMemories: async () => {
        throw new Error("ligação falhou");
      },
      upsertMemory: async () => {},
      deleteMemory: async () => {},
    };
    expect(await loadMutedCategories(ctx, new MemoryService(failingStore))).toEqual([]);

    const report = composeBriefingLines(
      [alert({ id: "bill-overdue-1", severity: "URGENT", title: "Conta vencida" })],
      { mutedCategories: [] },
    );
    expect(report.lines).toHaveLength(1);
    expect(report.summary).toBeUndefined();
  });
});