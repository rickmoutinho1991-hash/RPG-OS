/**
 * RPG-OS — server-authority da company nas ações AT (NO_COMPANY audit).
 * Estático: as ações de escrita AT nunca aceitam company_id/NIF do browser;
 * NO_COMPANY fail-closed existe. Sem segredos, sem rede.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const AT_ACTIONS = readFileSync(
  "apps/web/app/administracao/at/actions.ts",
  "utf8",
);
const CRED_ACTIONS = readFileSync(
  "apps/web/app/administracao/at/credentialActions.ts",
  "utf8",
);

describe("NO_COMPANY audit — autoridade server-side", () => {
  it("createAtConnection só aceita environment (sem company/nif)", () => {
    const m = AT_ACTIONS.match(/export async function createAtConnection\(([^)]*)\)/);
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/company|nif/i);
  });

  it("provision action só aceita connectionId + material (sem company/nif)", () => {
    const m = CRED_ACTIONS.match(
      /export async function provisionAtConnectionCredentials\(([^)]*)\)/,
    );
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/companyId|company_id|[^a-zA-Z]nif/i);
  });

  it("fail-closed NO_COMPANY existe e company vem do perfil server-side", () => {
    expect(AT_ACTIONS).toContain("NO_COMPANY");
    expect(AT_ACTIONS).toContain("auth.user.companyId");
  });

  it("NIF oficial vem de companies.tax_number, nunca do browser", () => {
    expect(AT_ACTIONS).toContain("company.tax_number");
    expect(AT_ACTIONS).not.toMatch(/form\([^)]*nif|body[^;]*nif|input[^;]*nif/i);
  });
});
