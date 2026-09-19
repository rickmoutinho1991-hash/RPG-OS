import { formatEuro } from "@/lib/currency";

/**
 * RPG-OS — Mercado: helpers puros do feed (vaga M-D).
 * Sem estado e sem imports de servidor — testáveis e reutilizados pelas
 * páginas /mercado (oportunidades e prestadores).
 */

export const OFFERING_PRICE_TYPES = {
  FIXED: "Valor fixo",
  PER_HOUR: "Por hora",
  FREE_ESTIMATE: "Orçamento grátis",
  NEGOTIABLE: "A combinar",
} as const;

export type OfferingPriceType = keyof typeof OFFERING_PRICE_TYPES;

/** Estados de pedidos que o feed apresenta como oportunidades abertas. */
export const OPEN_REQUEST_STATUSES = [
  "PUBLISHED",
  "QUOTES_RECEIVED",
  "ADJUDICATING",
] as const;

export function formatOfferPrice(
  cents: number | null | undefined,
  priceType: string | null | undefined,
): string {
  const type = (priceType ?? "NEGOTIABLE") as OfferingPriceType;
  if (type === "FREE_ESTIMATE") return "Orçamento grátis";
  if ((type === "FIXED" || type === "PER_HOUR") && !cents) {
    return type === "PER_HOUR" ? "Por hora a definir" : "Valor fixo a definir";
  }
  switch (type) {
    case "FIXED":
      return cents ? `${formatEuro(cents)} €` : "Valor fixo a definir";
    case "PER_HOUR":
      return cents ? `${formatEuro(cents)} €/h` : "Por hora a definir";
    default:
      return "A combinar";
  }
}

/** Normaliza a query de pesquisa do feed (>=2 chars, máx 100). */
export function sanitizeFeedQuery(q: string | undefined): string | undefined {
  const value = q?.trim().slice(0, 100) ?? "";
  return value.length >= 2 ? value : undefined;
}

/** Normaliza o id de categoria do feed (máx 36 chars). */
export function sanitizeFeedCategory(cat: string | undefined): string | undefined {
  const value = cat?.trim().slice(0, 36) ?? "";
  return value.length > 0 ? value : undefined;
}

export interface RequestFilters {
  /** Termo para filtro ILIKE no título do pedido. */
  ilikeTitle?: string;
  categoryId?: string;
}

/** Converte parâmetros do feed em filtros aplicáveis a service_requests. */
export function buildRequestFilters(
  q: string | undefined,
  cat: string | undefined,
): RequestFilters {
  const filters: RequestFilters = {};
  const cleanQ = sanitizeFeedQuery(q);
  if (cleanQ) filters.ilikeTitle = `%${cleanQ}%`;
  const cleanCat = sanitizeFeedCategory(cat);
  if (cleanCat) filters.categoryId = cleanCat;
  return filters;
}

export function buildLocationLabel(
  city: string | null | undefined,
  district: string | null | undefined,
): string {
  if (city && district) return `${city} · ${district}`;
  if (city) return city;
  if (district) return district;
  return "Local a definir";
}