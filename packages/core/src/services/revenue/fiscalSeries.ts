/**
 * RPG-OS Fiscal Document Series (FASE 10I-B)
 *
 * Portuguese fiscal document series support.
 * Organization-scoped, deterministic numbering, no duplicates.
 * All monetary values in integer cents.
 */

import type { InvoiceType } from "../../types/invoice";

/** Portuguese fiscal series status */
export type FiscalSeriesStatus = "active" | "inactive" | "archived";

/** Fiscal document series model */
export interface FiscalSeries {
  /** Unique series identifier */
  seriesId: string;
  /** Associated organization */
  organizationId: string;
  /** Document type: FT, FS, FR, NC, ND */
  documentType: InvoiceType;
  /** Series code (e.g., "2025", "FT-2025", "A") */
  seriesCode: string;
  /** Next document number to assign */
  nextDocumentNumber: number;
  /** Whether the series is active */
  status: FiscalSeriesStatus;
  /** Fiscal year this series belongs to */
  fiscalYear: number;
  /** Created at (ISO string) */
  createdAt: string;
  /** Last updated at (ISO string) */
  updatedAt: string;
}

/** Input for creating a new fiscal series */
export interface CreateFiscalSeriesInput {
  organizationId: string;
  documentType: InvoiceType;
  seriesCode: string;
  fiscalYear: number;
  startingNumber?: number;
  status?: FiscalSeriesStatus;
}

/** Input for updating a fiscal series */
export interface UpdateFiscalSeriesInput {
  seriesCode?: string;
  status?: FiscalSeriesStatus;
  nextDocumentNumber?: number;
}

/** Result of allocating a document number */
export interface DocumentNumberAllocation {
  /** The allocated document number */
  documentNumber: number;
  /** The series code */
  seriesCode: string;
  /** Formatted document number (e.g., "2025/001") */
  formattedNumber: string;
  /** The series ID */
  seriesId: string;
}

/** Creates a new fiscal series */
export function createFiscalSeries(input: CreateFiscalSeriesInput): FiscalSeries {
  const now = new Date().toISOString();
  const seriesId = `series_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    seriesId,
    organizationId: input.organizationId,
    documentType: input.documentType,
    seriesCode: input.seriesCode,
    nextDocumentNumber: input.startingNumber ?? 1,
    status: input.status ?? "active",
    fiscalYear: input.fiscalYear,
    createdAt: now,
    updatedAt: now,
  };
}

/** Allocates the next document number in a series */
export function allocateDocumentNumber(series: FiscalSeries): DocumentNumberAllocation {
  if (series.status !== "active") {
    throw new Error(`Cannot allocate number from inactive series: ${series.seriesId}`);
  }

  if (series.nextDocumentNumber < 1) {
    throw new Error(`Invalid next document number: ${series.nextDocumentNumber}`);
  }

  const documentNumber = series.nextDocumentNumber;
  const formattedNumber = `${series.seriesCode}/${documentNumber.toString().padStart(3, "0")}`;

  return {
    documentNumber,
    seriesCode: series.seriesCode,
    formattedNumber,
    seriesId: series.seriesId,
  };
}

/** Increments the series counter after successful allocation */
export function incrementSeriesCounter(series: FiscalSeries): FiscalSeries {
  return {
    ...series,
    nextDocumentNumber: series.nextDocumentNumber + 1,
    updatedAt: new Date().toISOString(),
  };
}

/** Validates a fiscal series for invariants */
export function validateFiscalSeries(series: FiscalSeries): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!series.seriesId) errors.push("Series ID is required");
  if (!series.organizationId) errors.push("Organization ID is required");
  if (!series.documentType) errors.push("Document type is required");
  if (!series.seriesCode) errors.push("Series code is required");
  if (series.nextDocumentNumber < 1) errors.push("Next document number must be >= 1");
  if (series.fiscalYear < 2000 || series.fiscalYear > 2100) {
    errors.push("Fiscal year must be between 2000 and 2100");
  }
  if (!["active", "inactive", "archived"].includes(series.status)) {
    errors.push(`Invalid series status: ${series.status}`);
  }
  if (!["FT", "FS", "FR", "NC", "ND"].includes(series.documentType)) {
    errors.push(`Invalid document type: ${series.documentType}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/** Checks if two series would conflict (same org, type, code, year) */
export function seriesConflict(
  seriesA: FiscalSeries,
  seriesB: FiscalSeries,
): boolean {
  return (
    seriesA.organizationId === seriesB.organizationId &&
    seriesA.documentType === seriesB.documentType &&
    seriesA.seriesCode === seriesB.seriesCode &&
    seriesA.fiscalYear === seriesB.fiscalYear
  );
}

/** Formats a document number with series code */
export function formatDocumentNumber(
  seriesCode: string,
  documentNumber: number,
): string {
  return `${seriesCode}/${documentNumber.toString().padStart(3, "0")}`;
}

/** Parses a formatted document number */
export function parseDocumentNumber(
  formatted: string,
): { seriesCode: string; documentNumber: number } | null {
  const match = formatted.match(/^(.+)\/(\d+)$/);
  if (!match) return null;
  return {
    seriesCode: match[1],
    documentNumber: parseInt(match[2], 10),
  };
}