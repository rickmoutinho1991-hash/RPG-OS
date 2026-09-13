import { describe, it, expect } from "vitest";
import {
  createInvoiceDraft,
  calculateAmountDue,
  recordPayment,
  recordPartialPayment,
  voidInvoice,
  markUncollectible,
  canEditInvoice,
  canVoidInvoice,
  canRefundInvoice,
  canRecordPayment,
  protectInvoiceInvariants,
  type Invoice,
  type InvoiceCustomer,
  type InvoiceSupplier,
  type InvoiceLine,
  type InvoicePaymentTerms,
  type VatRate,
  type VatBreakdown,
  type InvoiceType,
} from "../../revenue/invoices";

describe("Invoice Module - Portuguese Fiscal Support (FASE 10H+)", () => {
  const now = new Date().toISOString();

  const individualCustomer: InvoiceCustomer = {
    id: "cust-001",
    name: "João Silva",
    taxNumber: "212345672",
    nifType: "INDIVIDUAL",
    address: "Rua das Flores 10",
    postalCode: "1000-001",
    city: "Lisboa",
    country: "PT",
  };

  const companyCustomer: InvoiceCustomer = {
    id: "cust-002",
    name: "Tech Solutions Lda",
    taxNumber: "501234560",
    nifType: "COMPANY",
    address: "Avenida da República 50",
    postalCode: "4000-123",
    city: "Porto",
    country: "PT",
  };

  const supplier: InvoiceSupplier = {
    id: "supp-001",
    name: "Fornecedor S/A",
    taxNumber: "512345678",
    nifType: "COMPANY",
    address: "Rua do Comércio 5",
    postalCode: "3000-000",
    city: "Faro",
    country: "PT",
  };

  const paymentTerms: InvoicePaymentTerms = {
    dueDays: 30,
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    issueDate: now,
    earlyDiscountCents: 100,
    earlyDiscountDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
  };

  describe("createInvoiceDraft", () => {
    it("creates a basic invoice draft with Portuguese concepts", () => {
      const invoice = createInvoiceDraft({
        organizationId: "org-123",
        invoiceType: "FT",
        series: "2025",
        documentNumber: "001",
        customer: individualCustomer,
        supplier,
        paymentTerms,
      });

      expect(invoice.invoiceId).toBeDefined();
      expect(invoice.organizationId).toBe("org-123");
      expect(invoice.invoiceType).toBe("FT");
      expect(invoice.series).toBe("2025");
      expect(invoice.documentNumber).toBe("001");
      expect(invoice.customer.name).toBe("João Silva");
      expect(invoice.customer.taxNumber).toBe("212345672");
      expect(invoice.customer.nifType).toBe("INDIVIDUAL");
      expect(invoice.supplier).toBeDefined();
      expect(invoice.paymentTerms).toBeDefined();
      expect(invoice.status).toBe("draft");
      expect(invoice.subtotalCents).toBe(0);
      expect(invoice.totalCents).toBe(0);
      expect(invoice.vatBreakdown).toEqual([]);
    });

    it("creates an invoice draft with lines and VAT breakdown", () => {
      const lines: InvoiceLine[] = [
        {
          lineId: "line-1",
          description: "Serviço de consultoria",
          unitAmountCents: 5000,
          vatRate: "23",
          taxCents: 1150, // 5000 * 23% = 1150
        },
        {
          lineId: "line-2",
          description: "Material de escritório",
          unitAmountCents: 2000,
          vatRate: "13",
          taxCents: 260, // 2000 * 13% = 260
        },
      ];

      const invoice = createInvoiceDraft({
        organizationId: "org-123",
        invoiceType: "FT",
        series: "2025",
        documentNumber: "002",
        customer: individualCustomer,
        lines,
        paymentTerms,
      });

      expect(invoice.subtotalCents).toBe(7000);
      expect(invoice.taxCents).toBe(1410); // 1150 + 260
      expect(invoice.totalCents).toBeGreaterThan(0);
      expect(invoice.vatBreakdown.length).toBe(2);
      // Check both VAT rates are present (order may vary)
      // Use non-null assertion since createInvoiceDraft always sets vatBreakdown
      const rates = invoice.vatBreakdown!.map((v) => v.rate);
      expect(rates).toContain("23");
      expect(rates).toContain("13");
    });

    it("creates an invoice draft for fatura simplificada (FS)", () => {
      const invoice = createInvoiceDraft({
        organizationId: "org-123",
        invoiceType: "FS",
        series: "2025",
        documentNumber: "003",
        customer: individualCustomer,
        paymentTerms,
      });

      expect(invoice.invoiceType).toBe("FS");
    });

    it("creates an invoice draft for nota de crédito (NC)", () => {
      const invoice = createInvoiceDraft({
        organizationId: "org-123",
        invoiceType: "NC",
        series: "2025",
        documentNumber: "004",
        customer: companyCustomer,
        paymentTerms,
      });

      expect(invoice.invoiceType).toBe("NC");
    });

    it("creates an invoice draft for nota de débito (ND)", () => {
      const invoice = createInvoiceDraft({
        organizationId: "org-123",
        invoiceType: "ND",
        series: "2025",
        documentNumber: "005",
        customer: companyCustomer,
        paymentTerms,
      });

      expect(invoice.invoiceType).toBe("ND");
    });

    it("creates an invoice draft for fatura-recibo (FR)", () => {
      const invoice = createInvoiceDraft({
        organizationId: "org-123",
        invoiceType: "FR",
        series: "2025",
        documentNumber: "006",
        customer: individualCustomer,
        paymentTerms,
      });

      expect(invoice.invoiceType).toBe("FR");
    });
  });

describe("protectInvoiceInvariants", () => {
  it("validates a correct invoice with VAT breakdown", () => {
    const invoice: Invoice = {
      invoiceId: "inv-001",
      organizationId: "org-123",
      invoiceType: "FT",
      series: "2025",
      documentNumber: "001",
      customer: individualCustomer,
      subtotalCents: 10000,
      discountCents: 0,
      feeCents: 0,
      taxCents: 2300,
      totalCents: 12300,  // 10000 - 0 + 0 + 2300 = 12300
      paidCents: 0,
      amountDueCents: 12300,
      status: "open",
      createdAt: now,
      updatedAt: now,
      issueDate: now,
      dueDate: now,
      billingPeriodStart: now,
      billingPeriodEnd: now,
      currency: "EUR",
      vatBreakdown: [
        { rate: "23", ratePercent: 23, amountCents: 2300, baseCents: 10000 },
      ],
    };

      const result = protectInvoiceInvariants(invoice);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("rejects invoice with VAT breakdown total mismatch", () => {
      const invoice: Invoice = {
        invoiceId: "inv-002",
        organizationId: "org-123",
        invoiceType: "FT",
        series: "2025",
        documentNumber: "002",
        customer: individualCustomer,
        subtotalCents: 10000,
        discountCents: 0,
        feeCents: 0,
        taxCents: 2000,
        totalCents: 11000,
        paidCents: 0,
        amountDueCents: 11000,
        status: "open",
        createdAt: now,
        updatedAt: now,
        issueDate: now,
        dueDate: now,
        billingPeriodStart: now,
        billingPeriodEnd: now,
        currency: "EUR",
        vatBreakdown: [
          { rate: "23", ratePercent: 23, amountCents: 1500, baseCents: 10000 },
        ],
      };

      const result = protectInvoiceInvariants(invoice);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "VAT breakdown total (1500) !== total tax (2000)",
      );
    });

    it("rejects invoice with invalid VAT rate", () => {
      const invoice: Invoice = {
        invoiceId: "inv-003",
        organizationId: "org-123",
        invoiceType: "FT",
        series: "2025",
        documentNumber: "003",
        customer: individualCustomer,
        subtotalCents: 10000,
        discountCents: 0,
        feeCents: 0,
        taxCents: 1000,
        totalCents: 11000,
        paidCents: 0,
        amountDueCents: 11000,
        status: "open",
        createdAt: now,
        updatedAt: now,
        issueDate: now,
        dueDate: now,
        billingPeriodStart: now,
        billingPeriodEnd: now,
        currency: "EUR",
        vatBreakdown: [
          { rate: "99" as VatRate, ratePercent: 99, amountCents: 1000, baseCents: 10000 },
        ],
      };

      const result = protectInvoiceInvariants(invoice);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid VAT rate: 99");
    });

    it("rejects invoice with negative totals", () => {
      const invoice: Invoice = {
        invoiceId: "inv-004",
        organizationId: "org-123",
        invoiceType: "FT",
        series: "2025",
        documentNumber: "004",
        customer: individualCustomer,
        subtotalCents: -100,
        discountCents: 0,
        feeCents: 0,
        taxCents: 0,
        totalCents: -100,
        paidCents: 0,
        amountDueCents: -100,
        status: "open",
        createdAt: now,
        updatedAt: now,
        issueDate: now,
        dueDate: now,
        billingPeriodStart: now,
        billingPeriodEnd: now,
        currency: "EUR",
        vatBreakdown: [],
      };

      const result = protectInvoiceInvariants(invoice);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Subtotal cannot be negative");
    });

    it("validates invoice invariants for fatura simplificada", () => {
      const invoice: Invoice = {
        invoiceId: "inv-005",
        organizationId: "org-123",
        invoiceType: "FS",
        series: "2025",
        documentNumber: "005",
        customer: individualCustomer,
        subtotalCents: 5000,
        discountCents: 0,
        feeCents: 125,
        taxCents: 1150,
        totalCents: 6275,  // 5000 - 0 + 125 + 1150 = 6275
        paidCents: 0,
        amountDueCents: 6275,
        status: "open",
        createdAt: now,
        updatedAt: now,
        issueDate: now,
        dueDate: now,
        billingPeriodStart: now,
        billingPeriodEnd: now,
        currency: "EUR",
        vatBreakdown: [],
      };

      const result = protectInvoiceInvariants(invoice);
      expect(result.valid).toBe(true);
    });
  });

  describe("calculateAmountDue", () => {
    it("calculates amount due correctly", () => {
      const invoice: Invoice = {
        invoiceId: "inv-001",
        organizationId: "org-123",
        invoiceType: "FT",
        series: "2025",
        documentNumber: "001",
        customer: individualCustomer,
        subtotalCents: 10000,
        discountCents: 500,
        feeCents: 250,
        taxCents: 2300,
        totalCents: 11800,
        paidCents: 3000,
        amountDueCents: 0, // will be calculated
        status: "open",
        createdAt: now,
        updatedAt: now,
        issueDate: now,
        dueDate: now,
        billingPeriodStart: now,
        billingPeriodEnd: now,
        currency: "EUR",
        vatBreakdown: [],
      };

      // Fix the amountDueCents
      invoice.amountDueCents = calculateAmountDue(invoice);
      expect(invoice.amountDueCents).toBe(8800); // 11800 - 3000
    });
  });

  describe("recordPayment", () => {
    it("records a full payment and marks invoice as paid", () => {
      const invoice: Invoice = {
        invoiceId: "inv-001",
        organizationId: "org-123",
        invoiceType: "FT",
        series: "2025",
        documentNumber: "001",
        customer: individualCustomer,
        subtotalCents: 10000,
        discountCents: 0,
        feeCents: 250,
        taxCents: 2300,
        totalCents: 12550,
        paidCents: 0,
        amountDueCents: 12550,
        status: "open",
        createdAt: now,
        updatedAt: now,
        issueDate: now,
        dueDate: now,
        billingPeriodStart: now,
        billingPeriodEnd: now,
        currency: "EUR",
        vatBreakdown: [],
      };

      const updated = recordPayment(invoice, 12550);
      expect(updated.paidCents).toBe(12550);
      expect(updated.status).toBe("paid");
      expect(updated.amountDueCents).toBe(0);
    });

    it("records a partial payment and marks invoice as partially_paid", () => {
      const invoice: Invoice = {
        invoiceId: "inv-001",
        organizationId: "org-123",
        invoiceType: "FT",
        series: "2025",
        documentNumber: "001",
        customer: individualCustomer,
        subtotalCents: 10000,
        discountCents: 0,
        feeCents: 250,
        taxCents: 2300,
        totalCents: 12550,
        paidCents: 0,
        amountDueCents: 12550,
        status: "open",
        createdAt: now,
        updatedAt: now,
        issueDate: now,
        dueDate: now,
        billingPeriodStart: now,
        billingPeriodEnd: now,
        currency: "EUR",
        vatBreakdown: [],
      };

      const updated = recordPartialPayment(invoice, 5000);
      expect(updated.paidCents).toBe(5000);
      expect(updated.status).toBe("partially_paid");
      expect(updated.amountDueCents).toBe(7550); // 12550 - 5000
    });
  });

  describe("voidInvoice and markUncollectible", () => {
    it("voids an invoice", () => {
      const invoice: Invoice = {
        invoiceId: "inv-001",
        organizationId: "org-123",
        invoiceType: "FT",
        series: "2025",
        documentNumber: "001",
        customer: individualCustomer,
        subtotalCents: 1000,
        discountCents: 0,
        feeCents: 0,
        taxCents: 0,
        totalCents: 1000,
        paidCents: 0,
        amountDueCents: 0,
        status: "open",
        createdAt: now,
        updatedAt: now,
        issueDate: now,
        dueDate: now,
        billingPeriodStart: now,
        billingPeriodEnd: now,
        currency: "EUR",
        vatBreakdown: [],
      };

      const voided = voidInvoice(invoice);
      expect(voided.status).toBe("void");
    });

    it("marks an invoice as uncollectible", () => {
      const invoice: Invoice = {
        invoiceId: "inv-001",
        organizationId: "org-123",
        invoiceType: "FT",
        series: "2025",
        documentNumber: "001",
        customer: individualCustomer,
        subtotalCents: 1000,
        discountCents: 0,
        feeCents: 0,
        taxCents: 0,
        totalCents: 1000,
        paidCents: 0,
        amountDueCents: 1000,
        status: "open",
        createdAt: now,
        updatedAt: now,
        issueDate: now,
        dueDate: now,
        billingPeriodStart: now,
        billingPeriodEnd: now,
        currency: "EUR",
        vatBreakdown: [],
      };

      const uncollectible = markUncollectible(invoice);
      expect(uncollectible.status).toBe("uncollectible");
    });
  });

  describe("canEditInvoice, canVoidInvoice, canRefundInvoice, canRecordPayment", () => {
    it("canEditInvoice returns true for draft and open", () => {
      expect(canEditInvoice({ status: "draft" as const } as Invoice)).toBe(true);
      expect(canEditInvoice({ status: "open" as const } as Invoice)).toBe(true);
      expect(canEditInvoice({ status: "paid" as const } as Invoice)).toBe(false);
      expect(canEditInvoice({ status: "void" as const } as Invoice)).toBe(false);
    });

    it("canVoidInvoice returns true for non-paid, non-void invoices", () => {
      expect(canVoidInvoice({ status: "draft" as const } as Invoice)).toBe(true);
      expect(canVoidInvoice({ status: "open" as const } as Invoice)).toBe(true);
      expect(canVoidInvoice({ status: "paid" as const } as Invoice)).toBe(false);
      expect(canVoidInvoice({ status: "void" as const } as Invoice)).toBe(false);
    });

    it("canRefundInvoice returns true only for paid invoices", () => {
      expect(canRefundInvoice({ status: "paid" as const } as Invoice)).toBe(true);
      expect(canRefundInvoice({ status: "open" as const } as Invoice)).toBe(false);
      expect(canRefundInvoice({ status: "void" as const } as Invoice)).toBe(false);
    });

    it("canRecordPayment returns true for non-paid, non-void invoices", () => {
      expect(canRecordPayment({ status: "draft" as const } as Invoice)).toBe(true);
      expect(canRecordPayment({ status: "open" as const } as Invoice)).toBe(true);
      expect(canRecordPayment({ status: "paid" as const } as Invoice)).toBe(false);
      expect(canRecordPayment({ status: "void" as const } as Invoice)).toBe(false);
    });
  });
});