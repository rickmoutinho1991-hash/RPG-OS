/**
 * RPG-OS Portuguese Tax Authority Integration (FASE 10I-G)
 *
 * Integration abstraction for Autoridade Tributária / e-Fatura.
 * Creates FakePortugueseTaxAuthorityProvider for local/dev testing.
 * Configuration through environment variables for future official integration.
 */

import type { Invoice, InvoiceType } from "../../types/invoice";

/** Document status from tax authority */
export type TaxAuthorityDocumentStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "ERROR"
  | "CANCELLED";

/** Result of document validation */
export interface TaxAuthorityValidationResult {
  valid: boolean;
  documentId: string;
  status: TaxAuthorityDocumentStatus;
  validatedAt: string;
  errors?: string[];
  warnings?: string[];
}

/** Result of document submission */
export interface TaxAuthoritySubmissionResult {
  success: boolean;
  documentId: string;
  submissionId?: string;
  status: TaxAuthorityDocumentStatus;
  submittedAt: string;
  atcud?: string;
  qrCode?: string;
  hash?: string;
  errors?: string[];
}

/** Document status query result */
export interface TaxAuthorityStatusResult {
  documentId: string;
  status: TaxAuthorityDocumentStatus;
  lastCheckedAt: string;
  atcud?: string;
  hash?: string;
  errors?: string[];
}

/** Cancellation result */
export interface TaxAuthorityCancellationResult {
  success: boolean;
  documentId: string;
  cancellationId?: string;
  status: TaxAuthorityDocumentStatus;
  cancelledAt: string;
  errors?: string[];
}

/** Query result */
export interface TaxAuthorityQueryResult {
  documents: Array<{
    documentId: string;
    series: string;
    documentNumber: string;
    documentType: InvoiceType;
    issueDate: string;
    totalAmount: number;
    status: TaxAuthorityDocumentStatus;
    atcud?: string;
  }>;
  totalCount: number;
  page: number;
  pageSize: number;
}

/** Configuration for tax authority provider */
export interface TaxAuthorityConfig {
  /** Provider type: 'fake' | 'official' */
  provider: "fake" | "official";
  /** API endpoint (for official) */
  apiEndpoint?: string;
  /** API credentials (for official) - never hardcode! */
  credentials?: {
    clientId?: string;
    clientSecret?: string;
    certificate?: string;
    certificatePassword?: string;
  };
  /** Organization NIF */
  organizationNif: string;
  /** Software certificate */
  softwareCertificate?: string;
  /** Timeout in ms */
  timeout?: number;
  /** Retry attempts */
  retryAttempts?: number;
}

/**
 * Portuguese Tax Authority Provider Interface
 * Abstracts all interactions with AT/e-Fatura
 */
export interface PortugueseTaxAuthorityProvider {
  /** Validate a fiscal document before submission */
  validateDocument(document: Invoice): Promise<TaxAuthorityValidationResult>;

  /** Submit a fiscal document to e-Fatura */
  submitDocument(document: Invoice): Promise<TaxAuthoritySubmissionResult>;

  /** Get document status from tax authority */
  getDocumentStatus(documentId: string): Promise<TaxAuthorityStatusResult>;

  /** Cancel a submitted document */
  cancelDocument(documentId: string, reason: string): Promise<TaxAuthorityCancellationResult>;

  /** Query documents by criteria */
  queryDocuments(criteria: {
    startDate?: string;
    endDate?: string;
    documentType?: InvoiceType;
    status?: TaxAuthorityDocumentStatus;
    page?: number;
    pageSize?: number;
  }): Promise<TaxAuthorityQueryResult>;

  /** Get provider health status */
  getHealth(): Promise<{ healthy: boolean; latency?: number; message?: string }>;
}

/**
 * Fake Portuguese Tax Authority Provider
 * For local/development testing only.
 * Simulates ACCEPTED, REJECTED, PENDING, ERROR responses.
 */
export class FakePortugueseTaxAuthorityProvider implements PortugueseTaxAuthorityProvider {
  private readonly config: TaxAuthorityConfig;
  private readonly submittedDocuments = new Map<string, {
    document: Invoice;
    status: TaxAuthorityDocumentStatus;
    submittedAt: string;
    atcud?: string;
    qrCode?: string;
    hash?: string;
    submissionId: string;
  }>();
  private readonly deterministic: boolean;

  constructor(config: Partial<TaxAuthorityConfig & { deterministic?: boolean }> = {}) {
    this.config = {
      provider: "fake",
      organizationNif: "501234560",
      timeout: 1000,
      retryAttempts: 3,
      ...config,
    };
    this.deterministic = config.deterministic ?? false;
  }

  /**
   * Validates a document locally
   * Simulates AT validation rules
   */
  async validateDocument(document: Invoice): Promise<TaxAuthorityValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Simulate network delay
    await this.simulateDelay();

    // Check required fields
    if (!document.invoiceId) errors.push("Missing invoiceId");
    if (!document.organizationId) errors.push("Missing organizationId");
    if (!document.customer?.taxNumber) errors.push("Missing customer NIF");
    if (!document.series) errors.push("Missing series");
    if (!document.documentNumber) errors.push("Missing document number");
    if (!document.issueDate) errors.push("Missing issue date");
    if (document.totalCents <= 0) errors.push("Total must be positive");

    // Check VAT breakdown
    if (document.invoiceType !== "FS") {
      const vatBreakdownTotal = document.vatBreakdown.reduce((sum, v) => sum + v.amountCents, 0);
      if (vatBreakdownTotal !== document.taxCents) {
        errors.push(`VAT breakdown mismatch: ${vatBreakdownTotal} !== ${document.taxCents}`);
      }
    }

    // Check NIF validity (basic)
    if (document.customer?.taxNumber && !this.isValidNifFormat(document.customer.taxNumber)) {
      errors.push("Invalid customer NIF format");
    }

    // Check series format
    if (document.series && !/^\d{4}$/.test(document.series)) {
      warnings.push("Series should be 4-digit year format");
    }

    // Simulate random validation failure for testing (10% chance) - only in non-deterministic mode
    if (!this.deterministic && Math.random() < 0.1 && errors.length === 0) {
      errors.push("Simulated validation error: document format not accepted");
    }

    return {
      valid: errors.length === 0,
      documentId: document.invoiceId,
      status: errors.length === 0 ? "ACCEPTED" : "REJECTED",
      validatedAt: new Date().toISOString(),
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Submits a document to the fake e-Fatura
   * Simulates submission with deterministic results
   */
  async submitDocument(document: Invoice): Promise<TaxAuthoritySubmissionResult> {
    await this.simulateDelay();

    // Validate first
    const validation = await this.validateDocument(document);
    if (!validation.valid) {
      return {
        success: false,
        documentId: document.invoiceId,
        status: "REJECTED",
        submittedAt: new Date().toISOString(),
        errors: validation.errors,
      };
    }

    // Generate fake AT response
    const submissionId = `SUB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const atcud = this.generateAtcud(document);
    const hash = this.generateHash(document);
    const qrCode = this.generateQrCode(document, atcud);

    // Store as submitted
    this.submittedDocuments.set(document.invoiceId, {
      document,
      status: "ACCEPTED",
      submittedAt: new Date().toISOString(),
      atcud,
      qrCode,
      hash,
      submissionId,
    });

    // Simulate different outcomes based on document properties
    let status: TaxAuthorityDocumentStatus = "ACCEPTED";
    if (document.totalCents > 1000000) { // > €10,000
      // Large amounts might need manual review
      if (!this.deterministic && Math.random() < 0.2) status = "PENDING";
    }

    // Simulate random rejection (5% chance) - only in non-deterministic mode
    if (!this.deterministic && Math.random() < 0.05) {
      status = "REJECTED";
    }

    return {
      success: status === "ACCEPTED" || status === "PENDING",
      documentId: document.invoiceId,
      submissionId,
      status,
      submittedAt: new Date().toISOString(),
      atcud,
      qrCode,
      hash,
      errors: status === "REJECTED" ? ["Simulated rejection: document failed validation"] : undefined,
    };
  }

  /**
   * Gets document status from fake provider
   */
  async getDocumentStatus(documentId: string): Promise<TaxAuthorityStatusResult> {
    await this.simulateDelay(100);

    const record = this.submittedDocuments.get(documentId);
    if (!record) {
      return {
        documentId,
        status: "ERROR",
        lastCheckedAt: new Date().toISOString(),
        errors: ["Document not found in fake provider"],
      };
    }

    return {
      documentId,
      status: record.status,
      lastCheckedAt: new Date().toISOString(),
      atcud: record.atcud,
      hash: record.hash,
    };
  }

  /**
   * Cancels a document in fake provider
   */
  async cancelDocument(documentId: string, reason: string): Promise<TaxAuthorityCancellationResult> {
    await this.simulateDelay();

    const record = this.submittedDocuments.get(documentId);
    if (!record) {
      return {
        success: false,
        documentId,
        status: "ERROR",
        cancelledAt: new Date().toISOString(),
        errors: ["Document not found"],
      };
    }

    if (record.status === "CANCELLED") {
      return {
        success: false,
        documentId,
        status: "CANCELLED",
        cancelledAt: new Date().toISOString(),
        errors: ["Document already cancelled"],
      };
    }

    // Update status
    record.status = "CANCELLED";
    this.submittedDocuments.set(documentId, record);

    return {
      success: true,
      documentId,
      cancellationId: `CAN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: "CANCELLED",
      cancelledAt: new Date().toISOString(),
    };
  }

  /**
   * Queries documents from fake provider
   */
  async queryDocuments(criteria: {
    startDate?: string;
    endDate?: string;
    documentType?: InvoiceType;
    status?: TaxAuthorityDocumentStatus;
    page?: number;
    pageSize?: number;
  }): Promise<TaxAuthorityQueryResult> {
    await this.simulateDelay(200);

    let docs = Array.from(this.submittedDocuments.values()).map((record) => record.document);

    // Apply filters
    if (criteria.startDate) {
      docs = docs.filter((d) => d.issueDate && d.issueDate >= criteria.startDate!);
    }
    if (criteria.endDate) {
      docs = docs.filter((d) => d.issueDate && d.issueDate <= criteria.endDate!);
    }
    if (criteria.documentType) {
      docs = docs.filter((d) => d.invoiceType === criteria.documentType);
    }
    if (criteria.status) {
      docs = docs.filter((d) => {
        const record = this.submittedDocuments.get(d.invoiceId);
        return record?.status === criteria.status;
      });
    }

    // Pagination
    const page = criteria.page ?? 1;
    const pageSize = criteria.pageSize ?? 50;
    const start = (page - 1) * pageSize;
    const paginated = docs.slice(start, start + pageSize);

    return {
      documents: paginated.map((d) => {
        const record = this.submittedDocuments.get(d.invoiceId);
        return {
          documentId: d.invoiceId,
          series: d.series ?? "",
          documentNumber: d.documentNumber ?? "",
          documentType: d.invoiceType,
          issueDate: d.issueDate ?? "",
          totalAmount: d.totalCents / 100,
          status: record?.status ?? "ERROR",
          atcud: record?.atcud,
        };
      }),
      totalCount: docs.length,
      page,
      pageSize,
    };
  }

  /**
   * Health check for fake provider
   */
  async getHealth(): Promise<{ healthy: boolean; latency?: number; message?: string }> {
    const start = Date.now();
    await this.simulateDelay(10);
    return {
      healthy: true,
      latency: Date.now() - start,
      message: "Fake provider operational",
    };
  }

  /**
   * Resets the fake provider state (for testing)
   */
  reset(): void {
    this.submittedDocuments.clear();
  }

  /**
   * Gets all submitted documents (for testing)
   */
  getSubmittedDocuments(): Map<string, any> {
    return new Map(this.submittedDocuments);
  }

  /**
   * Simulates network delay
   */
  private async simulateDelay(extraMs: number = 0): Promise<void> {
    const delay = (this.config.timeout ?? 1000) * 0.1 + extraMs + Math.random() * 50;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Generates fake ATCUD
   */
  private generateAtcud(document: Invoice): string {
    const datePart = new Date(document.issueDate ?? Date.now()).toISOString().slice(0, 10).replace(/-/g, "");
    const randomPart = Math.random().toString(36).substr(2, 8).toUpperCase();
    return `ATCUD-${datePart}-${randomPart}`;
  }

  /**
   * Generates fake hash
   */
  private generateHash(document: Invoice): string {
    const data = `${document.invoiceId}|${document.series}|${document.documentNumber}|${document.totalCents}|${document.issueDate}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data.charCodeAt(i);
      hash |= 0;
    }
    return `HASH-${Math.abs(hash).toString(16).toUpperCase().padStart(8, "0")}`;
  }

  /**
   * Generates fake QR code data
   */
  private generateQrCode(document: Invoice, atcud: string): string {
    const qrData = {
      v: "1.0",
      t: document.invoiceType,
      s: document.series,
      n: document.documentNumber,
      d: document.issueDate?.split("T")[0],
      a: document.totalCents / 100,
      c: document.customer.taxNumber,
      h: atcud,
    };
    return `data:image/png;base64,${btoa(JSON.stringify(qrData))}`;
  }

  /**
   * Basic NIF format check
   */
  private isValidNifFormat(nif: string): boolean {
    const clean = nif.replace(/\s/g, "");
    return /^\d{9}$/.test(clean);
  }
}

/**
 * Creates a tax authority provider from environment configuration
 * Usage:
 *   const provider = createTaxAuthorityProvider();
 *   await provider.submitDocument(invoice);
 */
export function createTaxAuthorityProvider(config?: Partial<TaxAuthorityConfig>): PortugueseTaxAuthorityProvider {
  // @ts-ignore - process is available in Node.js
  const providerType = config?.provider ?? (process.env.PORTUGAL_TAX_PROVIDER as "fake" | "official") ?? "fake";

  if (providerType === "official") {
    // Official provider would be implemented here when credentials are available
    // For now, throw an error to prevent accidental use
    throw new Error(
      "Official AT/e-Fatura provider not implemented. " +
      "Set PORTUGAL_TAX_PROVIDER=fake for development, or implement official provider with valid credentials.",
    );
  }

  return new FakePortugueseTaxAuthorityProvider(config);
}

/**
 * Idempotency key generator for tax authority submissions
 * Ensures the same submission never creates duplicates
 */
export function generateIdempotencyKey(
  organizationId: string,
  documentId: string,
  operation: "submit" | "cancel" | "query",
  attempt: number = 1,
): string {
  const data = `${organizationId}|${documentId}|${operation}|${attempt}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data.charCodeAt(i);
    hash |= 0;
  }
  return `IDEMP-${Math.abs(hash).toString(16).toUpperCase()}-${attempt}`;
}