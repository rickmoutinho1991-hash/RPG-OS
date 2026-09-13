import { describe, it, expect } from "vitest";
import {
  aggregateFeeLedger,
  formatEurosFromCents,
  type FeeLedgerEntry,
} from "../PlatformFeeService";

const entry = (
  gross: number,
  fee: number,
  createdAt: string,
  basisPoints = 250,
): FeeLedgerEntry => ({
  grossCents: gross,
  feeCents: fee,
  netCents: gross - fee,
  basisPoints,
  createdAt,
});

describe("aggregateFeeLedger — totais do período", () => {
  it("soma bruto, fee e líquido em inteiros exatos", () => {
    const { totals } = aggregateFeeLedger([
      entry(100000, 2500, "2026-08-01T10:00:00Z"),
      entry(50000, 1250, "2026-08-15T10:00:00Z"),
    ]);
    expect(totals.grossCents).toBe(150000);
    expect(totals.feeCents).toBe(3750);
    expect(totals.netCents).toBe(146250);
    expect(totals.paymentsCount).toBe(2);
  });

  it("calcula ticket médio com arredondamento determinístico", () => {
    const { totals } = aggregateFeeLedger([
      entry(10000, 250, "2026-07-01T00:00:00Z"),
      entry(10001, 250, "2026-07-02T00:00:00Z"),
      entry(10001, 250, "2026-07-03T00:00:00Z"),
    ]);
    // (10000+10001+10001)/3 = 10000.67 → round → 10001
    expect(totals.avgTicketCents).toBe(10001);
    expect(
      aggregateFeeLedger([]).totals.avgTicketCents,
    ).toBe(0);
  });

  it("taxa efetiva deriva dos snapshots reais, não da config atual", () => {
    // Entradas com bps distintos no histórico (config mudou entretanto)
    const { totals } = aggregateFeeLedger([
      entry(100000, 2500, "2026-06-01", 250),
      entry(100000, 1300, "2026-06-15", 130),
    ]);
    // fee 3800 / gross 200000 → 190 bps efetivos
    expect(totals.effectiveBasisPoints).toBe(190);
  });

  it("sem volume: taxa efetiva e totais a zero", () => {
    const { totals, monthly } = aggregateFeeLedger([]);
    expect(totals.effectiveBasisPoints).toBe(0);
    expect(totals.grossCents).toBe(0);
    expect(monthly).toEqual([]);
    expect(aggregateFeeLedger(null).totals.feeCents).toBe(0);
  });

  it("rejeita valores negativos ou não-inteiros (corrupção não silenciada)", () => {
    expect(() =>
      aggregateFeeLedger([entry(-1, 0, "2026-08-01")]),
    ).toThrow();
    expect(() => aggregateFeeLedger([{ ...entry(1, 1, "2026-08-01"), feeCents: 1.5 }])).toThrow();
  });
});

describe("aggregateFeeLedger — série mensal", () => {
  it("agrupa por mês e ordena ascendentemente", () => {
    const { monthly } = aggregateFeeLedger([
      entry(30000, 750, "2026-05-20"),
      entry(10000, 250, "2026-04-02"),
      entry(50000, 1250, "2026-05-01"),
    ]);
    expect(monthly.map((m) => m.month)).toEqual(["2026-04", "2026-05"]);
    expect(monthly[1].grossCents).toBe(80000);
    expect(monthly[1].count).toBe(2);
  });

  it("ignora timestamps sem chave mensal válida nos pontos mas conta nos totais", () => {
    const { totals, monthly } = aggregateFeeLedger([
      entry(10000, 250, "2026-08-10"),
      entry(10000, 250, "data-invalida"),
    ]);
    expect(totals.paymentsCount).toBe(2);
    expect(monthly).toHaveLength(1);
    expect(monthly[0].month).toBe("2026-08");
  });
});

describe("formatEurosFromCents", () => {
  it("formata sem floating point", () => {
    expect(formatEurosFromCents(82065)).toBe("820,65 €");
    expect(formatEurosFromCents(5)).toBe("0,05 €");
    expect(formatEurosFromCents(100)).toBe("1,00 €");
    expect(formatEurosFromCents(-250)).toBe("-2,50 €");
    expect(() => formatEurosFromCents(1.5)).toThrow();
  });
});