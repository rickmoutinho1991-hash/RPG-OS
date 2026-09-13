/**
 * RPG-OS — Invoice routing assignment tests (decisão pura, sem I/O/DB).
 *
 * Cobrem authorization, tenant, assignment, determinismo e privacy por
 * construção (a decisão nunca recebe nem devolve payload fiscal).
 */
import { describe, it, expect } from "vitest";
import {
  decideInvoiceRouting,
  type InvoiceRoutingRequest,
} from "../invoiceRouting";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const ORG_X = "33333333-3333-4333-8333-333333333333";
const ORG_Y = "44444444-4444-4444-8444-444444444444";

function req(overrides: Partial<InvoiceRoutingRequest> = {}): InvoiceRoutingRequest {
  return {
    actorCompanyId: COMPANY_A,
    invoiceCompanyId: COMPANY_A,
    memberOrgIds: [ORG_X],
    requestedOrgId: ORG_X,
    linkActive: true,
    existingStatus: null,
    action: "assign",
    ...overrides,
  };
}

describe("decideInvoiceRouting — authorization", () => {
  it("1. actor sem company nunca assigna", () => {
    expect(decideInvoiceRouting(req({ actorCompanyId: null }))).toEqual({
      ok: false,
      error: "FORBIDDEN",
    });
  });

  it("2. fiscal.admin é verificado fora: sem membership → reject", () => {
    expect(decideInvoiceRouting(req({ memberOrgIds: [] }))).toEqual({
      ok: false,
      error: "FORBIDDEN",
    });
  });

  it("3. company do actor ≠ company da invoice → reject", () => {
    expect(
      decideInvoiceRouting(req({ actorCompanyId: COMPANY_B })),
    ).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("4. org fora das memberships → reject", () => {
    expect(decideInvoiceRouting(req({ requestedOrgId: ORG_Y }))).toEqual({
      ok: false,
      error: "FORBIDDEN",
    });
  });
});

describe("decideInvoiceRouting — tenant", () => {
  it("6. vínculo inativo → NO_ROUTE (não cria)", () => {
    expect(decideInvoiceRouting(req({ linkActive: false }))).toEqual({
      ok: false,
      error: "NO_ROUTE",
    });
  });

  it("7. invoice sem company → NO_ROUTE (fail closed)", () => {
    expect(decideInvoiceRouting(req({ invoiceCompanyId: null }))).toEqual({
      ok: false,
      error: "NO_ROUTE",
    });
  });

  it("8. UUID igual nos dois eixos não confere nada sozinho", () => {
    // Mesmo valor exige passar em TODAS as verificações independentes.
    expect(
      decideInvoiceRouting(
        req({
          actorCompanyId: ORG_X,
          invoiceCompanyId: ORG_X,
          memberOrgIds: [ORG_X],
          requestedOrgId: ORG_X,
        }),
      ),
    ).toEqual({ ok: true, mode: "create" });
    // E continua a rejeitar org fora das memberships.
    expect(
      decideInvoiceRouting(req({ requestedOrgId: ORG_Y })),
    ).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("9/10. client não controla company/actor/status (assinatura não os aceita)", () => {
    const d = decideInvoiceRouting(req());
    expect(d).toEqual({ ok: true, mode: "create" });
    expect("created_by" in d).toBe(false);
    expect("status" in d).toBe(false);
    expect("companyId" in d).toBe(false);
  });
});

describe("decideInvoiceRouting — assignment", () => {
  it("12. assignment válido → create", () => {
    expect(decideInvoiceRouting(req())).toEqual({ ok: true, mode: "create" });
  });

  it("13. duplicado → noop-assigned idempotente", () => {
    expect(decideInvoiceRouting(req({ existingStatus: "ASSIGNED" }))).toEqual({
      ok: true,
      mode: "noop-assigned",
    });
  });

  it("14. reassign → modo reassign (histórico preservado pelo chamador)", () => {
    expect(decideInvoiceRouting(req({ existingStatus: "REVOKED" }))).toEqual({
      ok: true,
      mode: "reassign",
    });
  });

  it("15. revoke de ASSIGNED → revoke; sem assignment → noop-revoked", () => {
    expect(decideInvoiceRouting(req({ action: "revoke" }))).toEqual({
      ok: true,
      mode: "noop-revoked",
    });
    expect(
      decideInvoiceRouting(
        req({ action: "revoke", existingStatus: "ASSIGNED" }),
      ),
    ).toEqual({ ok: true, mode: "revoke" });
    expect(
      decideInvoiceRouting(
        req({ action: "revoke", existingStatus: "REVOKED" }),
      ),
    ).toEqual({ ok: true, mode: "noop-revoked" });
  });
});

describe("decideInvoiceRouting — determinismo e privacy", () => {
  it("19. mesmo invoice + destino → mesmo resultado, qualquer actor", () => {
    const a = decideInvoiceRouting(req());
    const b = decideInvoiceRouting(req());
    expect(a).toEqual(b);
    expect(a).toEqual({ ok: true, mode: "create" });
  });

  it("21. decisão nunca contém payload fiscal (só modo/erro)", () => {
    const d = decideInvoiceRouting(req());
    const s = JSON.stringify(d);
    expect(s).not.toMatch(/nif|NIF|amount|total|counterparty/i);
  });
});
