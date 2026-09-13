import { describe, it, expect, beforeEach } from "vitest";
import {
  SaftPtExporter,
  createTestSaftPtConfig,
  type SaftPtExportConfig,
  type SaftPtExport,
  type Invoice,
  type InvoiceType,
  type InvoiceCustomer,
  type InvoiceLine,
  type VatBreakdown,
} from "../../revenue";

describe("SAF-T PT Foundation - Phase 10I-F", () => {
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
    lines: [
      {
        lineId: "line-1",
        description: "Serviço de consultoria",
        unitAmountCents: 10000,
        vatRate: "23",
        taxCents: 2300,
      },
    ],
    issueDate: "2025-01-15T00:00:00.000Z",
    dueDate: "2025-02-14T00:00:00.000Z",
    billingPeriodStart: "2025-01-15T00:00:00.000Z",
    billingPeriodEnd: "2025-01-15T00:00:00.000Z",
    currency: "EUR",
    ...overrides,
  });

  const createMockConfig = (invoices: Invoice[]): SaftPtExportConfig => ({
    organizationId: "org-123",
    fiscalYear: 2025,
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    company: {
      taxRegistrationNumber: "501234560",
      companyName: "Empresa Teste Lda",
      address: {
        street: "Rua da Empresa",
        number: "100",
        postalCode: "1000-100",
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
  });

  describe("SaftPtExporter", () => {
    let exporter: SaftPtExporter;

    beforeEach(() => {
      exporter = new SaftPtExporter();
    });

    it("exports a basic invoice to SAF-T PT", async () => {
      const invoice = createMockInvoice();
      const config = createMockConfig([invoice]);
      const result = await exporter.exportToSaftPt(config);

      expect(result.header.auditFileVersion).toBe("1.04_01");
      expect(result.header.company.taxRegistrationNumber).toBe("501234560");
      expect(result.header.company.companyName).toBe("Empresa Teste Lda");
      expect(result.header.fiscalYear).toBe(2025);
      expect(result.header.currency).toBe("EUR");
      expect(result.header.software.productName).toBe("RPG-OS Fiscal Engine");

      expect(result.sourceDocuments.length).toBe(1);
      const doc = result.sourceDocuments[0];
      expect(doc.documentType).toBe("FT");
      expect(doc.series).toBe("2025");
      expect(doc.documentNumber).toBe("001");
      expect(doc.documentStatus).toBe("N");
      expect(doc.customer.taxRegistrationNumber).toBe("212345672");
      expect(doc.customer.name).toBe("Cliente Teste");
    });

    it("exports multiple invoices", async () => {
      const invoices = [
        createMockInvoice({ invoiceId: "inv-001", documentNumber: "001" }),
        createMockInvoice({ invoiceId: "inv-002", documentNumber: "002", invoiceType: "FS" }),
        createMockInvoice({ invoiceId: "inv-003", documentNumber: "003", invoiceType: "NC" }),
      ];
      const config = createMockConfig(invoices);
      const result = await exporter.exportToSaftPt(config);

      expect(result.sourceDocuments.length).toBe(3);
      expect(result.sourceDocuments[0].documentType).toBe("FT");
      expect(result.sourceDocuments[1].documentType).toBe("FS");
      expect(result.sourceDocuments[2].documentType).toBe("NC");
    });

    it("maps document status correctly", async () => {
      const issuedInvoice = createMockInvoice({ status: "open", documentNumber: "001" });
      const voidInvoice = createMockInvoice({ status: "void", documentNumber: "002" });
      const draftInvoice = createMockInvoice({ status: "draft", documentNumber: "003" });

      const config = createMockConfig([issuedInvoice, voidInvoice, draftInvoice]);
      const result = await exporter.exportToSaftPt(config);

      expect(result.sourceDocuments[0].documentStatus).toBe("N"); // Normal
      expect(result.sourceDocuments[1].documentStatus).toBe("A"); // Anulado
      expect(result.sourceDocuments[2].documentStatus).toBe("C"); // Cancelado
    });

    it("includes VAT breakdown in totals", async () => {
      const invoice = createMockInvoice({
        vatBreakdown: [
          { rate: "23", ratePercent: 23, amountCents: 2300, baseCents: 10000 },
          { rate: "6", ratePercent: 6, amountCents: 300, baseCents: 5000 },
        ],
        taxCents: 2600,
        totalCents: 17900,
        lines: [
          { lineId: "line-1", description: "Serviço 23%", unitAmountCents: 10000, vatRate: "23", taxCents: 2300 },
          { lineId: "line-2", description: "Produto 6%", unitAmountCents: 5000, vatRate: "6", taxCents: 300 },
        ],
      });

      const config = createMockConfig([invoice]);
      const result = await exporter.exportToSaftPt(config);

      const doc = result.sourceDocuments[0];
      expect(doc.totals.vatBreakdown.length).toBe(2);
      expect(doc.totals.vatBreakdown[0].vatRate).toBe(23);
      expect(doc.totals.vatBreakdown[1].vatRate).toBe(6);
    });

    it("includes payment terms when available", async () => {
      const invoice = createMockInvoice({
        paymentTerms: {
          dueDays: 30,
          dueDate: "2025-02-14T00:00:00.000Z",
          issueDate: "2025-01-15T00:00:00.000Z",
          earlyDiscountCents: 100,
          earlyDiscountDate: "2025-01-25T00:00:00.000Z",
        },
      });

      const config = createMockConfig([invoice]);
      const result = await exporter.exportToSaftPt(config);

      expect(result.sourceDocuments[0].paymentTerms).toBeDefined();
      expect(result.sourceDocuments[0].paymentTerms?.days).toBe(30);
    });

    it("includes supplier for reverse charge", async () => {
      const invoice = createMockInvoice({
        supplier: {
          id: "supp-001",
          name: "Fornecedor EU",
          taxNumber: "DE123456789",
          nifType: "COMPANY",
          address: "Berliner Str. 1",
          postalCode: "10115",
          city: "Berlin",
          country: "DE",
        },
      });

      const config = createMockConfig([invoice]);
      const result = await exporter.exportToSaftPt(config);

      expect(result.sourceDocuments[0].supplier).toBeDefined();
      expect(result.sourceDocuments[0].supplier?.taxRegistrationNumber).toBe("DE123456789");
      expect(result.sourceDocuments[0].supplier?.partyType).toBe("F");
    });
  });

  describe("Validation", () => {
    let exporter: SaftPtExporter;

    beforeEach(() => {
      exporter = new SaftPtExporter();
    });

    it("validates a correct export", async () => {
      const invoice = createMockInvoice();
      const config = createMockConfig([invoice]);
      const exportData = await exporter.exportToSaftPt(config);

      expect(exportData.validation.isValid).toBe(true);
      expect(exportData.validation.errors).toEqual([]);
      expect(exportData.validation.documentCount).toBe(1);
    });

    it("detects missing company information", async () => {
      const invoice = createMockInvoice();
      const config = createMockConfig([invoice]);
      config.company.taxRegistrationNumber = "";
      config.company.companyName = "";

      const exportData = await exporter.exportToSaftPt(config);

      expect(exportData.validation.isValid).toBe(false);
      expect(exportData.validation.errors.some((e) => e.includes("tax registration"))).toBe(true);
      expect(exportData.validation.errors.some((e) => e.includes("Company name"))).toBe(true);
    });

    it("detects missing customer NIF", async () => {
      const invoice = createMockInvoice({
        customer: { ...createMockInvoice().customer, taxNumber: "" },
      });
      const config = createMockConfig([invoice]);

      const exportData = await exporter.exportToSaftPt(config);

      expect(exportData.validation.isValid).toBe(false);
      expect(exportData.validation.errors.some((e) => e.includes("Customer NIF"))).toBe(true);
    });

    it("detects gross != net + VAT mismatch", async () => {
      const invoice = createMockInvoice({
        totalCents: 13000, // Wrong: should be 12300
      });
      const config = createMockConfig([invoice]);

      const exportData = await exporter.exportToSaftPt(config);

      expect(exportData.validation.isValid).toBe(false);
      expect(exportData.validation.errors.some((e) => e.includes("gross != net + VAT"))).toBe(true);
    });

    it("calculates aggregate totals in validation", async () => {
      const invoices = [
        createMockInvoice({ documentNumber: "001", totalCents: 12300, taxCents: 2300, subtotalCents: 10000 }),
        createMockInvoice({ documentNumber: "002", totalCents: 5000, taxCents: 1000, subtotalCents: 4000 }),
      ];
      const config = createMockConfig(invoices);
      const exportData = await exporter.exportToSaftPt(config);

      expect(exportData.validation.totalGrossAmount).toBe(17300);
      expect(exportData.validation.totalVatAmount).toBe(3300);
      expect(exportData.validation.totalNetAmount).toBe(14000);
    });
  });

  describe("Supported formats", () => {
    it("reports supported formats", () => {
      const exporter = new SaftPtExporter();
      const formats = exporter.getSupportedFormats();

      expect(formats).toContain("SAFT-PT");
      expect(formats).toContain("JSON");
    });
  });

  describe("Test config helper", () => {
    it("creates a valid test configuration", () => {
      const invoices = [createMockInvoice()];
      const config = createTestSaftPtConfig("org-123", invoices);

      expect(config.organizationId).toBe("org-123");
      expect(config.invoices.length).toBe(1);
      expect(config.company.taxRegistrationNumber).toBe("501234560");
      expect(config.software.productName).toBe("RPG-OS Fiscal Engine");
    });
  });

  describe("Edge cases", () => {
    let exporter: SaftPtExporter;

    beforeEach(() => {
      exporter = new SaftPtExporter();
    });

    it("handles invoice without lines (fallback)", async () => {
      const invoice = createMockInvoice({ lines: [] });
      const config = createMockConfig([invoice]);
      const result = await exporter.exportToSaftPt(config);

      expect(result.sourceDocuments[0].lines.length).toBe(1);
      expect(result.sourceDocuments[0].lines[0].description).toBe("Total da fatura");
    });

    it("handles invoice without payment terms", async () => {
      const invoice = createMockInvoice({ paymentTerms: undefined });
      const config = createMockConfig([invoice]);
      const result = await exporter.exportToSaftPt(config);

      expect(result.sourceDocuments[0].paymentTerms).toBeUndefined();
    });

    it("handles invoice without supplier", async () => {
      const invoice = createMockInvoice({ supplier: undefined });
      const config = createMockConfig([invoice]);
      const result = await exporter.exportToSaftPt(config);

      expect(result.sourceDocuments[0].supplier).toBeUndefined();
    });

    it("includes ATCUD and hash when present", async () => {
      const invoice = createMockInvoice({
        atcud: "ATCUD-12345",
        hash: "HASH-12345",
      });
      const config = createMockConfig([invoice]);
      const result = await exporter.exportToSaftPt(config);

      expect(result.sourceDocuments[0].atcud).toBe("ATCUD-12345");
      expect(result.sourceDocuments[0].hash).toBe("HASH-12345");
    });
  });

  describe("SAF-T PT structure compliance (non-certified)", () => {
    let exporter: SaftPtExporter;

    beforeEach(() => {
      exporter = new SaftPtExporter();
    });

    it("includes all required header fields", async () => {
      const invoice = createMockInvoice();
      const config = createMockConfig([invoice]);
      const result = await exporter.exportToSaftPt(config);

      expect(result.header.auditFileVersion).toBeDefined();
      expect(result.header.company).toBeDefined();
      expect(result.header.fiscalYear).toBeDefined();
      expect(result.header.startDate).toBeDefined();
      expect(result.header.endDate).toBeDefined();
      expect(result.header.currency).toBeDefined();
      expect(result.header.generatedAt).toBeDefined();
      expect(result.header.software).toBeDefined();
    });

    it("includes required document fields", async () => {
      const invoice = createMockInvoice();
      const config = createMockConfig([invoice]);
      const result = await exporter.exportToSaftPt(config);

      const doc = result.sourceDocuments[0];
      expect(doc.documentType).toBeDefined();
      expect(doc.series).toBeDefined();
      expect(doc.documentNumber).toBeDefined();
      expect(doc.issueDate).toBeDefined();
      expect(doc.customer).toBeDefined();
      expect(doc.lines).toBeDefined();
      expect(doc.totals).toBeDefined();
    });

    it("marks remaining official schema compliance work", () => {
      // This test documents known limitations
      const limitations = [
        "Full XSD schema validation not implemented",
        "Digital signature/certificate integration pending",
        "Official ATCUD generation not implemented",
        "Hash chain validation not implemented",
        "Periodic control totals not fully implemented",
      ];

      expect(limitations.length).toBeGreaterThan(0);
    });
  });
});