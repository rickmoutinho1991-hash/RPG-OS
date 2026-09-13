/**
 * RPG-OS — testes do contexto fiscal pessoal (pessoa singular).
 * Lógica pura: tenant user_id, presença de NIF, gate company-only.
 * Sem valores fiscais reais.
 */
import { describe, expect, it } from "vitest";
import {
  requiresCompany,
  resolvePersonalFiscalContext,
} from "../personalFiscal";

describe("personalFiscal — contexto", () => {
  it("sem userId → null (fail-closed)", () => {
    expect(resolvePersonalFiscalContext({ userId: null, taxNumber: "1" })).toBeNull();
    expect(resolvePersonalFiscalContext({ userId: "", taxNumber: null })).toBeNull();
  });

  it("userId + NIF → contexto sem expor valor", () => {
    const ctx = resolvePersonalFiscalContext({ userId: "u1", taxNumber: "212345672" });
    expect(ctx).toEqual({ userId: "u1", taxNumberPresent: true, taxpayerKind: "INDIVIDUAL" });
    expect(JSON.stringify(ctx)).not.toContain("212345672");
  });

  it("sector SOLE_TRADER → kind SOLE_TRADER (pessoa singular com atividade)", () => {
    const ctx = resolvePersonalFiscalContext({ userId: "u1", taxNumber: null, sector: "SOLE_TRADER" });
    expect(ctx?.taxpayerKind).toBe("SOLE_TRADER");
    expect(ctx?.taxNumberPresent).toBe(false);
  });
});

describe("personalFiscal — requiresCompany", () => {
  it("pessoal não exige company; AT/inbox exigem", () => {
    expect(requiresCompany("personal_obligations")).toBe(false);
    expect(requiresCompany("personal_invoices")).toBe(false);
    expect(requiresCompany("personal_calculations")).toBe(false);
    expect(requiresCompany("at_connection")).toBe(true);
    expect(requiresCompany("at_submission")).toBe(true);
    expect(requiresCompany("fiscal_inbox")).toBe(true);
  });
});

describe("personalFiscal — sem company, AT continua NO_COMPANY", () => {
  it("contexto pessoal válido não autoriza at_connection (gate separado)", () => {
    const ctx = resolvePersonalFiscalContext({ userId: "u1", taxNumber: "212345672" });
    expect(ctx).not.toBeNull();
    expect(requiresCompany("at_connection")).toBe(true);
  });
});
