/**
 * RPG-OS — toggleMutedCategory (P4): payload do mute preserva as categorias
 * prévias; o unmute remove apenas a categoria visada. Funções puras.
 */
import { describe, it, expect } from "vitest";
import {
  toggleMutedCategory,
  groupByCategory,
  categoryLabel,
  isMutableCategory,
} from "../briefingMute";

describe("toggleMutedCategory", () => {
  it("mute preserva categorias prévias e adiciona a visada (nova lista)", () => {
    const input = ["finance", "docs"];
    const next = toggleMutedCategory(input, "saude");
    expect(next).toEqual(["finance", "docs", "saude"]);
    expect(next).not.toBe(input);
    expect(input).toEqual(["finance", "docs"]);
  });

  it("unmute remove apenas a categoria visada", () => {
    const next = toggleMutedCategory(["finance", "docs", "saude"], "finance");
    expect(next).toEqual(["docs", "saude"]);
  });

  it("toggle quando já presente remove (não duplica)", () => {
    expect(toggleMutedCategory(["finance", "finance"], "finance")).toEqual([]);
    expect(toggleMutedCategory(["finance"], "docs")).toEqual([
      "finance",
      "docs",
    ]);
  });
});

describe("taxonomia de categorias", () => {
  it("groupByCategory agrupa mantendo ordem relativa", () => {
    const items = [
      { id: "a", category: "finance" },
      { id: "b", category: "docs" },
      { id: "c", category: "finance" },
    ];
    const groups = groupByCategory(items);
    expect(Array.from(groups.keys())).toEqual(["finance", "docs"]);
    expect(groups.get("finance")?.map((i) => i.id)).toEqual(["a", "c"]);
    expect(groups.get("docs")?.map((i) => i.id)).toEqual(["b"]);
  });

  it("as 6 categorias do briefing são silenciáveis", () => {
    for (const cat of [
      "finance",
      "obras",
      "fiscal",
      "saude",
      "aprovacoes",
      "docs",
    ]) {
      expect(isMutableCategory(cat)).toBe(true);
    }
    expect(isMutableCategory("tarefas")).toBe(false);
  });

  it("categoryLabel devolve etiqueta legível (fallback = própria categoria)", () => {
    expect(categoryLabel("finance")).toContain("Finanças");
    expect(categoryLabel("desconhecida")).toBe("desconhecida");
  });
});