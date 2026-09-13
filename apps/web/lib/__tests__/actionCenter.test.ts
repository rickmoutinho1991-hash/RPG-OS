/**
 * RPG-OS — composeBriefingLines: separação FACT/INFERENCIA/RECOMENDACAO (§38).
 * Função pura; nenhuma query, nenhuma rede, nenhum fake.
 */
import { describe, it, expect } from "vitest";
import {
  composeBriefingLines,
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
    const lines = composeBriefingLines([
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
    const lines = composeBriefingLines([
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

  it("lista vazia devolve lista vazia", () => {
    expect(composeBriefingLines([])).toEqual([]);
  });

  it("preserva a ordem e o número de itens", () => {
    const items: ActionAlert[] = [
      alert({ id: "bill-overdue-1", severity: "URGENT", title: "Conta vencida", detail: "Eletricidade — 45,90 €" }),
      alert({ id: "wf-2", severity: "INFO", title: "Pedido à sua espera", detail: "ORCAMENTO" }),
      alert({ id: "doc-expiring-3", severity: "WARNING", title: "Documento a expirar", detail: "Cartão cidadão" }),
    ];
    const lines = composeBriefingLines(items);
    expect(lines.map((l) => l.id)).toEqual(["bill-overdue-1", "wf-2", "doc-expiring-3"]);
    expect(lines.map((l) => l.href)).toEqual(["/x", "/x", "/x"]);
  });

  it("item sem detalhe usa o título como fact", () => {
    const lines = composeBriefingLines([
      alert({ id: "notif-5", severity: "URGENT", title: "Tentativa de acesso detetada" }),
    ]);
    expect(lines[0].fact).toContain("Tentativa de acesso detetada");
  });
});