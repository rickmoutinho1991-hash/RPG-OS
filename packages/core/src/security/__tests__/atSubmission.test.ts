/**
 * RPG-OS — AT submission foundation tests (lógica pura, sem rede/AT).
 *
 * Elegibilidade, idempotência determinística, máquina de estados, mapeador
 * honesto (UNVERIFIED), validação de pedido WSDL e tenant/security.
 */
import { describe, it, expect } from "vitest";
import {
  canSubmitInvoiceToAT,
  buildSubmissionIdempotencyKey,
  resolveSubmissionState,
  mapATSubmissionResponse,
  validateSubmissionRequest,
  requiresReconciliation,
  type AtSubmissionRequestInput,
} from "../atSubmission";

function validRequest(overrides: Partial<AtSubmissionRequestInput> = {}): AtSubmissionRequestInput {
  return {
    invoiceNo: "FT 2026/001",
    atcud: "ATCUD-1",
    invoiceDate: "2026-09-06",
    invoiceType: "FT",
    emitterNif: "501234567",
    customerNif: "123456789",
    customerCountry: "PT",
    lines: [
      { taxPointDate: "2026-09-06", debitCredit: "D", netAmount: 100, taxCode: "NOR", taxPercentage: 23 },
    ],
    netTotal: 100,
    taxPayable: 23,
    grossTotal: 123,
    ...overrides,
  };
}

describe("eligibility", () => {
  it("só ISSUED é elegível; resto fail closed", () => {
    expect(canSubmitInvoiceToAT("ISSUED")).toEqual({ eligible: true });
    for (const s of ["DRAFT", "CANCELLED", "PAID", "PARTIALLY_PAID", "WEIRD"]) {
      const r = canSubmitInvoiceToAT(s);
      expect(r.eligible).toBe(false);
    }
  });
});

describe("idempotency key", () => {
  it("determinística, estável, com env; sem random/Date", () => {
    const a = buildSubmissionIdempotencyKey("inv-1", "TEST");
    const b = buildSubmissionIdempotencyKey("inv-1", "TEST");
    expect(a).toBe(b);
    expect(a).toBe("at-sub|TEST|inv-1|RegisterInvoice");
    expect(buildSubmissionIdempotencyKey("inv-1", "PRODUCTION")).not.toBe(a);
    expect(buildSubmissionIdempotencyKey("inv-2", "TEST")).not.toBe(a);
  });
});

describe("state machine", () => {
  it("NOT_SUBMITTED→PENDING→CONFIRMED/REJECTED/UNKNOWN; inválidas→null", () => {
    expect(resolveSubmissionState("NOT_SUBMITTED", "PREPARE_OK")).toBe("PENDING");
    expect(resolveSubmissionState("PENDING", "SEND_OK_CONFIRMED")).toBe("CONFIRMED");
    expect(resolveSubmissionState("PENDING", "SEND_OK_REJECTED")).toBe("REJECTED");
    expect(resolveSubmissionState("PENDING", "SEND_UNKNOWN")).toBe("UNKNOWN");
    expect(resolveSubmissionState("NOT_SUBMITTED", "SEND_OK_CONFIRMED")).toBeNull();
    expect(resolveSubmissionState("CONFIRMED", "SEND_OK_CONFIRMED")).toBeNull();
  });
});

describe("response mapping (honesto: UNVERIFIED)", () => {
  it("extrai campos sem promover a CONFIRMED sem tabela oficial", () => {
    const m = mapATSubmissionResponse({ codigoResposta: 0, mensagem: "OK", dataOperacao: "2026-09-06" });
    expect(m.outcome).toBe("UNVERIFIED");
    expect(m.codigoResposta).toBe(0);
    expect(m.mensagem).toBe("OK");
  });
});

describe("request validation (WSDL)", () => {
  it("pedido válido passa; falhas listadas por campo", () => {
    expect(validateSubmissionRequest(validRequest())).toEqual([]);
    expect(validateSubmissionRequest(validRequest({ invoiceNo: "bad" }))).toContain("invoiceNo");
    expect(validateSubmissionRequest(validRequest({ emitterNif: "123" }))).toContain("emitterNif");
    expect(validateSubmissionRequest(validRequest({ lines: [] }))).toContain("lines");
    expect(
      validateSubmissionRequest(validRequest({ grossTotal: 999 })),
    ).toContain("totals");
    expect(
      validateSubmissionRequest(validRequest({ invoiceType: "XX" as "FT" })),
    ).toContain("invoiceType");
  });
});

describe("tenant/security por construção", () => {
  it("funções puras não recebem browser/company arbitrária (assinaturas)", () => {
    expect(canSubmitInvoiceToAT.length).toBe(1);
    expect(buildSubmissionIdempotencyKey.length).toBe(2);
    const src = `${canSubmitInvoiceToAT.toString()}${buildSubmissionIdempotencyKey.toString()}`;
    expect(src).not.toMatch(/fetch|axios|Math\.random|Date\.now/);
  });
});

describe("reconciliation foundation (D6)", () => {
  it("só UNKNOWN requer reconciliação; restantes não", () => {
    expect(requiresReconciliation("UNKNOWN")).toBe(true);
    expect(requiresReconciliation("PENDING")).toBe(false);
    expect(requiresReconciliation("SUBMITTED")).toBe(false);
    expect(requiresReconciliation("CONFIRMED")).toBe(false);
    expect(requiresReconciliation("REJECTED")).toBe(false);
    expect(requiresReconciliation("NOT_SUBMITTED")).toBe(false);
  });
});
