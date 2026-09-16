import { describe, it, expect } from "vitest";
import { hasPermission, PERSONAL_BASELINE_PERMISSIONS } from "@rpg/core";
import { NAV_GROUPS, PAGE_PERMISSIONS, filterNavGroups } from "@/lib/navigation";
import {
  PROFESSIONAL_AREAS,
  effectivePermissionsForArea,
  filterNavGroupsByArea,
} from "@/lib/areas";

const NAV_HREFS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));

describe("mercado — acesso transversal (M-B)", () => {
  it("o mercado está na navegação e protegido por marketplace.view (a)", () => {
    expect(NAV_HREFS).toContain("/mercado");
    expect(NAV_HREFS).toContain("/mercado/contratos");
    expect(PAGE_PERMISSIONS["/mercado"]).toBe("marketplace.view");
    expect(PAGE_PERMISSIONS["/mercado/contratos"]).toBe("marketplace.contracts.view");
  });

  it("o menu mostra o mercado a quem tem marketplace.view (a)", () => {
    const hrefs = filterNavGroups([
      "marketplace.view",
      "marketplace.contracts.view",
    ]).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toContain("/mercado");
    expect(hrefs).toContain("/mercado/contratos");
  });

  it("todas as áreas profissionais dão acesso ao mercado (b)", () => {
    for (const area of PROFESSIONAL_AREAS) {
      if (area.modules.length === 0) continue; // "outra" não restringe
      expect(area.modules).toContain("/mercado");
      expect(area.grants).toContain("marketplace.view");
    }
    // "outra" (sem restrição) continua a ver o mercado via RBAC/baseline.
    const outra = PROFESSIONAL_AREAS.find((a) => a.id === "outra");
    expect(outra?.modules).toEqual([]);
    const hrefs = filterNavGroupsByArea(["marketplace.view"], "outra").flatMap((g) =>
      g.items.map((i) => i.href),
    );
    expect(hrefs).toContain("/mercado");
  });

  it("uma área especializada continua a ver o mercado (b)", () => {
    const hrefs = filterNavGroupsByArea([], "enfermagem").flatMap((g) =>
      g.items.map((i) => i.href),
    );
    expect(hrefs).toContain("/mercado");
  });

  it("effectivePermissionsForArea preserva o acesso ao mercado da área (b)", () => {
    const efetivas = effectivePermissionsForArea([], "construcao");
    expect(hasPermission(efetivas, "marketplace.view")).toBe(true);
    expect(hasPermission(efetivas, "marketplace.quotes.create")).toBe(true);
  });

  it("o baseline pessoal permite criar pedidos e propostas (c)", () => {
    expect(PERSONAL_BASELINE_PERMISSIONS).toContain("marketplace.view");
    expect(
      hasPermission(PERSONAL_BASELINE_PERMISSIONS, "marketplace.requests.create"),
    ).toBe(true);
    expect(
      hasPermission(PERSONAL_BASELINE_PERMISSIONS, "marketplace.quotes.create"),
    ).toBe(true);
    expect(
      hasPermission(PERSONAL_BASELINE_PERMISSIONS, "marketplace.contracts.view"),
    ).toBe(true);
  });

  it("sem permissões o mercado não aparece e a ação é negada (c)", () => {
    const hrefs = filterNavGroups([]).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain("/mercado");
    expect(hasPermission([], "marketplace.requests.create")).toBe(false);
  });
});
