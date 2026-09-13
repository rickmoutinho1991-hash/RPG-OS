import { describe, it, expect } from "vitest";
import {
  isValidPortugueseNif,
  isValidPortugueseIndividualNif,
  isValidPortugueseCompanyNipc,
  classifyPortugueseNif,
  formatPortugueseNif,
} from "../nif";

describe("Validação e Classificação de NIF / NIPC Português", () => {
  it("deve validar NIFs singulares reais e válidos (Módulo 11)", () => {
    // 212345672 é válido (21234567 -> soma 130 % 11 = 9 -> 11 - 9 = 2)
    expect(isValidPortugueseNif("212345672")).toBe(true);
    expect(isValidPortugueseIndividualNif("212345672")).toBe(true);

    // NIF inválido por dígito de controlo
    expect(isValidPortugueseNif("123456788")).toBe(false);
    expect(isValidPortugueseNif("212345679")).toBe(false);
  });

  it("deve validar NIPCs empresariais válidos (prefixo 5)", () => {
    // 501234560 é válido (50123456 -> soma 122 % 11 = 1 -> checkDigit 0)
    expect(isValidPortugueseCompanyNipc("501234560")).toBe(true);
    expect(isValidPortugueseCompanyNipc("501234569")).toBe(false);
  });

  it("deve rejeitar NIFs com comprimento diferente de 9 dígitos", () => {
    expect(isValidPortugueseNif("")).toBe(false);
    expect(isValidPortugueseNif("123")).toBe(false);
    expect(isValidPortugueseNif("1234567890")).toBe(false);
    expect(isValidPortugueseNif("abcdefghi")).toBe(false);
  });

  it("deve classificar corretamente os tipos de entidade pelo NIF", () => {
    expect(classifyPortugueseNif("501234560")).toBe("COMPANY");
    expect(classifyPortugueseNif("212345672")).toBe("INDIVIDUAL");
    expect(classifyPortugueseNif("000000000")).toBe("INVALID");
  });

  it("deve formatar o NIF no padrão português XXX XXX XXX", () => {
    expect(formatPortugueseNif("501234560")).toBe("501 234 560");
    expect(formatPortugueseNif("212 345 672")).toBe("212 345 672");
    expect(formatPortugueseNif("123")).toBe("123");
  });
});
