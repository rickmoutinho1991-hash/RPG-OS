import { describe, it, expect } from "vitest";
import { SYSTEM_ROLES, SystemRole } from "../roles";

describe("Controlo de Acessos Baseado em Funções (RBAC)", () => {
  it("deve definir permissão universal wildcard (*) para ADMIN", () => {
    expect(SYSTEM_ROLES.ADMIN.permissions).toContain("*");
  });

  it("deve atribuir permissão de exportação SAF-T ao contabilista e administradores", () => {
    expect(SYSTEM_ROLES.ACCOUNTANT.permissions).toContain("saft:export");
    expect(SYSTEM_ROLES.ACCOUNTANT.permissions).toContain("invoices:manage");
  });

  it("deve restringir permissões do perfil CLIENT apenas ao portal e leitura", () => {
    const clientPerms = SYSTEM_ROLES.CLIENT.permissions;
    expect(clientPerms).toContain("client_portal:read");
    expect(clientPerms).toContain("invoices:read");
    expect(clientPerms).not.toContain("invoices:manage");
    expect(clientPerms).not.toContain("*");
  });

  it("deve conter todas as roles do sistema esperadas", () => {
    const expectedRoles: SystemRole[] = [
      "ADMIN",
      "COMPANY_ADMIN",
      "PROJECT_MANAGER",
      "ENGINEER",
      "FOREMAN",
      "WORKER",
      "CLIENT",
      "ACCOUNTANT",
    ];

    expectedRoles.forEach((role) => {
      expect(SYSTEM_ROLES[role]).toBeDefined();
      expect(SYSTEM_ROLES[role].label).toBeTruthy();
    });
  });
});
