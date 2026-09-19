/**
 * RPG-OS — Mercado: comissão da plataforma (modelo 3% = 300 bps) no fluxo de
 * pagamentos de milestones (M-F).
 *
 * Funções PURAS — sem BD. O servidor persiste os valores calculados aqui.
 * O cliente paga o valor bruto; a plataforma retém a fee; o prestador recebe
 * o líquido (gross − fee). Reutiliza `computePlatformFee` (round-half-up,
 * centavos inteiros, domínio validado) e o snapshot `FeeConfigSnapshot`.
 */

import {
  computePlatformFee,
  type FeeConfigSnapshot,
  type PlatformFeeComputation,
} from "./PlatformFeeService";

/** Taxa padrão do mercado: 3% = 300 bps (plano FREE). */
export const MARKETPLACE_FEE_BPS_DEFAULT = 300;

/**
 * Resolve a comissão aplicável a um pagamento do mercado.
 * Configuração GLOBAL ativa prevalece; sem nenhuma → 300 bps (3%) por omissão.
 */
export function resolveMarketplaceFeeBps(
  configs: FeeConfigSnapshot[] | null | undefined,
): number {
  const global = (configs ?? []).find(
    (c) => c.isActive && c.companyId === null,
  );
  return global ? global.basisPoints : MARKETPLACE_FEE_BPS_DEFAULT;
}

/**
 * Calcula fee/líquido de um milestone. Liga a `computePlatformFee` com o
 * default de mercado.
 */
export function computeMilestoneFee(
  grossCents: number,
  basisPoints: number = MARKETPLACE_FEE_BPS_DEFAULT,
): PlatformFeeComputation {
  return computePlatformFee({ grossCents, basisPoints });
}

export interface FeeEntry {
  grossCents: number;
  basisPoints: number;
  feeCents: number;
  netCents: number;
}

export interface FeeTotals {
  grossCents: number;
  feeCents: number;
  netCents: number;
}

/** Totais de comissão de um conjunto de pagamentos (vista de contrato). */
export function sumFeeEntries(entries: FeeEntry[]): FeeTotals {
  let grossCents = 0;
  let feeCents = 0;
  let netCents = 0;
  for (const entry of entries) {
    grossCents += entry.grossCents;
    feeCents += entry.feeCents;
    netCents += entry.netCents;
  }
  return { grossCents, feeCents, netCents };
}

/**
 * Percentagem legível da fee (ex.: 300 → "3%"), sem frações desnecessárias.
 */
export function feePercentLabel(basisPoints: number): string {
  const whole = Math.floor(basisPoints / 100);
  const fraction = basisPoints % 100;
  return fraction === 0
    ? `${whole}%`
    : `${whole},${String(fraction).padStart(2, "0").replace(/0+$/, "")}%`;
}