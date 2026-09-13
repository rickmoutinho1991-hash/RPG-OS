/**
 * RPG-OS — guardrails do motor de deduções pessoais (P1).
 * Estático: sem AT/Vault/rede, user_id só da sessão, linguagem honesta.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ACTIONS_SRC = readFileSync("apps/web/app/fiscal/expenseActions.ts", "utf8");
const UI_SRC = readFileSync("apps/web/app/fiscal/DeductionsClient.tsx", "utf8");

describe("P1 deduções — isolamento AT", () => {
  it("actions nunca importam AT/Vault/fetch", () => {
    for (const forbidden of [
      "@/lib/at/",
      "@/lib/secrets",
      "handshakeHarness",
      "testATConnection",
      "atSubmission",
      "RegisterInvoice",
      "fetch(",
      "axios",
    ]) {
      expect(ACTIONS_SRC).not.toContain(forbidden);
    }
  });
});

describe("P1 deduções — tenant user_id da sessão", () => {
  it("user_id vem de getCurrentUser, nunca de input", () => {
    expect(ACTIONS_SRC).toContain("getCurrentUser()");
    expect(ACTIONS_SRC).toContain("user_id: auth.user.id");
    expect(ACTIONS_SRC).not.toMatch(/input\.userId|body\.user_id|userId.*formData/i);
  });

  it("delete scoped por id + user", () => {
    expect(ACTIONS_SRC).toContain('.eq("user_id", auth.user.id)');
  });

  it("dinheiro em cents inteiros (sem float)", () => {
    expect(ACTIONS_SRC).toContain("Number.isInteger(input.amountCents)");
    expect(ACTIONS_SRC).not.toMatch(/amountCents:\s*Number\(amount\)/);
  });
});

describe("P1.2 contexto — sem NIF armazenado", () => {
  it("actions nunca leem/escrevem tax_number", () => {
    expect(ACTIONS_SRC).not.toMatch(/tax_number/);
  });

  it("flags estritas: não-booleanos rejeitados", () => {
    expect(ACTIONS_SRC).toContain("INVALID_CONTEXT");
    expect(ACTIONS_SRC).toContain("parseContextFlag");
  });

  it("update recalcula server-side (nunca aceita resultados do browser)", () => {
    expect(ACTIONS_SRC).toContain("updateDeductionContext");
    expect(ACTIONS_SRC).toContain("evaluatePersonalExpense");
    expect(ACTIONS_SRC).not.toMatch(/input\.(fiscalStatus|deductibleCents|reasonCode|ruleVersion)/);
  });

  it("UI sem alegações AT no contexto", () => {
    for (const forbidden of ["AT confirmou", "Fatura validada pela AT", "Valor oficial", "e-Fatura sincronizada"]) {
      expect(UI_SRC).not.toContain(forbidden);
    }
    expect(UI_SRC).toContain("não confirmado pela AT");
  });
});

describe("P1 deduções — linguagem honesta na UI", () => {
  it("sem claims oficiais", () => {
    for (const forbidden of [
      "Confirmado pela AT",
      "Dedução garantida",
      "e-Fatura sincronizado",
      "dedução aprovada",
      "validado pela AT",
      "IRS final",
    ]) {
      expect(UI_SRC).not.toContain(forbidden);
    }
    expect(UI_SRC).toContain("Não confirmadas pela AT");
  });
});
