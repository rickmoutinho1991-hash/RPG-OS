/**
 * RPG-OS — Life Action Dispatcher (A Minha Vida)
 *
 * Mapeia cada LifeAction para destino/label reais.
 * Nunca cria ações falsas: o destino deriva do domínio de origem.
 */
import type { LifeAction, LifeDomain, LifeItem } from "../../types/vida";

export interface LifeActionTarget {
  kind: "link" | "info" | "none";
  /** Href interno quando kind === "link". */
  href?: string;
  /** Rótulo compreensível para o utilizador. */
  label: string;
  /** Instruções oficiais quando a ação é manual (consult_manually / connect_learn). */
  instructions?: string;
}

const DOMAIN_HOME: Record<LifeDomain, string> = {
  finance: "/financas",
  mobility: "/mobilidade",
  health: "/saude",
  fiscal: "/fiscal",
  documents: "/documentos",
  government: "/administracao/governo",
  social_security: "/fiscal",
};

export function domainHome(domain: LifeDomain): string {
  return DOMAIN_HOME[domain] ?? "/";
}

export function domainLabel(domain: LifeDomain): string {
  const labels: Record<LifeDomain, string> = {
    finance: "Finanças",
    mobility: "Mobilidade",
    health: "Saúde",
    fiscal: "Fiscal",
    documents: "Documentos",
    government: "Governo",
    social_security: "Segurança Social",
  };
  return labels[domain] ?? domain;
}

/** Nome da fonte compreensível (nunca IDs internos). */
export function sourceLabel(item: Pick<LifeItem, "domain" | "source" | "capability">): string {
  if (item.domain === "mobility") {
    if (item.capability.includes("ctt")) return "CTT Portagens";
    if (item.capability.includes("viaverde") || item.capability.includes("via_verde"))
      return "Via Verde";
    return "Mobilidade";
  }
  return domainLabel(item.domain);
}

/**
 * Resolve a ação de um LifeItem para um destino real.
 * - view/consult/pay/validate/download → módulo de origem (nunca URL externa inventada)
 * - connect_learn → página de integrações/preparação
 * - consult_manually → instruções oficiais (sem link falso de pagamento)
 * - none → sem ação
 */
export function resolveLifeAction(item: LifeItem): LifeActionTarget {
  const home = domainHome(item.domain);
  switch (item.action as LifeAction) {
    case "view":
      return { kind: "link", href: home, label: "Ver no serviço" };
    case "consult":
      return { kind: "link", href: home, label: "Consultar no serviço" };
    case "pay":
      // pay só chega aqui se o collector confirmou capacidade real de pagamento.
      return { kind: "link", href: home, label: "Resolver no serviço" };
    case "validate":
      return { kind: "link", href: home, label: "Validar no serviço" };
    case "download":
      return { kind: "link", href: home, label: "Descarregar no serviço" };
    case "connect_learn":
      return {
        kind: "link",
        href: "/integracoes",
        label: "Saber como ligar",
        instructions:
          "Este serviço ainda não tem ligação oficial ativa. Consulta a página de integrações para ver o estado da preparação.",
      };
    case "consult_manually":
      return {
        kind: "info",
        label: "Consultar manualmente",
        instructions:
          "Consulta manual disponível no portal oficial do fornecedor. A Minha Vida não executa pagamentos nem consultas automáticas neste serviço.",
      };
    case "none":
    default:
      return { kind: "none", label: "Sem ação disponível" };
  }
}
