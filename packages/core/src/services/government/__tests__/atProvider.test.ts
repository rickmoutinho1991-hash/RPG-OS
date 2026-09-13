import { describe, it, expect, beforeEach } from "vitest";
import { FakeATProvider } from "../atProvider";
import { GovernmentEnvironment, GovernmentCapability, GovernmentConnectionConfig } from "../governmentIntegration";
import type { Invoice, InvoiceType } from "../../../types/invoice";

const createMockInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  invoiceId: "inv-001",
  organizationId: "org-123",
  invoiceType: "FT" as InvoiceType,
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

describe("ATProvider - Phase 10J-A", () => {
  describe("FakeATProvider", () => {
    let provider: FakeATProvider;

    beforeEach(() => {
      provider = new FakeATProvider({ organizationNif: "501234560" });
    });

    describe("metadata", () => {
      it("has correct provider metadata", () => {
        expect(provider.metadata.providerId).toBe("AT");
        expect(provider.metadata.country).toBe("PT");
        expect(provider.metadata.environment).toBe("development");
        expect(provider.metadata.capabilities).toContain("SUBMIT_INVOICE");
        expect(provider.metadata.capabilities).toContain("QUERY_INVOICE");
        expect(provider.metadata.capabilities).toContain("CANCEL_INVOICE");
        expect(provider.metadata.capabilities).toContain("VALIDATE_INVOICE");
        expect(provider.metadata.capabilities).toContain("SAFT_EXPORT");
        expect(provider.metadata.capabilities).toContain("REAL_TIME_STATUS");
        expect(provider.metadata.capabilities).toContain("WEBHOOK_NOTIFICATIONS");
        expect(provider.metadata.authMethod).toBe("OAUTH2_PKCE");
        expect(provider.metadata.sandboxAvailable).toBe(true);
        expect(provider.metadata.officialAvailable).toBe(true);
      });
    });

    describe("supports", () => {
      it("returns supported for AT capabilities", () => {
        const result = provider.supports("SUBMIT_INVOICE");
        expect(result.providerId).toBe("AT");
        expect(result.capability).toBe("SUBMIT_INVOICE");
        expect(result.supported).toBe(true);
      });

      it("returns unsupported for non-AT capabilities", () => {
        const result = provider.supports("AUTHENTICATION");
        expect(result.supported).toBe(false);
        expect(result.details).toContain("not supported");
      });
    });

    describe("getHealth", () => {
      it("reports healthy status", async () => {
        const health = await provider.getHealth();

        expect(health.providerId).toBe("AT");
        expect(health.healthy).toBe(true);
        expect(health.latencyMs).toBeGreaterThanOrEqual(0);
        expect(health.message).toBeDefined();
        expect(health.checkedAt).toBeDefined();
      });
    });

    describe("connect", () => {
      it("connects successfully with valid organizationId", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "AT",
          environment: "development",
          scopes: ["invoices.submit", "invoices.read"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        const result = await provider.connect(config);

        expect(result.success).toBe(true);
        expect(result.connectionId).toBe("conn-001");
        expect(result.expiresAt).toBeDefined();
      });

      it("fails without organizationId", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "",
          userId: "user-123",
          providerId: "AT",
          environment: "development",
          scopes: ["invoices.submit"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        const result = await provider.connect(config);

        expect(result.success).toBe(false);
        expect(result.error).toContain("organizationId");
      });
    });

    describe("disconnect", () => {
      it("disconnects existing connection", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "AT",
          environment: "development",
          scopes: ["invoices.submit"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);
        const result = await provider.disconnect("conn-001");

        expect(result.success).toBe(true);
      });

      it("fails for non-existent connection", async () => {
        const result = await provider.disconnect("non-existent");
        expect(result.success).toBe(false);
        expect(result.error).toContain("not found");
      });
    });

    describe("getConnectionStatus", () => {
      it("returns connection status without sensitive data", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "AT",
          environment: "development",
          scopes: ["invoices.submit", "invoices.read"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);
        const status = await provider.getConnectionStatus("conn-001");

        expect(status).toBeDefined();
        expect(status?.connectionId).toBe("conn-001");
        expect(status?.organizationId).toBe("org-123");
        expect(status?.scopes).toEqual(["invoices.submit", "invoices.read"]);
      });

      it("returns null for non-existent connection", async () => {
        const status = await provider.getConnectionStatus("non-existent");
        expect(status).toBeNull();
      });
    });

    describe("submitDocument", () => {
      it("submits valid document successfully", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "AT",
          environment: "development",
          scopes: ["invoices.submit"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);

        const invoice = createMockInvoice();
        const idempotencyKey = "idem-001";

        const result = await provider.submitDocument("conn-001", invoice, idempotencyKey);

        expect(result.organizationId).toBe("org-123");
        expect(result.connectionId).toBe("conn-001");
        expect(result.idempotencyKey).toBe(idempotencyKey);
        expect(result.status).toBe("ACCEPTED");
        expect(result.externalReference).toBeDefined();
        expect(result.atcud).toBeDefined();
      });

      it("rejects invalid document (zero total)", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "AT",
          environment: "development",
          scopes: ["invoices.submit"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);

        const invoice = createMockInvoice({ totalCents: 0 });
        const result = await provider.submitDocument("conn-001", invoice, "idem-001");

        expect(result.status).toBe("REJECTED");
        expect(result.error).toBeDefined();
      });

      it("throws for wrong organization", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "AT",
          environment: "development",
          scopes: ["invoices.submit"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);

        const invoice = createMockInvoice({ organizationId: "org-456" });
        await expect(provider.submitDocument("conn-001", invoice, "idem-001")).rejects.toThrow("Organization mismatch");
      });

      it("throws for non-existent connection", async () => {
        const invoice = createMockInvoice();
        await expect(provider.submitDocument("non-existent", invoice, "idem-001")).rejects.toThrow("Connection not found");
      });
    });

    describe("getDocumentStatus", () => {
      it("returns status for submitted document", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "AT",
          environment: "development",
          scopes: ["invoices.read"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);

        const invoice = createMockInvoice({ invoiceId: "inv-001" });
        await provider.submitDocument("conn-001", invoice, "idem-001");

        const status = await provider.getDocumentStatus("conn-001", "inv-001");

        expect(status.status).toBe("SUCCESS");
        expect(status.documentId).toBe("inv-001");
        expect(status.result?.status).toBe("ACCEPTED");
        expect(status.result?.atcud).toBeDefined();
      });

      it("throws for non-existent connection", async () => {
        await expect(provider.getDocumentStatus("non-existent", "inv-001")).rejects.toThrow("Connection not found");
      });
    });

    describe("cancelDocument", () => {
      it("cancels submitted document", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "AT",
          environment: "development",
          scopes: ["invoices.submit", "invoices.cancel"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);

        const invoice = createMockInvoice({ invoiceId: "inv-001" });
        await provider.submitDocument("conn-001", invoice, "idem-001");

        const result = await provider.cancelDocument("conn-001", "inv-001", "Customer request");

        expect(result.success).toBe(true);
        expect(result.cancellationId).toBeDefined();
      });

      it("fails for non-existent document", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "AT",
          environment: "development",
          scopes: ["invoices.cancel"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);

        const result = await provider.cancelDocument("conn-001", "non-existent", "Test");
        expect(result.success).toBe(false);
        expect(result.error).toContain("not found");
      });
    });

    describe("queryDocuments", () => {
      it("returns submitted documents with filters", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "AT",
          environment: "development",
          scopes: ["invoices.read"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);

        const invoices = [
          createMockInvoice({ invoiceId: "inv-001", documentNumber: "001", invoiceType: "FT" }),
          createMockInvoice({ invoiceId: "inv-002", documentNumber: "002", invoiceType: "FS" }),
        ];

        for (const inv of invoices) {
          await provider.submitDocument("conn-001", inv, `idem-${inv.invoiceId}`);
        }

        const result = await provider.queryDocuments("conn-001", {});

        expect(result.totalCount).toBe(2);
        expect(result.documents.length).toBe(2);
      });

      it("filters by document type", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "AT",
          environment: "development",
          scopes: ["invoices.read"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);

        const invoices = [
          createMockInvoice({ invoiceId: "inv-001", documentNumber: "001", invoiceType: "FT" }),
          createMockInvoice({ invoiceId: "inv-002", documentNumber: "002", invoiceType: "FS" }),
        ];

        for (const inv of invoices) {
          await provider.submitDocument("conn-001", inv, `idem-${inv.invoiceId}`);
        }

        const result = await provider.queryDocuments("conn-001", { documentType: "FT" });
        expect(result.totalCount).toBe(1);
        expect(result.documents[0].documentType).toBe("FT");
      });
    });

    describe("exportDocuments", () => {
      it("exports documents in SAFT-PT format", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "AT",
          environment: "development",
          scopes: ["saft.export"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);

        const result = await provider.exportDocuments("conn-001", "SAFT-PT", {
          startDate: "2025-01-01",
          endDate: "2025-01-31",
        });

        expect(result.exportId).toBeDefined();
        expect(result.format).toBe("SAFT-PT");
        expect(result.data).toContain("SAFT-PT");
      });
    });

    describe("synchronize", () => {
      it("performs sync successfully", async () => {
        const config: GovernmentConnectionConfig = {
          connectionId: "conn-001",
          organizationId: "org-123",
          userId: "user-123",
          providerId: "AT",
          environment: "development",
          scopes: ["invoices.read"],
          status: "DISCONNECTED",
          connectedAt: new Date().toISOString(),
        };

        await provider.connect(config);

        const result = await provider.synchronize("conn-001");

        expect(result.success).toBe(true);
        expect(result.syncedCount).toBe(0);
        expect(result.errors).toHaveLength(0);
        expect(result.lastSyncAt).toBeDefined();
      });
    });
  });
});