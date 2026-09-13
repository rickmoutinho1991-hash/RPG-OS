/**
 * RPG-OS — Revenue Ledger (FASE 7).
 *
 * Ledger de receita APPEND-ORIENTED e IMUTÁVEL: cada evento cria um novo
 * registo; um registo existente nunca é reescrito (apenas se acrescenta um
 * evento de reversão). O saldo de um ponto do tempo é derivado da soma dos
 * eventos, nunca de um campo mutável.
 *
 * Este módulo contém APENAS lógica pura/estado-máquina. A persistência é feita
 * pela camada de integração (Server Actions / service-role), mantendo a
 * segurança monetária aqui testável.
 *
 * Estados de entrada do ledger (append-only):
 *   - PENDING        — pagamento autorizado, recolha pendente
 *   - COLLECTED      — receita recolhida (fee efetiva da plataforma)
 *   - REFUNDED       — receita totalmente devolvida (refund total)
 *   - PARTIALLY_REFUNDED — parte da receita devolvida
 *   - FAILED         — pagamento falhou; nenhuma receita recolhida
 *   - REVERSED       — reversão administrativa (erro/fraude)
 *
 * Transições permitidas:
 *   PENDING → COLLECTED | FAILED | REVERSED
 *   COLLECTED → REFUNDED | PARTIALLY_REFUNDED | REVERSED
 *   PARTIALLY_REFUNDED → REFUNDED | REVERSED
 *   (terminal: FAILED, REFUNDED, REVERSED)
 */

export type RevenueLedgerStatus =
  | "PENDING"
  | "COLLECTED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "FAILED"
  | "REVERSED";

export const REVENUE_LEDGER_STATUSES: RevenueLedgerStatus[] = [
  "PENDING",
  "COLLECTED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "FAILED",
  "REVERSED",
];

export function isRevenueLedgerStatus(
  value: unknown,
): value is RevenueLedgerStatus {
  return (
    typeof value === "string" &&
    (REVENUE_LEDGER_STATUSES as string[]).includes(value)
  );
}

const TRANSITIONS: Record<RevenueLedgerStatus, RevenueLedgerStatus[]> = {
  PENDING: ["COLLECTED", "FAILED", "REVERSED"],
  COLLECTED: ["REFUNDED", "PARTIALLY_REFUNDED", "REVERSED"],
  PARTIALLY_REFUNDED: ["REFUNDED", "REVERSED"],
  REFUNDED: [],
  FAILED: [],
  REVERSED: [],
};

export function canTransitionLedger(
  from: RevenueLedgerStatus,
  to: RevenueLedgerStatus,
): boolean {
  if (!isRevenueLedgerStatus(from) || !isRevenueLedgerStatus(to)) return false;
  return TRANSITIONS[from].includes(to);
}

export function isTerminalLedgerStatus(
  status: RevenueLedgerStatus,
): boolean {
  return status === "REFUNDED" || status === "FAILED" || status === "REVERSED";
}

export interface LedgerLine {
  /** Identificador imutável da linha (uma por transação). */
  id: string;
  organizationId: string;
  companyId?: string;
  /** Valor bruto da transação em CENTAVOS. */
  grossCents: number;
  /** Fee efetiva recolhida em CENTAVOS. */
  feeCents: number;
  /** Líquido para a empresa em CENTAVOS. */
  netCents: number;
  /** Fee total do pagamento (antes de refunds) em CENTAVOS. */
  feeCollectedCents: number;
  /** Taxa snapshot (bps). */
  basisPoints: number;
  /** Total já reembolsado da fee em CENTAVOS. */
  feeRefundedCents: number;
  /** Plano associado (fonte de taxa), se aplicável. */
  planId?: string;
  /** Serviço de origem (PAYMENT/SUBSCRIPTION), se conhecido (FASE 8). */
  sourceType?: string;
  status: RevenueLedgerStatus;
  createdAt: string;
  updatedAt: string;
}

/** Resultado de aplicação de um evento de refund/reversal. */
export interface LedgerMutationResult {
  ok: boolean;
  error?: string;
  line?: LedgerLine;
  /** Fee a devolver (>=0) decorrente do evento. */
  feeToRefundCents?: number;
}

export function applyLedgerRefund(
  line: LedgerLine,
  refundCents: number,
  reason?: string,
): LedgerMutationResult {
  if (isTerminalLedgerStatus(line.status)) {
    return { ok: false, error: "Ledger em estado terminal: sem reembolso." };
  }
  if (line.status !== "COLLECTED" && line.status !== "PARTIALLY_REFUNDED") {
    return {
      ok: false,
      error: "Apenas receita recolhida pode ser reembolsada.",
    };
  }
  if (refundCents < 0 || !Number.isSafeInteger(refundCents)) {
    return { ok: false, error: "Montante de reembolso inválido." };
  }
  if (refundCents === 0) return { ok: true, line, feeToRefundCents: 0 };

  // Fee a devolver proporcional ao montante bruto reembolsado (inteiros exatos).
  // Reembolso parcial de 50% do bruto reverte ~50% da fee; reembolso total
  // reverte 100%. Nunca ultrapassa a fee ainda retida.
  const remainingFee = line.feeCollectedCents - line.feeRefundedCents;
  const proportional =
    Math.floor((line.feeCollectedCents * refundCents) / line.grossCents);
  let feeToRefund = Math.min(remainingFee, proportional);
  if (refundCents >= line.grossCents) feeToRefund = remainingFee;

  let nextStatus: RevenueLedgerStatus;
  if (line.feeRefundedCents + feeToRefund >= line.feeCollectedCents) {
    nextStatus = "REFUNDED";
  } else if (feeToRefund > 0) {
    nextStatus = "PARTIALLY_REFUNDED";
  } else {
    nextStatus = line.status;
  }

  const updatedAt = new Date().toISOString();
  return {
    ok: true,
    feeToRefundCents: feeToRefund,
    line: {
      ...line,
      status: nextStatus,
      feeRefundedCents: line.feeRefundedCents + feeToRefund,
      updatedAt,
      netCents: Math.max(0, line.netCents - feeToRefund),
    },
  };
}

export function applyLedgerReversal(line: LedgerLine, reason?: string): LedgerMutationResult {
  if (isTerminalLedgerStatus(line.status)) {
    return { ok: false, error: "Ledger em estado terminal: sem reversão." };
  }
  return {
    ok: true,
    feeToRefundCents: line.feeCollectedCents - line.feeRefundedCents,
    line: {
      ...line,
      status: "REVERSED",
      feeRefundedCents: line.feeCollectedCents,
      netCents: 0,
      updatedAt: new Date().toISOString(),
      reason,
    } as LedgerLine & { reason?: string },
  };
}

export function applyLedgerCollect(line: LedgerLine): LedgerMutationResult {
  if (line.status !== "PENDING") {
    return { ok: false, error: "Apenas PENDING pode ser recolhido." };
  }
  return {
    ok: true,
    line: { ...line, status: "COLLECTED", updatedAt: new Date().toISOString() },
  };
}

export function applyLedgerFail(line: LedgerLine): LedgerMutationResult {
  if (line.status !== "PENDING") {
    return { ok: false, error: "Apenas PENDING pode falhar." };
  }
  return {
    ok: true,
    line: {
      ...line,
      status: "FAILED",
      feeCents: 0,
      netCents: 0,
      updatedAt: new Date().toISOString(),
    },
  };
}

/** Cria uma linha PENDING a partir de um cálculo de fee já validado. */
export function createPendingLedgerLine(input: {
  id: string;
  organizationId: string;
  companyId?: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  basisPoints: number;
}): LedgerLine {
  const now = new Date().toISOString();
  return {
    id: input.id,
    organizationId: input.organizationId,
    companyId: input.companyId,
    grossCents: input.grossCents,
    feeCents: input.feeCents,
    netCents: input.netCents,
    feeCollectedCents: input.feeCents,
    basisPoints: input.basisPoints,
    feeRefundedCents: 0,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Soma total de fee recolhida de um conjunto de linhas (inteiros).
 * status 'FAILED' ou 'REVERSED' contribui 0 (nenhuma receita retida);
 * REVERSED/REFUNDED subtraem o já reembolsado.
 */
export function totalCollectedFee(lines: readonly LedgerLine[]): number {
  return lines.reduce((sum, l) => {
    if (l.status === "FAILED" || l.status === "REVERSED") return sum;
    return sum + (l.feeCollectedCents - l.feeRefundedCents);
  }, 0);
}
