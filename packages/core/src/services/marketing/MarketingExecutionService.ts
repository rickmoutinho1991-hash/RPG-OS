/**
 * RPG-OS Marketing Execution Service — ORQUESTRAÇÃO PURA do pipeline:
 *
 *   campaign → action → guardrails → approval/autonomy → provider → result
 *
 * Sem BD e sem Next.js: recebe a config (fonte: BD), a ação proposta e um
 * provider (ex.: FakeMarketingProvider no sandbox). Regras:
 *  - NENHUMA chamada ao provider acontece sem decisão ALLOWED dos guardrails;
 *  - A decisão é reavaliada AQUI no momento da execução (defesa em profundidade
 *    contra budgets alterados entre proposta e execução);
 *  - Ações sem conceito externo (GENERATE_CONTENT, SUGGEST_TARGETING) ficam
 *    apenas registadas (status NOT_EXECUTED, external=false);
 *  - Sem provider disponível → fail-safe: nada é executado.
 */

import type { MarketingAdapterResult } from "../../adapters/MarketingProviderAdapter";
import {
  canExecuteMarketingAction,
  type MarketingAction,
  type MarketingActionContext,
  type MarketingActionDecision,
  type MarketingActionType,
  type MarketingCampaignStatus,
  type MarketingConfig,
} from "../MarketingAiService";
import type { FakeMarketingMetricsSnapshot } from "./FakeMarketingProvider";

/** Ações que têm correspondência real num provider de campanhas. */
export const PROVIDER_EXECUTING_ACTION_TYPES: readonly MarketingActionType[] = [
  "CREATE_CAMPAIGN",
  "PAUSE_CAMPAIGN",
  "RESUME_CAMPAIGN",
  "ADJUST_BUDGET",
];

export function isProviderExecutingAction(
  type: MarketingActionType,
): boolean {
  return PROVIDER_EXECUTING_ACTION_TYPES.includes(type);
}

/* ─── Ciclo de vida de campanha (validação pura de transições) ────────── */

const CAMPAIGN_TRANSITIONS: Record<
  MarketingCampaignStatus,
  readonly MarketingCampaignStatus[]
> = {
  DRAFT: ["PENDING_APPROVAL", "ACTIVE", "PAUSED", "CANCELLED"],
  PENDING_APPROVAL: ["ACTIVE", "PAUSED", "CANCELLED"],
  ACTIVE: ["PAUSED", "COMPLETED", "CANCELLED"],
  PAUSED: ["ACTIVE", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function validateCampaignStatusTransition(
  from: MarketingCampaignStatus,
  to: MarketingCampaignStatus,
): { valid: boolean; error?: string } {
  if (from === to) {
    return { valid: false, error: "CAMPAIGN_TRANSITION_SAME_STATUS" };
  }
  if (CAMPAIGN_TRANSITIONS[from]?.includes(to)) {
    return { valid: true };
  }
  return { valid: false, error: "CAMPAIGN_TRANSITION_INVALID" };
}

/* ─── Execução via provider ───────────────────────────────────────────── */

export interface MarketingExecutionInput {
  /** Config efetiva lida da BD (fonte de verdade server-side). */
  config: MarketingConfig;
  /** Ação proposta (recomendação da IA). */
  action: MarketingAction;
  /** Gasto acumulado (dia/mês/leads) — resolvido server-side. */
  context?: MarketingActionContext;
  /** Provider a usar (ex.: FakeMarketingProvider). null = fail-safe. */
  provider: MarketingExecutionProvider | null;
  /**
   * Campanha local associada (para PAUSE/RESUME/ADJUST_BUDGET e para dar
   * identidade à criação). `providerExternalId` liga ao external_id real.
   */
  campaign?: {
    id: string;
    providerId: string | null;
    providerExternalId: string | null;
  } | null;
}

/**
 * Provider mínimo exigido pelo executor: apenas o adapter de campanhas, com
 * `getMetrics` opcional (sandbox). Manter pequeno facilita drivers futuros.
 */
export interface MarketingExecutionProvider {
  readonly id: string;
  readonly sandbox?: boolean;
  campaigns(): {
    createCampaign(
      spec: {
        campaignId: string;
        companyId: string;
        name: string;
        objective: MarketingAction["objective"];
        budgetCents: number;
        channel: MarketingAction["channel"];
        targeting: { services: string[]; zones: string[] };
      },
    ): Promise<MarketingAdapterResult<{ externalId: string }>>;
    pauseCampaign(
      externalId: string,
    ): Promise<MarketingAdapterResult<void>>;
    resumeCampaign(
      externalId: string,
    ): Promise<MarketingAdapterResult<void>>;
    updateBudget(
      externalId: string,
      budgetCents: number,
    ): Promise<MarketingAdapterResult<void>>;
    getMetrics?(
      externalId: string,
    ): Promise<MarketingAdapterResult<FakeMarketingMetricsSnapshot>>;
  };
}

export type MarketingExecutionStatus =
  | "NOT_EXECUTED"
  | "EXECUTED"
  | "FAILED";

export interface MarketingExecutionResult {
  /** Decisão determinística dos guardrails (sempre presente). */
  decision: MarketingActionDecision;
  /** Provider invocado com sucesso. */
  executed: boolean;
  /** Houve chamada ao provider (sandbox conta como externa simulada). */
  external: boolean;
  status: MarketingExecutionStatus;
  providerId: string | null;
  providerExternalId: string | null;
  error?: string;
  metricsSnapshot?: FakeMarketingMetricsSnapshot | null;
}

function notExecuted(
  decision: MarketingActionDecision,
  error?: string,
): MarketingExecutionResult {
  return {
    decision,
    executed: false,
    external: false,
    status: "NOT_EXECUTED",
    providerId: null,
    providerExternalId: null,
    error,
  };
}

/**
 * NÚCLEO DA EXECUÇÃO — pipeline completo, puro e auditável:
 * 1. Guardrails reavaliados no momento da execução (nunca confia na decisão
 *    anterior — budgets/limites podem ter mudado);
 * 2. Só chega ao provider se decision === 'ALLOWED' E a ação tiver conceito
 *    externo E existir provider;
 * 3. Falha do provider → status FAILED (o servidor decide persistência).
 */
export async function executeMarketingActionViaProvider(
  input: MarketingExecutionInput,
): Promise<MarketingExecutionResult> {
  // ── 1. Guardrails (sempre, em qualquer caminho) ───────────────────────
  const decision = canExecuteMarketingAction(
    input.config,
    input.action,
    input.context ?? {},
  );
  if (decision.decision !== "ALLOWED") {
    // COPILOT (REQUIRES_APPROVAL) e DENIED nunca chegam ao provider.
    return notExecuted(decision);
  }
  if (!isProviderExecutingAction(input.action.type)) {
    // Ações de sugestão/conteúdo não têm execução externa nesta fase.
    return notExecuted(decision, "NO_EXTERNAL_CONCEPT");
  }
  if (!input.provider) {
    // Fail-safe: sem provider registado, nada é executado.
    return notExecuted(decision, "NO_PROVIDER");
  }

  const adapter = input.provider.campaigns();
  const providerId = input.provider.id;
  let externalId: string | null = null;

  // ── 2. Execução por tipo ──────────────────────────────────────────────
  try {
    switch (input.action.type) {
      case "CREATE_CAMPAIGN": {
        const budgetCents =
          input.action.campaignBudgetCents ?? input.action.estimatedCostCents ?? 0;
        const created = await adapter.createCampaign({
          campaignId: input.campaign?.id ?? `generated-${Date.now()}`,
          companyId: input.config.companyId,
          name: `Campanha ${input.action.objective} (${input.action.channel})`,
          objective: input.action.objective,
          budgetCents,
          channel: input.action.channel,
          targeting: {
            services: input.action.service ? [input.action.service] : [],
            zones: input.action.zone ? [input.action.zone] : [],
          },
        });
        if (!created.ok) {
          return {
            decision,
            executed: false,
            external: true,
            status: "FAILED",
            providerId,
            providerExternalId: null,
            error: created.error,
          };
        }
        externalId = created.value.externalId;
        break;
      }
      case "PAUSE_CAMPAIGN":
      case "RESUME_CAMPAIGN": {
        const external = input.campaign?.providerExternalId ?? null;
        if (!external) {
          return {
            decision,
            executed: false,
            external: true,
            status: "FAILED",
            providerId,
            providerExternalId: null,
            error: "CAMPAIGN_NOT_PUBLISHED",
          };
        }
        const res =
          input.action.type === "PAUSE_CAMPAIGN"
            ? await adapter.pauseCampaign(external)
            : await adapter.resumeCampaign(external);
        if (!res.ok) {
          return {
            decision,
            executed: false,
            external: true,
            status: "FAILED",
            providerId,
            providerExternalId: external,
            error: res.error,
          };
        }
        externalId = external;
        break;
      }
      case "ADJUST_BUDGET": {
        const external = input.campaign?.providerExternalId ?? null;
        if (!external) {
          return {
            decision,
            executed: false,
            external: true,
            status: "FAILED",
            providerId,
            providerExternalId: null,
            error: "CAMPAIGN_NOT_PUBLISHED",
          };
        }
        const budget = input.action.campaignBudgetCents ?? null;
        if (budget === null) {
          return {
            decision,
            executed: false,
            external: true,
            status: "FAILED",
            providerId,
            providerExternalId: external,
            error: "MISSING_BUDGET",
          };
        }
        const res = await adapter.updateBudget(external, budget);
        if (!res.ok) {
          return {
            decision,
            executed: false,
            external: true,
            status: "FAILED",
            providerId,
            providerExternalId: external,
            error: res.error,
          };
        }
        externalId = external;
        break;
      }
      default:
        return notExecuted(decision, "NO_EXTERNAL_CONCEPT");
    }
  } catch (e: unknown) {
    return {
      decision,
      executed: false,
      external: true,
      status: "FAILED",
      providerId,
      providerExternalId: externalId,
      error: e instanceof Error ? e.message : "PROVIDER_EXCEPTION",
    };
  }

  // ── 3. Snapshot de métricas (opcional, sandbox) ───────────────────────
  let metricsSnapshot: FakeMarketingMetricsSnapshot | null = null;
  if (externalId && adapter.getMetrics) {
    const m = await adapter.getMetrics(externalId);
    metricsSnapshot = m.ok ? m.value : null;
  }

  return {
    decision,
    executed: true,
    external: true,
    status: "EXECUTED",
    providerId,
    providerExternalId: externalId,
    metricsSnapshot,
  };
}
