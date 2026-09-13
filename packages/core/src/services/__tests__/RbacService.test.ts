import { describe, expect, it } from "vitest";
import { hasPermission } from "../../constants/permissions";
import { resolveEffectivePermissions } from "../RbacService";

describe("RBAC multi-tenant", () => {
  it("resolve modulo wildcard and global wildcard", () => {
    expect(hasPermission(["tarefas.*"], "tarefas.delete")).toBe(true);
    expect(hasPermission(["*"], "faturacao.export")).toBe(true);
    expect(hasPermission(["clientes.view"], "faturacao.view")).toBe(false);
  });
  it("honra suspensão e validade temporal", () => {
    expect(
      resolveEffectivePermissions({
        id: "1",
        organizationId: "o",
        userId: "u",
        roleKey: "OWNER",
        status: "SUSPENDED",
      }).permissions,
    ).toEqual([]);
    expect(
      resolveEffectivePermissions({
        id: "1",
        organizationId: "o",
        userId: "u",
        roleKey: "OWNER",
        status: "ACTIVE",
        validUntil: "2020-01-01",
      }).permissions,
    ).toEqual([]);
  });
});
