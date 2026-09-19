import { describe, it, expect } from "vitest";
import {
  MARKETPLACE_FEE_BPS_DEFAULT,
  computeMilestoneFee,
  feePercentLabel,
  resolveMarketplaceFeeBps,
  sumFeeEntries,
} from "../marketplaceFees";

describe("marketplaceFees — comissão de mercado (modelo 3% = 300 bps)", () => {
  it("sem configuração → 300 bps por omissão (a)", () => {
    expect(resolveMarketplaceFeeBps(null)).toBe(300);
    expect(resolveMarketplaceFeeBps([])).toBe(300);
    expect(MARKETPLACE_FEE_BPS_DEFAULT).toBe(300);
    expect(resolveMarketplaceFeeBps([{ companyId: "co", basisPoints: 150, isActive: true }])).toBe(300);
  });

  it("configuração global ativa prevalece sobre o default (b)", () => {
    expect(
      resolveMarketplaceFeeBps([
        { companyId: "co", basisPoints: 150, isActive: true },
        { companyId: null, basisPoints: 450, isActive: true },
      ]),
    ).toBe(450);
    expect(
      resolveMarketplaceFeeBps([
        { companyId: null, basisPoints: 450, isActive: false },
      ]),
    ).toBe(300);
  });

  it("falha fora do domínio (c)", () => {
    expect(() => computeMilestoneFee(-1)).toThrow();
    expect(() => computeMilestoneFee(100, 10001)).toThrow();
    expect(() => computeMilestoneFee(100, -1)).toThrow();
  });

  it("fee exata em centavos, round-half-up, estável e determinística (d)", () => {
    const big = computeMilestoneFee(100_000, 300);
    expect(big).toEqual({ grossCents: 100000, basisPoints: 300, feeCents: 3000, netCents: 97000 });
    const tiny = computeMilestoneFee(1, 300);
    expect(tiny.feeCents).toBe(0);
    expect(tiny.netCents).toBe(1);
    const half = computeMilestoneFee(17, 300); // 0.51 cêntimos -> 1 (half-up)
    expect(half.feeCents).toBe(1);
    expect(computeMilestoneFee(10_000, 450)).toEqual({
      grossCents: 10000,
      basisPoints: 450,
      feeCents: 450,
      netCents: 9550,
    });
  });

  it("sumFeeEntries agrega sem perder centavos (e)", () => {
    const totals = sumFeeEntries([
      { grossCents: 100000, basisPoints: 300, feeCents: 3000, netCents: 97000 },
      { grossCents: 5000, basisPoints: 300, feeCents: 150, netCents: 4850 },
    ]);
    expect(totals).toEqual({ grossCents: 105000, feeCents: 3150, netCents: 101850 });
    expect(sumFeeEntries([])).toEqual({ grossCents: 0, feeCents: 0, netCents: 0 });
  });

  it("feePercentLabel formata 3% e frações (f)", () => {
    expect(feePercentLabel(300)).toBe("3%");
    expect(feePercentLabel(450)).toBe("4,5%");
    expect(feePercentLabel(275)).toBe("2,75%");
    expect(feePercentLabel(100)).toBe("1%");
  });
});