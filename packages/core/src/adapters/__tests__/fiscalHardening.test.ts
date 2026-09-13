/**
 * RPG-OS — Fiscal security hardening tests (negative tests)
 *
 * Provam comportamento real: nenhuma capability externa inexistente é
 * apresentada como operação oficial concluída. Sem mocks de produção,
 * sem dados fake — apenas os adapters reais em estado não-integrado.
 */
import { describe, it, expect } from "vitest";
import { EFaturaAdapter, SibsPaymentGatewayAdapter } from "../EFaturaAdapter";
import { AtTaxAuthorityAdapter } from "../AtTaxAuthorityAdapter";

describe("EFaturaAdapter — sem integração real", () => {
  it("nunca devolve REGISTERED nem registrationNumber", async () => {
    const adapter = new EFaturaAdapter();
    const res = await adapter.communicateInvoice({
      invoiceId: "inv-1",
      invoiceNumber: "FT 1",
      atcud: "ATCUD-1",
      hash: "h",
      netTotal: 100,
      vatTotal: 23,
      grossTotal: 123,
    });
    expect(res.success).toBe(false);
    expect(res.status).not.toBe("REGISTERED");
    expect(res.registrationNumber).toBeUndefined();
    expect(res.errorMessage ?? "").toMatch(/ainda não disponível/i);
  });
});

describe("AtTaxAuthorityAdapter — só formato local", () => {
  it("NIF válido nunca produz 'Entidade Fiscal Verificada' (sem consulta AT)", async () => {
    const adapter = new AtTaxAuthorityAdapter();
    const res = await adapter.validateNif({ taxNumber: "501234567" });
    expect(res.name).toBeUndefined();
    expect(res.name).not.toBe("Entidade Fiscal Verificada");
  });

  it("NIF inválido devolve valid=false", async () => {
    const adapter = new AtTaxAuthorityAdapter();
    const res = await adapter.validateNif({ taxNumber: "000" });
    expect(res.valid).toBe(false);
  });

  it("proveniência é sempre LOCAL_FORMAT_CHECK, nunca AT", async () => {
    const adapter = new AtTaxAuthorityAdapter();
    for (const taxNumber of ["501234567", "000"]) {
      const res = await adapter.validateNif({ taxNumber });
      expect(res.verificationSource).toBe("LOCAL_FORMAT_CHECK");
    }
  });
});

describe("SibsPaymentGatewayAdapter — sem gateway real", () => {
  it("MB WAY nunca produz PAYMENT_INITIATED nem transação mbw_", async () => {
    const gateway = new SibsPaymentGatewayAdapter({ entityCode: "21550" });
    const res = await gateway.requestMbWayPayment({
      paymentId: "PAY-1",
      phoneNumber: "912345678",
      amount: 49,
      description: "teste",
    });
    expect(res.success).toBe(false);
    expect(res.transactionId).toBe("");
    expect(res.transactionId).not.toMatch(/^mbw_/);
    expect(res.message).toMatch(/indisponível|não.*executado/i);
  });

  it("referência Multibanco não é gerada: lança erro explícito", async () => {
    const gateway = new SibsPaymentGatewayAdapter({ entityCode: "21550" });
    await expect(gateway.generateMultibancoReference(49, "FT-1")).rejects.toThrow(
      /indisponíveis|integração/i,
    );
  });
});

describe("Fake providers — bloqueados em produção", () => {
  it("registerDefaultProviders não regista fakes com NODE_ENV=production", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const mod = await import("../../services/government/atProvider");
      const before = mod.governmentProviderRegistry
        .getAll()
        .filter((p) => p.metadata.providerType === "FAKE").length;
      mod.registerDefaultProviders();
      const after = mod.governmentProviderRegistry
        .getAll()
        .filter((p) => p.metadata.providerType === "FAKE").length;
      expect(after).toBe(before);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it("registerFakeProviderForTesting lança em produção", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const mod = await import("../../services/government/atProvider");
      expect(() => mod.registerFakeProviderForTesting()).toThrow();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
