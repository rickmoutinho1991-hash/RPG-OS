import { describe, it, expect } from "vitest";
import {
  isValidPortugueseNif,
  isValidPortugueseIndividualNif,
  isValidPortugueseCompanyNipc,
  classifyPortugueseNif,
  formatPortugueseNif,
  isValidEuVatNumber,
  isValidNonEuTaxId,
  validateFiscalIdentifier,
  validatePortugueseIndividualNif,
  validatePortugueseCompanyNipc,
  extractEuVatCountryCode,
  formatEuVatNumber,
  type PortugueseNifType,
  type FiscalIdentifierType,
} from "../fiscalIdentifiers";

// Helper to generate valid NIFs for testing
function generateValidNif(prefix: number, base: number): string {
  const prefixStr = prefix.toString();
  const baseStr = base.toString().padStart(8 - prefixStr.length, "0");
  const digits = prefixStr + baseStr; // 8 digits total
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += Number(digits[i]) * (9 - i);
  }
  const remainder = sum % 11;
  const checkDigit = remainder < 2 ? 0 : 11 - remainder;
  return digits + checkDigit;
}

describe("Portuguese Fiscal Identifiers - Phase 10I-C", () => {
  describe("Portuguese NIF/NIPC Validation", () => {
    it("validates real Portuguese NIFs with correct checksum (Module 11)", () => {
      // Known valid NIFs
      expect(isValidPortugueseNif("212345672")).toBe(true);
      expect(isValidPortugueseIndividualNif("212345672")).toBe(true);

      // Invalid checksum
      expect(isValidPortugueseNif("123456788")).toBe(false);
    });

    it("validates Portuguese company NIPCs (prefix 5)", () => {
      // 501234560 is valid
      expect(isValidPortugueseCompanyNipc("501234560")).toBe(true);
      expect(isValidPortugueseCompanyNipc("501234569")).toBe(false);
    });

    it("validates Portuguese public entities (prefix 6)", () => {
      // Generate a valid one
      const valid = generateValidNif(6, 123456);
      expect(isValidPortugueseNif(valid)).toBe(true);
    });

    it("rejects NIFs with wrong length", () => {
      expect(isValidPortugueseNif("")).toBe(false);
      expect(isValidPortugueseNif("123")).toBe(false);
      expect(isValidPortugueseNif("1234567890")).toBe(false);
      expect(isValidPortugueseNif("abcdefghi")).toBe(false);
    });

    it("rejects NIFs starting with 0", () => {
      expect(isValidPortugueseNif("012345678")).toBe(false);
    });

    it("handles formatted NIFs with spaces", () => {
      expect(isValidPortugueseNif("212 345 672")).toBe(true);
      expect(isValidPortugueseNif("501 234 560")).toBe(true);
    });
  });

  describe("Portuguese NIF Classification", () => {
    it("classifies company NIFs (prefix 5)", () => {
      expect(classifyPortugueseNif("501234560")).toBe("COMPANY");
    });

    it("classifies public entities (prefix 6)", () => {
      const valid = generateValidNif(6, 123456);
      expect(classifyPortugueseNif(valid)).toBe("PUBLIC_ENTITY");
    });

    it("classifies heritage (prefix 70, 71, 72)", () => {
      expect(classifyPortugueseNif(generateValidNif(70, 12345))).toBe("HERITAGE");
      expect(classifyPortugueseNif(generateValidNif(71, 12345))).toBe("HERITAGE");
      expect(classifyPortugueseNif(generateValidNif(72, 12345))).toBe("HERITAGE");
    });

    it("classifies non-profit (prefix 90, 91, 98, 99)", () => {
      // 50-59 are ambiguous (mostly companies), so we only test unambiguous non-profit prefixes
      expect(classifyPortugueseNif(generateValidNif(90, 12345))).toBe("NON_PROFIT");
      expect(classifyPortugueseNif(generateValidNif(91, 12345))).toBe("NON_PROFIT");
      expect(classifyPortugueseNif(generateValidNif(98, 12345))).toBe("NON_PROFIT");
      expect(classifyPortugueseNif(generateValidNif(99, 12345))).toBe("NON_PROFIT");
    });

    it("classifies individuals (prefix 1, 2, 3)", () => {
      expect(classifyPortugueseNif(generateValidNif(1, 123456))).toBe("INDIVIDUAL");
      expect(classifyPortugueseNif(generateValidNif(2, 123456))).toBe("INDIVIDUAL");
      expect(classifyPortugueseNif(generateValidNif(3, 123456))).toBe("INDIVIDUAL");
    });

    it("classifies sole traders (prefix 4)", () => {
      expect(classifyPortugueseNif(generateValidNif(4, 123456))).toBe("SOLE_TRADER");
    });

    it("returns INVALID for invalid NIFs", () => {
      // 000000000 - invalid (starts with 0)
      expect(classifyPortugueseNif("000000000")).toBe("INVALID");
      // 123456780 - invalid checksum (should be 9)
      expect(classifyPortugueseNif("123456780")).toBe("INVALID");
    });

    it("returns OTHER for unclassified valid NIFs", () => {
      // 8 prefix that doesn't match non-profit patterns
      expect(classifyPortugueseNif(generateValidNif(8, 123456))).toBe("OTHER");
    });
  });

  describe("Portuguese NIF Formatting", () => {
    it("formats NIF as XXX XXX XXX", () => {
      expect(formatPortugueseNif("501234560")).toBe("501 234 560");
      expect(formatPortugueseNif("212 345 672")).toBe("212 345 672");
      expect(formatPortugueseNif("123")).toBe("123");
    });
  });

  describe("EU VAT Number Validation", () => {
    it("validates Portuguese VAT numbers", () => {
      expect(isValidEuVatNumber("PT501234560")).toBe(true);
      expect(isValidEuVatNumber("PT 501 234 560")).toBe(true);
    });

    it("validates Spanish VAT numbers", () => {
      expect(isValidEuVatNumber("ESB12345678")).toBe(true);
      expect(isValidEuVatNumber("ES12345678Z")).toBe(true);
    });

    it("validates French VAT numbers", () => {
      expect(isValidEuVatNumber("FR12345678901")).toBe(true);
      expect(isValidEuVatNumber("FRA1234567890")).toBe(true);
    });

    it("validates German VAT numbers", () => {
      expect(isValidEuVatNumber("DE123456789")).toBe(true);
    });

    it("validates Italian VAT numbers", () => {
      expect(isValidEuVatNumber("IT12345678901")).toBe(true);
    });

    it("validates Dutch VAT numbers", () => {
      expect(isValidEuVatNumber("NL123456789B01")).toBe(true);
    });

    it("validates Belgian VAT numbers", () => {
      expect(isValidEuVatNumber("BE1234567890")).toBe(true);
    });

    it("validates Austrian VAT numbers", () => {
      expect(isValidEuVatNumber("ATU12345678")).toBe(true);
    });

    it("validates Polish VAT numbers", () => {
      expect(isValidEuVatNumber("PL1234567890")).toBe(true);
    });

    it("validates Irish VAT numbers", () => {
      expect(isValidEuVatNumber("IE1234567AB")).toBe(true);
    });

    it("rejects invalid EU country codes", () => {
      expect(isValidEuVatNumber("XX123456789")).toBe(false);
      expect(isValidEuVatNumber("US123456789")).toBe(false);
    });

    it("rejects malformed VAT numbers", () => {
      expect(isValidEuVatNumber("PT")).toBe(false);
      expect(isValidEuVatNumber("PT123")).toBe(false);
      expect(isValidEuVatNumber("")).toBe(false);
    });
  });

  describe("Non-EU Tax ID Validation", () => {
    it("validates US EIN format", () => {
      expect(isValidNonEuTaxId("12-3456789", "US")).toBe(true);
      expect(isValidNonEuTaxId("123456789", "US")).toBe(true);
    });

    it("validates Brazilian CNPJ format (digits only)", () => {
      expect(isValidNonEuTaxId("12345678000190", "BR")).toBe(true);
    });

    it("validates UK UTR/VAT format", () => {
      expect(isValidNonEuTaxId("123456789", "UK")).toBe(true);
      expect(isValidNonEuTaxId("AB123456789", "UK")).toBe(true);
    });

    it("validates Canadian BN format", () => {
      expect(isValidNonEuTaxId("123456789", "CA")).toBe(true);
    });

    it("accepts generic alphanumeric tax IDs", () => {
      expect(isValidNonEuTaxId("ABC123456")).toBe(true);
      expect(isValidNonEuTaxId("TAXID123")).toBe(true);
    });

    it("rejects too short or too long IDs", () => {
      expect(isValidNonEuTaxId("AB")).toBe(false);
      expect(isValidNonEuTaxId("A".repeat(21))).toBe(false);
    });

    it("rejects IDs with special characters", () => {
      expect(isValidNonEuTaxId("ABC@123")).toBe(false);
      expect(isValidNonEuTaxId("ABC#123")).toBe(false);
    });
  });

  describe("validateFiscalIdentifier - Unified Validation", () => {
    it("validates Portuguese NIF and returns detailed result", () => {
      const result = validateFiscalIdentifier("212345672");

      expect(result.valid).toBe(true);
      expect(result.type).toBe("PT_NIF");
      expect(result.portugueseType).toBe("INDIVIDUAL");
      expect(result.number).toBe("212345672");
    });

    it("validates Portuguese NIPC and returns detailed result", () => {
      const result = validateFiscalIdentifier("501234560");

      expect(result.valid).toBe(true);
      expect(result.type).toBe("PT_NIF");
      expect(result.portugueseType).toBe("COMPANY");
      expect(result.number).toBe("501234560");
    });

    it("validates EU VAT numbers", () => {
      const result = validateFiscalIdentifier("PT501234560");

      expect(result.valid).toBe(true);
      expect(result.type).toBe("EU_VAT");
      expect(result.countryCode).toBe("PT");
      expect(result.number).toBe("501234560");
    });

    it("validates Spanish VAT numbers", () => {
      const result = validateFiscalIdentifier("ESB12345678");

      expect(result.valid).toBe(true);
      expect(result.type).toBe("EU_VAT");
      expect(result.countryCode).toBe("ES");
    });

    it("validates non-EU tax IDs with country code", () => {
      const result = validateFiscalIdentifier("US-12-3456789");

      expect(result.valid).toBe(true);
      expect(result.type).toBe("NON_EU_TAX_ID");
      expect(result.countryCode).toBe("US");
      expect(result.number).toBe("123456789");
    });

    it("rejects invalid Portuguese NIF checksum", () => {
      const result = validateFiscalIdentifier("123456788");

      expect(result.valid).toBe(false);
      expect(result.type).toBe("PT_NIF");
      expect(result.error).toContain("checksum");
    });

    it("rejects empty identifiers", () => {
      const result = validateFiscalIdentifier("");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Empty identifier");
    });

    it("rejects unrecognized formats", () => {
      const result = validateFiscalIdentifier("@@@@@");

      expect(result.valid).toBe(false);
      expect(result.type).toBe("UNKNOWN");
    });
  });

  describe("Context-Specific Validation", () => {
    it("validatePortugueseIndividualNif accepts individual NIFs", () => {
      const result = validatePortugueseIndividualNif("212345672");
      expect(result.valid).toBe(true);
      expect(result.portugueseType).toBe("INDIVIDUAL");
    });

    it("validatePortugueseIndividualNif accepts sole trader NIFs", () => {
      const validSoleTrader = generateValidNif(4, 123456);
      const result = validatePortugueseIndividualNif(validSoleTrader);
      expect(result.valid).toBe(true);
      expect(result.portugueseType).toBe("SOLE_TRADER");
    });

    it("validatePortugueseIndividualNif rejects company NIFs", () => {
      const result = validatePortugueseIndividualNif("501234560");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not valid for individual context");
    });

    it("validatePortugueseIndividualNif rejects public entity NIFs", () => {
      const validPublic = generateValidNif(6, 123456);
      const result = validatePortugueseIndividualNif(validPublic);
      expect(result.valid).toBe(false);
    });

    it("validatePortugueseCompanyNipc accepts company NIPCs", () => {
      const result = validatePortugueseCompanyNipc("501234560");
      expect(result.valid).toBe(true);
      expect(result.portugueseType).toBe("COMPANY");
    });

    it("validatePortugueseCompanyNipc accepts public entity NIFs", () => {
      const validPublic = generateValidNif(6, 123456);
      const result = validatePortugueseCompanyNipc(validPublic);
      expect(result.valid).toBe(true);
      expect(result.portugueseType).toBe("PUBLIC_ENTITY");
    });

    it("validatePortugueseCompanyNipc rejects individual NIFs", () => {
      const result = validatePortugueseCompanyNipc("212345672");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not valid for company context");
    });

    it("validatePortugueseCompanyNipc rejects EU VAT numbers", () => {
      const result = validatePortugueseCompanyNipc("PT501234560");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Not a Portuguese NIPC");
    });
  });

  describe("EU VAT Utilities", () => {
    it("extracts country code from EU VAT number", () => {
      expect(extractEuVatCountryCode("PT501234560")).toBe("PT");
      expect(extractEuVatCountryCode("DE123456789")).toBe("DE");
      expect(extractEuVatCountryCode("FRAB123456789")).toBe("FR");
      expect(extractEuVatCountryCode("123456789")).toBeNull();
    });

    it("formats EU VAT number with space", () => {
      expect(formatEuVatNumber("PT501234560")).toBe("PT 501234560");
      expect(formatEuVatNumber("DE123456789")).toBe("DE 123456789");
      expect(formatEuVatNumber("FRAB123456789")).toBe("FR AB123456789");
    });
  });

  describe("Distinction Between Identifier Types", () => {
    it("does not confuse NIF with NIPC", () => {
      // Both are 9-digit Portuguese numbers but different context
      const nifResult = validateFiscalIdentifier("212345672");
      const nipcResult = validateFiscalIdentifier("501234560");

      expect(nifResult.portugueseType).toBe("INDIVIDUAL");
      expect(nipcResult.portugueseType).toBe("COMPANY");
    });

    it("does not confuse NIF/NIPC with VAT number", () => {
      const nifResult = validateFiscalIdentifier("212345672");
      const vatResult = validateFiscalIdentifier("PT212345672");

      expect(nifResult.type).toBe("PT_NIF");
      expect(vatResult.type).toBe("EU_VAT");
      expect(nifResult.number).toBe("212345672");
      expect(vatResult.number).toBe("212345672");
      expect(vatResult.countryCode).toBe("PT");
    });

    it("does not confuse with CAE (activity code)", () => {
      // CAE codes are 5 digits, not 9
      const cae = "62010";
      const result = validateFiscalIdentifier(cae);
      // Should not be recognized as valid fiscal identifier
      expect(result.valid).toBe(false);
    });

    it("does not confuse with IBAN", () => {
      const iban = "PT50000201231234567890154";
      const result = validateFiscalIdentifier(iban);
      expect(result.valid).toBe(false);
    });
  });
});