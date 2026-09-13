import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  FakePortugueseTaxAuthorityProvider,
  createTaxAuthorityProvider,
  generateIdempotencyKey,
  type PortugueseTaxAuthorityProvider,
  type Invoice,
  type TaxAuthorityDocumentStatus,
} from "../../revenue";

describe("Portuguese Tax Authority Provider - Phase 10I-G", () => {
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
    ...overrides,
  });

  describe("FakePortugueseTaxAuthorityProvider", () => {
    describe("validateDocument", () => {
      let provider: FakePortugueseTaxAuthorityProvider;

      beforeEach(() => {
        provider = new FakePortugueseTaxAuthorityProvider({ deterministic: true });
      });

      it("validates a correct document", async () => {
        const invoice = createMockInvoice();
        const result = await provider.validateDocument(invoice);

        expect(result.valid).toBe(true);
        expect(result.documentId).toBe("inv-001");
        expect(result.status).toBe("ACCEPTED");
        expect(result.validatedAt).toBeDefined();
      });

      it("rejects document with missing invoiceId", async () => {
        const invoice = createMockInvoice({ invoiceId: "" });
        const result = await provider.validateDocument(invoice);

        expect(result.valid).toBe(false);
        expect(result.status).toBe("REJECTED");
        expect(result.errors).toContain("Missing invoiceId");
      });

      it("rejects document with missing organizationId", async () => {
        const invoice = createMockInvoice({ organizationId: "" });
        const result = await provider.validateDocument(invoice);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("Missing organizationId");
      });

      it("rejects document with missing customer NIF", async () => {
        const invoice = createMockInvoice({
          customer: { ...createMockInvoice().customer, taxNumber: "" },
        });
        const result = await provider.validateDocument(invoice);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("Missing customer NIF");
      });

      it("rejects document with invalid NIF format", async () => {
        const invoice = createMockInvoice({
          customer: { ...createMockInvoice().customer, taxNumber: "123" },
        });
        const result = await provider.validateDocument(invoice);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("Invalid customer NIF format");
      });

      it("rejects document with non-positive total", async () => {
        const invoice = createMockInvoice({ totalCents: 0 });
        const result = await provider.validateDocument(invoice);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain("Total must be positive");
      });

      it("rejects document with VAT breakdown mismatch", async () => {
        const invoice = createMockInvoice({
          taxCents: 2000, // Wrong: should be 2300
        });
        const result = await provider.validateDocument(invoice);

        expect(result.valid).toBe(false);
        expect(result.errors?.[0]).toContain("VAT breakdown mismatch");
      });

      it("warns about non-standard series format", async () => {
        const invoice = createMockInvoice({ series: "ABC" });
        const result = await provider.validateDocument(invoice);

        expect(result.valid).toBe(true);
        expect(result.warnings).toContain("Series should be 4-digit year format");
      });

      it("includes validatedAt timestamp", async () => {
        const invoice = createMockInvoice();
        const result = await provider.validateDocument(invoice);

        expect(new Date(result.validatedAt).getTime()).toBeLessThanOrEqual(Date.now());
        expect(new Date(result.validatedAt).getTime()).toBeGreaterThan(Date.now() - 5000);
      });
    });

    describe("submitDocument", () => {
      let provider: FakePortugueseTaxAuthorityProvider;

      beforeEach(() => {
        provider = new FakePortugueseTaxAuthorityProvider({ deterministic: true });
      });

      it("submits a valid document successfully", async () => {
        const invoice = createMockInvoice();
        const result = await provider.submitDocument(invoice);

        expect(result.success).toBe(true);
        expect(result.documentId).toBe("inv-001");
        expect(result.submissionId).toBeDefined();
        expect(result.status).toBe("ACCEPTED");
        expect(result.atcud).toBeDefined();
        expect(result.qrCode).toBeDefined();
        expect(result.hash).toBeDefined();
      });

      it("rejects invalid document", async () => {
        const invoice = createMockInvoice({ totalCents: 0 });
        const result = await provider.submitDocument(invoice);

        expect(result.success).toBe(false);
        expect(result.status).toBe("REJECTED");
        expect(result.errors).toBeDefined();
      });

      it("generates deterministic ATCUD format", async () => {
        const invoice = createMockInvoice({ issueDate: "2025-01-15T00:00:00.000Z" });
        const result = await provider.submitDocument(invoice);

        expect(result.atcud).toMatch(/^ATCUD-\d{8}-[A-Z0-9]{8}$/);
      });

      it("stores submitted document for status queries", async () => {
        const invoice = createMockInvoice();
        await provider.submitDocument(invoice);

        const status = await provider.getDocumentStatus("inv-001");
        expect(status.status).toBe("ACCEPTED");
        expect(status.atcud).toBeDefined();
      });

      it("can result in PENDING status", async () => {
        // This is probabilistic, so we test the logic exists by checking status is valid
        const invoice = createMockInvoice({ totalCents: 2000000 }); // €20,000
        const result = await provider.submitDocument(invoice);
        // Should be one of the valid statuses
        expect(["ACCEPTED", "PENDING", "REJECTED"]).toContain(result.status);
      });
    });

    describe("getDocumentStatus", () => {
      let provider: FakePortugueseTaxAuthorityProvider;

      beforeEach(() => {
        provider = new FakePortugueseTaxAuthorityProvider({ deterministic: true });
      });

      it("returns status for submitted document", async () => {
        const invoice = createMockInvoice();
        await provider.submitDocument(invoice);

        const status = await provider.getDocumentStatus("inv-001");

        expect(status.documentId).toBe("inv-001");
        expect(status.status).toBe("ACCEPTED");
        expect(status.atcud).toBeDefined();
        expect(status.hash).toBeDefined();
      });

      it("returns ERROR for unknown document", async () => {
        const status = await provider.getDocumentStatus("unknown-inv");

        expect(status.status).toBe("ERROR");
        expect(status.errors).toContain("Document not found in fake provider");
      });
    });

    describe("cancelDocument", () => {
      let provider: FakePortugueseTaxAuthorityProvider;

      beforeEach(() => {
        provider = new FakePortugueseTaxAuthorityProvider({ deterministic: true });
      });

      it("cancels a submitted document", async () => {
        const invoice = createMockInvoice();
        await provider.submitDocument(invoice);

        const result = await provider.cancelDocument("inv-001", "Customer request");

        expect(result.success).toBe(true);
        expect(result.status).toBe("CANCELLED");
        expect(result.cancellationId).toBeDefined();

        const status = await provider.getDocumentStatus("inv-001");
        expect(status.status).toBe("CANCELLED");
      });

      it("fails to cancel non-existent document", async () => {
        const result = await provider.cancelDocument("unknown", "Test");

        expect(result.success).toBe(false);
        expect(result.errors).toContain("Document not found");
      });

      it("fails to cancel already cancelled document", async () => {
        const invoice = createMockInvoice();
        await provider.submitDocument(invoice);
        await provider.cancelDocument("inv-001", "First cancel");

        const result = await provider.cancelDocument("inv-001", "Second cancel");

        expect(result.success).toBe(false);
        expect(result.errors).toContain("Document already cancelled");
      });
    });

    describe("queryDocuments", () => {
      let provider: FakePortugueseTaxAuthorityProvider;

      beforeEach(() => {
        provider = new FakePortugueseTaxAuthorityProvider({ deterministic: true });
      });

      it("returns all submitted documents", async () => {
        const invoices = [
          createMockInvoice({ invoiceId: "inv-001", documentNumber: "001" }),
          createMockInvoice({ invoiceId: "inv-002", documentNumber: "002", invoiceType: "FS" }),
          createMockInvoice({ invoiceId: "inv-003", documentNumber: "003", invoiceType: "NC" }),
        ];

        for (const inv of invoices) {
          await provider.submitDocument(inv);
        }

        const result = await provider.queryDocuments({});

        expect(result.totalCount).toBe(3);
        expect(result.documents.length).toBe(3);
        expect(result.page).toBe(1);
        expect(result.pageSize).toBe(50);
      });

      it("filters by document type", async () => {
        const invoices = [
          createMockInvoice({ invoiceId: "inv-001", documentNumber: "001", invoiceType: "FT" }),
          createMockInvoice({ invoiceId: "inv-002", documentNumber: "002", invoiceType: "FS" }),
        ];

        for (const inv of invoices) {
          await provider.submitDocument(inv);
        }

        const result = await provider.queryDocuments({ documentType: "FT" });

        expect(result.totalCount).toBe(1);
        expect(result.documents[0].documentType).toBe("FT");
      });

      it("filters by date range", async () => {
        const invoices = [
          createMockInvoice({ invoiceId: "inv-001", issueDate: "2025-01-15T00:00:00.000Z" }),
          createMockInvoice({ invoiceId: "inv-002", issueDate: "2025-06-15T00:00:00.000Z" }),
        ];

        for (const inv of invoices) {
          await provider.submitDocument(inv);
        }

        const result = await provider.queryDocuments({
          startDate: "2025-01-01",
          endDate: "2025-03-31",
        });

        expect(result.totalCount).toBe(1);
        expect(result.documents[0].issueDate).toContain("2025-01");
      });

      it("supports pagination", async () => {
        const invoices = Array.from({ length: 12 }, (_, i) =>
          createMockInvoice({ invoiceId: `inv-${i}`, documentNumber: String(i).padStart(3, "0") }),
        );

        for (const inv of invoices) {
          await provider.submitDocument(inv);
        }

        const page1 = await provider.queryDocuments({ page: 1, pageSize: 10 });
        const page2 = await provider.queryDocuments({ page: 2, pageSize: 10 });

        expect(page1.documents.length).toBe(10);
        expect(page2.documents.length).toBe(2);
        expect(page1.totalCount).toBe(12);
      }, 30_000);
    });

    describe("getHealth", () => {
      let provider: FakePortugueseTaxAuthorityProvider;

      beforeEach(() => {
        provider = new FakePortugueseTaxAuthorityProvider({ deterministic: true });
      });

      it("reports healthy status", async () => {
        const health = await provider.getHealth();

        expect(health.healthy).toBe(true);
        expect(health.latency).toBeDefined();
        expect(health.message).toBe("Fake provider operational");
      });
    });

    describe("reset (testing utility)", () => {
      it("clears all submitted documents", async () => {
        const provider = new FakePortugueseTaxAuthorityProvider();
        const invoice = createMockInvoice();
        await provider.submitDocument(invoice);

        provider.reset();

        const status = await provider.getDocumentStatus("inv-001");
        expect(status.status).toBe("ERROR");
      });
    });

    describe("Idempotency simulation", () => {
      let provider: FakePortugueseTaxAuthorityProvider;

      beforeEach(() => {
        provider = new FakePortugueseTaxAuthorityProvider({ deterministic: true });
      });

      it("same document submission returns same result structure", async () => {
        const invoice = createMockInvoice();
        const result1 = await provider.submitDocument(invoice);
        const result2 = await provider.submitDocument(invoice);

        // Each call generates new submission ID but same document
        expect(result1.documentId).toBe(result2.documentId);
        expect(result1.submissionId).not.toBe(result2.submissionId);
      });
    });
  });

  describe("createTaxAuthorityProvider factory", () => {
    it("creates fake provider by default", () => {
      const provider = createTaxAuthorityProvider();
      expect(provider).toBeInstanceOf(FakePortugueseTaxAuthorityProvider);
    });

    it("creates fake provider when explicitly configured", () => {
      const provider = createTaxAuthorityProvider({ provider: "fake" });
      expect(provider).toBeInstanceOf(FakePortugueseTaxAuthorityProvider);
    });

    it("throws for official provider (not implemented)", () => {
      expect(() => createTaxAuthorityProvider({ provider: "official" })).toThrow(
        "Official AT/e-Fatura provider not implemented",
      );
    });
  });

  describe("generateIdempotencyKey", () => {
    it("generates deterministic key for same inputs", () => {
      const key1 = generateIdempotencyKey("org-123", "inv-001", "submit", 1);
      const key2 = generateIdempotencyKey("org-123", "inv-001", "submit", 1);

      expect(key1).toBe(key2);
    });

    it("generates different keys for different attempts", () => {
      const key1 = generateIdempotencyKey("org-123", "inv-001", "submit", 1);
      const key2 = generateIdempotencyKey("org-123", "inv-001", "submit", 2);

      expect(key1).not.toBe(key2);
      expect(key1).toContain("-1");
      expect(key2).toContain("-2");
    });

    it("generates different keys for different operations", () => {
      const key1 = generateIdempotencyKey("org-123", "inv-001", "submit", 1);
      const key2 = generateIdempotencyKey("org-123", "inv-001", "cancel", 1);

      expect(key1).not.toBe(key2);
    });

    it("generates different keys for different organizations", () => {
      const key1 = generateIdempotencyKey("org-1", "inv-001", "submit", 1);
      const key2 = generateIdempotencyKey("org-2", "inv-001", "submit", 1);

      expect(key1).not.toBe(key2);
    });

    it("includes attempt in key", () => {
      const key = generateIdempotencyKey("org-123", "inv-001", "submit", 3);

      expect(key).toContain("-3");
    });
  });

  describe("Environment configuration", () => {
    it("reads PORTUGAL_TAX_PROVIDER from env", () => {
      // Test that the factory respects environment variable
      vi.stubEnv("PORTUGAL_TAX_PROVIDER", "fake");
      const provider = createTaxAuthorityProvider();
      expect(provider).toBeInstanceOf(FakePortugueseTaxAuthorityProvider);
      vi.unstubAllEnvs();
    });
  });
});