import { describe, it, expect, beforeEach } from "vitest";
import {
  GovernmentAuditService,
  GovernmentAuditAction,
  GovernmentAuditSource,
  GovernmentAuditMetadata,
  GovernmentAuditEvent,
  GovernmentAuditQuery,
  GovernmentAuditStats,
} from "../governmentAudit";
import type { GovernmentProviderId, GovernmentProviderType, GovernmentEnvironment } from "../governmentIntegration";

describe("Government Audit Center - Phase 10J-K", () => {
  let service: GovernmentAuditService;
  const orgId = "org-123";
  const userId = "user-123";

  beforeEach(() => {
    service = new GovernmentAuditService();
  });

  describe("log", () => {
    it("logs audit event with generated id and timestamp", () => {
      const event = service.log({
        source: "USER",
        action: "GOV_CONNECTION_CREATED",
        organizationId: orgId,
        userId,
        metadata: {
          organizationId: orgId,
          providerId: "AT",
          providerType: "FAKE",
          providerEnvironment: "development",
          connectionId: "conn-001",
          scopes: ["invoices.submit"],
        },
      });

      expect(event.id).toContain("gov_audit_");
      expect(event.timestamp).toBeDefined();
      expect(event.source).toBe("USER");
      expect(event.action).toBe("GOV_CONNECTION_CREATED");
      expect(event.organizationId).toBe(orgId);
      expect(event.userId).toBe(userId);
    });

    it("sanitizes sensitive metadata", () => {
      const event = service.log({
        source: "SYSTEM",
        action: "GOV_CONNECTION_CREATED",
        organizationId: orgId,
        metadata: {
          organizationId: orgId,
          providerId: "AT",
          providerType: "FAKE",
          providerEnvironment: "development",
          password: "secret123",
          clientSecret: "secret",
          accessToken: "token123",
          privateKey: "key-data",
        },
      });

      expect(event.metadata.password).toBeUndefined();
      expect(event.metadata.clientSecret).toBeUndefined();
      expect(event.metadata.accessToken).toBeUndefined();
      expect(event.metadata.privateKey).toBeUndefined();
    });

    it("masks NIF in maskedNif field", () => {
      const event = service.log({
        source: "USER",
        action: "GOV_AUTH_COMPLETED",
        organizationId: orgId,
        metadata: {
          organizationId: orgId,
          providerId: "AUTENTICACAO_GOV",
          providerType: "FAKE",
          providerEnvironment: "development",
          maskedNif: "501234560",
        },
      });

      expect(event.metadata.maskedNif).toBe("***560");
    });

    it("masks NISS in maskedNiss field", () => {
      const event = service.log({
        source: "USER",
        action: "GOV_AUTH_COMPLETED",
        organizationId: orgId,
        metadata: {
          organizationId: orgId,
          providerId: "SEGURANCA_SOCIAL",
          providerType: "FAKE",
          providerEnvironment: "development",
          maskedNiss: "12345678901",
        },
      });

      expect(event.metadata.maskedNiss).toBe("***78901");
    });

    it("preserves non-sensitive metadata", () => {
      const event = service.log({
        source: "AUTOMATION",
        action: "GOV_DOCUMENT_SUBMITTED",
        organizationId: orgId,
        metadata: {
          organizationId: orgId,
          providerId: "AT",
          providerType: "FAKE",
          providerEnvironment: "development",
          documentId: "inv-001",
          documentType: "FT",
          submissionId: "sub-001",
          latencyMs: 150,
        },
      });

      expect(event.metadata.documentId).toBe("inv-001");
      expect(event.metadata.documentType).toBe("FT");
      expect(event.metadata.submissionId).toBe("sub-001");
      expect(event.metadata.latencyMs).toBe(150);
    });
  });

  describe("Convenience Methods", () => {
    describe("logConnectionCreated", () => {
      it("logs connection created event", () => {
        const event = service.logConnectionCreated(orgId, userId, {
          id: "conn-001",
          providerId: "AT",
          environment: "development",
          scopes: ["invoices.submit", "invoices.read"],
        });

        expect(event.action).toBe("GOV_CONNECTION_CREATED");
        expect(event.source).toBe("USER");
        expect(event.metadata.connectionId).toBe("conn-001");
        expect(event.metadata.providerId).toBe("AT");
        expect(event.metadata.scopes).toEqual(["invoices.submit", "invoices.read"]);
      });
    });

    describe("logConnectionConnected", () => {
      it("logs connection connected event", () => {
        const event = service.logConnectionConnected(
          orgId,
          "conn-001",
          "AT",
          "production",
          "OFFICIAL"
        );

        expect(event.action).toBe("GOV_CONNECTION_CONNECTED");
        expect(event.source).toBe("SYSTEM");
        expect(event.metadata.previousStatus).toBe("DISCONNECTED");
        expect(event.metadata.newStatus).toBe("CONNECTED");
        expect(event.metadata.providerType).toBe("OFFICIAL");
        expect(event.metadata.providerEnvironment).toBe("production");
      });
    });

    describe("logConnectionFailed", () => {
      it("logs connection failed event", () => {
        const event = service.logConnectionFailed(
          orgId,
          "conn-001",
          "AT",
          "production",
          "OFFICIAL",
          "Invalid credentials",
          "INVALID_CREDENTIALS"
        );

        expect(event.action).toBe("GOV_CONNECTION_FAILED");
        expect(event.metadata.errorCode).toBe("INVALID_CREDENTIALS");
        expect(event.metadata.errorMessage).toBe("Invalid credentials");
        expect(event.metadata.newStatus).toBe("ERROR");
      });

      it("uses default error code", () => {
        const event = service.logConnectionFailed(
          orgId,
          "conn-001",
          "AT",
          "production",
          "OFFICIAL",
          "Some error"
        );

        expect(event.metadata.errorCode).toBe("CONNECTION_FAILED");
      });
    });

    describe("logConsentGranted", () => {
      it("logs consent granted event", () => {
        const event = service.logConsentGranted(orgId, userId, {
          id: "consent-001",
          providerId: "AT",
          scopes: ["invoices.submit", "invoices.read"],
          expiresAt: "2025-12-31T23:59:59.000Z",
        });

        expect(event.action).toBe("GOV_CONSENT_GRANTED");
        expect(event.metadata.consentId).toBe("consent-001");
        expect(event.metadata.scopes).toEqual(["invoices.submit", "invoices.read"]);
      });
    });

    describe("logConsentRevoked", () => {
      it("logs consent revoked event", () => {
        const event = service.logConsentRevoked(orgId, userId, "consent-001", "AT", "User revoked access");

        expect(event.action).toBe("GOV_CONSENT_REVOKED");
        expect(event.metadata.consentId).toBe("consent-001");
        expect(event.metadata.errorMessage).toBe("User revoked access");
      });
    });

    describe("logDocumentSubmitted", () => {
      it("logs document submitted event", () => {
        const event = service.logDocumentSubmitted(
          orgId,
          {
            id: "inv-001",
            type: "FT",
            series: "2025",
            number: "001",
            totalCents: 12300,
          },
          {
            submissionId: "sub-001",
            providerId: "AT",
            environment: "production",
            providerType: "OFFICIAL",
            connectionId: "conn-001",
            idempotencyKey: "idem-001",
          }
        );

        expect(event.action).toBe("GOV_DOCUMENT_SUBMITTED");
        expect(event.source).toBe("AUTOMATION");
        expect(event.metadata.documentId).toBe("inv-001");
        expect(event.metadata.documentType).toBe("FT");
        expect(event.metadata.documentSeries).toBe("2025");
        expect(event.metadata.documentNumber).toBe("001");
        expect(event.metadata.submissionId).toBe("sub-001");
        expect(event.metadata.idempotencyKey).toBe("idem-001");
        expect(event.metadata.providerType).toBe("OFFICIAL");
      });
    });

    describe("logDocumentAccepted", () => {
      it("logs document accepted event", () => {
        const event = service.logDocumentAccepted(
          orgId,
          "inv-001",
          "sub-001",
          "ATCUD-20250115-ABC123",
          "AT",
          "OFFICIAL"
        );

        expect(event.action).toBe("GOV_DOCUMENT_ACCEPTED");
        expect(event.source).toBe("GOVERNMENT_PROVIDER");
        expect(event.metadata.externalReference).toBe("ATCUD-20250115-ABC123");
        expect(event.metadata.previousStatus).toBe("SUBMITTED");
        expect(event.metadata.newStatus).toBe("ACCEPTED");
      });
    });

    describe("logDocumentRejected", () => {
      it("logs document rejected event", () => {
        const event = service.logDocumentRejected(
          orgId,
          "inv-001",
          "sub-001",
          "NIF do cliente inválido",
          "AT",
          "OFFICIAL",
          "VALIDATION_ERROR"
        );

        expect(event.action).toBe("GOV_DOCUMENT_REJECTED");
        expect(event.metadata.errorCode).toBe("VALIDATION_ERROR");
        expect(event.metadata.errorMessage).toBe("NIF do cliente inválido");
        expect(event.metadata.previousStatus).toBe("SUBMITTED");
        expect(event.metadata.newStatus).toBe("REJECTED");
      });
    });

    describe("logReconciliationRun", () => {
      it("logs reconciliation run event", () => {
        const event = service.logReconciliationRun(orgId, {
          batchId: "batch-001",
          total: 100,
          matched: 95,
          mismatched: 3,
          missingExternal: 1,
          missingLocal: 1,
          providerId: "AT",
        });

        expect(event.action).toBe("GOV_RECONCILIATION_RUN");
        expect(event.metadata.reconciliationBatchId).toBe("batch-001");
        const meta1 = event.metadata.metadata as Record<string, unknown> | undefined;
        expect(meta1?.total).toBe(100);
        expect(meta1?.matched).toBe(95);
        expect(meta1?.mismatched).toBe(3);
        expect(meta1?.missingExternal).toBe(1);
        expect(meta1?.missingLocal).toBe(1);
      });
    });

    describe("logReconciliationMismatch", () => {
      it("logs reconciliation mismatch event", () => {
        const event = service.logReconciliationMismatch(
          orgId,
          "batch-001",
          "inv-001",
          [
            { field: "totalCents", localValue: 12300, externalValue: 12500 },
            { field: "vatCents", localValue: 2300, externalValue: 2500 },
          ],
          "AT"
        );

        expect(event.action).toBe("GOV_RECONCILIATION_MISMATCH");
        expect(event.metadata.documentId).toBe("inv-001");
        const meta2 = event.metadata.metadata as Record<string, unknown> | undefined;
        expect(meta2?.differences).toHaveLength(2);
        expect((meta2?.differences as Array<{ field: string }> | undefined)?.[0]?.field).toBe("totalCents");
      });
    });

    describe("logDeadlineCreated", () => {
      it("logs deadline created event", () => {
        const event = service.logDeadlineCreated(orgId, {
          id: "dl-001",
          ruleCode: "IVA_MONTHLY",
          category: "IVA",
          dueDate: "2025-02-15",
        });

        expect(event.action).toBe("GOV_DEADLINE_CREATED");
        expect(event.metadata.deadlineId).toBe("dl-001");
        const meta3 = event.metadata.metadata as Record<string, unknown> | undefined;
        expect(meta3?.rule_code).toBe("IVA_MONTHLY");
      });
    });

    describe("logDeadlineCompleted", () => {
      it("logs deadline completed event", () => {
        const event = service.logDeadlineCompleted(orgId, "dl-001", userId);

        expect(event.action).toBe("GOV_DEADLINE_COMPLETED");
        expect(event.userId).toBe(userId);
        expect(event.metadata.deadlineId).toBe("dl-001");
      });
    });

    describe("logAuthInitiated", () => {
      it("logs authentication initiated event", () => {
        const event = service.logAuthInitiated(orgId, userId, "AUTENTICACAO_GOV", "tx-001");

        expect(event.action).toBe("GOV_AUTH_INITIATED");
        const meta4 = event.metadata.metadata as Record<string, unknown> | undefined;
        expect(meta4?.transaction_id).toBe("tx-001");
      });
    });

    describe("logAuthCompleted", () => {
      it("logs authentication completed with masked NIF", () => {
        const event = service.logAuthCompleted(orgId, userId, "CMD", "501234560", "tx-001");

        expect(event.action).toBe("GOV_AUTH_COMPLETED");
        expect(event.source).toBe("GOVERNMENT_PROVIDER");
        expect(event.metadata.maskedNif).toBe("***560");
        const meta5 = event.metadata.metadata as Record<string, unknown> | undefined;
        expect(meta5?.transaction_id).toBe("tx-001");
      });
    });

    describe("logProviderError", () => {
      it("logs provider error with all details", () => {
        const event = service.logProviderError(
          orgId,
          "AT",
          "OFFICIAL",
          "production",
          "submitDocument",
          "Timeout connecting to AT",
          "TIMEOUT",
          504,
          "conn-001",
          30000,
          3,
          5
        );

        expect(event.action).toBe("GOV_PROVIDER_ERROR");
        expect(event.metadata.errorCode).toBe("TIMEOUT");
        expect(event.metadata.errorMessage).toBe("Timeout connecting to AT");
        expect(event.metadata.httpStatusCode).toBe(504);
        expect(event.metadata.connectionId).toBe("conn-001");
        expect(event.metadata.latencyMs).toBe(30000);
        expect(event.metadata.retryAttempt).toBe(3);
        expect(event.metadata.maxRetries).toBe(5);
        const meta6 = event.metadata.metadata as Record<string, unknown> | undefined;
        expect(meta6?.operation).toBe("submitDocument");
      });
    });
  });

  describe("query", () => {
    beforeEach(() => {
      // Add test events
      service.log({
        source: "USER",
        action: "GOV_CONNECTION_CREATED",
        organizationId: orgId,
        userId,
        metadata: { organizationId: orgId, providerId: "AT", providerType: "FAKE", providerEnvironment: "development" },
      });

      service.log({
        source: "SYSTEM",
        action: "GOV_DOCUMENT_SUBMITTED",
        organizationId: orgId,
        metadata: { organizationId: orgId, providerId: "AT", providerType: "FAKE", providerEnvironment: "development", documentId: "inv-001" },
      });

      service.log({
        source: "GOVERNMENT_PROVIDER",
        action: "GOV_DOCUMENT_ACCEPTED",
        organizationId: orgId,
        metadata: { organizationId: orgId, providerId: "AT", providerType: "OFFICIAL", providerEnvironment: "production", documentId: "inv-001" },
      });

      service.log({
        source: "SYSTEM",
        action: "GOV_PROVIDER_ERROR",
        organizationId: orgId,
        metadata: { organizationId: orgId, providerId: "AT", providerType: "OFFICIAL", providerEnvironment: "production", errorCode: "TIMEOUT" },
      });

      service.log({
        source: "USER",
        action: "GOV_CONNECTION_CREATED",
        organizationId: "org-456",
        metadata: { organizationId: "org-456", providerId: "EFATURA", providerType: "FAKE", providerEnvironment: "development" },
      });
    });

    it("filters by organizationId", () => {
      const results = service.query({ organizationId: orgId });
      expect(results.length).toBe(4);
      expect(results.every(e => e.organizationId === orgId)).toBe(true);
    });

    it("filters by userId", () => {
      const results = service.query({ userId });
      expect(results.length).toBe(1);
      expect(results[0].userId).toBe(userId);
    });

    it("filters by providerId", () => {
      const results = service.query({ providerId: "AT" });
      expect(results.length).toBe(4);
      expect(results.every(e => e.metadata.providerId === "AT")).toBe(true);
    });

    it("filters by source", () => {
      const results = service.query({ source: "GOVERNMENT_PROVIDER" });
      expect(results.length).toBe(1);
      expect(results[0].source).toBe("GOVERNMENT_PROVIDER");
    });

    it("filters by action", () => {
      const results = service.query({ action: "GOV_CONNECTION_CREATED" });
      expect(results.length).toBe(2);
      expect(results.every(e => e.action === "GOV_CONNECTION_CREATED")).toBe(true);
    });

    it("filters by connectionId", () => {
      const results = service.query({ connectionId: "conn-001" });
      expect(results.length).toBe(0); // No events with connectionId in test data
    });

    it("filters by documentId", () => {
      const results = service.query({ documentId: "inv-001" });
      expect(results.length).toBe(2);
      expect(results.every(e => e.metadata.documentId === "inv-001")).toBe(true);
    });

    it("filters by date range", () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const results = service.query({ startDate: yesterday, endDate: tomorrow });
      expect(results.length).toBe(5);
    });

    it("filters errors only", () => {
      const results = service.query({ hasError: true });
      expect(results.length).toBe(1);
      expect(results[0].metadata.errorCode).toBe("TIMEOUT");
    });

    it("sorts by timestamp descending", () => {
      const results = service.query({ organizationId: orgId });
      for (let i = 1; i < results.length; i++) {
        expect(new Date(results[i].timestamp).getTime()).toBeLessThanOrEqual(
          new Date(results[i - 1].timestamp).getTime()
        );
      }
    });

    it("applies pagination", () => {
      const page1 = service.query({ organizationId: orgId, limit: 2, offset: 0 });
      const page2 = service.query({ organizationId: orgId, limit: 2, offset: 2 });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  describe("getStats", () => {
    beforeEach(() => {
      service.log({
        source: "USER",
        action: "GOV_CONNECTION_CREATED",
        organizationId: orgId,
        metadata: { organizationId: orgId, providerId: "AT", providerType: "FAKE", providerEnvironment: "development" },
      });

      service.log({
        source: "SYSTEM",
        action: "GOV_DOCUMENT_SUBMITTED",
        organizationId: orgId,
        metadata: { organizationId: orgId, providerId: "AT", providerType: "FAKE", providerEnvironment: "development", latencyMs: 100 },
      });

      service.log({
        source: "GOVERNMENT_PROVIDER",
        action: "GOV_DOCUMENT_ACCEPTED",
        organizationId: orgId,
        metadata: { organizationId: orgId, providerId: "AT", providerType: "OFFICIAL", providerEnvironment: "production", latencyMs: 200 },
      });

      service.log({
        source: "SYSTEM",
        action: "GOV_PROVIDER_ERROR",
        organizationId: orgId,
        metadata: { organizationId: orgId, providerId: "EFATURA", providerType: "FAKE", providerEnvironment: "development", errorCode: "VALIDATION_ERROR" },
      });
    });

    it("calculates correct statistics", () => {
      const stats = service.getStats(orgId);

      expect(stats.totalEvents).toBe(4);
      expect(stats.bySource.USER).toBe(1);
      expect(stats.bySource.SYSTEM).toBe(2);
      expect(stats.bySource.GOVERNMENT_PROVIDER).toBe(1);
      expect(stats.bySource.AUTOMATION).toBe(0);

      expect(stats.byAction.GOV_CONNECTION_CREATED).toBe(1);
      expect(stats.byAction.GOV_DOCUMENT_SUBMITTED).toBe(1);
      expect(stats.byAction.GOV_DOCUMENT_ACCEPTED).toBe(1);
      expect(stats.byAction.GOV_PROVIDER_ERROR).toBe(1);

      expect(stats.byProvider.AT).toBe(3);
      expect(stats.byProvider.EFATURA).toBe(1);

      expect(stats.errorsLast24h).toBe(1);
      expect(stats.successRate).toBe(75); // 3 success out of 4
      expect(stats.averageLatencyMs).toBe(150); // (100 + 200) / 2
      expect(stats.topErrors.length).toBe(1);
      expect(stats.topErrors[0].code).toBe("VALIDATION_ERROR");
      expect(stats.topErrors[0].count).toBe(1);
    });

    it("filters stats by date range", () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const stats = service.getStats(orgId, yesterday);

      expect(stats.totalEvents).toBe(4);
    });
  });

  describe("clear", () => {
    it("clears all events", () => {
      service.log({
        source: "USER",
        action: "GOV_CONNECTION_CREATED",
        organizationId: orgId,
        metadata: { organizationId: orgId, providerId: "AT", providerType: "FAKE", providerEnvironment: "development" },
      });

      service.clear();

      const results = service.query({ organizationId: orgId });
      expect(results.length).toBe(0);
    });
  });
});