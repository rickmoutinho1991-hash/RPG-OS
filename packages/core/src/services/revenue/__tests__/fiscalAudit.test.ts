import { describe, it, expect, beforeEach } from "vitest";
import {
  createFiscalAuditEvent,
  sanitizeFiscalMetadata,
  InMemoryFiscalAuditLogger,
  FiscalAuditEvents,
  type FiscalAuditAction,
  type AuditSource,
  type FiscalAuditMetadata,
} from "../../revenue";

describe("Fiscal Audit Events - Phase 10I-I", () => {
  let logger: InMemoryFiscalAuditLogger;

  beforeEach(() => {
    logger = new InMemoryFiscalAuditLogger();
  });

  describe("createFiscalAuditEvent", () => {
    it("creates a fiscal audit event with all required fields", () => {
      const event = createFiscalAuditEvent(
        "FISCAL_DOCUMENT_CREATED",
        "user-123",
        "org-456",
        { documentId: "inv-001", totalCents: 10000 },
        "USER",
      );

      expect(event.id).toContain("audit_");
      expect(event.userId).toBe("user-123");
      expect(event.companyId).toBe("org-456");
      expect(event.action).toBe("FISCAL_DOCUMENT_CREATED");
      expect(event.module).toBe("fiscal");
      expect(event.entityType).toBe("invoice");
      expect(event.entityId).toBe("inv-001");
      expect(event.timestamp).toBeDefined();
      expect(event.source).toBe("USER");
      expect(event.metadata.organizationId).toBe("org-456");
      expect(event.metadata.documentId).toBe("inv-001");
      expect(event.metadata.totalCents).toBe(10000);
    });

    it("maps actions to correct entity types", () => {
      const docActions: FiscalAuditAction[] = [
        "FISCAL_DOCUMENT_CREATED",
        "FISCAL_DOCUMENT_ISSUED",
        "FISCAL_DOCUMENT_SUBMITTED",
        "TAX_AUTHORITY_VALIDATION",
      ];

      for (const action of docActions) {
        const event = createFiscalAuditEvent(action, "user", "org", { documentId: "inv-001" });
        expect(event.entityType).toBe("invoice");
      }

      const seriesActions: FiscalAuditAction[] = [
        "FISCAL_SERIES_CREATED",
        "FISCAL_SERIES_UPDATED",
      ];

      for (const action of seriesActions) {
        const event = createFiscalAuditEvent(action, "user", "org", {});
        expect(event.entityType).toBe("series");
      }

      const exportEvent = createFiscalAuditEvent("FISCAL_EXPORT_CREATED", "user", "org", {});
      expect(exportEvent.entityType).toBe("export");

      const reconActions: FiscalAuditAction[] = [
        "FISCAL_DOCUMENT_RECONCILED",
        "FISCAL_DOCUMENT_MISMATCH",
      ];

      for (const action of reconActions) {
        const event = createFiscalAuditEvent(action, "user", "org", { documentId: "inv-001" });
        expect(event.entityType).toBe("reconciliation");
      }
    });

    it("includes source in event", () => {
      const sources: AuditSource[] = ["USER", "SYSTEM", "AUTOMATION", "GOVERNMENT_PROVIDER"];

      for (const source of sources) {
        const event = createFiscalAuditEvent(
          "FISCAL_DOCUMENT_CREATED",
          "user",
          "org",
          {},
          source,
        );
        expect(event.source).toBe(source);
      }
    });

    it("generates unique event IDs", () => {
      const event1 = createFiscalAuditEvent("FISCAL_DOCUMENT_CREATED", "user", "org", {});
      const event2 = createFiscalAuditEvent("FISCAL_DOCUMENT_CREATED", "user", "org", {});

      expect(event1.id).not.toBe(event2.id);
    });
  });

  describe("sanitizeFiscalMetadata", () => {
    it("removes sensitive keys from metadata (case insensitive)", () => {
      const metadata: FiscalAuditMetadata = {
        organizationId: "org-123",
        password: "secret123",
        apiKey: "api-key-123",
        clientSecret: "client-secret",
        certificatePassword: "cert-pass",
        token: "bearer-token",
        totalCents: 10000,
      };

      const sanitized = sanitizeFiscalMetadata(metadata);

      expect(sanitized.password).toBeUndefined();
      expect(sanitized.apiKey).toBeUndefined();
      expect(sanitized.clientSecret).toBeUndefined();
      expect(sanitized.certificatePassword).toBeUndefined();
      expect(sanitized.token).toBeUndefined();
      expect(sanitized.totalCents).toBe(10000);
      expect(sanitized.organizationId).toBe("org-123");
    });

    it("masks NIF (keeps last 3 digits)", () => {
      const metadata: FiscalAuditMetadata = {
        organizationId: "org-123",
        customerNif: "212345672",
      };

      const sanitized = sanitizeFiscalMetadata(metadata);

      expect(sanitized.customerNif).toBe("***672");
    });

    it("does not mask short NIFs", () => {
      const metadata: FiscalAuditMetadata = {
        organizationId: "org-123",
        customerNif: "123",
      };

      const sanitized = sanitizeFiscalMetadata(metadata);

      expect(sanitized.customerNif).toBe("123");
    });
  });

  describe("InMemoryFiscalAuditLogger", () => {
    it("logs and queries events", async () => {
      const event = createFiscalAuditEvent(
        "FISCAL_DOCUMENT_CREATED",
        "user-123",
        "org-456",
        { documentId: "inv-001", totalCents: 10000 },
      );

      await logger.log(event);

      const results = await logger.query({ organizationId: "org-456" });

      expect(results.length).toBe(1);
      expect(results[0].id).toBe(event.id);
    });

    it("filters by organizationId", async () => {
      await logger.log(createFiscalAuditEvent("FISCAL_DOCUMENT_CREATED", "user", "org-1", { documentId: "inv-1" }));
      await logger.log(createFiscalAuditEvent("FISCAL_DOCUMENT_CREATED", "user", "org-2", { documentId: "inv-2" }));

      const results = await logger.query({ organizationId: "org-1" });

      expect(results.length).toBe(1);
      expect(results[0].metadata.organizationId).toBe("org-1");
    });

    it("filters by action", async () => {
      await logger.log(createFiscalAuditEvent("FISCAL_DOCUMENT_CREATED", "user", "org", {}));
      await logger.log(createFiscalAuditEvent("FISCAL_DOCUMENT_ISSUED", "user", "org", {}));

      const results = await logger.query({ action: "FISCAL_DOCUMENT_CREATED" });

      expect(results.length).toBe(1);
      expect(results[0].action).toBe("FISCAL_DOCUMENT_CREATED");
    });

    it("filters by source", async () => {
      await logger.log(createFiscalAuditEvent("FISCAL_DOCUMENT_CREATED", "user", "org", {}, "USER"));
      await logger.log(createFiscalAuditEvent("FISCAL_DOCUMENT_ACCEPTED", "system", "org", {}, "GOVERNMENT_PROVIDER"));

      const results = await logger.query({ source: "GOVERNMENT_PROVIDER" });

      expect(results.length).toBe(1);
      expect(results[0].source).toBe("GOVERNMENT_PROVIDER");
    });

    it("filters by date range", async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const futureDate = new Date(Date.now() + 86400000).toISOString();

      await logger.log(createFiscalAuditEvent("FISCAL_DOCUMENT_CREATED", "user", "org", {}));

      const results = await logger.query({ startDate: pastDate, endDate: futureDate });

      expect(results.length).toBe(1);
    });

    it("sorts by timestamp descending", async () => {
      const event1 = createFiscalAuditEvent("FISCAL_DOCUMENT_CREATED", "user", "org", {});
      await new Promise((r) => setTimeout(r, 10));
      const event2 = createFiscalAuditEvent("FISCAL_DOCUMENT_ISSUED", "user", "org", {});

      await logger.log(event1);
      await logger.log(event2);

      const results = await logger.query({});

      expect(new Date(results[0].timestamp).getTime()).toBeGreaterThanOrEqual(new Date(results[1].timestamp).getTime());
    });

    it("limits results", async () => {
      for (let i = 0; i < 10; i++) {
        await logger.log(createFiscalAuditEvent("FISCAL_DOCUMENT_CREATED", "user", "org", {}));
      }

      const results = await logger.query({ limit: 3 });

      expect(results.length).toBe(3);
    });

    it("sanitizes metadata on log", async () => {
      const event = createFiscalAuditEvent(
        "FISCAL_DOCUMENT_CREATED",
        "user",
        "org",
        { password: "secret", totalCents: 10000 },
      );

      await logger.log(event);

      const results = await logger.query({});
      expect(results[0].metadata.password).toBeUndefined();
      expect(results[0].metadata.totalCents).toBe(10000);
    });
  });

  describe("FiscalAuditEvents creators", () => {
    it("creates document created event", () => {
      const event = FiscalAuditEvents.documentCreated("user", "org", {
        id: "inv-001",
        type: "FT",
        series: "2025",
        number: "001",
        customerNif: "212345672",
        totalCents: 12300,
      });

      expect(event.action).toBe("FISCAL_DOCUMENT_CREATED");
      expect(event.source).toBe("USER");
      expect(event.metadata.documentType).toBe("FT");
      expect(event.metadata.series).toBe("2025");
      expect(event.metadata.documentNumber).toBe("001");
      expect(event.metadata.customerNif).toBe("212345672"); // not masked at creation, masked on log
      expect(event.metadata.totalCents).toBe(12300);
    });

    it("creates document issued event", () => {
      const event = FiscalAuditEvents.documentIssued("user", "org", {
        id: "inv-001",
        type: "FT",
        series: "2025",
        number: "001",
        atcud: "ATCUD-123",
      });

      expect(event.action).toBe("FISCAL_DOCUMENT_ISSUED");
      expect(event.metadata.previousStatus).toBe("draft");
      expect(event.metadata.newStatus).toBe("issued");
      expect(event.metadata.externalReference).toBe("ATCUD-123");
    });

    it("creates document cancelled event", () => {
      const event = FiscalAuditEvents.documentCancelled("user", "org", {
        id: "inv-001",
        type: "FT",
        series: "2025",
        number: "001",
        reason: "Customer request",
      });

      expect(event.action).toBe("FISCAL_DOCUMENT_CANCELLED");
      expect(event.metadata.error).toBe("Customer request");
      expect(event.metadata.previousStatus).toBe("issued");
      expect(event.metadata.newStatus).toBe("cancelled");
    });

    it("creates document submitted event with attempt tracking", () => {
      const event = FiscalAuditEvents.documentSubmitted("user", "org", {
        id: "inv-001",
        type: "FT",
        series: "2025",
        number: "001",
        submissionId: "SUB-123",
        attempt: 2,
      });

      expect(event.action).toBe("FISCAL_DOCUMENT_SUBMITTED");
      expect(event.source).toBe("AUTOMATION");
      expect(event.metadata.externalReference).toBe("SUB-123");
      expect(event.metadata.isRetry).toBe(true);
      expect(event.metadata.attempt).toBe(2);
    });

    it("creates document accepted event from government provider", () => {
      const event = FiscalAuditEvents.documentAccepted("org", {
        id: "inv-001",
        type: "FT",
        series: "2025",
        number: "001",
        atcud: "ATCUD-123",
        hash: "HASH-123",
      });

      expect(event.action).toBe("FISCAL_DOCUMENT_ACCEPTED");
      expect(event.source).toBe("GOVERNMENT_PROVIDER");
      expect(event.metadata.newStatus).toBe("accepted");
    });

    it("creates document rejected event", () => {
      const event = FiscalAuditEvents.documentRejected("org", {
        id: "inv-001",
        type: "FT",
        series: "2025",
        number: "001",
        error: "Invalid NIF",
      });

      expect(event.action).toBe("FISCAL_DOCUMENT_REJECTED");
      expect(event.source).toBe("GOVERNMENT_PROVIDER");
      expect(event.metadata.error).toBe("Invalid NIF");
      expect(event.metadata.newStatus).toBe("rejected");
    });

    it("creates document reconciled event", () => {
      const event = FiscalAuditEvents.documentReconciled("user", "org", {
        id: "inv-001",
        type: "FT",
        series: "2025",
        number: "001",
      }, "REC-BATCH-123");

      expect(event.action).toBe("FISCAL_DOCUMENT_RECONCILED");
      expect(event.metadata.reconciliationBatchId).toBe("REC-BATCH-123");
      expect(event.metadata.newStatus).toBe("reconciled");
    });

    it("creates document mismatch event", () => {
      const event = FiscalAuditEvents.documentMismatch("org", {
        id: "inv-001",
        type: "FT",
        series: "2025",
        number: "001",
      }, [
        { field: "totalAmount", localValue: 12300, externalValue: 12000 },
      ]);

      expect(event.action).toBe("FISCAL_DOCUMENT_MISMATCH");
      expect(event.source).toBe("AUTOMATION");
      expect((event.metadata as any).metadata.differences).toBeDefined();
    });

    it("creates export created event", () => {
      const event = FiscalAuditEvents.exportCreatedEvent("user", "org", {
        id: "EXPORT-123",
        fiscalYear: 2025,
        documentCount: 50,
        totalNetCents: 1000000,
        totalVatCents: 230000,
      });

      expect(event.action).toBe("FISCAL_EXPORT_CREATED");
      expect(event.entityType).toBe("export");
      expect(event.metadata.totalCents).toBe(1230000);
      expect(event.metadata.vatCents).toBe(230000);
    });

    it("creates series created event", () => {
      const event = FiscalAuditEvents.seriesCreated("user", "org", {
        id: "series-123",
        type: "FT",
        code: "2025",
        fiscalYear: 2025,
        startingNumber: 1,
      });

      expect(event.action).toBe("FISCAL_SERIES_CREATED");
      expect(event.entityType).toBe("series");
      expect(event.metadata.documentType).toBe("FT");
      expect(event.metadata.series).toBe("2025");
      expect(event.metadata.documentNumber).toBe("1");
    });

    it("creates tax authority validation event", () => {
      const event = FiscalAuditEvents.taxAuthorityValidation("org", {
        id: "inv-001",
        type: "FT",
        series: "2025",
        number: "001",
      }, { valid: true, status: "ACCEPTED" });

      expect(event.action).toBe("TAX_AUTHORITY_VALIDATION");
      expect(event.source).toBe("GOVERNMENT_PROVIDER");
      expect(event.metadata.newStatus).toBe("ACCEPTED");
    });

    it("creates idempotency key generated event", () => {
      const event = FiscalAuditEvents.idempotencyKeyGenerated("org", {
        id: "inv-001",
        type: "FT",
        series: "2025",
        number: "001",
      }, "submit", 1, "IDEMP-ABC123-1");

      expect(event.action).toBe("IDEMPOTENCY_KEY_GENERATED");
      expect(event.source).toBe("AUTOMATION");
      expect(event.metadata.externalReference).toBe("IDEMP-ABC123-1");
      expect(event.metadata.attempt).toBe(1);
    });
  });

  describe("No secrets in logs", () => {
    it("never logs passwords", async () => {
      const event = createFiscalAuditEvent(
        "FISCAL_DOCUMENT_CREATED",
        "user",
        "org",
        { password: "secret123", apiKey: "key123" },
      );

      await logger.log(event);
      const results = await logger.query({});

      expect(results[0].metadata.password).toBeUndefined();
      expect(results[0].metadata.apiKey).toBeUndefined();
    });

    it("never logs tokens", async () => {
      const event = createFiscalAuditEvent(
        "FISCAL_DOCUMENT_CREATED",
        "user",
        "org",
        { token: "bearer-token", clientSecret: "secret" },
      );

      await logger.log(event);
      const results = await logger.query({});

      expect(results[0].metadata.token).toBeUndefined();
      expect(results[0].metadata.clientSecret).toBeUndefined();
    });

    it("never logs certificate passwords", async () => {
      const event = createFiscalAuditEvent(
        "FISCAL_DOCUMENT_CREATED",
        "user",
        "org",
        { certificatePassword: "cert-pass", privateKey: "key-data" },
      );

      await logger.log(event);
      const results = await logger.query({});

      expect(results[0].metadata.certificatePassword).toBeUndefined();
      expect(results[0].metadata.privateKey).toBeUndefined();
    });

    it("masks NIF in logged events", async () => {
      const event = FiscalAuditEvents.documentCreated("user", "org", {
        id: "inv-001",
        type: "FT",
        series: "2025",
        number: "001",
        customerNif: "212345672",
        totalCents: 12300,
      });

      await logger.log(event);
      const results = await logger.query({});

      // NIF should be masked in logged event
      expect(results[0].metadata.customerNif).toBe("***672");
    });
  });
});