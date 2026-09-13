/**
 * RPG-OS SAF-T PT Foundation (FASE 10I-F)
 *
 * Domain/export abstraction for Portuguese SAF-T (Standard Audit File for Tax).
 * DOES NOT claim official certification.
 * Provides domain mapping, deterministic serialization, and validation.
 */

import type { Invoice, InvoiceType, InvoiceCustomer, InvoiceSupplier, InvoiceLine, VatBreakdown } from "../../types/invoice";
import type { FiscalSeries } from "./fiscalSeries";
import { calculateVat, type VatLineItem, type VatRateCode, type VatRegion } from "./vatEngine";

/** SAF-T PT version */
export const SAFT_PT_VERSION = "1.04_01";

/** SAF-T PT header information */
export interface SaftPtHeader {
  /** Audit file version */
  auditFileVersion: string;
  /** Company information */
  company: SaftPtCompany;
  /** Period of the export */
  fiscalYear: number;
  startDate: string;
  endDate: string;
  /** Currency used */
  currency: string;
  /** Date of generation */
  generatedAt: string;
  /** Software information */
  software: SaftPtSoftware;
}

/** Company information for SAF-T */
export interface SaftPtCompany {
  /** Company NIF/NIPC */
  taxRegistrationNumber: string;
  /** Company legal name */
  companyName: string;
  /** Company address */
  address: SaftPtAddress;
  /** Contact info */
  contact?: SaftPtContact;
  /** Bank accounts */
  bankAccounts?: SaftPtBankAccount[];
}

/** Address structure */
export interface SaftPtAddress {
  /** Street address */
  street: string;
  /** Building number */
  number?: string;
  /** Additional address info */
  complement?: string;
  /** Postal code (XXXX-XXX) */
  postalCode: string;
  /** City */
  city: string;
  /** Country code (PT) */
  country: string;
  /** Region (CONTINENT, AZORES, MADEIRA) */
  region?: VatRegion;
}

/** Contact information */
export interface SaftPtContact {
  /** Phone number */
  phone?: string;
  /** Email */
  email?: string;
  /** Website */
  website?: string;
}

/** Bank account information */
export interface SaftPtBankAccount {
  /** IBAN */
  iban: string;
  /** Bank name */
  bankName?: string;
  /** Account description */
  description?: string;
}

/** Software information */
export interface SaftPtSoftware {
  /** Software company name */
  companyName: string;
  /** Software product name */
  productName: string;
  /** Software version */
  version: string;
  /** Software certificate number (if applicable) */
  certificateNumber?: string;
}

/** Customer/Supplier for SAF-T */
export interface SaftPtParty {
  /** Party type */
  partyType: "C" | "F"; // Customer or Supplier
  /** Tax registration number (NIF/NIPC) */
  taxRegistrationNumber: string;
  /** Name */
  name: string;
  /** Address */
  address: SaftPtAddress;
  /** Contact */
  contact?: SaftPtContact;
  /** Self-billing indicator */
  selfBillingIndicator?: boolean;
}

/** Invoice/Source document for SAF-T */
export interface SaftPtSourceDocument {
  /** Document type: FT, FS, FR, NC, ND */
  documentType: InvoiceType;
  /** Series */
  series: string;
  /** Document number */
  documentNumber: string;
  /** ATCUD (Código de validação) */
  atcud?: string;
  /** Hash/CRC */
  hash?: string;
  /** Document status */
  documentStatus: "N" | "A" | "C"; // Normal, Anulado, Cancelado
  /** Hash control */
  hashControl?: string;
  /** Issue date */
  issueDate: string;
  /** Due date */
  dueDate?: string;
  /** Customer */
  customer: SaftPtParty;
  /** Supplier (for reverse charge) */
  supplier?: SaftPtParty;
  /** Line items */
  lines: SaftPtLine[];
  /** Totals */
  totals: SaftPtTotals;
  /** Payment terms */
  paymentTerms?: SaftPtPaymentTerms;
  /** Notes */
  notes?: string;
}

/** Line item for SAF-T */
export interface SaftPtLine {
  /** Line number */
  lineNumber: number;
  /** Product/service code */
  productCode?: string;
  /** Description */
  description: string;
  /** Quantity */
  quantity: number;
  /** Unit of measure */
  unitOfMeasure: string;
  /** Unit price (net) */
  unitPrice: number;
  /** Discount */
  discount?: number;
  /** Net amount */
  netAmount: number;
  /** VAT rate percentage */
  vatRate: number;
  /** VAT amount */
  vatAmount: number;
  /** Gross amount */
  grossAmount: number;
  /** VAT region */
  vatRegion?: VatRegion;
  /** Exemption reason */
  exemptionReason?: string;
}

/** Totals for SAF-T */
export interface SaftPtTotals {
  /** Total net amount */
  totalNet: number;
  /** Total VAT amount */
  totalVat: number;
  /** Total gross amount */
  totalGross: number;
  /** VAT breakdown by rate */
  vatBreakdown: SaftPtVatBreakdown[];
}

/** VAT breakdown entry for SAF-T */
export interface SaftPtVatBreakdown {
  /** VAT rate percentage */
  vatRate: number;
  /** VAT region */
  vatRegion: VatRegion;
  /** Taxable base */
  taxableBase: number;
  /** VAT amount */
  vatAmount: number;
  /** Exemption reason (if applicable) */
  exemptionReason?: string;
}

/** Payment terms for SAF-T */
export interface SaftPtPaymentTerms {
  /** Days to due date */
  days: number;
  /** Due date */
  dueDate: string;
  /** Early payment discount */
  discount?: {
    rate: number;
    days: number;
    amount: number;
  };
}

/** Complete SAF-T PT export structure */
export interface SaftPtExport {
  header: SaftPtHeader;
  sourceDocuments: SaftPtSourceDocument[];
  /** Validation result */
  validation: SaftPtValidationResult;
}

/** Validation result for SAF-T export */
export interface SaftPtValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  documentCount: number;
  totalNetAmount: number;
  totalVatAmount: number;
  totalGrossAmount: number;
}

/** Configuration for SAF-T export */
export interface SaftPtExportConfig {
  /** Organization ID */
  organizationId: string;
  /** Fiscal year */
  fiscalYear: number;
  /** Start date (ISO) */
  startDate: string;
  /** End date (ISO) */
  endDate: string;
  /** Company information (from organization settings) */
  company: SaftPtCompany;
  /** Invoices to export */
  invoices: Invoice[];
  /** Fiscal series for reference */
  series?: FiscalSeries[];
  /** Software info */
  software: SaftPtSoftware;
}

/**
 * Fiscal Export Provider Interface
 * Implementations can generate SAF-T, CSV, or other fiscal exports
 */
export interface FiscalExportProvider {
  /** Export fiscal documents to SAF-T PT format */
  exportToSaftPt(config: SaftPtExportConfig): Promise<SaftPtExport>;
  /** Validate a SAF-T export */
  validateSaftPt(exportData: SaftPtExport): SaftPtValidationResult;
  /** Get supported export formats */
  getSupportedFormats(): string[];
}

/**
 * SAF-T PT Exporter Implementation
 * Maps RPG-OS fiscal documents to SAF-T PT structure
 */
export class SaftPtExporter implements FiscalExportProvider {
  constructor(
    private readonly defaultConfig: Partial<SaftPtExportConfig> = {},
  ) {}

  /**
   * Exports fiscal documents to SAF-T PT format
   */
  async exportToSaftPt(config: SaftPtExportConfig): Promise<SaftPtExport> {
    const generatedAt = new Date().toISOString();

    // Build header
    const header: SaftPtHeader = {
      auditFileVersion: SAFT_PT_VERSION,
      company: config.company,
      fiscalYear: config.fiscalYear,
      startDate: config.startDate,
      endDate: config.endDate,
      currency: "EUR",
      generatedAt,
      software: config.software,
    };

    // Map invoices to source documents
    const sourceDocuments: SaftPtSourceDocument[] = [];

    for (const invoice of config.invoices) {
      const doc = this.mapInvoiceToSourceDocument(invoice);
      sourceDocuments.push(doc);
    }

    // Validate
    const validation = this.validateExport(header, sourceDocuments);

    return {
      header,
      sourceDocuments,
      validation,
    };
  }

  /**
   * Maps an RPG-OS Invoice to SAF-T Source Document
   */
  private mapInvoiceToSourceDocument(invoice: Invoice): SaftPtSourceDocument {
    // Determine document status
    const documentStatus = this.mapInvoiceStatusToSaft(invoice.status);

    // Map customer
    const customer = this.mapPartyToSaft(invoice.customer, "C");

    // Map supplier if present
    const supplier = invoice.supplier
      ? this.mapPartyToSaft(invoice.supplier, "F")
      : undefined;

    // Map lines
    const lines = this.mapLinesToSaft(invoice.lines ?? [], invoice.vatBreakdown, invoice);

    // Map totals
    const totals = this.mapTotalsToSaft(invoice);

    // Map payment terms
    const paymentTerms = invoice.paymentTerms
      ? this.mapPaymentTermsToSaft(invoice.paymentTerms)
      : undefined;

    return {
      documentType: invoice.invoiceType,
      series: invoice.series ?? "",
      documentNumber: invoice.documentNumber ?? "",
      atcud: invoice.atcud,
      hash: invoice.hash,
      documentStatus,
      issueDate: invoice.issueDate ?? new Date().toISOString().split("T")[0],
      dueDate: invoice.dueDate,
      customer,
      supplier,
      lines,
      totals,
      paymentTerms,
      notes: invoice.notes,
    };
  }

  /**
   * Maps invoice status to SAF-T document status
   */
  private mapInvoiceStatusToSaft(status: string): "N" | "A" | "C" {
    switch (status) {
      case "void":
      case "cancelled":
        return "A"; // Anulado
      case "draft":
        return "C"; // Cancelado (not yet issued)
      default:
        return "N"; // Normal
    }
  }

  /**
   * Maps a party (customer/supplier) to SAF-T party
   */
  private mapPartyToSaft(
    party: InvoiceCustomer | InvoiceSupplier,
    partyType: "C" | "F",
  ): SaftPtParty {
    return {
      partyType,
      taxRegistrationNumber: party.taxNumber,
      name: party.name,
      address: {
        street: party.address ?? "",
        postalCode: party.postalCode ?? "",
        city: party.city ?? "",
        country: party.country ?? "PT",
      },
    };
  }

  /**
   * Maps invoice lines to SAF-T lines
   */
  private mapLinesToSaft(
    lines: InvoiceLine[],
    vatBreakdown: VatBreakdown[],
    invoice: Invoice,
  ): SaftPtLine[] {
    // If we have explicit lines, use them
    if (lines.length > 0) {
      return lines.map((line, index) => {
        // Find matching VAT breakdown
        const vatInfo = vatBreakdown.find(
          (v) => v.rate === (line.vatRate ?? "NOR"),
        );
        const vatRate = line.vatRate ? this.vatRateCodeFromString(line.vatRate) : "NOR";
        const vatPercentage = vatInfo?.ratePercent ?? this.vatPercentageFromCode(vatRate);

        return {
          lineNumber: index + 1,
          productCode: line.lineId,
          description: line.description,
          quantity: line.quantity ?? 1,
          unitOfMeasure: "UN",
          unitPrice: line.unitAmountCents / 100, // Convert to euros for SAF-T
          discount: (line.discountCents ?? 0) / 100,
          netAmount: (line.unitAmountCents - (line.discountCents ?? 0)) / 100 * (line.quantity ?? 1),
          vatRate: vatPercentage,
          vatAmount: (line.taxCents ?? 0) / 100,
          grossAmount: (line.unitAmountCents - (line.discountCents ?? 0) + (line.taxCents ?? 0)) / 100 * (line.quantity ?? 1),
        };
      });
    }

    // Otherwise create a single line from totals (fallback)
    return [
      {
        lineNumber: 1,
        productCode: "TOTAL",
        description: "Total da fatura",
        quantity: 1,
        unitOfMeasure: "UN",
        unitPrice: invoice.subtotalCents / 100,
        discount: invoice.discountCents / 100,
        netAmount: (invoice.subtotalCents - invoice.discountCents) / 100,
        vatRate: 0, // Mixed rates
        vatAmount: invoice.taxCents / 100,
        grossAmount: invoice.totalCents / 100,
      },
    ];
  }

  /**
   * Maps totals to SAF-T totals
   */
  private mapTotalsToSaft(invoice: Invoice): SaftPtTotals {
    const vatBreakdown: SaftPtVatBreakdown[] = invoice.vatBreakdown.map((v) => ({
      vatRate: v.ratePercent,
      vatRegion: "CONTINENT", // Would need region info
      taxableBase: v.baseCents / 100,
      vatAmount: v.amountCents / 100,
    }));

    return {
      totalNet: (invoice.subtotalCents - invoice.discountCents) / 100,
      totalVat: invoice.taxCents / 100,
      totalGross: invoice.totalCents / 100,
      vatBreakdown,
    };
  }

  /**
   * Maps payment terms to SAF-T
   */
  private mapPaymentTermsToSaft(terms: any): SaftPtPaymentTerms {
    return {
      days: terms.dueDays,
      dueDate: terms.dueDate,
      discount: terms.earlyDiscountCents
        ? {
            rate: 0, // Would need rate
            days: 0, // Would need days
            amount: terms.earlyDiscountCents / 100,
          }
        : undefined,
    };
  }

  /**
   * Validates the complete SAF-T export
   */
  validateSaftPt(exportData: SaftPtExport): SaftPtValidationResult {
    return this.validateExport(exportData.header, exportData.sourceDocuments);
  }

  /**
   * Internal validation logic
   */
  private validateExport(
    header: SaftPtHeader,
    documents: SaftPtSourceDocument[],
  ): SaftPtValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check header
    if (!header.company.taxRegistrationNumber) {
      errors.push("Company tax registration number is required");
    }
    if (!header.company.companyName) {
      errors.push("Company name is required");
    }

    // Check documents
    let totalNetCents = 0;
    let totalVatCents = 0;
    let totalGrossCents = 0;

    for (const doc of documents) {
      // Validate document
      if (!doc.documentType) errors.push(`Document missing type`);
      if (!doc.series) errors.push(`Document missing series`);
      if (!doc.documentNumber) errors.push(`Document missing number`);
      if (!doc.customer.taxRegistrationNumber) errors.push(`Customer NIF missing`);

      // Convert totals from euros to cents for validation
      const docNetCents = Math.round(doc.totals.totalNet * 100);
      const docVatCents = Math.round(doc.totals.totalVat * 100);
      const docGrossCents = Math.round(doc.totals.totalGross * 100);

      // Check totals
      if (docGrossCents !== docNetCents + docVatCents) {
        errors.push(
          `Document ${doc.series}/${doc.documentNumber}: gross != net + VAT`,
        );
      }

      totalNetCents += docNetCents;
      totalVatCents += docVatCents;
      totalGrossCents += docGrossCents;

      // Warnings
      if (doc.documentStatus === "C") {
        warnings.push(`Document ${doc.series}/${doc.documentNumber} is in draft/cancelled state`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      documentCount: documents.length,
      totalNetAmount: totalNetCents,
      totalVatAmount: totalVatCents,
      totalGrossAmount: totalGrossCents,
    };
  }

  /**
   * Gets supported export formats
   */
  getSupportedFormats(): string[] {
    return ["SAFT-PT", "JSON"];
  }

  /**
   * Helper: converts VAT rate string to code
   */
  private vatRateCodeFromString(rate: string): VatRateCode {
    switch (rate) {
      case "23":
        return "NOR";
      case "13":
        return "INT";
      case "6":
        return "RED";
      case "0":
        return "ISE";
      case "22":
        return "NOR"; // Madeira normal
      default:
        return "NOR";
    }
  }

  /**
   * Helper: gets VAT percentage from code
   */
  private vatPercentageFromCode(code: VatRateCode): number {
    switch (code) {
      case "NOR":
        return 23;
      case "INT":
        return 13;
      case "RED":
        return 6;
      case "ISE":
        return 0;
      default:
        return 23;
    }
  }
}

/**
 * Creates a minimal SAF-T PT export configuration for testing
 */
export function createTestSaftPtConfig(
  organizationId: string,
  invoices: Invoice[],
): SaftPtExportConfig {
  return {
    organizationId,
    fiscalYear: new Date().getFullYear(),
    startDate: `${new Date().getFullYear()}-01-01`,
    endDate: `${new Date().getFullYear()}-12-31`,
    company: {
      taxRegistrationNumber: "501234560",
      companyName: "Test Company Lda",
      address: {
        street: "Rua de Teste",
        number: "123",
        postalCode: "1000-001",
        city: "Lisboa",
        country: "PT",
        region: "CONTINENT",
      },
    },
    invoices,
    software: {
      companyName: "RPG-OS",
      productName: "RPG-OS Fiscal Engine",
      version: "1.0.0",
    },
  };
}