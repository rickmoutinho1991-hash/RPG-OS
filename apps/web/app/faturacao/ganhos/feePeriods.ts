import type { FeeMonthlyPoint, FeePeriodTotals } from "@rpg/core";

/** Períodos suportados pelo painel (calculados SEMPRE no servidor). */
export const FEE_PERIODS = [
  "mes-atual",
  "mes-anterior",
  "3m",
  "12m",
  "custom",
] as const;
export type FeePeriod = (typeof FEE_PERIODS)[number];

export interface FeeDashboardRange {
  period: FeePeriod;
  /** ISO date (YYYY-MM-DD) inclusivo — calculado no servidor. */
  from: string;
  to: string;
}

/**
 * Calcula o intervalo de datas do período. Os campos `from`/`to` vindos
 * do cliente só são aceites em modo `custom` e APENAS como datas de filtro
 * (nunca influenciam valores monetários, empresa ou taxa).
 */
export function resolveRange(
  period: FeePeriod,
  customFrom?: string,
  customTo?: string,
): FeeDashboardRange | null {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  switch (period) {
    case "mes-atual":
      return {
        period,
        from: iso(new Date(Date.UTC(y, m, 1))),
        to: iso(new Date(Date.UTC(y, m + 1, 0))),
      };
    case "mes-anterior":
      return {
        period,
        from: iso(new Date(Date.UTC(y, m - 1, 1))),
        to: iso(new Date(Date.UTC(y, m, 0))),
      };
    case "3m":
      return {
        period,
        from: iso(new Date(Date.UTC(y, m - 2, 1))),
        to: iso(new Date(Date.UTC(y, m + 1, 0))),
      };
    case "12m":
      return {
        period,
        from: iso(new Date(Date.UTC(y, m - 11, 1))),
        to: iso(new Date(Date.UTC(y, m + 1, 0))),
      };
    case "custom": {
      // Validação estrita: apenas datas ISO válidas; from <= to.
      if (!customFrom || !customTo) return null;
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(customFrom) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(customTo)
      )
        return null;
      if (customFrom > customTo) return null;
      // Limita a janela personalizada aos últimos 5 anos.
      const minFrom = iso(new Date(Date.UTC(y - 5, m, 1)));
      return {
        period,
        from: customFrom < minFrom ? minFrom : customFrom,
        to: customTo,
      };
    }
    default:
      return null;
  }
}

const MONTH_LABELS_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export function monthLabel(key: string): string {
  const [, mm] = key.split("-");
  const idx = Number(mm) - 1;
  return `${MONTH_LABELS_PT[idx] ?? mm} / ${key.slice(2, 4)}`;
}

export interface FeeDashboardData {
  company: { id: string; name: string };
  range: FeeDashboardRange;
  totals: FeePeriodTotals;
  monthly: Array<FeeMonthlyPoint & { label: string }>;
  /** Config atual, apenas informativa ("taxa vigente"); histórico usa snapshots. */
  currentBasisPoints: number | null;
}