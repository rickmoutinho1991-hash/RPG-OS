/**
 * RPG-OS — Money Safety (FASE 7).
 *
 * Garantias centrais de segurança monetária, aplicadas a TODAS as operações
 * do Revenue Engine:
 *  - todo o dinheiro em CENTAVOS inteiros (minor units) — zero floating point;
 *  - nunca NaN, nunca Infinity, nunca negativos indevidos;
 *  - invariante `gross === fee + net` (quando aplicável a fee);
 *  - fee nunca excede o bruto;
 *  - refund/reversal proporcionais em inteiros sem perda (round-safe).
 */

export interface SafeMonetaryAmount {
  cents: number;
  ok: true;
}

export type MonetaryResult =
  | { ok: true; cents: number }
  | { ok: false; error: string };

/**
 * Valida que um valor é um inteiro seguro e não-negativo de centavos.
 * Rejeita NaN, Infinity, negativos, floats e inteiros fora do range seguro.
 */
export function assertNonNegativeCents(
  cents: unknown,
  label = "valor",
): MonetaryResult {
  if (typeof cents !== "number" || !Number.isSafeInteger(cents)) {
    return { ok: false, error: `${label} deve ser um inteiro de centavos.` };
  }
  if (cents < 0) {
    return { ok: false, error: `${label} não pode ser negativo.` };
  }
  if (cents === 0 || !Number.isFinite(cents)) {
    if (!Number.isFinite(cents)) return { ok: false, error: `${label} inválido.` };
  }
  return { ok: true, cents };
}

/** Valida um inteiro de centavos que pode ser negativo (ex.: deltas). */
export function assertSafeCents(cents: unknown, label = "valor"): MonetaryResult {
  if (typeof cents !== "number" || !Number.isSafeInteger(cents)) {
    return { ok: false, error: `${label} deve ser um inteiro de centavos.` };
  }
  if (!Number.isFinite(cents)) {
    return { ok: false, error: `${label} inválido.` };
  }
  return { ok: true, cents };
}

/**
 * Valida o invariante `gross === fee + net` com todos os valores inteiros
 * não-negativos. Devolve ok=false com mensagem se quebrado.
 */
export function validateFeeSplit(input: {
  grossCents: number;
  feeCents: number;
  netCents: number;
  basisPoints?: number;
}): MonetaryResult {
  const gross = assertNonNegativeCents(input.grossCents, "bruto");
  if (!gross.ok) return gross;
  const fee = assertNonNegativeCents(input.feeCents, "fee");
  if (!fee.ok) return fee;
  const net = assertNonNegativeCents(input.netCents, "líquido");
  if (!net.ok) return net;

  if (input.feeCents > input.grossCents) {
    return { ok: false, error: "A fee não pode exceder o valor bruto." };
  }
  if (input.basisPoints != null) {
    if (
      !Number.isSafeInteger(input.basisPoints) ||
      input.basisPoints < 0 ||
      input.basisPoints > 10000
    ) {
      return { ok: false, error: "Basis points fora do domínio (0..10000)." };
    }
  }
  if (input.feeCents + input.netCents !== input.grossCents) {
    return {
      ok: false,
      error: `Invariante quebrado: gross(${input.grossCents}) !== fee(${input.feeCents}) + net(${input.netCents}).`,
    };
  }
  return { ok: true, cents: input.grossCents };
}

/**
 * Refund/reversal proporcional em inteiros.
 *
 * Dado um valor total reembolsável e o montante a reembolsar, devolve a Fee a
 * devolver de forma proporcional e round-safe de tal forma que o total de fees
 * NUNCA seja negativo e a soma seja exata. Estratégia:
 *   feeToReverse = floor(totalFee * amount / total) com correção residual para
 *   garantir que refunds totais devolvem 100% da fee.
 *
 * Devolve { ok:false } se qualquer input for inválido ou se o montante a
 * reembolsar > total.
 */
export function proportionalFeeRefund(input: {
  totalCents: number;
  totalFeeCents: number;
  refundCents: number;
}): MonetaryResult {
  const total = assertNonNegativeCents(input.totalCents, "total");
  if (!total.ok) return total;
  const totalFee = assertNonNegativeCents(input.totalFeeCents, "fee total");
  if (!totalFee.ok) return totalFee;
  const refund = assertNonNegativeCents(input.refundCents, "reembolso");
  if (!refund.ok) return refund;

  if (input.refundCents === 0) return { ok: true, cents: 0 };
  if (input.refundCents > input.totalCents) {
    return {
      ok: false,
      error: "O montante a reembolsar não pode exceder o total.",
    };
  }
  if (input.totalCents === 0) {
    return { ok: false, error: "Total zero não pode ter reembolso." };
  }
  if (input.totalFeeCents === 0) return { ok: true, cents: 0 };

  // Reembolso total → devolve 100% da fee (exato).
  if (input.refundCents === input.totalCents) {
    return { ok: true, cents: input.totalFeeCents };
  }

  // Reembolso parcial: fee proporcional, arredondada para baixo; o resíduo
  // fica retido até o reembolso total (nunca criamos fee negativa).
  const feeToReverse = Math.floor(
    (input.totalFeeCents * input.refundCents) / input.totalCents,
  );
  return { ok: true, cents: feeToReverse };
}

/** Soma segura de centavos (rejeita overflow/float). */
export function sumCents(values: readonly number[]): MonetaryResult {
  let sum = 0;
  for (const v of values) {
    const r = assertNonNegativeCents(v);
    if (!r.ok) return r;
    sum += v;
  }
  if (!Number.isSafeInteger(sum)) {
    return { ok: false, error: "Soma excede o inteiro seguro." };
  }
  return { ok: true, cents: sum };
}
