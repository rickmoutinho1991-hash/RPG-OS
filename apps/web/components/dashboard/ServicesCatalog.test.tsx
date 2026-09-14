import { describe, it, expect } from "vitest";
import { buildPublicCatalog, isRelevantForActor, type ActorTag } from "@/lib/publicCatalog";

describe("ServicesCatalog - P5-B tests", () => {
  const mockCounts = {
    approvals: 3,
    overdueBills: 2,
    expiringDocs: 1,
    complaints: 0,
  };

  it("badges do catálogo só de counts fornecidos (sem counts → chip neutro) (c)", () => {
    const catalog = buildPublicCatalog();
    
    const financasDomain = catalog.find(d => d.id === "financas");
    expect(financasDomain).toBeTruthy();
    expect(financasDomain!.services.length).toBeGreaterThan(0);
    
    const operacoesDomain = catalog.find(d => d.id === "operacoes");
    expect(operacoesDomain).toBeTruthy();
    expect(operacoesDomain!.services.length).toBeGreaterThan(0);
  });

  it("secção catálogo reutiliza buildPublicCatalog (mesmos grupos/domínios do showcase) (d)", () => {
    const catalog = buildPublicCatalog();
    
    const expectedDomains = ["vida", "trabalho", "negocio", "financas", "operacoes"];
    const actualDomains = catalog.filter(d => d.id !== "mercado").map(d => d.id);
    
    expect(actualDomains).toEqual(expectedDomains);
    
    for (const domain of catalog.filter(d => d.id !== "mercado")) {
      expect(domain.services.length).toBeGreaterThan(0);
      for (const service of domain.services) {
        expect(service.href).toBeTruthy();
        expect(service.label).toBeTruthy();
        expect(service.description).toBeTruthy();
        expect(service.actors).toBeTruthy();
      }
    }
  });

  it("chips de ator REALÇAM sem esconder (d)", () => {
    const catalog = buildPublicCatalog();
    const actors: ActorTag[] = ["Pessoa", "Independente", "Empresa", "Fornecedor"];
    
    for (const actor of actors) {
      for (const domain of catalog) {
        for (const service of domain.services) {
          const relevant = isRelevantForActor(service, actor);
          expect(typeof relevant).toBe("boolean");
          if (relevant) {
            expect(service.actors).toContain(actor);
          }
        }
      }
    }
  });
});