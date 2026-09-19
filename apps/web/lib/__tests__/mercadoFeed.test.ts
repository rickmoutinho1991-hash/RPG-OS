import { describe, it, expect } from "vitest";
import {
  OFFERING_PRICE_TYPES,
  OPEN_REQUEST_STATUSES,
  buildLocationLabel,
  buildRequestFilters,
  formatOfferPrice,
  sanitizeFeedCategory,
  sanitizeFeedQuery,
} from "@/lib/mercado/feed";

describe("mercado — feed de oportunidades e prestadores (M-D)", () => {
  it("formatOfferPrice traduz todos os tipos de preço (a)", () => {
    expect(formatOfferPrice(34000, "FIXED")).toBe("340,00 €");
    expect(formatOfferPrice(2500, "PER_HOUR")).toBe("25,00 €/h");
    expect(formatOfferPrice(null, "FREE_ESTIMATE")).toBe("Orçamento grátis");
    expect(formatOfferPrice(null, "NEGOTIABLE")).toBe("A combinar");
    expect(formatOfferPrice(null, null)).toBe("A combinar");
    expect(formatOfferPrice(null, "FIXED")).toBe("Valor fixo a definir");
    expect(formatOfferPrice(null, "PER_HOUR")).toBe("Por hora a definir");
  });

  it("o catálogo de tipos cobre os 4 tipos de preço (a)", () => {
    expect(Object.keys(OFFERING_PRICE_TYPES)).toEqual([
      "FIXED",
      "PER_HOUR",
      "FREE_ESTIMATE",
      "NEGOTIABLE",
    ]);
    for (const label of Object.values(OFFERING_PRICE_TYPES)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("o feed mostra apenas oportunidades abertas (b)", () => {
    expect(OPEN_REQUEST_STATUSES).toContain("PUBLISHED");
    expect(OPEN_REQUEST_STATUSES).toContain("QUOTES_RECEIVED");
    expect(OPEN_REQUEST_STATUSES).toContain("ADJUDICATING");
    expect(OPEN_REQUEST_STATUSES).not.toContain("DRAFT");
    expect(OPEN_REQUEST_STATUSES).not.toContain("COMPLETED");
  });

  it("sanitiza os parâmetros de pesquisa e categoria (c)", () => {
    expect(sanitizeFeedQuery("  pintura  ")).toBe("pintura");
    expect(sanitizeFeedQuery("a")).toBeUndefined();
    expect(sanitizeFeedQuery(undefined)).toBeUndefined();
    expect(sanitizeFeedQuery("x".repeat(200))?.length).toBe(100);
    expect(sanitizeFeedCategory(" cat-1 ")).toBe("cat-1");
    expect(sanitizeFeedCategory("")).toBeUndefined();
  });

  it("buildRequestFilters converte params em filtros ILIKE/categoria (d)", () => {
    expect(buildRequestFilters("limpeza", "cat-1")).toEqual({
      ilikeTitle: "%limpeza%",
      categoryId: "cat-1",
    });
    expect(buildRequestFilters(undefined, undefined)).toEqual({});
  });

  it("buildLocationLabel compõe localização e cai em 'a definir' (e)", () => {
    expect(buildLocationLabel("Lisboa", "Lisboa")).toBe("Lisboa · Lisboa");
    expect(buildLocationLabel("Porto", null)).toBe("Porto");
    expect(buildLocationLabel(null, "Faro")).toBe("Faro");
    expect(buildLocationLabel("", "")).toBe("Local a definir");
  });
});