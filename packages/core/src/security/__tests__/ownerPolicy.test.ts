import { describe, expect, it } from "vitest";
import {
  OWNER_POLICY_COMMANDS,
  OWNER_POLICY_COLUMN,
  ownerPolicyName,
  supportsOwnerPolicy,
  ownerColumnFor,
  ownerPolicyPlan,
  ownerPolicyCoverage,
  ownerHardeningMigrationName,
} from "../ownerPolicy";

describe("ownerPolicy (helper owner-only determinístico, M-G/H)", () => {
  it("a) expõe as quatro acções owner estáveis", () => {
    expect(OWNER_POLICY_COMMANDS).toEqual([
      "select",
      "insert",
      "update",
      "delete",
    ]);
  });

  it("b) detecta ownership directa por 'user_id'", () => {
    expect(supportsOwnerPolicy(["user_id"])).toBe(true);
    expect(supportsOwnerPolicy([])).toBe(false);
    expect(supportsOwnerPolicy(["org_id"])).toBe(false);
  });

  it("c) devolve a coluna de ownership se viável", () => {
    expect(ownerColumnFor(["user_id"])).toBe("user_id");
    expect(ownerColumnFor(["org_id"])).toBeNull();
    expect(ownerColumnFor([])).toBeNull();
  });

  it("d) devolve a constante de coluna owner", () => {
    expect(OWNER_POLICY_COLUMN).toBe("user_id");
  });

  it("e) nomeia políticas e planos sem depender do Postgres", () => {
    expect(ownerPolicyName("notifications", "select")).toBe(
      "notifications_owner_select",
    );
    const plan = ownerPolicyPlan("notifications", ["user_id"]);
    expect(plan).toHaveLength(OWNER_POLICY_COMMANDS.length);
    for (const entry of plan) {
      expect(entry.policy).toContain(`notifications_owner_${entry.command}`);
      expect(entry.policy).toContain("user_id = auth.uid()");
    }
    expect(ownerPolicyPlan("notifications", [])).toEqual([]);
    expect(ownerPolicyPlan("notifications", ["org_id"])).toEqual([]);
  });

  it("f) cobre todas as acções owner", () => {
    expect(ownerPolicyCoverage()).toEqual(OWNER_POLICY_COMMANDS);
  });

  it("g) nome determinístico e sem colisão de versão", () => {
    const name = ownerHardeningMigrationName("20260927000000", [
      "notifications",
    ]);
    expect(name).toBe("20260927000000_rls_owner_notifications.sql");
    expect(ownerHardeningMigrationName("20260925000000", ["notifications"])).not.toBe(
      // a migração de mutação M-G usa 20260925000000 para outra coisa —
      // garante que o stamp do ficheiro é único na pasta
      "20260927000000_rls_owner_notifications.sql",
    );
  });
});
