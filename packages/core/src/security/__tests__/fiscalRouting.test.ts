/**
 * RPG-OS — Fiscal routing decision tests.
 *
 * Validam a decisão NO ROUTE nos 10 cenários: sem vínculos, 1 vínculo,
 * múltiplos, REVOKED, membership perdida, link revogado, duplicados,
 * fan-out proibido, client sem influência, primary ignorada.
 */
import { describe, it, expect } from "vitest";
import { resolveFiscalRoutingTargets } from "../fiscalRouting";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("resolveFiscalRoutingTargets", () => {
  it("1. zero organizations → NO_LINKS, sem targets", () => {
    expect(resolveFiscalRoutingTargets([])).toEqual({
      targets: [],
      blockedReason: "NO_LINKS",
    });
  });

  it("2. one ACTIVE organization → ainda bloqueado (associação ≠ routing)", () => {
    expect(
      resolveFiscalRoutingTargets([{ organization_id: ORG_A, status: "ACTIVE" }]),
    ).toEqual({ targets: [], blockedReason: "NEEDS_EXPLICIT_RULE" });
  });

  it("3. multiple ACTIVE → bloqueado, sem fan-out automático", () => {
    const d = resolveFiscalRoutingTargets([
      { organization_id: ORG_A, status: "ACTIVE" },
      { organization_id: ORG_B, status: "ACTIVE" },
    ]);
    expect(d.targets).toEqual([]);
    expect(d.blockedReason).toBe("NEEDS_EXPLICIT_RULE");
  });

  it("4. ACTIVE + REVOKED → REVOKED ignorado, resto bloqueado", () => {
    expect(
      resolveFiscalRoutingTargets([
        { organization_id: ORG_A, status: "ACTIVE" },
        { organization_id: ORG_B, status: "REVOKED" },
      ]),
    ).toEqual({ targets: [], blockedReason: "NEEDS_EXPLICIT_RULE" });
  });

  it("5/6. membership/link revogados (só REVOKED) → como zero", () => {
    expect(
      resolveFiscalRoutingTargets([{ organization_id: ORG_A, status: "REVOKED" }]),
    ).toEqual({ targets: [], blockedReason: "NO_LINKS" });
  });

  it("7/8. duplicados e fan-out: nunca dois targets sem regra", () => {
    const d = resolveFiscalRoutingTargets([
      { organization_id: ORG_A, status: "ACTIVE" },
      { organization_id: ORG_A, status: "ACTIVE" },
      { organization_id: ORG_B, status: "ACTIVE" },
    ]);
    expect(d.targets.length).toBeLessThanOrEqual(0);
    expect(d.blockedReason).toBe("NEEDS_EXPLICIT_RULE");
  });

  it("9. client não influencia: só vínculos contam (sem campo de input client)", () => {
    // A assinatura só aceita links resolvidos server-side; não há parâmetro
    // de organização vindo do client para influenciar o resultado.
    const fn = resolveFiscalRoutingTargets.toString();
    expect(fn).not.toMatch(/client|request|cookie|session/i);
    expect(
      resolveFiscalRoutingTargets([{ organization_id: ORG_A, status: "ACTIVE" }])
        .targets,
    ).toEqual([]);
  });

  it("10. primary do utilizador nunca decide routing fiscal", () => {
    // is_primary vive em org_memberships por utilizador e só ordena sessão;
    // a função nem o recebe como input — impossível influenciar.
    expect(
      resolveFiscalRoutingTargets([{ organization_id: ORG_B, status: "ACTIVE" }])
        .targets,
    ).toEqual([]);
  });

  it("11. actor-independence: dois actores, primárias distintas, mesmo resultado", () => {
    // User X (primary Org A) e User Y (primary Org B) processam a invoice da
    // mesma company: o routing tem de ser idêntico — sem input de actor,
    // o resultado não pode divergir.
    const links = [{ organization_id: ORG_A, status: "ACTIVE" as const }];
    const forX = resolveFiscalRoutingTargets(links);
    const forY = resolveFiscalRoutingTargets(links);
    expect(forX).toEqual(forY);
    expect(forX.targets).toEqual([]);
  });
});
