import { describe, it, expect } from "vitest";
import { hasPermission } from "../../constants/permissions";

describe("Platform Fee RBAC Security", () => {
  it("utilizadores sem permissão platform_fees.manage não podem gerir taxa", () => {
    const permissions = ["admin.view", "administracao.view"];
    expect(hasPermission(permissions, "platform_fees.manage")).toBe(false);
  });

  it("utilizadores com permissão platform_fees.manage podem gerir taxa", () => {
    const permissions = ["platform_fees.manage"];
    expect(hasPermission(permissions, "platform_fees.manage")).toBe(true);
  });

  it("wildcard * concede acesso total", () => {
    const permissions = ["*"];
    expect(hasPermission(permissions, "platform_fees.manage")).toBe(true);
  });

  it("platform_fees.* concede acesso a todas as ações do módulo", () => {
    const permissions = ["platform_fees.*"];
    expect(hasPermission(permissions, "platform_fees.manage")).toBe(true);
    expect(hasPermission(permissions, "platform_fees.view")).toBe(true);
    expect(hasPermission(permissions, "platform_fees.edit")).toBe(true);
  });

  it("platform_fees.manage implica view e edit", () => {
    const permissions = ["platform_fees.manage"];
    expect(hasPermission(permissions, "platform_fees.view")).toBe(true);
    expect(hasPermission(permissions, "platform_fees.edit")).toBe(true);
  });

  it("platform_fees.admin implica todas as ações do módulo", () => {
    const permissions = ["platform_fees.admin"];
    expect(hasPermission(permissions, "platform_fees.manage")).toBe(true);
    expect(hasPermission(permissions, "platform_fees.view")).toBe(true);
    expect(hasPermission(permissions, "platform_fees.edit")).toBe(true);
    expect(hasPermission(permissions, "platform_fees.delete")).toBe(true);
  });

  it("outras permissões não concedem acesso a platform_fees", () => {
    const permissions = ["admin.view", "faturacao.manage", "workflows.approve"];
    expect(hasPermission(permissions, "platform_fees.manage")).toBe(false);
    expect(hasPermission(permissions, "platform_fees.view")).toBe(false);
  });

  it("isola multi-tenant: permissões de uma org não aplicam a outra", () => {
    const orgAPermissions = ["platform_fees.manage"];
    const orgBPermissions = ["faturacao.view"];
    
    expect(hasPermission(orgAPermissions, "platform_fees.manage")).toBe(true);
    expect(hasPermission(orgBPermissions, "platform_fees.manage")).toBe(false);
  });
});

describe("Platform Fee Security Edge Cases", () => {
  it("array vazio de permissões não concede acesso", () => {
    expect(hasPermission([], "platform_fees.manage")).toBe(false);
  });

  it("undefined de permissões não concede acesso", () => {
    expect(hasPermission(undefined, "platform_fees.manage")).toBe(false);
  });

  it("null de permissões não concede acesso", () => {
    expect(hasPermission(null as unknown as string[], "platform_fees.manage")).toBe(false);
  });

  it("permissão malformada não concede acesso", () => {
    const permissions = ["", "invalid", "platform_fees", "platform_fees."];
    expect(hasPermission(permissions, "platform_fees.manage")).toBe(false);
  });

  it("case sensitivity em permissões", () => {
    const permissions = ["PLATFORM_FEES.MANAGE"];
    expect(hasPermission(permissions, "platform_fees.manage")).toBe(false);
    expect(hasPermission(permissions, "PLATFORM_FEES.MANAGE")).toBe(true);
  });
});