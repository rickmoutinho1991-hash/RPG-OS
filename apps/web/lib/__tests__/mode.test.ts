import { describe, it, expect } from "vitest";
import { NAV_GROUPS } from "@/lib/navigation";
import {
  DEFAULT_MODE,
  MODE_COOKIE,
  MODE_PERSONAL,
  MODE_WORK,
  WORK_GROUP_LABELS,
  classifyGroupLabel,
  orderGroupsForMode,
} from "@/lib/mode";

const GROUP_LABELS = NAV_GROUPS.map((g) => g.label);

describe("modo de espaço — Pessoal/Trabalho (M-C)", () => {
  it("default é pessoal; classifica os grupos-chave (a)", () => {
    expect(DEFAULT_MODE).toBe(MODE_PERSONAL);
    expect(classifyGroupLabel("Negócio")).toBe(MODE_WORK);
    expect(classifyGroupLabel("Finanças")).toBe(MODE_WORK);
    expect(classifyGroupLabel("Operações")).toBe(MODE_WORK);
    expect(classifyGroupLabel("Administração")).toBe(MODE_WORK);
    expect(classifyGroupLabel("Vida")).toBe(MODE_PERSONAL);
    expect(classifyGroupLabel("Início")).toBe(MODE_PERSONAL);
    expect(classifyGroupLabel("Mercado")).toBe(MODE_PERSONAL);
  });

  it("todos os grupos da navegação têm classificação definida (b)", () => {
    for (const label of GROUP_LABELS) {
      expect([MODE_PERSONAL, MODE_WORK]).toContain(classifyGroupLabel(label));
    }
  });

  it("modo pessoal coloca os grupos pessoais primeiro (c)", () => {
    const ordenados = orderGroupsForMode(
      NAV_GROUPS.map((g) => ({ label: g.label })),
      MODE_PERSONAL,
    ).map((g) => g.label);
    const idxVida = ordenados.indexOf("Vida");
    const idxNegocio = ordenados.indexOf("Negócio");
    const idxMercado = ordenados.indexOf("Mercado");
    const idxFinancas = ordenados.indexOf("Finanças");
    expect(idxVida).toBeLessThan(idxNegocio);
    expect(idxMercado).toBeLessThan(idxFinancas);
  });

  it("modo trabalho inverte a prioridade (d)", () => {
    const ordenados = orderGroupsForMode(
      NAV_GROUPS.map((g) => ({ label: g.label })),
      MODE_WORK,
    ).map((g) => g.label);
    expect(ordenados.indexOf("Negócio")).toBeLessThan(ordenados.indexOf("Vida"));
    expect(ordenados.indexOf("Finanças")).toBeLessThan(ordenados.indexOf("Mercado"));
    expect(ordenados.indexOf("Operações")).toBeLessThan(ordenados.indexOf("Trabalho"));
  });

  it("ambos os modos preservam todos os grupos — espaço único (e)", () => {
    const base = NAV_GROUPS.map((g) => g.label);
    const pessoal = orderGroupsForMode(
      NAV_GROUPS.map((g) => ({ label: g.label })),
      MODE_PERSONAL,
    ).map((g) => g.label);
    const trabalho = orderGroupsForMode(
      NAV_GROUPS.map((g) => ({ label: g.label })),
      MODE_WORK,
    ).map((g) => g.label);
    expect(new Set(pessoal)).toEqual(new Set(base));
    expect(new Set(trabalho)).toEqual(new Set(base));
    expect(new Set(WORK_GROUP_LABELS)).toEqual(
      new Set(["Operações", "Negócio", "Finanças", "Administração"]),
    );
    expect(MODE_COOKIE).toBe("rpgos_mode");
  });
});