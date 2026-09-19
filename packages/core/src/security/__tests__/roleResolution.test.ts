import { describe, it, expect } from "vitest";
import {
  DEFAULT_SYSTEM_ROLE,
  isKnownSystemRole,
  resolveSystemPermissions,
  resolveSystemRole,
} from "../roleResolution";
import { SYSTEM_ROLES } from "../../constants/roles";

describe("roleResolution — default seguro (M-G)", () => {
  it("nunca resolve ADMIN por omissão (a)", () => {
    expect(resolveSystemRole(undefined)).toBe(DEFAULT_SYSTEM_ROLE);
    expect(resolveSystemRole(null)).toBe(DEFAULT_SYSTEM_ROLE);
    expect(resolveSystemRole("")).toBe(DEFAULT_SYSTEM_ROLE);
    expect(DEFAULT_SYSTEM_ROLE).not.toBe("ADMIN");
  });

  it("valores conhecidos resolvem-se como estão (b)", () => {
    expect(resolveSystemRole("ADMIN")).toBe("ADMIN");
    expect(resolveSystemRole("COMPANY_ADMIN")).toBe("COMPANY_ADMIN");
    expect(resolveSystemRole("WORKER")).toBe("WORKER");
  });

  it("permissões nunca contém '*' para entradas inválidas (c)", () => {
    expect(resolveSystemPermissions(undefined)).toEqual([]);
    expect(resolveSystemPermissions("HACKER_ROLE")).toEqual([]);
    expect(resolveSystemPermissions("WORKER")).toEqual(
      SYSTEM_ROLES.WORKER.permissions,
    );
  });

  it("guard de validação distingue roles conhecidos de inventados (d)", () => {
    expect(isKnownSystemRole("ADMIN")).toBe(true);
    expect(isKnownSystemRole("NOROLE")).toBe(false);
    expect(isKnownSystemRole(null)).toBe(false);
  });

  it("o default CLIENT não tem privilégios de sistema (e)", () => {
    expect(SYSTEM_ROLES.CLIENT.permissions).not.toContain("*");
    expect(SYSTEM_ROLES.ADMIN.permissions).toContain("*");
  });
});