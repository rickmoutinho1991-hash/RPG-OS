/**
 * RPG-OS E-Fatura Reconciliation (FASE 10I-H)
 *
 * Reconciliation model for comparing local fiscal documents with external (AT/e-Fatura) records.
 * No destructive automatic correction - mismatches must be visible and auditable.
 */

import type { Invoice, InvoiceType } from "../../types/invoice";

/** Reconciliation status */
export type ReconciliationStatus =
  | "LOCAL_DOCUMENT"
  | "EXTERNAL_DOCUMENT"
  | "MATCHED"
  | "MISMATCH"
  | "MISSING_EXTERNAL"
  | "MISSING_LOCAL"
  | "PENDING";

/** Fields to compare during reconciliation */
export interface ReconciliationComparison {
  nifNipc: boolean;
  documentType: boolean;
  series: boolean;
  documentNumber: boolean;
  issueDate: boolean;
  totalAmount: boolean;
  vatAmount: boolean;
  customerSupplier: boolean;
}

/** Result of a single document reconciliation */
export interface ReconciliationResult {
  /** Local document ID */
  localDocumentId: string;
  /** External document ID (from AT) */
  externalDocumentId?: string;
  /** Reconciliation status */
  status: ReconciliationStatus;
  /** Field-by-field comparison */
  comparison: ReconciliationComparison;
  /** Detailed differences */
  differences: ReconciliationDifference[];
  /** When reconciliation was performed */
  reconciledAt: string;
  /** Who/what performed the reconciliation */
  reconciledBy: "SYSTEM" | "USER" | "AUTOMATION";
}

/** Difference detail */
export interface ReconciliationDifference {
  /** Field name */
  field: string;
  /** Local value */
  localValue: string | number;
  /** External value */
  externalValue: string | number;
  /** Severity */
  severity: "INFO" | "WARNING" | "ERROR";
}

/** Batch reconciliation result */
export interface ReconciliationBatchResult {
  /** Batch ID */
  batchId: string;
  /** Period reconciled */
  period: { startDate: string; endDate: string };
  /** Organization */
  organizationId: string;
  /** Individual results */
  results: ReconciliationResult[];
  /** Summary counts */
  summary: {
    total: number;
    matched: number;
    mismatched: number;
    missingExternal: number;
    missingLocal: number;
    pending: number;
  };
  /** When batch was run */
  runAt: string;
}

/** Local document summary for reconciliation */
export interface LocalDocumentSummary {
  documentId: string;
  documentType: InvoiceType;
  series: string;
  documentNumber: string;
  issueDate: string;
  totalCents: number;
  taxCents: number;
  customerNif: string;
  customerName: string;
  status: string;
  atcud?: string;
  hash?: string;
}

/** External document summary (from AT) */
export interface ExternalDocumentSummary {
  documentId: string;
  documentType: InvoiceType;
  series: string;
  documentNumber: string;
  issueDate: string;
  totalAmount: number;
  vatAmount: number;
  customerNif: string;
  customerName: string;
  status: string;
  atcud?: string;
  hash?: string;
}

/**
 * Reconciliation service for comparing local and external fiscal documents
 */
export class FiscalReconciliationService {
  /**
   * Reconciles a single local document against external records
   */
  async reconcileDocument(
    localDoc: LocalDocumentSummary,
    externalDocs: ExternalDocumentSummary[],
  ): Promise<ReconciliationResult> {
    // Find matching external document
    const externalDoc = this.findMatchingExternal(localDoc, externalDocs);

    if (!externalDoc) {
      return this.createResult(localDoc, undefined, "MISSING_EXTERNAL", "SYSTEM");
    }

    // Compare fields
    const comparison = this.compareFields(localDoc, externalDoc);
    const differences = this.findDifferences(localDoc, externalDoc);

    // Determine overall status
    const hasErrors = differences.some((d) => d.severity === "ERROR");
    const hasWarnings = differences.some((d) => d.severity === "WARNING");
    const allMatch = differences.length === 0;

    let status: ReconciliationStatus;
    if (allMatch) {
      status = "MATCHED";
    } else if (hasErrors) {
      status = "MISMATCH";
    } else if (hasWarnings) {
      status = "MISMATCH"; // Treat warnings as mismatches for audit purposes
    } else {
      status = "MISMATCH";
    }

    return this.createResult(localDoc, externalDoc.documentId, status, "SYSTEM", comparison, differences);
  }

  /**
   * Reconciles a batch of local documents against external records
   */
  async reconcileBatch(
    organizationId: string,
    localDocs: LocalDocumentSummary[],
    externalDocs: ExternalDocumentSummary[],
    startDate: string,
    endDate: string,
  ): Promise<ReconciliationBatchResult> {
    const batchId = `REC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const results: ReconciliationResult[] = [];

    for (const localDoc of localDocs) {
      const result = await this.reconcileDocument(localDoc, externalDocs);
      results.push(result);
    }

    // Also check for external documents without local counterpart
    for (const extDoc of externalDocs) {
      const hasLocal = localDocs.some((l) =>
        l.series === extDoc.series && l.documentNumber === extDoc.documentNumber,
      );
      if (!hasLocal) {
        results.push(
          this.createExternalOnlyResult(extDoc, organizationId, "SYSTEM"),
        );
      }
    }

    const summary = this.calculateSummary(results);

    return {
      batchId,
      period: { startDate, endDate },
      organizationId,
      results,
      summary,
      runAt: new Date().toISOString(),
    };
  }

  /**
   * Finds matching external document by document number (primary key)
   * Series is compared as part of field comparison
   */
  private findMatchingExternal(
    local: LocalDocumentSummary,
    external: ExternalDocumentSummary[],
  ): ExternalDocumentSummary | undefined {
    return external.find(
      (e) => e.documentNumber === local.documentNumber,
    );
  }

  /**
   * Compares fields between local and external documents
   */
  private compareFields(
    local: LocalDocumentSummary,
    external: ExternalDocumentSummary,
  ): ReconciliationComparison {
    return {
      nifNipc: local.customerNif === external.customerNif,
      documentType: local.documentType === external.documentType,
      series: local.series === external.series,
      documentNumber: local.documentNumber === external.documentNumber,
      issueDate: local.issueDate === external.issueDate,
      totalAmount: local.totalCents === Math.round(external.totalAmount * 100),
      vatAmount: local.taxCents === Math.round(external.vatAmount * 100),
      customerSupplier: local.customerName === external.customerName,
    };
  }

  /**
   * Finds detailed differences
   */
  private findDifferences(
    local: LocalDocumentSummary,
    external: ExternalDocumentSummary,
  ): ReconciliationDifference[] {
    const differences: ReconciliationDifference[] = [];

    if (local.customerNif !== external.customerNif) {
      differences.push({
        field: "customerNif",
        localValue: local.customerNif,
        externalValue: external.customerNif,
        severity: "ERROR",
      });
    }

    if (local.documentType !== external.documentType) {
      differences.push({
        field: "documentType",
        localValue: local.documentType,
        externalValue: external.documentType,
        severity: "ERROR",
      });
    }

    if (local.series !== external.series) {
      differences.push({
        field: "series",
        localValue: local.series,
        externalValue: external.series,
        severity: "ERROR",
      });
    }

    if (local.documentNumber !== external.documentNumber) {
      differences.push({
        field: "documentNumber",
        localValue: local.documentNumber,
        externalValue: external.documentNumber,
        severity: "ERROR",
      });
    }

    if (local.issueDate !== external.issueDate) {
      differences.push({
        field: "issueDate",
        localValue: local.issueDate,
        externalValue: external.issueDate,
        severity: "WARNING",
      });
    }

    const localTotalCents = local.totalCents;
    const externalTotalCents = Math.round(external.totalAmount * 100);
    if (localTotalCents !== externalTotalCents) {
      differences.push({
        field: "totalAmount",
        localValue: localTotalCents,
        externalValue: externalTotalCents,
        severity: "ERROR",
      });
    }

    const localVatCents = local.taxCents;
    const externalVatCents = Math.round(external.vatAmount * 100);
    if (localVatCents !== externalVatCents) {
      differences.push({
        field: "vatAmount",
        localValue: localVatCents,
        externalValue: externalVatCents,
        severity: "ERROR",
      });
    }

    if (local.customerName !== external.customerName) {
      differences.push({
        field: "customerName",
        localValue: local.customerName,
        externalValue: external.customerName,
        severity: "WARNING",
      });
    }

    return differences;
  }

  /**
   * Creates a reconciliation result
   */
  private createResult(
    local: LocalDocumentSummary,
    externalId: string | undefined,
    status: ReconciliationStatus,
    reconciledBy: "SYSTEM" | "USER" | "AUTOMATION",
    comparison?: ReconciliationComparison,
    differences?: ReconciliationDifference[],
  ): ReconciliationResult {
    let finalDifferences = differences ?? [];
    
    // Add default difference for MISSING_EXTERNAL
    if (status === "MISSING_EXTERNAL" && finalDifferences.length === 0) {
      finalDifferences = [
        {
          field: "document",
          localValue: local.documentId,
          externalValue: "NOT_FOUND",
          severity: "ERROR",
        },
      ];
    }

    return {
      localDocumentId: local.documentId,
      externalDocumentId: externalId,
      status,
      comparison: comparison ?? {
        nifNipc: false,
        documentType: false,
        series: false,
        documentNumber: false,
        issueDate: false,
        totalAmount: false,
        vatAmount: false,
        customerSupplier: false,
      },
      differences: finalDifferences,
      reconciledAt: new Date().toISOString(),
      reconciledBy,
    };
  }

  /**
   * Creates result for external-only document
   */
  private createExternalOnlyResult(
    external: ExternalDocumentSummary,
    organizationId: string,
    reconciledBy: "SYSTEM" | "USER" | "AUTOMATION",
  ): ReconciliationResult {
    return {
      localDocumentId: `EXT-${external.documentId}`,
      externalDocumentId: external.documentId,
      status: "MISSING_LOCAL",
      comparison: {
        nifNipc: false,
        documentType: false,
        series: false,
        documentNumber: false,
        issueDate: false,
        totalAmount: false,
        vatAmount: false,
        customerSupplier: false,
      },
      differences: [
        {
          field: "document",
          localValue: "NOT_FOUND",
          externalValue: external.documentId,
          severity: "ERROR",
        },
      ],
      reconciledAt: new Date().toISOString(),
      reconciledBy,
    };
  }

  /**
   * Calculates summary statistics
   */
  private calculateSummary(results: ReconciliationResult[]): ReconciliationBatchResult["summary"] {
    return {
      total: results.length,
      matched: results.filter((r) => r.status === "MATCHED").length,
      mismatched: results.filter((r) => r.status === "MISMATCH").length,
      missingExternal: results.filter((r) => r.status === "MISSING_EXTERNAL").length,
      missingLocal: results.filter((r) => r.status === "MISSING_LOCAL").length,
      pending: results.filter((r) => r.status === "PENDING").length,
    };
  }
}

/**
 * Creates a local document summary from an Invoice
 */
export function createLocalSummary(invoice: Invoice): LocalDocumentSummary {
  return {
    documentId: invoice.invoiceId,
    documentType: invoice.invoiceType,
    series: invoice.series ?? "",
    documentNumber: invoice.documentNumber ?? "",
    issueDate: invoice.issueDate ?? "",
    totalCents: invoice.totalCents,
    taxCents: invoice.taxCents,
    customerNif: invoice.customer.taxNumber,
    customerName: invoice.customer.name,
    status: invoice.status,
    atcud: invoice.atcud,
    hash: invoice.hash,
  };
}

/**
 * Creates an external document summary from AT query result
 */
export function createExternalSummary(data: {
  documentId: string;
  documentType: InvoiceType;
  series: string;
  documentNumber: string;
  issueDate: string;
  totalAmount: number;
  vatAmount: number;
  customerNif: string;
  customerName: string;
  status: string;
  atcud?: string;
  hash?: string;
}): ExternalDocumentSummary {
  return data;
}