/**
 * RPG-OS — Refunds & Reversals (FASE 7).
 *
 * Modelo puro de reembolsos e reversões de receita com distribuição
 * proporcional da fee, em inteiros exatos. A persistência é feita pela
 * camada de integração; aqui validamos e calculamos de forma testável.
 */

import { proportionalFeeRefund, type MonetaryResult } from "./money";

export type RefundOrientation = "USER" | "ADMIN" | "SYSTEM";

export type RevenueRefundType = "REFUND" | "REVERSAL";

export interface RevenueRefundRequest {
  /** Transação / ledger line a reembolsar. */
  transactionId: string;
  /** Montante (bruto) a reembolsar em CENTAVOS. */
  refundCents: number;
  type: RevenueRefundType;
  orientation: RefundOrientation;
  reason?: string;
}

export interface RevenueRefundComputation {
  /** Montante bruto a reembolsar em centavos. */
  refundCents: number;
  /** Fee a devolver (proporcional) em centavos. */
  feeToRefundCents: number;
  /** Líquido (para a empresa) a devolver em centavos. */
  netToRefundCents: number;
  ok: true;
}

export type RefundComputationResult =
  | RevenueRefundComputation
  | { ok: false; error: string };

/**
 * Calcula o split (fee/líquido) de um reembolso proporcional e garante que
 *  - 0 <= feeToRefund <= feeCollected;
 *  - refundCents === feeToRefund + netToRefund (invariante);
 *  - valores inteiros, sem NaN/Infinity/negativos.
 */
export function computeRevenueRefund(input: {
  transactionId: string;
  totalCents: number;
  feeCollectedCents: number;
  refundCents: number;
}): RefundComputationResult {
  const fee = proportionalFeeRefund({
    totalCents: input.totalCents,
    totalFeeCents: input.feeCollectedCents,
    refundCents: input.refundCents,
  });
  if (!fee.ok) return fee;

  const feeToRefund = fee.cents;
  const netToRefund = input.refundCents - feeToRefund;

  if (netToRefund < 0) {
    return {
      ok: false,
      error: "Cálculo de reembolso produziu líquido negativo.",
    };
  }
  if (feeToRefund + netToRefund !== input.refundCents) {
    return {
      ok: false,
      error: "Invariante de reembolso quebrado.",
    };
  }
  return {
    ok: true,
    refundCents: input.refundCents,
    feeToRefundCents: feeToRefund,
    netToRefundCents: netToRefund,
  };
}
