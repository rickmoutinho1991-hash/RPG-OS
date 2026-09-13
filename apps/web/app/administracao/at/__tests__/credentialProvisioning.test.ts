/**
 * RPG-OS — guardrails estáticos do provisioning AT TEST (D21.5).
 * Garantem: sem rede AT, sem submissão, sem logging de valores,
 * audit metadata-only, limpeza de campos na UI. Sem segredos reais.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ACTION_SRC = readFileSync(
  "apps/web/app/administracao/at/credentialActions.ts",
  "utf8",
);
const UI_SRC = readFileSync(
  "apps/web/app/administracao/at/AtClient.tsx",
  "utf8",
);

describe("D21.5 provisioning — sem rede nem submissão", () => {
  it("action nunca importa transport/connectivity/submission", () => {
    for (const forbidden of [
      "./connectivity",
      "handshakeHarness",
      "atSubmission",
      "RegisterInvoice",
      "ChangeInvoice",
      "DeleteInvoice",
      "testATConnection",
      "fetch(",
    ]) {
      expect(ACTION_SRC).not.toContain(forbidden);
    }
  });

  it("TEST-only estrutural: ambiente nunca vem do browser", () => {
    expect(ACTION_SRC).toContain('environment: "TEST"');
    expect(ACTION_SRC).not.toContain("material.environment");
  });
});

describe("D21.5 provisioning — secret safety estática", () => {
  it("action sem logging/impressão de valores", () => {
    for (const forbidden of ["console.log", "console.info", "console.debug", "process.stdout"]) {
      expect(ACTION_SRC).not.toContain(forbidden);
    }
  });

  it("audit só com metadata (connectionId, environment, credentialTypes)", () => {
    expect(ACTION_SRC).toContain("at.credentials.provisioned");
    expect(ACTION_SRC).toContain("credentialTypes");
    // Nenhum valor de material entra no audit: só tipos e ids.
    expect(ACTION_SRC).not.toMatch(/metadata:\s*\{[^}]*material/);
  });

  it("falha de attach faz cleanup; refs antigas nunca apagadas", () => {
    expect(ACTION_SRC).toContain("cleanupCreated");
    expect(ACTION_SRC).toContain("deleteRef");
    // Nenhum delete de ref pré-existente: só ids recém-criados.
    expect(ACTION_SRC).not.toMatch(/deleteRef\(\s*conn/);
  });

  it("backend não-Vault falha closed", () => {
    expect(ACTION_SRC).toContain("instanceof VaultSecretBackend");
  });
});

describe("D21.5 provisioning — UI hygiene", () => {
  it("campos limpos após submit (sucesso e erro)", () => {
    const handle = UI_SRC.slice(UI_SRC.indexOf("async function handleProvision"));
    expect(handle).toContain("clearProvFields(id)");
    expect((handle.match(/clearProvFields\(id\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("sem botão de submissão; só Vault", () => {
    expect(UI_SRC).toContain("Guardar credenciais no Vault");
    for (const forbidden of ["Submeter", "Submeter à AT", "RegistarInvoice"]) {
      expect(UI_SRC).not.toContain(forbidden);
    }
  });

  it("painel de provisioning só para TEST (gate no botão Credenciais)", () => {
    expect(UI_SRC).toContain('c.environment === "TEST"');
    const panel = UI_SRC.slice(UI_SRC.indexOf("Credenciais AT TEST (guardadas no Vault)"));
    expect(panel).not.toContain("PRODUCTION");
  });
});
