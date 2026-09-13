import { describe, it, expect } from "vitest";
import { NAV_GROUPS } from "@/lib/navigation";
import {
  buildPublicCatalog,
  isRelevantForActor,
  type ActorTag,
} from "@/lib/publicCatalog";

describe("publicCatalog", () => {
  it("deriva domínios/serviços de NAV_SOURCE sem duplicação (a)", () => {
    const catalog = buildPublicCatalog();
    const domainIds = catalog.map((d) => d.id);
    expect(domainIds).toContain("vida");
    expect(domainIds).toContain("trabalho");
    expect(domainIds).toContain("negocio");
    expect(domainIds).toContain("financas");
    expect(domainIds).toContain("operacoes");
    expect(domainIds).toContain("mercado");

    // Cada serviço vem de NAV_GROUPS (fonte única)
    const allNavHrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    const catalogHrefs = catalog.flatMap((d) =>
      d.services.map((s) => s.href)
    ).filter((h) => !h.startsWith("#")); // mercado usa #anchors

    for (const href of catalogHrefs) {
      expect(allNavHrefs).toContain(href);
    }

    // Sem duplicados de href por domínio
    for (const domain of catalog) {
      const hrefs = domain.services.map((s) => s.href);
      const unique = new Set(hrefs);
      expect(hrefs.length).toBe(unique.size);
    }
  });

  it("cada serviço tem descrição PT-PT de 1 linha (a)", () => {
    const catalog = buildPublicCatalog();
    for (const domain of catalog) {
      for (const service of domain.services) {
        expect(service.description).toBeTruthy();
        expect(typeof service.description).toBe("string");
        expect(service.description.length).toBeGreaterThan(10);
        // Sem quebras de linha (1 linha)
        expect(service.description).not.toContain("\n");
      }
    }
  });

  it("cada domínio tem tagline (a)", () => {
    const catalog = buildPublicCatalog();
    for (const domain of catalog) {
      expect(domain.tagline).toBeTruthy();
      expect(typeof domain.tagline).toBe("string");
    }
  });

  it("chips de ator REALÇAM serviços relevantes sem esconder os outros (b)", () => {
    const catalog = buildPublicCatalog();
    const actors: ActorTag[] = ["Pessoa", "Independente", "Empresa", "Fornecedor"];

    for (const actor of actors) {
      for (const domain of catalog) {
        for (const service of domain.services) {
          const relevant = isRelevantForActor(service, actor);
          // A função existe e retorna boolean
          expect(typeof relevant).toBe("boolean");
          // Se relevante, deve incluir o ator
          if (relevant) {
            expect(service.actors).toContain(actor);
          }
          // Se não relevante, NÃO deve remover o serviço (apenas dimmed no UI)
          // O teste de UI (dimmed) é no componente, aqui validamos a lógica de relevância
        }
      }
    }
  });

  it("domínio mercado marcado como demo com steps do ciclo (a)", () => {
    const catalog = buildPublicCatalog();
    const mercado = catalog.find((d) => d.id === "mercado");
    expect(mercado).toBeTruthy();
    expect(mercado!.demo).toBe(true);
    expect(mercado!.services.length).toBeGreaterThan(0);
    // Steps usam #anchors
    for (const s of mercado!.services) {
      expect(s.href).toMatch(/^#/);
    }
  });
});