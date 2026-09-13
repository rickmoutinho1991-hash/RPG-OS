/**
 * RPG-OS — Company <-> Organization link decision tests.
 *
 * Provam a decisão pura usada pela server action (sem I/O, sem DB):
 * nenhum vínculo nasce sem membership ACTIVE na org E company do perfil.
 */
import { describe, it, expect } from "vitest";
import {
  decideCompanyOrgLink,
  type CompanyOrgLinkRequest,
} from "../companyOrgLink";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const ORG_X = "33333333-3333-4333-8333-333333333333";
const ORG_Y = "44444444-4444-4444-8444-444444444444";

function req(overrides: Partial<CompanyOrgLinkRequest> = {}): CompanyOrgLinkRequest {
  return {
    actorCompanyId: COMPANY_A,
    requestedCompanyId: COMPANY_A,
    memberOrgIds: [ORG_X],
    requestedOrgId: ORG_X,
    existingStatus: null,
    ...overrides,
  };
}

describe("decideCompanyOrgLink", () => {
  it("Test 1 — sem membership na org: REJECT", () => {
    expect(decideCompanyOrgLink(req({ memberOrgIds: [] }))).toEqual({
      ok: false,
      error: "FORBIDDEN",
    });
  });

  it("Test 2 — membership noutra org não autoriza Org B", () => {
    expect(
      decideCompanyOrgLink(req({ memberOrgIds: [ORG_X], requestedOrgId: ORG_Y })),
    ).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("Test 3 — company arbitrária (Company B) sem autorização: REJECT", () => {
    expect(decideCompanyOrgLink(req({ requestedCompanyId: COMPANY_B }))).toEqual({
      ok: false,
      error: "FORBIDDEN",
    });
  });

  it("Test 4 — organization arbitrária sem membership: REJECT", () => {
    expect(
      decideCompanyOrgLink(
        req({ requestedOrgId: "55555555-5555-4555-8555-555555555555" }),
      ),
    ).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("Test 5 — duplicado ACTIVE: no-op idempotente, sem segunda row", () => {
    expect(decideCompanyOrgLink(req({ existingStatus: "ACTIVE" }))).toEqual({
      ok: true,
      mode: "noop-active",
    });
  });

  it("Test 6 — revoke é decisão separada: link válido não implica revoke", () => {
    // A decisão de link nunca produz REVOKED; revoke vive na action própria.
    const d = decideCompanyOrgLink(req({ existingStatus: "REVOKED" }));
    expect(d).toEqual({ ok: true, mode: "reactivate" });
  });

  it("Test 7 — REVOKED reativa a mesma linha (sem duplicado)", () => {
    expect(decideCompanyOrgLink(req({ existingStatus: "REVOKED" }))).toEqual({
      ok: true,
      mode: "reactivate",
    });
  });

  it("Test 8 — cross-tenant: par (Company B, Org Y) com contexto (A, X): REJECT", () => {
    expect(
      decideCompanyOrgLink(
        req({ requestedCompanyId: COMPANY_B, requestedOrgId: ORG_Y }),
      ),
    ).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("Test 9 — UUID igual nos dois lados não confere equivalência", () => {
    // Mesmo valor exige passar nas DUAS verificações independentes.
    const same = ORG_X;
    expect(
      decideCompanyOrgLink(
        req({
          actorCompanyId: same,
          requestedCompanyId: same,
          memberOrgIds: [same],
          requestedOrgId: same,
        }),
      ),
    ).toEqual({ ok: true, mode: "create" });
    // Mas company correta + org fora das memberships continua REJECT.
    expect(
      decideCompanyOrgLink(
        req({ requestedCompanyId: COMPANY_A, requestedOrgId: ORG_Y }),
      ),
    ).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("Test 10 — created_by/status do client são ignorados (decisão não os lê)", () => {
    // A função nem aceita esses campos: compañía/org/authoridade vêm da sessão.
    const d = decideCompanyOrgLink(req());
    expect(d).toEqual({ ok: true, mode: "create" });
    expect("created_by" in d).toBe(false);
    expect("status" in d).toBe(false);
  });

  it("actor sem empresa nunca vincula", () => {
    expect(decideCompanyOrgLink(req({ actorCompanyId: null }))).toEqual({
      ok: false,
      error: "FORBIDDEN",
    });
  });

  it("multi-org: Company A com Org X e Org Y coexistem (decisão por par)", () => {
    expect(
      decideCompanyOrgLink(
        req({ memberOrgIds: [ORG_X, ORG_Y], requestedOrgId: ORG_Y }),
      ),
    ).toEqual({ ok: true, mode: "create" });
    // Revogar X não afeta Y: decisões independentes por par.
    expect(
      decideCompanyOrgLink(
        req({
          memberOrgIds: [ORG_X, ORG_Y],
          requestedOrgId: ORG_X,
          existingStatus: "REVOKED",
        }),
      ),
    ).toEqual({ ok: true, mode: "reactivate" });
  });
});
