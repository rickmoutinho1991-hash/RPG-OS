import { describe, it, expect, beforeEach } from "vitest";
import {
  FiscalReconciliationService,
  createLocalSummary,
  createExternalSummary,
  type LocalDocumentSummary,
  type ExternalDocumentSummary,
  type ReconciliationStatus,
} from "../../revenue";
import type { Invoice } from "../../../types/invoice";

describe("E-Fatura Reconciliation - Phase 10I-H", () => {
  let service: FiscalReconciliationService;

  const createMockInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
    invoiceId: "inv-001",
    organizationId: "org-123",
    invoiceType: "FT",
    series: "2025",
    documentNumber: "001",
    customer: {
      id: "cust-001",
      name: "Cliente Teste",
      taxNumber: "212345672",
      nifType: "INDIVIDUAL",
      address: "Rua do Cliente 10",
      postalCode: "1000-001",
      city: "Lisboa",
      country: "PT",
    },
    subtotalCents: 10000,
    discountCents: 0,
    feeCents: 0,
    taxCents: 2300,
    totalCents: 12300,
    paidCents: 0,
    amountDueCents: 12300,
    status: "open",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    vatBreakdown: [
      { rate: "23", ratePercent: 23, amountCents: 2300, baseCents: 10000 },
    ],
    issueDate: "2025-01-15T00:00:00.000Z",
    dueDate: "2025-02-14T00:00:00.000Z",
    billingPeriodStart: "2025-01-15T00:00:00.000Z",
    billingPeriodEnd: "2025-01-15T00:00:00.000Z",
    currency: "EUR",
    atcud: "ATCUD-123",
    hash: "HASH-123",
    ...overrides,
  });

  const createMockExternal = (overrides: Partial<ExternalDocumentSummary> = {}): ExternalDocumentSummary => ({
    documentId: "EXT-001",
    documentType: "FT",
    series: "2025",
    documentNumber: "001",
    issueDate: "2025-01-15T00:00:00.000Z",
    totalAmount: 123.00,
    vatAmount: 23.00,
    customerNif: "212345672",
    customerName: "Cliente Teste",
    status: "ACCEPTED",
    atcud: "ATCUD-123",
    hash: "HASH-123",
    ...overrides,
  });

  beforeEach(() => {
    service = new FiscalReconciliationService();
  });

  describe("reconcileDocument", () => {
    it("returns MATCHED for identical documents", async () => {
      const invoice = createMockInvoice();
      const localDoc = createLocalSummary(invoice);
      const externalDoc = createMockExternal();

      const result = await service.reconcileDocument(localDoc, [externalDoc]);

      expect(result.status).toBe("MATCHED");
      expect(result.externalDocumentId).toBe("EXT-001");
      expect(result.comparison.nifNipc).toBe(true);
      expect(result.comparison.documentType).toBe(true);
      expect(result.comparison.series).toBe(true);
      expect(result.comparison.documentNumber).toBe(true);
      expect(result.comparison.issueDate).toBe(true);
      expect(result.comparison.totalAmount).toBe(true);
      expect(result.comparison.vatAmount).toBe(true);
      expect(result.comparison.customerSupplier).toBe(true);
      expect(result.differences.length).toBe(0);
    });

    it("returns MISSING_EXTERNAL when no match found", async () => {
      const invoice = createMockInvoice({ documentNumber: "999" });
      const localDoc = createLocalSummary(invoice);
      const externalDoc = createMockExternal({ documentNumber: "001" });

      const result = await service.reconcileDocument(localDoc, [externalDoc]);

      expect(result.status).toBe("MISSING_EXTERNAL");
      expect(result.externalDocumentId).toBeUndefined();
      expect(result.differences.length).toBeGreaterThan(0);
      expect(result.differences[0].field).toBe("document");
      expect(result.differences[0].severity).toBe("ERROR");
    });

    it("detects NIF mismatch", async () => {
      const invoice = createMockInvoice();
      const localDoc = createLocalSummary(invoice);
      const externalDoc = createMockExternal({ customerNif: "999999999" });

      const result = await service.reconcileDocument(localDoc, [externalDoc]);

      expect(result.status).toBe("MISMATCH");
      expect(result.comparison.nifNipc).toBe(false);
      expect(result.differences.some((d) => d.field === "customerNif" && d.severity === "ERROR")).toBe(true);
    });

    it("detects document type mismatch", async () => {
      const invoice = createMockInvoice({ invoiceType: "FT" });
      const localDoc = createLocalSummary(invoice);
      const externalDoc = createMockExternal({ documentType: "FS" });

      const result = await service.reconcileDocument(localDoc, [externalDoc]);

      expect(result.status).toBe("MISMATCH");
      expect(result.comparison.documentType).toBe(false);
      expect(result.differences.some((d) => d.field === "documentType" && d.severity === "ERROR")).toBe(true);
    });

    it("detects series mismatch", async () => {
      const invoice = createMockInvoice({ series: "2025" });
      const localDoc = createLocalSummary(invoice);
      const externalDoc = createMockExternal({ series: "2024" });

      const result = await service.reconcileDocument(localDoc, [externalDoc]);

      expect(result.status).toBe("MISMATCH");
      expect(result.comparison.series).toBe(false);
    });

    it("returns MISSING_EXTERNAL for document number mismatch", async () => {
      const invoice = createMockInvoice({ documentNumber: "001" });
      const localDoc = createLocalSummary(invoice);
      const externalDoc = createMockExternal({ documentNumber: "002" });

      const result = await service.reconcileDocument(localDoc, [externalDoc]);

      expect(result.status).toBe("MISSING_EXTERNAL");
      expect(result.externalDocumentId).toBeUndefined();
    });

    it("detects total amount mismatch", async () => {
      const invoice = createMockInvoice({ totalCents: 12300 });
      const localDoc = createLocalSummary(invoice);
      const externalDoc = createMockExternal({ totalAmount: 100.00 });

      const result = await service.reconcileDocument(localDoc, [externalDoc]);

      expect(result.status).toBe("MISMATCH");
      expect(result.comparison.totalAmount).toBe(false);
      expect(result.differences.some((d) => d.field === "totalAmount" && d.severity === "ERROR")).toBe(true);
    });

    it("detects VAT amount mismatch", async () => {
      const invoice = createMockInvoice({ taxCents: 2300 });
      const localDoc = createLocalSummary(invoice);
      const externalDoc = createMockExternal({ vatAmount: 10.00 });

      const result = await service.reconcileDocument(localDoc, [externalDoc]);

      expect(result.status).toBe("MISMATCH");
      expect(result.comparison.vatAmount).toBe(false);
      expect(result.differences.some((d) => d.field === "vatAmount" && d.severity === "ERROR")).toBe(true);
    });

    it("detects customer name mismatch as WARNING", async () => {
      const invoice = createMockInvoice();
      const localDoc = createLocalSummary(invoice);
      const externalDoc = createMockExternal({ customerName: "Outro Cliente" });

      const result = await service.reconcileDocument(localDoc, [externalDoc]);

      expect(result.status).toBe("MISMATCH");
      expect(result.comparison.customerSupplier).toBe(false);
      expect(result.differences.some((d) => d.field === "customerName" && d.severity === "WARNING")).toBe(true);
    });

    it("detects issue date mismatch as WARNING", async () => {
      const invoice = createMockInvoice({ issueDate: "2025-01-15T00:00:00.000Z" });
      const localDoc = createLocalSummary(invoice);
      const externalDoc = createMockExternal({ issueDate: "2025-01-16T00:00:00.000Z" });

      const result = await service.reconcileDocument(localDoc, [externalDoc]);

      expect(result.status).toBe("MISMATCH");
      expect(result.comparison.issueDate).toBe(false);
      expect(result.differences.some((d) => d.field === "issueDate" && d.severity === "WARNING")).toBe(true);
    });

    it("includes reconciledAt timestamp", async () => {
      const invoice = createMockInvoice();
      const localDoc = createLocalSummary(invoice);
      const externalDoc = createMockExternal();

      const result = await service.reconcileDocument(localDoc, [externalDoc]);

      expect(new Date(result.reconciledAt).getTime()).toBeLessThanOrEqual(Date.now());
      expect(new Date(result.reconciledAt).getTime()).toBeGreaterThan(Date.now() - 5000);
    });

    it("sets reconciledBy to SYSTEM", async () => {
      const invoice = createMockInvoice();
      const localDoc = createLocalSummary(invoice);
      const externalDoc = createMockExternal();

      const result = await service.reconcileDocument(localDoc, [externalDoc]);

      expect(result.reconciledBy).toBe("SYSTEM");
    });
  });

  describe("reconcileBatch", () => {
    it("reconciles multiple documents", async () => {
      const invoices = [
        createMockInvoice({ invoiceId: "inv-001", documentNumber: "001" }),
        createMockInvoice({ invoiceId: "inv-002", documentNumber: "002", invoiceType: "FS" }),
        createMockInvoice({ invoiceId: "inv-003", documentNumber: "003", invoiceType: "NC" }),
      ];

      const localDocs = invoices.map(createLocalSummary);
      const externalDocs = [
        createMockExternal({ documentNumber: "001" }),
        createMockExternal({ documentNumber: "002", documentType: "FS" }),
      ];

      const batch = await service.reconcileBatch("org-123", localDocs, externalDocs, "2025-01-01", "2025-12-31");

      expect(batch.batchId).toContain("REC-");
      expect(batch.organizationId).toBe("org-123");
      expect(batch.results.length).toBe(3); // 2 matched + 1 missing external
      expect(batch.summary.total).toBe(3);
      expect(batch.summary.matched).toBe(2);
      expect(batch.summary.missingExternal).toBe(1);
    });

    it("detects MISSING_LOCAL for external-only documents", async () => {
      const invoices = [
        createMockInvoice({ invoiceId: "inv-001", documentNumber: "001" }),
      ];

      const localDocs = invoices.map(createLocalSummary);
      const externalDocs = [
        createMockExternal({ documentId: "EXT-001", documentNumber: "001" }),
        createMockExternal({ documentId: "EXT-002", documentNumber: "002" }),
      ];

      const batch = await service.reconcileBatch("org-123", localDocs, externalDocs, "2025-01-01", "2025-12-31");

      expect(batch.results.length).toBe(2); // 1 matched + 1 missing local
      expect(batch.summary.matched).toBe(1);
      expect(batch.summary.missingLocal).toBe(1);

      const missingLocal = batch.results.find((r) => r.status === "MISSING_LOCAL");
      expect(missingLocal).toBeDefined();
      expect(missingLocal?.localDocumentId).toContain("EXT-002");
    });

    it("calculates correct summary counts", async () => {
      const invoices = [
        createMockInvoice({ invoiceId: "inv-001", documentNumber: "001" }),
        createMockInvoice({ invoiceId: "inv-002", documentNumber: "002", totalCents: 5000 }),
        createMockInvoice({ invoiceId: "inv-003", documentNumber: "003" }),
      ];

      const localDocs = invoices.map(createLocalSummary);
      const externalDocs = [
        createMockExternal({ documentNumber: "001" }), // MATCHED
        createMockExternal({ documentNumber: "002", totalAmount: 100 }), // MISMATCH (total different)
        createMockExternal({ documentNumber: "004" }), // MISSING_LOCAL
      ];

      const batch = await service.reconcileBatch("org-123", localDocs, externalDocs, "2025-01-01", "2025-12-31");

      expect(batch.summary.total).toBe(4);
      expect(batch.summary.matched).toBe(1);
      expect(batch.summary.mismatched).toBe(1);
      expect(batch.summary.missingExternal).toBe(1); // inv-003
      expect(batch.summary.missingLocal).toBe(1); // EXT-004
    });

    it("includes batch metadata", async () => {
      const invoices = [createMockInvoice()];
      const localDocs = invoices.map(createLocalSummary);
      const externalDocs = [createMockExternal()];

      const batch = await service.reconcileBatch("org-123", localDocs, externalDocs, "2025-01-01", "2025-12-31");

      expect(batch.batchId).toContain("REC-");
      expect(batch.period.startDate).toBe("2025-01-01");
      expect(batch.period.endDate).toBe("2025-12-31");
      expect(batch.runAt).toBeDefined();
    });
  });

  describe("createLocalSummary", () => {
    it("creates summary from invoice", () => {
      const invoice = createMockInvoice();
      const summary = createLocalSummary(invoice);

      expect(summary.documentId).toBe("inv-001");
      expect(summary.documentType).toBe("FT");
      expect(summary.series).toBe("2025");
      expect(summary.documentNumber).toBe("001");
      expect(summary.totalCents).toBe(12300);
      expect(summary.taxCents).toBe(2300);
      expect(summary.customerNif).toBe("212345672");
      expect(summary.customerName).toBe("Cliente Teste");
    });
  });

  describe("createExternalSummary", () => {
    it("creates summary from AT data", () => {
      const data = {
        documentId: "EXT-001",
        documentType: "FT" as const,
        series: "2025",
        documentNumber: "001",
        issueDate: "2025-01-15T00:00:00.000Z",
        totalAmount: 123.00,
        vatAmount: 23.00,
        customerNif: "212345672",
        customerName: "Cliente Teste",
        status: "ACCEPTED",
      };

      const summary = createExternalSummary(data);

      expect(summary.documentId).toBe("EXT-001");
      expect(summary.totalAmount).toBe(123.00);
      expect(summary.vatAmount).toBe(23.00);
    });
  });

  describe("No destructive correction", () => {
    it("never modifies original documents", async () => {
      const invoice = createMockInvoice({ totalCents: 12300 });
      const localDoc = createLocalSummary(invoice);
      const externalDoc = createMockExternal({ totalAmount: 100.00 });

      const originalTotal = localDoc.totalCents;
      await service.reconcileDocument(localDoc, [externalDoc]);

      expect(localDoc.totalCents).toBe(originalTotal);
    });

    it("reports all differences for audit", async () => {
      const invoice = createMockInvoice();
      const localDoc = createLocalSummary(invoice);
      const externalDoc = createMockExternal({
        customerNif: "999999999",
        totalAmount: 100.00,
        vatAmount: 10.00,
        customerName: "Outro",
      });

      const result = await service.reconcileDocument(localDoc, [externalDoc]);

      expect(result.differences.length).toBeGreaterThan(0);
      // All differences should be reported
      expect(result.differences.some((d) => d.field === "customerNif")).toBe(true);
      expect(result.differences.some((d) => d.field === "totalAmount")).toBe(true);
      expect(result.differences.some((d) => d.field === "vatAmount")).toBe(true);
      expect(result.differences.some((d) => d.field === "customerName")).toBe(true);
    });
  });
});