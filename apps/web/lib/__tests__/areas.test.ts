import { describe, it, expect } from "vitest";
import { NAV_GROUPS, PAGE_PERMISSIONS, filterNavGroups } from "@/lib/navigation";
import {
  DEFAULT_AREA_ID,
  PROFESSIONAL_AREAS,
  areaModules,
  effectivePermissionsForArea,
  filterNavGroupsByArea,
  resolveArea,
  specialitiesForArea,
} from "@/lib/areas";

const NAV_HREFS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));

describe("areas (M-A)", () => {
  it("resolveArea cai no default para id desconhecido ou nulo (a)", () => {
    expect(resolveArea("nao-existe").id).toBe(DEFAULT_AREA_ID);
    expect(resolveArea(null).id).toBe(DEFAULT_AREA_ID);
    expect(resolveArea(undefined).id).toBe(DEFAULT_AREA_ID);
    expect(resolveArea("enfermagem").id).toBe("enfermagem");
  });

  it("enfermagem expõe módulos essenciais que existem na NAV_GROUPS (a)", () => {
    const area = resolveArea("enfermagem");
    expect(area.modules).toContain("/saude");
    expect(area.modules).toContain("/agenda");
    expect(area.modules).toContain("/tarefas");
    expect(area.modules).toContain("/documentos");
    expect(area.modules).toContain("/clientes");
    for (const href of area.modules) {
      expect(NAV_HREFS).toContain(href);
    }
    expect(PAGE_PERMISSIONS["/saude"]).toBe("saude.view");
  });

  it("effectivePermissionsForArea une RBAC + grants sem subtrair (a)", () => {
    const efetivas = effectivePermissionsForArea(["faturacao.view"], "enfermagem");
    expect(efetivas).toContain("faturacao.view"); // RBAC preservado
    expect(efetivas).toContain("saude.view"); // grant da área
    expect(new Set(efetivas).size).toBe(efetivas.length); // sem duplicados
  });

  it("filterNavGroupsByArea restringe ao subconjunto da área (b)", () => {
    const grupos = filterNavGroupsByArea([], "enfermagem");
    const hrefs = grupos.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toContain("/saude");
    expect(hrefs).toContain("/agenda");
    expect(hrefs).not.toContain("/obras");
    expect(hrefs).not.toContain("/faturacao");
  });

  it("área 'outra' não restringe (devolve a navegação RBAC) (b)", () => {
    const comArea = filterNavGroupsByArea(["*"], "outra");
    const rbac = filterNavGroups(["*"]);
    expect(comArea.length).toBe(rbac.length);
  });

  it("areaModules resolve hrefs/labels e 'outra' devolve vazio (a)", () => {
    const mods = areaModules("enfermagem");
    expect(mods.length).toBeGreaterThan(0);
    for (const m of mods) {
      expect(m.label).toBeTruthy();
    }
    expect(areaModules("outra")).toEqual([]);
  });

  it("cada área define especialidades não vazias para o registo (a)", () => {
    for (const area of PROFESSIONAL_AREAS) {
      expect(specialitiesForArea(area.id).length).toBeGreaterThan(0);
    }
  });
});
