/**
 * RPG-OS — Pricing & Comissão configuráveis (FASE 8).
 *
 * Modelo PURO da configuração comercial (pricing + comissão) e do seu
 * histórico de alterações (rule 3/4 da FASE 8):
 *  - comissão RPG-OS por plano, configurável entre 1% e 3% (100..300 bps);
 *  - pricing (mensalidade / desconto anual) configurável por plano;
 *  - cada alteração produz um registo de histórico IMUTÁVEL (append-only) que
 *    alimenta a auditoria/persistência na camada de integração.
 *
 * Nenhuma escrita aqui: apenas lógica pura determinística, testável com
 * centavos inteiros (nunca floats).
 */

import { computePlatformFee } from "../PlatformFeeService";
import { validateFeeSplit } from "./money";
import type { RevenuePlanId } from "./plans";
import { resolveRevenuePlan } from "./plans";

/** Campo comercial alterável (para histórico/auditoria). */
export type PricingField = "monthly_price" | "annual_discount" | "commission_bps";

export const PRICING_FIELDS: PricingField[] = [
  "monthly_price",
  "annual_discount",
  "commission_bps",
];

/** Origem da alteração de pricing (alinhado com RevenueOrigin). */
export type PricingChangeOrigin = "USER" | "ADMIN" | "SYSTEM" | "AUTOMATION";

export const PRICING_CHANGE_ORIGINS: PricingChangeOrigin[] = [
  "USER",
  "ADMIN",
  "SYSTEM",
  "AUTOMATION",
];

export function isPricingField(value: unknown): value is PricingField {
  return (
    typeof value === "string" &&
    (PRICING_FIELDS as string[]).includes(value)
  );
}

/** Registo imutável de uma alteração de pricing/comissão (venvom append-only). */
export interface PricingChangeRecord {
  id: string;
  organizationId: string | null;
  planId: RevenuePlanId;
  field: PricingField;
  /** Valor anterior (centavos para prices; bps para commission/discount). */
  oldValue: number;
  /** Novo valor (centavos para prices; bps para commission/discount). */
  newValue: number;
  effectiveAt: string;
  changedBy: string | null;
  origin: PricingChangeOrigin;
  reason?: string | null;
}

export interface PricingChangeIntent {
  planId: RevenuePlanId;
  field: PricingField;
  newValue: number;
  origin?: PricingChangeOrigin;
  changedBy?: string | null;
  reason?: string | null;
}

export type PricingChangeResult =
  | { ok: true; record?: PricingChangeRecord; changed: boolean }
  | { ok: false; error: string };

/**
 * Valida uma comissão em basis points dentro do domínio comercial 1%–3%
 * (100..300 bps). Aceita 100..300, inclusive; rejeita fora desse intervalo.
 */
export function validateCommissionBps(bps: number): {
  ok: boolean;
  error?: string;
} {
  if (!Number.isSafeInteger(bps) || bps < 100 || bps > 300) {
    return {
      ok: false,
      error: "Comissão deve estar entre 1% e 3% (100..300 bps).",
    };
  }
  return { ok: true };
}

/** Valida uma mensalidade em centavos (>= 0, inteiro, sem NaN/Infinity). */
export function validateMonthlyPriceCents(cents: number): {
  ok: boolean;
  error?: string;
} {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    return { ok: false, error: "Mensalidade inválida (centavos inteiros >= 0)." };
  }
  return { ok: true };
}

/** Valida um desconto anual em bps (0..10000). */
export function validateAnnualDiscountBps(bps: number): {
  ok: boolean;
  error?: string;
} {
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10000) {
    return { ok: false, error: "Desconto anual fora do domínio (0..10000 bps)." };
  }
  return { ok: true };
}

/**
 * Aplica uma alteração de pricing/comissão de forma PURA:
 * devolve o registo de histórico (sem gravar) e o novo valor.
 * `changed:false` quando o valor não muda (não gera registo redundante).
 */
export function applyPricingChange(
  current: { monthlyPriceCents: number; annualDiscountBps: number; platformFeeBps: number },
  intent: PricingChangeIntent,
): PricingChangeResult {
  const planId = resolveRevenuePlan(intent.planId).id;

  const origin: PricingChangeOrigin = intent.origin ?? "SYSTEM";
  let oldValue: number;
  let newValue: number;

  switch (intent.field) {
    case "monthly_price": {
      const v = validateMonthlyPriceCents(intent.newValue);
      if (!v.ok) return { ok: false, error: v.error ?? "Mensalidade inválida." };
      oldValue = current.monthlyPriceCents;
      newValue = intent.newValue;
      break;
    }
    case "annual_discount": {
      const v = validateAnnualDiscountBps(intent.newValue);
      if (!v.ok) return { ok: false, error: v.error ?? "Desconto inválido." };
      oldValue = current.annualDiscountBps;
      newValue = intent.newValue;
      break;
    }
    case "commission_bps": {
      const v = validateCommissionBps(intent.newValue);
      if (!v.ok) return { ok: false, error: v.error ?? "Comissão inválida." };
      oldValue = current.platformFeeBps;
      newValue = intent.newValue;
      break;
    }
    default:
      return { ok: false, error: "Campo de pricing desconhecido." };
  }

  if (oldValue === newValue) {
    return { ok: true, changed: false };
  }

  const record: PricingChangeRecord = {
    id: `${planId}:${intent.field}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    organizationId: null,
    planId,
    field: intent.field,
    oldValue,
    newValue,
    effectiveAt: new Date().toISOString(),
    changedBy: intent.changedBy ?? null,
    origin,
    reason: intent.reason ?? null,
  };

  return { ok: true, changed: true, record };
}

/**
 * Comissão RPG-OS (fee) em CENTAVOS inteiros para um valor bruto e uma taxa,
 * sempre com validação do invariante `gross = fee + net` e `fee <= gross`.
 * Nunca usa floats para dinheiro.
 */
export function commissionForGross(input: {
  grossCents: number;
  commissionBps: number;
}): { feeCents: number; netCents: number } {
  const calc = computePlatformFee({
    grossCents: input.grossCents,
    basisPoints: input.commissionBps,
  });
  const check = validateFeeSplit({
    grossCents: calc.grossCents,
    feeCents: calc.feeCents,
    netCents: calc.netCents,
    basisPoints: input.commissionBps,
  });
  if (!check.ok) {
    throw new Error(check.error);
  }
  return { feeCents: calc.feeCents, netCents: calc.netCents };
}
