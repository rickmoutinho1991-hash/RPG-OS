import { describe, it, expect } from "vitest";
import {
  isValidPortuguesePostalCode,
  formatPortuguesePostalCode,
} from "../postalCode";

describe("Validação de Códigos Postais Portugueses", () => {
  it("deve aceitar códigos postais válidos no formato XXXX-XXX", () => {
    expect(isValidPortuguesePostalCode("1000-001")).toBe(true);
    expect(isValidPortuguesePostalCode("4000-123")).toBe(true);
    expect(isValidPortuguesePostalCode("2900-500")).toBe(true);
  });

  it("deve rejeitar códigos postais inválidos", () => {
    expect(isValidPortuguesePostalCode("")).toBe(false);
    expect(isValidPortuguesePostalCode("0999-001")).toBe(false); // Prefixo 0 não é válido em PT
    expect(isValidPortuguesePostalCode("1000001")).toBe(false);
    expect(isValidPortuguesePostalCode("100-001")).toBe(false);
  });

  it("deve formatar código postal numérico para XXXX-XXX", () => {
    expect(formatPortuguesePostalCode("1000001")).toBe("1000-001");
    expect(formatPortuguesePostalCode("4000-123")).toBe("4000-123");
  });
});
