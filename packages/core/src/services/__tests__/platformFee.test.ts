import { describe, it, expect } from "vitest";
import {
  computePlatformFee,
  parseEuroToCents,
  resolveApplicableBasisPoints,
} from "../PlatformFeeService";

describe("parseEuroToCents", () => {
  it("converte sem erro de floating point", () => {
    // 820.65 * 100 em float daria 82064.99999…
    expect(parseEuroToCents("820.65")).toBe(82065);
    expect(parseEuroToCents("1000")).toBe(100000);
    expect(parseEuroToCents("0.05")).toBe(5);
    expect(parseEuroToCents("1 000,50".replace(" ", ""))).toBe(100050);
    expect(parseEuroToCents(1234.56)).toBe(123456); // via String()
    expect(parseEuroToCents(-10.2)).toBe(-1020);
  });

  it("rejeita inválidos em vez de adivinhar", () => {
    expect(parseEuroToCents(null)).toBeNull();
    expect(parseEuroToCents("abc")).toBeNull();
    expect(parseEuroToCents("1.234")).toBeNull(); // >2 casas decimais
    expect(parseEuroToCents("")).toBeNull();
  });
});

describe("resolveApplicableBasisPoints", () => {
  const configs = [
    { companyId: null, basisPoints: 250, isActive: true },
    { companyId: "c-1", basisPoints: 150, isActive: true },
    { companyId: "c-2", basisPoints: 500, isActive: false },
  ];

  it("config da empresa prevalece sobre a global", () => {
    expect(resolveApplicableBasisPoints(configs, "c-1")).toBe(150);
  });

  it("empresa inativa cai no fallback global", () => {
    expect(resolveApplicableBasisPoints(configs, "c-2")).toBe(250);
  });

  it("sem qualquer config → 0 bps (default seguro)", () => {
    expect(resolveApplicableBasisPoints([], "c-x")).toBe(0);
    expect(resolveApplicableBasisPoints(null, null)).toBe(0);
  });

  it("sem empresa usa apenas a global", () => {
    expect(resolveApplicableBasisPoints(configs, null)).toBe(250);
  });
});

describe("computePlatformFee", () => {
  it("exemplo do modelo: 1.000 € @ 2,5% → fee 25 €, líquido 975 €", () => {
    expect(
      computePlatformFee({ grossCents: 100000, basisPoints: 250 }),
    ).toEqual({
      grossCents: 100000,
      basisPoints: 250,
      feeCents: 2500,
      netCents: 97500,
    });
  });

  it("determinístico e exato com valores difíceis (round half-up)", () => {
    // 820,65 € @ 2,5% = 20,516… € → 2052 cents
    expect(
      computePlatformFee({ grossCents: 82065, basisPoints: 250 }),
    ).toMatchObject({ feeCents: 2052, netCents: 80013 });
    // arredondamento por defeito para cima no meio-termo
    expect(
      computePlatformFee({ grossCents: 1, basisPoints: 5000 }),
    ).toMatchObject({ feeCents: 1, netCents: 0 }); // 0,5 → 1
  });

  it("extremos seguros em inteiros", () => {
    const big = computePlatformFee({ grossCents: 900719925474099 - 1, basisPoints: 1 });
    expect(big.netCents + big.feeCents).toBe(big.grossCents);
    expect(computePlatformFee({ grossCents: 0, basisPoints: 250 })).toEqual({
      grossCents: 0,
      basisPoints: 250,
      feeCents: 0,
      netCents: 0,
    });
  });

  it("rejeita entradas fora do domínio", () => {
    expect(() =>
      computePlatformFee({ grossCents: -1, basisPoints: 250 }),
    ).toThrow();
    expect(() =>
      computePlatformFee({ grossCents: 100, basisPoints: 20000 }),
    ).toThrow();
    expect(() =>
      computePlatformFee({ grossCents: 1.5 as unknown as number, basisPoints: 250 }),
    ).toThrow();
  });
});