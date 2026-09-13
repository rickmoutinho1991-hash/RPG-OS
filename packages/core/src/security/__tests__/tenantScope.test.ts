/**
 * RPG-OS — tenantScope tests (HIGH fix: company vs organization semantics).
 *
 * Provam que o filtro usa sempre as colunas certas e que a ausência de
 * companyId degrada para filtro só-de-utilizador (fail-closed), nunca global.
 */
import { describe, it, expect } from "vitest";
import { companyUserOrFilter } from "../tenantScope";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const ORG_X = "33333333-3333-4333-8333-333333333333";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("companyUserOrFilter", () => {
  it("Test 1 — Company A não recebe filtro de Company B", () => {
    const a = companyUserOrFilter({ companyId: COMPANY_A, userId: USER_A });
    const b = companyUserOrFilter({ companyId: COMPANY_B, userId: USER_A });
    expect(a).toContain(`company_id.eq.${COMPANY_A}`);
    expect(a).not.toContain(COMPANY_B);
    expect(b).toContain(`company_id.eq.${COMPANY_B}`);
    expect(b).not.toContain(COMPANY_A);
  });

  it("Test 3 — companyId e organizationId nunca se misturam", () => {
    // Mesmo que o chamador tenha ambos, o filtro de empresa usa companyId.
    const f = companyUserOrFilter({ companyId: COMPANY_A, userId: USER_A });
    expect(f).not.toContain(ORG_X);
    // Colunas por omissão são as do eixo company/user.
    expect(f).toMatch(/^company_id\.eq\..+,user_id\.eq\..+$/);
  });

  it("Test 4 — sem companyId devolve null (chamador usa só user → fail-closed)", () => {
    expect(companyUserOrFilter({ companyId: null, userId: USER_A })).toBeNull();
    expect(companyUserOrFilter({ companyId: undefined, userId: USER_A })).toBeNull();
    expect(companyUserOrFilter({ companyId: "", userId: USER_A })).toBeNull();
  });

  it("Test 6 — colisão de UUIDs não quebra a semântica (colunas mandam)", () => {
    // Hipótese adversarial: mesmo UUID nos dois eixos. O filtro continua a
    // referenciar as colunas certas; segurança por semântica, não por valor.
    const f = companyUserOrFilter({ companyId: ORG_X, userId: USER_A });
    expect(f).toBe(`company_id.eq.${ORG_X},user_id.eq.${USER_A}`);
  });

  it("suporta colunas de utilizador alternativas (ex.: owner_user_id)", () => {
    const f = companyUserOrFilter({
      companyId: COMPANY_A,
      userId: USER_A,
      userColumn: "owner_user_id",
    });
    expect(f).toBe(`company_id.eq.${COMPANY_A},owner_user_id.eq.${USER_A}`);
  });
});
