/**
 * RPG-OS — Planos de subscrição + config central de fees (FASE 7 / FASE 8).
 *
 * FASE 8: catálogo comercial completo FREE/STARTER/PRO/BUSINESS/ENTERPRISE com
 * pricing e limites configuráveis (objecto `REVENUE_PLANS`, fonte única de
 * verdade). Cada plano define:
 *  - a comissão RPG-OS (`platformFeeBps`, 1–3%): única fonte para os cálculos,
 *    nunca hardcoded fora daqui;
 *  - a mensalidade (`monthlyPriceCents`) e a anualização com desconto
 *    (`annualDiscountBps`);
 *  - os limites (`limits`) configuráveis (utilizadores, empresas, projetos,
 *    armazenamento, automações).
 *
 * Toda a lógica aqui é PURA: sem BD, sem I/O, determinística e testável.
 * Os valores monetários são em CENTAVOS inteiros (minor units) — nunca floats.
 */

import { computePlatformFee } from "../PlatformFeeService";

export type RevenuePlanId =
  | "FREE"
  | "STARTER"
  | "PRO"
  | "BUSINESS"
  | "ENTERPRISE";

/** Intervalo de faturação da subscrição (FASE 8). */
export type BillingInterval = "MONTH" | "YEAR";

export const BILLING_INTERVALS: BillingInterval[] = ["MONTH", "YEAR"];

export function isBillingInterval(value: unknown): value is BillingInterval {
  return (
    typeof value === "string" &&
    (BILLING_INTERVALS as string[]).includes(value)
  );
}

/** Limites configuráveis de cada plano (FASE 8). -1 = ilimitado. */
export interface RevenuePlanLimits {
  maxUsers: number;
  maxCompanies: number;
  maxProjects: number;
  maxStorageMb: number;
  maxAutomations: number;
}

const UNLIMITED: RevenuePlanLimits = {
  maxUsers: -1,
  maxCompanies: -1,
  maxProjects: -1,
  maxStorageMb: -1,
  maxAutomations: -1,
};

/** Características do plano relevantes para a monetização. */
export interface RevenuePlanDefinition {
  id: RevenuePlanId;
  /** Comissão RPG-OS do plano em basis points (1/100 de %). Ex.: 300 = 3%. */
  platformFeeBps: number;
  /** Preço mensal da subscrição em CENTAVOS (FREE = 0). */
  monthlyPriceCents: number;
  /** Desconto anual em bps (ex.: 2000 = 20% sobre o mensal × 12). */
  annualDiscountBps: number;
  /** Ordenação para exibição (ascendente). */
  order: number;
  label: string;
  description: string;
  /** Nº máximo de utilizadores incluído (compat FASE 7). -1 = ilimitado. */
  maxUsers: number;
  /** Limites configuráveis detalhados (FASE 8). */
  limits: RevenuePlanLimits;
}

export const REVENUE_PLANS: Record<RevenuePlanId, RevenuePlanDefinition> = {
  FREE: {
    id: "FREE",
    platformFeeBps: 300, // 3% — comissão máxima
    monthlyPriceCents: 0,
    annualDiscountBps: 0,
    order: 0,
    label: "Grátis",
    description:
      "Plano de entrada. Monetização exclusivamente por comissão transacional (3%).",
    maxUsers: 1,
    limits: {
      maxUsers: 1,
      maxCompanies: 1,
      maxProjects: 5,
      maxStorageMb: 500,
      maxAutomations: 3,
    },
  },
  STARTER: {
    id: "STARTER",
    platformFeeBps: 250, // 2,5%
    monthlyPriceCents: 1900, // 19 €/mês
    annualDiscountBps: 2000, // 20% -> 15,20 €/mês em faturação anual
    order: 1,
    label: "Starter",
    description: "Para quem está a começar. Comissão reduzida (2,5%).",
    maxUsers: 3,
    limits: {
      maxUsers: 3,
      maxCompanies: 3,
      maxProjects: 20,
      maxStorageMb: 2000,
      maxAutomations: 10,
    },
  },
  PRO: {
    id: "PRO",
    platformFeeBps: 200, // 2,0%
    monthlyPriceCents: 4900, // 49,00 €/mês
    annualDiscountBps: 2000, // 20% -> 39,20 €/mês em faturação anual
    order: 2,
    label: "Profissional",
    description: "Para profissionais. Comissão preferencial (2%).",
    maxUsers: 10,
    limits: {
      maxUsers: 10,
      maxCompanies: 10,
      maxProjects: 100,
      maxStorageMb: 10000,
      maxAutomations: 50,
    },
  },
  BUSINESS: {
    id: "BUSINESS",
    platformFeeBps: 150, // 1,5%
    monthlyPriceCents: 9900, // 99,00 €/mês
    annualDiscountBps: 2000, // 20% -> 79,20 €/mês em faturação anual
    order: 3,
    label: "Negócio",
    description: "Para PME. Comissão preferencial (1,5%).",
    maxUsers: 25,
    limits: {
      maxUsers: 25,
      maxCompanies: 50,
      maxProjects: 500,
      maxStorageMb: 50000,
      maxAutomations: 200,
    },
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    platformFeeBps: 100, // 1% (configurável em contrato)
    monthlyPriceCents: 0, // preço personalizado (não fixo no catálogo)
    annualDiscountBps: 2000, // 20% sobre orçamento acordado
    order: 4,
    label: "Empresarial",
    description:
      "Volumes elevados / multi-empresa. Comissão negociada (base 1%).",
    maxUsers: -1,
    limits: UNLIMITED,
  },
};

export const REVENUE_PLAN_IDS: RevenuePlanId[] = [
  "FREE",
  "STARTER",
  "PRO",
  "BUSINESS",
  "ENTERPRISE",
];

export function isRevenuePlanId(value: unknown): value is RevenuePlanId {
  return (
    typeof value === "string" &&
    (REVENUE_PLAN_IDS as string[]).includes(value)
  );
}

/** Resolve um plano a partir de um ID, com fallback seguro para FREE. */
export function resolveRevenuePlan(id: unknown): RevenuePlanDefinition {
  return isRevenuePlanId(id) ? REVENUE_PLANS[id] : REVENUE_PLANS.FREE;
}

/** Talka RPG-OS (bps) associada a um plano — única fonte para cálculos. */
export function revenuePlanFeeBps(planId: unknown): number {
  return resolveRevenuePlan(planId).platformFeeBps;
}

/** Fee em centavos para um valor bruto num dado plano (inteiros exatos). */
export function revenuePlanFee(grossCents: number, planId: unknown): number {
  return computePlatformFee({
    grossCents,
    basisPoints: revenuePlanFeeBps(planId),
  }).feeCents;
}

/**
 * Preço total do período de faturação em CENTAVOS inteiros.
 *  - MONTH → monthlyPriceCents (1 ciclo mensal);
 *  - YEAR  → total anual com desconto = round(monthly×12×(10000−disc)/10000)×12.
 */
export function planIntervalPriceCents(
  planId: unknown,
  interval: BillingInterval,
): number {
  const plan = resolveRevenuePlan(planId);
  const monthly = plan.monthlyPriceCents;
  if (interval !== "YEAR") return monthly;
  if (monthly === 0) return 0;
  const annualTotal = Math.round(
    (monthly * 12 * (10000 - plan.annualDiscountBps)) / 10000,
  );
  return annualTotal;
}

/** Preço mensal equivalente da subscrição (normalização para MRR/ARR). */
export function planMonthlyEquivalentCents(
  planId: unknown,
  interval: BillingInterval,
): number {
  if (interval === "YEAR") {
    return Math.round(planIntervalPriceCents(planId, "YEAR") / 12);
  }
  return resolveRevenuePlan(planId).monthlyPriceCents;
}

/** Precificação anual mensalizada apresentável (ex.: "10,32 €/mês"). */
export function planAnnualMonthlyEquivalentCents(planId: unknown): number {
  return planMonthlyEquivalentCents(planId, "YEAR");
}

/**
 * Devolve o limite configurável de um plano. `-1` (ilimitado) é convertido
 * em Infinity para comparação segura; nunca devolve valores negativos.
 */
export function planLimit(
  planId: unknown,
  key: keyof RevenuePlanLimits,
): number {
  const value = resolveRevenuePlan(planId).limits[key];
  return value < 0 ? Infinity : value;
}

/** Avalia um limite de plano retornando estado OK/WARNING/EXCEEDED. */
export function planLimitStatus(used: number, limit: number): "OK" | "WARNING" | "EXCEEDED" {
  if (limit <= 0) return used > 0 ? "EXCEEDED" : "OK";
  const pct = (used * 100) / limit;
  if (pct >= 100) return "EXCEEDED";
  if (pct >= 80) return "WARNING";
  return "OK";
}

/** Percentage arredondado para inteiro. */
export function planLimitPercentage(used: number, limit: number): number {
  if (limit <= 0) return used > 0 ? 110 : 0;
  return Math.round((used * 100) / limit);
}

/** Capacidade restante, nunca negativa. */
export function planLimitRemaining(used: number, limit: number): number {
  const r = limit - used;
  return r > 0 ? r : 0;
}

/** Mensagem explicativa para o UI baseada no estado do limite. */
export function planLimitMessage(planId: unknown, key: keyof RevenuePlanLimits, used: number): string {
  const limit = planLimit(planId, key);
  const status = planLimitStatus(used, limit);
  const messages: Record<"OK" | "WARNING" | "EXCEEDED", string> = {
    OK: "Está dentro do limite do plano.",
    WARNING: "Está a aproximar-se do limite do seu plano.",
    EXCEEDED: "Atingiu o limite do seu plano.",
  };
  return messages[status];
}

/** Avalia um limite de plano retornando estado estruturado. */
export interface PlanLimitEvaluation {
  status: "OK" | "WARNING" | "EXCEEDED";
  percentage: number;
  remaining: number;
  limit: number;
  used: number;
}

/** Avalia um limite de plano. */
export function evaluatePlanLimit(
  planId: unknown,
  key: keyof RevenuePlanLimits,
  used: number,
): PlanLimitEvaluation {
  const limit = planLimit(planId, key);
  return {
    status: planLimitStatus(used, limit),
    percentage: planLimitPercentage(used, limit),
    remaining: planLimitRemaining(used, limit),
    limit,
    used,
  };
}

/** Valida que um uso de limite não ultrapassa o permitido pelo plano. */
export function withinPlanLimit(
  planId: unknown,
  key: keyof RevenuePlanLimits,
  used: number,
): { ok: boolean; limit: number } {
  const evaluation = evaluatePlanLimit(planId, key, used);
  return { ok: evaluation.status !== "EXCEEDED", limit: evaluation.limit };
}

/** Mensagens pt-PT para estados de limite. */
export const planLimitMessages: Record<"OK" | "WARNING" | "EXCEEDED", string> = {
  OK: "Está dentro do limite do plano.",
  WARNING: "Está a aproximar-se do limite do seu plano.",
  EXCEEDED: "Atingiu o limite do seu plano.",
};

/** Identificadores de funcionalidades de plano (FASE 10C). */
export type PlanFeatureId =
  | "automations"
  | "advanced_reputation"
  | "commercial_tools"
  | "larger_storage"
  | "more_users"
  | "more_companies"
  | "more_projects"
  | "api_access"
  | "custom_branding"
  | "priority_support";

/** Metadado de uma funcionalidade de plano. */
export interface PlanFeatureDefinition {
  id: PlanFeatureId;
  label: string;
  description: string;
  planIds: RevenuePlanId[];
}

/** Catálogo central de funcionalidades disponíveis por plano (FASE 10C). */
export const PLAN_FEATURES: Record<PlanFeatureId, PlanFeatureDefinition> = {
  automations: {
    id: "automations",
    label: "Automações",
    description: "Automações de trabalho e fluxos de trabalho",
    planIds: ["STARTER", "PRO", "BUSINESS", "ENTERPRISE"],
  },
  advanced_reputation: {
    id: "advanced_reputation",
    label: "Reputação Avançada",
    description: "Funcionalidades avançadas de gestão de reputação",
    planIds: ["PRO", "BUSINESS", "ENTERPRISE"],
  },
  commercial_tools: {
    id: "commercial_tools",
    label: "Ferramentas Comerciais",
    description: "Ferramentas de gestão comercial e de faturamento",
    planIds: ["PRO", "BUSINESS", "ENTERPRISE"],
  },
  larger_storage: {
    id: "larger_storage",
    label: "Armazenamento Maior",
    description: "Armazenamento acima dos limites padrão",
    planIds: ["BUSINESS", "ENTERPRISE"],
  },
  more_users: {
    id: "more_users",
    label: "Mais Utilizadores",
    description: "Increase the maximum number of users beyond the plan limit",
    planIds: ["PRO", "BUSINESS", "ENTERPRISE"],
  },
  more_companies: {
    id: "more_companies",
    label: "Mais Empresas",
    description: "Increase the maximum number of companies beyond the plan limit",
    planIds: ["BUSINESS", "ENTERPRISE"],
  },
  more_projects: {
    id: "more_projects",
    label: "Mais Projetos",
    description: "Increase the maximum number of projects beyond the plan limit",
    planIds: ["BUSINESS", "ENTERPRISE"],
  },
  api_access: {
    id: "api_access",
    label: "Acesso API",
    description: "Acesso à API REST para integrações personalizadas",
    planIds: ["BUSINESS", "ENTERPRISE"],
  },
  custom_branding: {
    id: "custom_branding",
    label: "Branding Personalizado",
    description: "Personalização da interface da sua organização",
    planIds: ["ENTERPRISE"],
  },
  priority_support: {
    id: "priority_support",
    label: "Suporte Prioritário",
    description: "Suporte prioritário ao cliente",
    planIds: ["ENTERPRISE"],
  },
};

/** Verifica se um plano tem uma funcionalidade específica. */
export function hasPlanFeature(planId: unknown, feature: PlanFeatureId): boolean {
  const featureDef = PLAN_FEATURES[feature];
  if (!featureDef) return false;
  const plan = resolveRevenuePlan(planId);
  return featureDef.planIds.includes(plan.id);
}

/** Gera mensagem pt-PT para funcionalidade não disponível. */
export function planFeatureNotAvailableMessage(
  planId: unknown,
  feature: PlanFeatureId,
): string {
  const plan = resolveRevenuePlan(planId);
  const featureDef = PLAN_FEATURES[feature];
  if (!featureDef) {
    return "Funcionalidade desconhecida.";
  }
  // Get the highest plan that has this feature
  const allPlanIds = Object.values(REVENUE_PLANS)
    .sort((a, b) => a.order - b.order)
    .map(p => p.id);
  const higherPlanId = featureDef.planIds[featureDef.planIds.length - 1];
  const higherPlan = resolveRevenuePlan(higherPlanId);
  return `O plano ${plan.label} não inclui "${featureDef.label}". ` +
    `Esta funcionalidade está disponível no plano ${higherPlan.label.toLowerCase()}.`;
}

/** Gera mensagem de upgrade CTA para funcionalidade. */
export function planFeatureUpgradeCTA(
  planId: unknown,
  feature: PlanFeatureId,
): string {
  const plan = resolveRevenuePlan(planId);
  const featureDef = PLAN_FEATURES[feature];
  if (!featureDef) {
    return "CTA unavailable.";
  }
  return `Atualize para ${plan.label.includes("Prof") ? "Profissional" : plan.label} para ter acesso a "${featureDef.label}".`;
}
