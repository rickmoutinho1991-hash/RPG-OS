import { describe, it, expect } from "vitest";
import {
  parsePercentToBasisPoints,
  formatBasisPoints,
  validateFeeConfigChange,
  validateFeeConfigProposal,
  resolveApplicableBasisPoints,
  type FeeConfigChangeValidation,
} from "../PlatformFeeService";

const COMPANY_A = "11111111-1111-1111-1111-111111111111";
const COMPANY_B = "22222222-2222-2222-2222-222222222222";

describe("parsePercentToBasisPoints", () => {
  it("converte percentagens válidas para basis points", () => {
    expect(parsePercentToBasisPoints("2.5")).toBe(250);
    expect(parsePercentToBasisPoints("0.5")).toBe(50);
    expect(parsePercentToBasisPoints("10")).toBe(1000);
    expect(parsePercentToBasisPoints("0")).toBe(0);
    expect(parsePercentToBasisPoints("100")).toBe(10000);
    expect(parsePercentToBasisPoints("2,75")).toBe(275);
    expect(parsePercentToBasisPoints("3.25")).toBe(325);
  });

  it("rejeita percentagens inválidas", () => {
    expect(parsePercentToBasisPoints(null)).toBeNull();
    expect(parsePercentToBasisPoints(undefined)).toBeNull();
    expect(parsePercentToBasisPoints("")).toBeNull();
    expect(parsePercentToBasisPoints("abc")).toBeNull();
    expect(parsePercentToBasisPoints("2.999")).toBeNull(); // >2 casas decimais
    expect(parsePercentToBasisPoints("-1")).toBeNull();
    expect(parsePercentToBasisPoints("101")).toBeNull(); // >100%
  });

  it("trata input numérico corretamente", () => {
    expect(parsePercentToBasisPoints(2.5)).toBe(250);
    expect(parsePercentToBasisPoints(10)).toBe(1000);
  });
});

describe("formatBasisPoints", () => {
  it("formata basis points como percentagem legível", () => {
    expect(formatBasisPoints(250)).toBe("2,50%");
    expect(formatBasisPoints(50)).toBe("0,50%");
    expect(formatBasisPoints(1000)).toBe("10,00%");
    expect(formatBasisPoints(0)).toBe("0,00%");
    expect(formatBasisPoints(10000)).toBe("100,00%");
    expect(formatBasisPoints(275)).toBe("2,75%");
  });

  it("lança erro para basis points inválidos", () => {
    expect(() => formatBasisPoints(-1)).toThrow();
    expect(() => formatBasisPoints(10001)).toThrow();
    expect(() => formatBasisPoints(1.5 as unknown as number)).toThrow();
  });
});

describe("validateFeeConfigChange", () => {
  it("valida alteração com novo valor dentro dos limites", () => {
    const result: FeeConfigChangeValidation = validateFeeConfigChange({
      currentBps: 250,
      newBps: 300,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejeita novo valor fora dos limites", () => {
    expect(validateFeeConfigChange({ currentBps: 250, newBps: -1 }).valid).toBe(false);
    expect(validateFeeConfigChange({ currentBps: 250, newBps: 10001 }).valid).toBe(false);
    expect(validateFeeConfigChange({ currentBps: 250, newBps: 1.5 as unknown as number }).valid).toBe(false);
  });

  it("rejeita quando novo valor é igual ao atual", () => {
    const result: FeeConfigChangeValidation = validateFeeConfigChange({
      currentBps: 250,
      newBps: 250,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("A nova taxa é igual à taxa atual.");
  });

  it("permite alteração quando não há valor atual (primeira config)", () => {
    const result: FeeConfigChangeValidation = validateFeeConfigChange({
      currentBps: null,
      newBps: 250,
    });
    expect(result.valid).toBe(true);
  });

  it("permite alteração quando valor atual é 0", () => {
    const result: FeeConfigChangeValidation = validateFeeConfigChange({
      currentBps: 0,
      newBps: 250,
    });
    expect(result.valid).toBe(true);
  });

  it("permite alteração para 0% (desativar fee)", () => {
    const result: FeeConfigChangeValidation = validateFeeConfigChange({
      currentBps: 250,
      newBps: 0,
    });
    expect(result.valid).toBe(true);
  });

  it("permite alteração para 100% (fee total)", () => {
    const result: FeeConfigChangeValidation = validateFeeConfigChange({
      currentBps: 250,
      newBps: 10000,
    });
    expect(result.valid).toBe(true);
  });
});

describe("validateFeeConfigProposal (validação server-side da proposta)", () => {
  it("proposta GLOBAL válida com motivo", () => {
    const r = validateFeeConfigProposal({
      scope: "GLOBAL",
      companyId: null,
      newBps: 300,
      currentBps: 250,
      reason: "Ajuste de mercado",
      managedCompanyIds: [],
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("proposta COMPANY válida dentro do âmbito do ator", () => {
    const r = validateFeeConfigProposal({
      scope: "COMPANY",
      companyId: COMPANY_A,
      newBps: 500,
      currentBps: 250,
      reason: "Negócio específico",
      managedCompanyIds: [COMPANY_A, COMPANY_B],
    });
    expect(r.valid).toBe(true);
  });

  it("aceita 0% (desativar fee) e 100% (fee total)", () => {
    expect(
      validateFeeConfigProposal({
        scope: "GLOBAL",
        companyId: null,
        newBps: 0,
        currentBps: 250,
        reason: "Desativar",
        managedCompanyIds: [],
      }).valid,
    ).toBe(true);
    expect(
      validateFeeConfigProposal({
        scope: "GLOBAL",
        newBps: 10000,
        currentBps: 250,
        reason: "Fee total",
        companyId: null,
        managedCompanyIds: [],
      }).valid,
    ).toBe(true);
  });

  it("rejeita <0 e >100%", () => {
    for (const newBps of [-1, -100, 10001, 20000, 1.5]) {
      const r = validateFeeConfigProposal({
        scope: "GLOBAL",
        companyId: null,
        newBps: newBps as number,
        currentBps: 250,
        reason: "Teste",
        managedCompanyIds: [],
      });
      expect(r.valid).toBe(false);
    }
  });

  it("motivo é obrigatório em AMBOS os âmbitos", () => {
    expect(
      validateFeeConfigProposal({
        scope: "GLOBAL",
        companyId: null,
        newBps: 300,
        currentBps: 250,
        reason: "",
        managedCompanyIds: [],
      }).errors,
    ).toContain("Motivo é obrigatório.");
    expect(
      validateFeeConfigProposal({
        scope: "COMPANY",
        companyId: COMPANY_A,
        newBps: 300,
        currentBps: 250,
        reason: "   ",
        managedCompanyIds: [COMPANY_A],
      }).errors,
    ).toContain("Motivo é obrigatório.");
  });

  it("cross-tenant: empresa fora do âmbito do ator é rejeitada", () => {
    // O ator só gere a empresa A; tenta propor override para a empresa B.
    const r = validateFeeConfigProposal({
      scope: "COMPANY",
      companyId: COMPANY_B,
      newBps: 500,
      currentBps: 250,
      reason: "Tentativa de acesso a outra empresa",
      managedCompanyIds: [COMPANY_A],
    });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Sem autorização para gerir a taxa desta empresa.");
  });

  it("rejeita COMPANY sem companyId ou com identificador inválido", () => {
    expect(
      validateFeeConfigProposal({
        scope: "COMPANY",
        companyId: null,
        newBps: 300,
        currentBps: 250,
        reason: "Teste",
        managedCompanyIds: [COMPANY_A],
      }).errors,
    ).toContain("Empresa em falta ou identificador inválido.");
    expect(
      validateFeeConfigProposal({
        scope: "COMPANY",
        companyId: "cust_123", // não é UUID
        newBps: 300,
        currentBps: 250,
        reason: "Teste",
        managedCompanyIds: [],
      }).errors,
    ).toContain("Empresa em falta ou identificador inválido.");
  });

  it("aceita UUID em maiúsculas (comparação case-insensitive)", () => {
    expect(
      validateFeeConfigProposal({
        scope: "COMPANY",
        companyId: COMPANY_A.toUpperCase(),
        newBps: 500,
        currentBps: 250,
        reason: "Teste",
        managedCompanyIds: [COMPANY_A],
      }).valid,
    ).toBe(true);
  });

  it("âmbito inválido é rejeitado", () => {
    const r = validateFeeConfigProposal({
      scope: "OTHER" as "GLOBAL",
      companyId: null,
      newBps: 300,
      currentBps: 250,
      reason: "Teste",
      managedCompanyIds: [],
    });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Âmbito inválido.");
  });

  it("rejeita valor igual ao atual", () => {
    expect(
      validateFeeConfigProposal({
        scope: "GLOBAL",
        companyId: null,
        newBps: 250,
        currentBps: 250,
        reason: "Sem efeito",
        managedCompanyIds: [],
      }).valid,
    ).toBe(false);
  });

  it("precedência intacta: override por empresa resolvido por resolveApplicableBasisPoints", () => {
    // Documentado no fluxo server-side: currentBps é calculado com
    // resolveApplicableBasisPoints (empresa → global → 0) antes de validar.
    const configs = [
      { companyId: null, basisPoints: 300, isActive: true },
      { companyId: COMPANY_A, basisPoints: 500, isActive: true },
      { companyId: COMPANY_B, basisPoints: 100, isActive: false }, // inativo: ignorado
    ];
    expect(resolveApplicableBasisPoints(configs, COMPANY_A)).toBe(500);
    expect(resolveApplicableBasisPoints(configs, COMPANY_B)).toBe(300); // cai na global
    expect(resolveApplicableBasisPoints(configs, null)).toBe(300);
  });
});