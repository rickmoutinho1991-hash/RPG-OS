/**
 * RPG-OS Portuguese Fiscal Identifiers (FASE 10I-C)
 *
 * Expands the existing NIF/NIPC domain with:
 * - Individual NIF
 * - Company NIF/NIPC
 * - Portuguese public entities
 * - Foreign VAT IDs as separate category
 * - Checksum validation
 */

import {
  PortugueseNifType as BasePortugueseNifType,
  isValidPortugueseNif as baseIsValidPortugueseNif,
  isValidPortugueseIndividualNif as baseIsValidPortugueseIndividualNif,
  isValidPortugueseCompanyNipc as baseIsValidPortugueseCompanyNipc,
  classifyPortugueseNif as baseClassifyPortugueseNif,
  formatPortugueseNif as baseFormatPortugueseNif,
} from "../validation/nif";

export type PortugueseNifType = BasePortugueseNifType;
export { baseIsValidPortugueseNif as isValidPortugueseNif };
export { baseIsValidPortugueseIndividualNif as isValidPortugueseIndividualNif };
export { baseIsValidPortugueseCompanyNipc as isValidPortugueseCompanyNipc };
export { baseClassifyPortugueseNif as classifyPortugueseNif };
export { baseFormatPortugueseNif as formatPortugueseNif };

/** Types of fiscal identifiers supported */
export type FiscalIdentifierType =
  | "PT_NIF" // Portuguese NIF (9 digits)
  | "PT_NIPC" // Portuguese NIPC (same format as NIF, but for companies)
  | "EU_VAT" // EU VAT number (country code + number)
  | "NON_EU_TAX_ID" // Non-EU tax identifier
  | "UNKNOWN";

/** Result of fiscal identifier validation */
export interface FiscalIdentifierValidation {
  valid: boolean;
  type: FiscalIdentifierType;
  portugueseType?: PortugueseNifType;
  countryCode?: string;
  number?: string;
  error?: string;
}

/**
 * Validates an EU VAT number format (country code + number)
 * Basic format validation - does not verify VIES
 */
export function isValidEuVatNumber(value: string): boolean {
  if (!value) return false;
  const clean = value.replace(/\s/g, "").toUpperCase();

  // Must start with 2-letter country code
  const countryCodeMatch = clean.match(/^([A-Z]{2})(.+)$/);
  if (!countryCodeMatch) return false;

  const countryCode = countryCodeMatch[1];
  const number = countryCodeMatch[2];

  // Valid EU country codes
  const euCountries = [
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
    "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
    "PL", "PT", "RO", "SK", "SI", "ES", "SE", "XI", // XI for Northern Ireland
  ];

  if (!euCountries.includes(countryCode)) return false;

  // Country-specific format validation (simplified)
  const patterns: Record<string, RegExp> = {
    PT: /^\d{9}$/, // Portugal: 9 digits
    ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/, // Spain
    FR: /^\d{11}$|^[A-Z]\d{10}$|^\d{10}[A-Z]$/, // France
    DE: /^\d{9}$/, // Germany
    IT: /^\d{11}$/, // Italy
    NL: /^\d{9}B\d{2}$/, // Netherlands
    BE: /^\d{10}$/, // Belgium
    AT: /^U\d{8}$/, // Austria
    PL: /^\d{10}$/, // Poland
    IE: /^\d{7}[A-Z]{1,2}$/, // Ireland
  };

  const pattern = patterns[countryCode];
  if (pattern) {
    return pattern.test(number);
  }

  // Generic: alphanumeric, 2-12 chars after country code
  return /^[A-Z0-9]{2,12}$/.test(number);
}

/**
 * Validates a generic non-EU tax identifier
 * Basic format check - country-specific rules would need to be added
 */
export function isValidNonEuTaxId(value: string, countryCode?: string): boolean {
  if (!value) return false;
  // Keep original for country-specific pattern matching
  const original = value.trim();
  const clean = original.replace(/[\s\-\.\/]/g, "").toUpperCase();

  // Basic validation: alphanumeric, reasonable length
  if (clean.length < 3 || clean.length > 20) return false;
  if (!/^[A-Z0-9]+$/.test(clean)) return false;

  // Country-specific patterns
  if (countryCode) {
    const patterns: Record<string, RegExp> = {
      US: /^\d{2}-?\d{7}$/, // US EIN format (with or without dash)
      BR: /^\d{14}$/, // Brazil CNPJ (digits only)
      UK: /^\d{9}$|^[A-Z]{2}\d{9}$/, // UK UTR or VAT
      CA: /^\d{9}$/, // Canada BN
    };

    const pattern = patterns[countryCode];
    if (pattern) return pattern.test(clean);
  }

  return true;
}

/**
 * Validates any fiscal identifier and returns detailed result
 */
export function validateFiscalIdentifier(value: string): FiscalIdentifierValidation {
  if (!value || !value.trim()) {
    return { valid: false, type: "UNKNOWN", error: "Empty identifier" };
  }

  const clean = value.trim();

  // Check Portuguese NIF/NIPC first (9 digits)
  if (/^\d{9}$/.test(clean.replace(/\s/g, ""))) {
    const isValid = baseIsValidPortugueseNif(clean);
    if (isValid) {
      return {
        valid: true,
        type: "PT_NIF",
        portugueseType: baseClassifyPortugueseNif(clean),
        number: clean.replace(/\s/g, ""),
      };
    }
    return { valid: false, type: "PT_NIF", error: "Invalid Portuguese NIF checksum" };
  }

  // Check EU VAT number (country code + number)
  if (/^[A-Z]{2}[A-Z0-9]+$/i.test(clean)) {
    if (isValidEuVatNumber(clean)) {
      const countryCode = clean.slice(0, 2);
      const number = clean.slice(2);
      return {
        valid: true,
        type: "EU_VAT",
        countryCode,
        number,
      };
    }
  }

  // Check non-EU tax ID with country prefix (e.g., "US-12-3456789")
  const countryMatch = clean.match(/^([A-Z]{2})[-]?(.+)$/i);
  if (countryMatch) {
    const countryCode = countryMatch[1].toUpperCase();
    const numberPart = countryMatch[2];
    if (isValidNonEuTaxId(numberPart, countryCode)) {
      return {
        valid: true,
        type: "NON_EU_TAX_ID",
        countryCode,
        number: numberPart.replace(/[\s\-\.\/]/g, "").toUpperCase(),
      };
    }
  }

  // Check generic non-EU tax ID (alphanumeric, no country prefix)
  // Minimum 6 chars to avoid confusing with CAE codes (5 digits) and other short codes
  if (/^[A-Z0-9]{6,20}$/i.test(clean.replace(/[\s\-\.\/]/g, ""))) {
    const cleaned = clean.replace(/[\s\-\.\/]/g, "").toUpperCase();
    if (isValidNonEuTaxId(cleaned)) {
      return {
        valid: true,
        type: "NON_EU_TAX_ID",
        number: cleaned,
      };
    }
  }

  return { valid: false, type: "UNKNOWN", error: "Unrecognized fiscal identifier format" };
}

/**
 * Validates that a value is specifically a Portuguese NIF (not NIPC)
 * For use when individual NIF is required (e.g., fatura simplificada)
 */
export function validatePortugueseIndividualNif(value: string): FiscalIdentifierValidation {
  const result = validateFiscalIdentifier(value);
  if (!result.valid) return result;
  if (result.type !== "PT_NIF") {
    return { valid: false, type: "PT_NIF", error: "Not a Portuguese NIF" };
  }
  if (result.portugueseType !== "INDIVIDUAL" && result.portugueseType !== "SOLE_TRADER") {
    return {
      valid: false,
      type: "PT_NIF",
      portugueseType: result.portugueseType,
      error: `NIF type ${result.portugueseType} not valid for individual context`,
    };
  }
  return result;
}

/**
 * Validates that a value is specifically a Portuguese NIPC (company)
 */
export function validatePortugueseCompanyNipc(value: string): FiscalIdentifierValidation {
  const result = validateFiscalIdentifier(value);
  if (!result.valid) return result;
  if (result.type !== "PT_NIF") {
    return { valid: false, type: "PT_NIF", error: "Not a Portuguese NIPC" };
  }
  if (result.portugueseType !== "COMPANY" && result.portugueseType !== "PUBLIC_ENTITY") {
    return {
      valid: false,
      type: "PT_NIF",
      portugueseType: result.portugueseType,
      error: `NIF type ${result.portugueseType} not valid for company context`,
    };
  }
  return result;
}

/**
 * Extracts the country code from an EU VAT number
 */
export function extractEuVatCountryCode(vatNumber: string): string | null {
  const clean = vatNumber.replace(/\s/g, "").toUpperCase();
  const match = clean.match(/^([A-Z]{2})/);
  return match ? match[1] : null;
}

/**
 * Formats an EU VAT number with space after country code
 */
export function formatEuVatNumber(vatNumber: string): string {
  const clean = vatNumber.replace(/\s/g, "").toUpperCase();
  const match = clean.match(/^([A-Z]{2})(.+)$/);
  if (match) {
    return `${match[1]} ${match[2]}`;
  }
  return vatNumber;
}