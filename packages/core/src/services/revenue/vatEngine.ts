/**
 * RPG-OS Portuguese VAT/IVA Engine (FASE 10I-D)
 *
 * Reusable Portuguese VAT calculation engine.
 * Supports mainland, Azores, and Madeira rates.
 * All calculations in integer cents.
 * No float, NaN, or Infinity.
 */

import type { PortugalVatRegion, VatRateOption } from "../../constants/vat";

/** VAT rate codes */
export type VatRateCode = "NOR" | "INT" | "RED" | "ISE";

/** VAT jurisdiction/region */
export type VatRegion = "CONTINENT" | "AZORES" | "MADEIRA";

/** VAT rate information */
export interface VatRateInfo {
  code: VatRateCode;
  name: string;
  percentage: number;
  region: VatRegion;
}

/** Line item for VAT calculation */
export interface VatLineItem {
  /** Line identifier */
  lineId: string;
  /** Description */
  description: string;
  /** Quantity */
  quantity: number;
  /** Unit price in cents */
  unitPriceCents: number;
  /** Discount in cents */
  discountCents?: number;
  /** VAT rate code */
  vatRateCode: VatRateCode;
  /** VAT region (defaults to CONTINENT) */
  vatRegion?: VatRegion;
  /** VAT exemption reason (if rate is ISE) */
  exemptionReason?: string;
}

/** Result of VAT calculation for a line */
export interface VatLineResult {
  lineId: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  netAmountCents: number;
  vatRateCode: VatRateCode;
  vatRatePercentage: number;
  vatAmountCents: number;
  grossAmountCents: number;
  vatRegion: VatRegion;
  exemptionReason?: string;
}

/** VAT breakdown by rate */
export interface VatBreakdownEntry {
  vatRateCode: VatRateCode;
  vatRatePercentage: number;
  vatRegion: VatRegion;
  baseAmountCents: number;
  vatAmountCents: number;
}

/** Complete VAT calculation result */
export interface VatCalculationResult {
  lines: VatLineResult[];
  vatBreakdown: VatBreakdownEntry[];
  totalNetAmountCents: number;
  totalVatAmountCents: number;
  totalGrossAmountCents: number;
  currency: string;
}

/** VAT calculation options */
export interface VatCalculationOptions {
  /** Default region if not specified per line */
  defaultRegion?: VatRegion;
  /** Currency (default EUR) */
  currency?: string;
  /** Whether to group breakdown by region */
  groupByRegion?: boolean;
}

/**
 * Gets VAT rate info for a given code and region
 */
export function getVatRateInfo(
  rateCode: VatRateCode,
  region: VatRegion = "CONTINENT",
): VatRateInfo {
  const rates: Record<VatRegion, Record<VatRateCode, VatRateInfo>> = {
    CONTINENT: {
      NOR: { code: "NOR", name: "Normal", percentage: 23, region: "CONTINENT" },
      INT: { code: "INT", name: "Intermédia", percentage: 13, region: "CONTINENT" },
      RED: { code: "RED", name: "Reduzida", percentage: 6, region: "CONTINENT" },
      ISE: { code: "ISE", name: "Isento", percentage: 0, region: "CONTINENT" },
    },
    AZORES: {
      NOR: { code: "NOR", name: "Normal", percentage: 16, region: "AZORES" },
      INT: { code: "INT", name: "Intermédia", percentage: 9, region: "AZORES" },
      RED: { code: "RED", name: "Reduzida", percentage: 4, region: "AZORES" },
      ISE: { code: "ISE", name: "Isento", percentage: 0, region: "AZORES" },
    },
    MADEIRA: {
      NOR: { code: "NOR", name: "Normal", percentage: 22, region: "MADEIRA" },
      INT: { code: "INT", name: "Intermédia", percentage: 12, region: "MADEIRA" },
      RED: { code: "RED", name: "Reduzida", percentage: 5, region: "MADEIRA" },
      ISE: { code: "ISE", name: "Isento", percentage: 0, region: "MADEIRA" },
    },
  };

  return rates[region][rateCode];
}

/**
 * Calculates VAT for a single line item
 * All amounts in integer cents
 */
export function calculateLineVat(item: VatLineItem): VatLineResult {
  const region = item.vatRegion ?? "CONTINENT";
  const rateInfo = getVatRateInfo(item.vatRateCode, region);

  const quantity = Math.max(1, Math.floor(item.quantity));
  const unitPrice = Math.max(0, Math.floor(item.unitPriceCents));
  const discount = Math.max(0, Math.floor(item.discountCents ?? 0));

  const grossUnitPrice = unitPrice;
  const netUnitPrice = grossUnitPrice - discount;
  const netAmountCents = netUnitPrice * quantity;

  let vatAmountCents = 0;
  if (rateInfo.percentage > 0) {
    // VAT = netAmount * rate / 100, rounded to nearest cent
    vatAmountCents = Math.round((netAmountCents * rateInfo.percentage) / 100);
  }

  const grossAmountCents = netAmountCents + vatAmountCents;

  return {
    lineId: item.lineId,
    description: item.description,
    quantity,
    unitPriceCents: unitPrice,
    discountCents: discount,
    netAmountCents,
    vatRateCode: item.vatRateCode,
    vatRatePercentage: rateInfo.percentage,
    vatAmountCents,
    grossAmountCents,
    vatRegion: region,
    exemptionReason: item.exemptionReason,
  };
}

/**
 * Calculates VAT for multiple line items
 */
export function calculateVat(
  items: VatLineItem[],
  options: VatCalculationOptions = {},
): VatCalculationResult {
  const defaultRegion = options.defaultRegion ?? "CONTINENT";
  const currency = options.currency ?? "EUR";

  const results: VatLineResult[] = [];
  const breakdownMap = new Map<string, VatBreakdownEntry>();

  let totalNetAmountCents = 0;
  let totalVatAmountCents = 0;
  let totalGrossAmountCents = 0;

  for (const item of items) {
    const lineResult = calculateLineVat({
      ...item,
      vatRegion: item.vatRegion ?? defaultRegion,
    });

    results.push(lineResult);
    totalNetAmountCents += lineResult.netAmountCents;
    totalVatAmountCents += lineResult.vatAmountCents;
    totalGrossAmountCents += lineResult.grossAmountCents;

    // Group breakdown by rate code + region
    const breakdownKey = `${lineResult.vatRateCode}-${lineResult.vatRegion}`;
    const existing = breakdownMap.get(breakdownKey);
    if (existing) {
      existing.baseAmountCents += lineResult.netAmountCents;
      existing.vatAmountCents += lineResult.vatAmountCents;
    } else {
      breakdownMap.set(breakdownKey, {
        vatRateCode: lineResult.vatRateCode,
        vatRatePercentage: lineResult.vatRatePercentage,
        vatRegion: lineResult.vatRegion,
        baseAmountCents: lineResult.netAmountCents,
        vatAmountCents: lineResult.vatAmountCents,
      });
    }
  }

  const vatBreakdown = Array.from(breakdownMap.values());

  return {
    lines: results,
    vatBreakdown,
    totalNetAmountCents,
    totalVatAmountCents,
    totalGrossAmountCents,
    currency,
  };
}

/**
 * Calculates net amount from gross and VAT rate
 * net = gross / (1 + rate/100)
 */
export function calculateNetFromGross(
  grossAmountCents: number,
  vatRateCode: VatRateCode,
  region: VatRegion = "CONTINENT",
): number {
  const rateInfo = getVatRateInfo(vatRateCode, region);
  if (rateInfo.percentage === 0) return grossAmountCents;

  const divisor = 1 + rateInfo.percentage / 100;
  return Math.round(grossAmountCents / divisor);
}

/**
 * Calculates gross amount from net and VAT rate
 * gross = net * (1 + rate/100)
 */
export function calculateGrossFromNet(
  netAmountCents: number,
  vatRateCode: VatRateCode,
  region: VatRegion = "CONTINENT",
): number {
  const rateInfo = getVatRateInfo(vatRateCode, region);
  if (rateInfo.percentage === 0) return netAmountCents;

  const multiplier = 1 + rateInfo.percentage / 100;
  return Math.round(netAmountCents * multiplier);
}

/**
 * Validates that gross = net + VAT for a calculation result
 */
export function validateVatInvariants(result: VatCalculationResult): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check gross = net + VAT
  const calculatedGross = result.totalNetAmountCents + result.totalVatAmountCents;
  if (result.totalGrossAmountCents !== calculatedGross) {
    errors.push(
      `Gross mismatch: ${result.totalGrossAmountCents} !== ${calculatedGross} (net + VAT)`,
    );
  }

  // Check breakdown sums match totals
  const breakdownVatTotal = result.vatBreakdown.reduce(
    (sum, b) => sum + b.vatAmountCents,
    0,
  );
  if (breakdownVatTotal !== result.totalVatAmountCents) {
    errors.push(
      `VAT breakdown total (${breakdownVatTotal}) !== total VAT (${result.totalVatAmountCents})`,
    );
  }

  const breakdownBaseTotal = result.vatBreakdown.reduce(
    (sum, b) => sum + b.baseAmountCents,
    0,
  );
  if (breakdownBaseTotal !== result.totalNetAmountCents) {
    errors.push(
      `VAT breakdown base (${breakdownBaseTotal}) !== total net (${result.totalNetAmountCents})`,
    );
  }

  // Check no negative amounts
  if (result.totalNetAmountCents < 0) errors.push("Total net amount cannot be negative");
  if (result.totalVatAmountCents < 0) errors.push("Total VAT amount cannot be negative");
  if (result.totalGrossAmountCents < 0) errors.push("Total gross amount cannot be negative");

  for (const line of result.lines) {
    if (line.netAmountCents < 0) errors.push(`Line ${line.lineId}: net amount cannot be negative`);
    if (line.vatAmountCents < 0) errors.push(`Line ${line.lineId}: VAT amount cannot be negative`);
    if (line.grossAmountCents < 0) errors.push(`Line ${line.lineId}: gross amount cannot be negative`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Reverse charge VAT calculation (intra-community)
 * Returns the VAT that would be due under reverse charge
 */
export function calculateReverseChargeVat(
  netAmountCents: number,
  vatRateCode: VatRateCode,
  region: VatRegion = "CONTINENT",
): { vatAmountCents: number; vatRatePercentage: number; vatRegion: VatRegion } {
  const rateInfo = getVatRateInfo(vatRateCode, region);
  const vatAmountCents = Math.round((netAmountCents * rateInfo.percentage) / 100);

  return {
    vatAmountCents,
    vatRatePercentage: rateInfo.percentage,
    vatRegion: region,
  };
}

/**
 * Intra-community VAT - VAT not charged, but reported
 */
export function calculateIntraCommunityVat(
  netAmountCents: number,
  vatRateCode: VatRateCode,
  region: VatRegion = "CONTINENT",
): { vatReportableCents: number; vatRatePercentage: number; vatRegion: VatRegion } {
  const rateInfo = getVatRateInfo(vatRateCode, region);
  const vatReportableCents = Math.round((netAmountCents * rateInfo.percentage) / 100);

  return {
    vatReportableCents,
    vatRatePercentage: rateInfo.percentage,
    vatRegion: region,
  };
}

/**
 * Formats VAT rate for display
 */
export function formatVatRate(rateCode: VatRateCode, region: VatRegion = "CONTINENT"): string {
  const rateInfo = getVatRateInfo(rateCode, region);
  if (rateInfo.percentage === 0) return "Isento";
  return `${rateInfo.percentage}%`;
}

/**
 * Checks if a VAT rate is exempt
 */
export function isVatExempt(rateCode: VatRateCode): boolean {
  return rateCode === "ISE";
}

/**
 * Gets all available VAT rates for a region
 */
export function getAvailableVatRates(region: VatRegion): VatRateInfo[] {
  return ["NOR", "INT", "RED", "ISE"].map((code) => getVatRateInfo(code as VatRateCode, region));
}