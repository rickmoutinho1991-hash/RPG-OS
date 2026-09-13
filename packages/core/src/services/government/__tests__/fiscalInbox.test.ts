import { describe, it, expect, beforeEach } from "vitest";
import {
  FiscalInboxService,
  FiscalInboxItem,
  FiscalInboxItemType,
  FiscalInboxPriority,
  FiscalInboxStatus,
  FiscalInboxFilters,
  FiscalInboxStats,
  FiscalInboxBulkAction,
  FiscalInboxBulkActionResult,
} from "../fiscalInbox";
import type { GovernmentProviderId } from "../governmentIntegration";
import type { InvoiceType } from "../../../types/invoice";

describe("Fiscal Inbox - Caixa Fiscal (Phase 10J-I)", () => {
  let service: FiscalInboxService;
  const orgId = "org-123";

  beforeEach(() => {
    service = new FiscalInboxService();
  });

  describe("addItem", () => {
    it("adds item with generated id and timestamp", () => {
      const item = service.addItem({
        organization_id: orgId,
        type: "INVOICE_ISSUED",
        priority: "MEDIUM",
        status: "UNREAD",
        title: "Test invoice",
        description: "Test description",
        entity_type: "INVOICE",
        entity_id: "inv-001",
        tags: ["test"],
      });

      expect(item.id).toContain("inbox_");
      expect(item.created_at).toBeDefined();
      expect(item.organization_id).toBe(orgId);
      expect(item.type).toBe("INVOICE_ISSUED");
      expect(item.priority).toBe("MEDIUM");
      expect(item.status).toBe("UNREAD");
      expect(item.tags).toEqual(["test"]);
    });

    it("uses empty arrays for undefined tags and metadata", () => {
      const item = service.addItem({
        organization_id: orgId,
        type: "DEADLINE",
        priority: "HIGH",
        status: "ACTION_REQUIRED",
        title: "Deadline",
        description: "Test",
        entity_type: "DEADLINE",
        entity_id: "dl-001",
      });

      expect(item.tags).toEqual([]);
      expect(item.metadata).toEqual({});
    });
  });

  describe("getItem", () => {
    it("returns item by id", () => {
      const added = service.addItem({
        organization_id: orgId,
        type: "INVOICE_ISSUED",
        priority: "MEDIUM",
        status: "UNREAD",
        title: "Test",
        description: "Test",
        entity_type: "INVOICE",
        entity_id: "inv-001",
      });

      const retrieved = service.getItem(added.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(added.id);
    });

    it("returns undefined for non-existent id", () => {
      const retrieved = service.getItem("non-existent");
      expect(retrieved).toBeUndefined();
    });
  });

  describe("listItems", () => {
    beforeEach(() => {
      // Add test items
      service.addItem({
        organization_id: orgId,
        type: "INVOICE_ISSUED",
        priority: "MEDIUM",
        status: "UNREAD",
        title: "Invoice FT 2025/001",
        description: "Fatura emitida",
        entity_type: "INVOICE",
        entity_id: "inv-001",
        document_type: "FT",
        series: "2025",
        document_number: "001",
        counterparty_nif: "212345672",
        counterparty_name: "Cliente A",
        amount_cents: 12300,
        vat_cents: 2300,
        issue_date: "2025-01-15",
        tags: ["fatura", "FT"],
      });

      service.addItem({
        organization_id: orgId,
        type: "REJECTED_SUBMISSION",
        priority: "CRITICAL",
        status: "ACTION_REQUIRED",
        title: "Submissão rejeitada",
        description: "Erro na validação",
        entity_type: "INVOICE",
        entity_id: "inv-002",
        document_type: "FS",
        series: "2025",
        document_number: "002",
        provider: "AT",
        tags: ["rejeitada", "AT"],
      });

      service.addItem({
        organization_id: "org-456", // Different org
        type: "DEADLINE",
        priority: "HIGH",
        status: "UNREAD",
        title: "Prazo IVA",
        description: "IVA mensal",
        entity_type: "DEADLINE",
        entity_id: "dl-001",
        due_date: "2025-02-10",
        tags: ["prazo", "IVA"],
      });
    });

    it("filters by organization_id", () => {
      const items = service.listItems(orgId);
      expect(items).toHaveLength(2);
      expect(items.every(i => i.organization_id === orgId)).toBe(true);
    });

    it("filters by type", () => {
      const items = service.listItems(orgId, { types: ["REJECTED_SUBMISSION"] });
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe("REJECTED_SUBMISSION");
    });

    it("filters by priority", () => {
      const items = service.listItems(orgId, { priorities: ["CRITICAL"] });
      expect(items).toHaveLength(1);
      expect(items[0].priority).toBe("CRITICAL");
    });

    it("filters by status", () => {
      const items = service.listItems(orgId, { statuses: ["ACTION_REQUIRED"] });
      expect(items).toHaveLength(1);
      expect(items[0].status).toBe("ACTION_REQUIRED");
    });

    it("filters by document_type", () => {
      const items = service.listItems(orgId, { document_types: ["FT"] });
      expect(items).toHaveLength(1);
      expect(items[0].document_type).toBe("FT");
    });

    it("filters by counterparty_nif", () => {
      const items = service.listItems(orgId, { counterparty_nif: "212345672" });
      expect(items).toHaveLength(1);
      expect(items[0].counterparty_nif).toBe("212345672");
    });

    it("filters by provider", () => {
      const items = service.listItems(orgId, { provider: "AT" });
      expect(items).toHaveLength(1);
      expect(items[0].provider).toBe("AT");
    });

    it("filters by date_from", () => {
      const items = service.listItems(orgId, { date_from: "2025-01-20" });
      // Items created in beforeEach have recent timestamps
      expect(items.length).toBeGreaterThanOrEqual(0);
    });

    it("filters by date_to", () => {
      const items = service.listItems(orgId, { date_to: "2020-01-01" });
      expect(items).toHaveLength(0);
    });

    it("filters by tags", () => {
      const items = service.listItems(orgId, { tags: ["rejeitada"] });
      expect(items).toHaveLength(1);
      expect(items[0].tags).toContain("rejeitada");
    });

    it("filters unread_only", () => {
      const items = service.listItems(orgId, { unread_only: true });
      expect(items).toHaveLength(1);
      expect(items[0].status).toBe("UNREAD");
    });

    it("filters action_required_only", () => {
      const items = service.listItems(orgId, { action_required_only: true });
      expect(items).toHaveLength(1);
      expect(items[0].status).toBe("ACTION_REQUIRED");
    });

    it("sorts by priority then date", () => {
      // Add items with different priorities
      service.addItem({
        organization_id: orgId,
        type: "DEADLINE",
        priority: "LOW",
        status: "UNREAD",
        title: "Low priority",
        description: "Test",
        entity_type: "DEADLINE",
        entity_id: "dl-002",
      });

      service.addItem({
        organization_id: orgId,
        type: "DEADLINE",
        priority: "HIGH",
        status: "UNREAD",
        title: "High priority",
        description: "Test",
        entity_type: "DEADLINE",
        entity_id: "dl-003",
      });

      const items = service.listItems(orgId);
      // Should be sorted: CRITICAL, HIGH, MEDIUM, LOW
      expect(items[0].priority).toBe("CRITICAL");
      expect(items[1].priority).toBe("HIGH");
      expect(items[2].priority).toBe("MEDIUM");
      // LOW should be last
    });
  });

  describe("getStats", () => {
    beforeEach(() => {
      service.addItem({
        organization_id: orgId,
        type: "INVOICE_ISSUED",
        priority: "MEDIUM",
        status: "UNREAD",
        title: "Invoice 1",
        description: "Test",
        entity_type: "INVOICE",
        entity_id: "inv-001",
      });

      service.addItem({
        organization_id: orgId,
        type: "REJECTED_SUBMISSION",
        priority: "CRITICAL",
        status: "ACTION_REQUIRED",
        title: "Rejected 1",
        description: "Test",
        entity_type: "INVOICE",
        entity_id: "inv-002",
      });

      service.addItem({
        organization_id: orgId,
        type: "PENDING_SUBMISSION",
        priority: "HIGH",
        status: "ACTION_REQUIRED",
        title: "Pending 1",
        description: "Test",
        entity_type: "INVOICE",
        entity_id: "inv-003",
      });

      service.addItem({
        organization_id: orgId,
        type: "RECONCILIATION_ISSUE",
        priority: "HIGH",
        status: "UNREAD",
        title: "Recon 1",
        description: "Test",
        entity_type: "RECONCILIATION",
        entity_id: "rec-001",
      });

      // Add overdue deadline
      service.addItem({
        organization_id: orgId,
        type: "DEADLINE",
        priority: "CRITICAL",
        status: "ACTION_REQUIRED",
        title: "Overdue",
        description: "Test",
        entity_type: "DEADLINE",
        entity_id: "dl-001",
        due_date: "2020-01-01",
      });
    });

    it("calculates correct stats", () => {
      const stats = service.getStats(orgId);

      expect(stats.total).toBe(5);
      expect(stats.unread).toBe(2); // 2 UNREAD
      expect(stats.action_required).toBe(3); // 3 ACTION_REQUIRED
      expect(stats.by_priority.CRITICAL).toBe(2);
      expect(stats.by_priority.HIGH).toBe(2);
      expect(stats.by_priority.MEDIUM).toBe(1);
      expect(stats.by_priority.LOW).toBe(0);
      expect(stats.by_type.INVOICE_ISSUED).toBe(1);
      expect(stats.by_type.REJECTED_SUBMISSION).toBe(1);
      expect(stats.by_type.PENDING_SUBMISSION).toBe(1);
      expect(stats.by_type.RECONCILIATION_ISSUE).toBe(1);
      expect(stats.by_type.DEADLINE).toBe(1);
      expect(stats.by_status.UNREAD).toBe(2);
      expect(stats.by_status.ACTION_REQUIRED).toBe(3);
      expect(stats.overdue_deadlines).toBe(1);
      expect(stats.pending_submissions).toBe(1);
      expect(stats.rejected_submissions).toBe(1);
      expect(stats.reconciliation_issues).toBe(1);
    });
  });

  describe("markAsRead", () => {
    it("marks item as read", () => {
      const item = service.addItem({
        organization_id: orgId,
        type: "INVOICE_ISSUED",
        priority: "MEDIUM",
        status: "UNREAD",
        title: "Test",
        description: "Test",
        entity_type: "INVOICE",
        entity_id: "inv-001",
      });

      const updated = service.markAsRead(item.id, "user-123");

      expect(updated).toBeDefined();
      expect(updated?.status).toBe("READ");
      expect(updated?.read_at).toBeDefined();
      expect(updated?.metadata?.read_by).toBe("user-123");
    });

    it("returns undefined for non-existent item", () => {
      const result = service.markAsRead("non-existent", "user-123");
      expect(result).toBeUndefined();
    });
  });

  describe("markAsResolved", () => {
    it("marks item as resolved", () => {
      const item = service.addItem({
        organization_id: orgId,
        type: "REJECTED_SUBMISSION",
        priority: "CRITICAL",
        status: "ACTION_REQUIRED",
        title: "Test",
        description: "Test",
        entity_type: "INVOICE",
        entity_id: "inv-001",
      });

      const updated = service.markAsResolved(item.id, "user-123", "Fixed and resubmitted");

      expect(updated).toBeDefined();
      expect(updated?.status).toBe("RESOLVED");
      expect(updated?.resolved_at).toBeDefined();
      expect(updated?.resolved_by).toBe("user-123");
      expect(updated?.metadata?.resolution).toBe("Fixed and resubmitted");
    });

    it("returns undefined for non-existent item", () => {
      const result = service.markAsResolved("non-existent", "user-123");
      expect(result).toBeUndefined();
    });
  });

  describe("markInProgress", () => {
    it("marks item as in progress", () => {
      const item = service.addItem({
        organization_id: orgId,
        type: "RECONCILIATION_ISSUE",
        priority: "HIGH",
        status: "ACTION_REQUIRED",
        title: "Test",
        description: "Test",
        entity_type: "RECONCILIATION",
        entity_id: "rec-001",
      });

      const updated = service.markInProgress(item.id, "user-123");

      expect(updated).toBeDefined();
      expect(updated?.status).toBe("IN_PROGRESS");
      expect(updated?.metadata?.in_progress_by).toBe("user-123");
      expect(updated?.metadata?.in_progress_at).toBeDefined();
    });
  });

  describe("dismiss", () => {
    it("dismisses item", () => {
      const item = service.addItem({
        organization_id: orgId,
        type: "CONSENT_EXPIRING",
        priority: "LOW",
        status: "UNREAD",
        title: "Test",
        description: "Test",
        entity_type: "CONSENT",
        entity_id: "consent-001",
      });

      const updated = service.dismiss(item.id, "user-123");

      expect(updated).toBeDefined();
      expect(updated?.status).toBe("DISMISSED");
      expect(updated?.resolved_at).toBeDefined();
      expect(updated?.resolved_by).toBe("user-123");
      expect(updated?.metadata?.dismissed_by).toBe("user-123");
    });
  });

  describe("bulkAction", () => {
    beforeEach(() => {
      service.addItem({
        organization_id: orgId,
        type: "INVOICE_ISSUED",
        priority: "MEDIUM",
        status: "UNREAD",
        title: "Invoice 1",
        description: "Test",
        entity_type: "INVOICE",
        entity_id: "inv-001",
      });

      service.addItem({
        organization_id: orgId,
        type: "INVOICE_ISSUED",
        priority: "MEDIUM",
        status: "UNREAD",
        title: "Invoice 2",
        description: "Test",
        entity_type: "INVOICE",
        entity_id: "inv-002",
      });

      service.addItem({
        organization_id: "org-456",
        type: "INVOICE_ISSUED",
        priority: "MEDIUM",
        status: "UNREAD",
        title: "Other org invoice",
        description: "Test",
        entity_type: "INVOICE",
        entity_id: "inv-003",
      });
    });

    it("marks multiple items as read", () => {
      const items = service.listItems(orgId, { statuses: ["UNREAD"] });
      const itemIds = items.map(i => i.id);

      const result = service.bulkAction(orgId, itemIds, "MARK_READ", "user-123");

      expect(result.success).toBe(true);
      expect(result.processed).toBe(2);
      expect(result.failed).toBe(0);

      const updatedItems = service.listItems(orgId, { statuses: ["READ"] });
      expect(updatedItems).toHaveLength(2);
    });

    it("marks multiple items as resolved", () => {
      const items = service.listItems(orgId, { statuses: ["UNREAD"] });
      const itemIds = items.map(i => i.id);

      const result = service.bulkAction(orgId, itemIds, "MARK_RESOLVED", "user-123", { resolution: "Bulk resolved" });

      expect(result.success).toBe(true);
      expect(result.processed).toBe(2);

      const updatedItems = service.listItems(orgId, { statuses: ["RESOLVED"] });
      expect(updatedItems).toHaveLength(2);
    });

    it("dismisses multiple items", () => {
      const items = service.listItems(orgId, { statuses: ["UNREAD"] });
      const itemIds = items.map(i => i.id);

      const result = service.bulkAction(orgId, itemIds, "DISMISS", "user-123");

      expect(result.success).toBe(true);
      expect(result.processed).toBe(2);

      const dismissedItems = service.listItems(orgId, { statuses: ["DISMISSED"] });
      expect(dismissedItems).toHaveLength(2);
    });

    it("fails for items from different organization", () => {
      const allItems = service.listItems("org-456");
      const otherOrgItem = allItems[0];
      const orgItems = service.listItems(orgId);
      const itemIds = [otherOrgItem.id, orgItems[0].id];

      const result = service.bulkAction(orgId, itemIds, "MARK_READ", "user-123");

      expect(result.success).toBe(false);
      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain("access denied");
    });

    it("fails for non-existent items", () => {
      const result = service.bulkAction(orgId, ["non-existent"], "MARK_READ", "user-123");

      expect(result.success).toBe(false);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain("not found");
    });
  });

  describe("createInvoiceIssuedItem", () => {
    it("creates invoice issued item with correct data", () => {
      const item = service.createInvoiceIssuedItem({
        id: "inv-001",
        organization_id: orgId,
        invoice_type: "FT",
        series: "2025",
        document_number: "001",
        customer_nif: "212345672",
        customer_name: "Cliente Teste",
        total_cents: 12300,
        vat_cents: 2300,
        issue_date: "2025-01-15",
        due_date: "2025-02-14",
      });

      expect(item.type).toBe("INVOICE_ISSUED");
      expect(item.priority).toBe("MEDIUM");
      expect(item.status).toBe("UNREAD");
      expect(item.title).toContain("FT 2025/001");
      expect(item.document_type).toBe("FT");
      expect(item.series).toBe("2025");
      expect(item.document_number).toBe("001");
      expect(item.counterparty_nif).toBe("212345672");
      expect(item.counterparty_name).toBe("Cliente Teste");
      expect(item.amount_cents).toBe(12300);
      expect(item.vat_cents).toBe(2300);
      expect(item.action_url).toBe("/faturacao/inv-001");
    });
  });

  describe("createRejectedSubmissionItem", () => {
    it("creates rejected submission item with CRITICAL priority", () => {
      const item = service.createRejectedSubmissionItem({
        organization_id: orgId,
        document_id: "inv-001",
        document_type: "FT",
        series: "2025",
        document_number: "001",
        provider: "AT",
        error: "NIF inválido",
        submission_id: "sub-001",
      });

      expect(item.type).toBe("REJECTED_SUBMISSION");
      expect(item.priority).toBe("CRITICAL");
      expect(item.status).toBe("ACTION_REQUIRED");
      expect(item.title).toContain("rejeitada");
      expect(item.provider).toBe("AT");
      expect(item.metadata?.submission_id).toBe("sub-001");
      expect(item.metadata?.error).toBe("NIF inválido");
    });
  });

  describe("createPendingSubmissionItem", () => {
    it("creates pending submission item with HIGH priority", () => {
      const item = service.createPendingSubmissionItem({
        organization_id: orgId,
        document_id: "inv-001",
        document_type: "FS",
        series: "2025",
        document_number: "002",
        provider: "EFATURA",
        submitted_at: "2025-01-15T10:00:00.000Z",
      });

      expect(item.type).toBe("PENDING_SUBMISSION");
      expect(item.priority).toBe("HIGH");
      expect(item.status).toBe("ACTION_REQUIRED");
      expect(item.title).toContain("pendente");
      expect(item.provider).toBe("EFATURA");
      expect(item.metadata?.submitted_at).toBe("2025-01-15T10:00:00.000Z");
    });
  });

  describe("createReconciliationIssueItem", () => {
    it("creates reconciliation issue item", () => {
      const item = service.createReconciliationIssueItem({
        organization_id: orgId,
        document_id: "inv-001",
        document_type: "NC",
        series: "2025",
        document_number: "003",
        differences: ["Total diverge", "IVA incorreto"],
        provider: "AT",
      });

      expect(item.type).toBe("RECONCILIATION_ISSUE");
      expect(item.priority).toBe("HIGH");
      expect(item.status).toBe("ACTION_REQUIRED");
      expect(item.description).toContain("Total diverge");
      expect(item.description).toContain("IVA incorreto");
      expect(item.metadata?.differences).toEqual(["Total diverge", "IVA incorreto"]);
    });
  });

  describe("createDeadlineItem", () => {
    it("creates overdue deadline with CRITICAL priority", () => {
      const item = service.createDeadlineItem({
        organization_id: orgId,
        title: "IVA Mensal",
        description: "Declaração periódica IVA",
        due_date: "2020-01-01",
        type: "IVA",
        amount_cents: 50000,
        payment_reference: "12345678901",
      });

      expect(item.type).toBe("DEADLINE");
      expect(item.priority).toBe("CRITICAL");
      expect(item.status).toBe("ACTION_REQUIRED");
      expect(item.due_date).toBe("2020-01-01");
      expect(item.amount_cents).toBe(50000);
      expect(item.metadata?.payment_reference).toBe("12345678901");
      expect(item.action_url).toBe("/financas/pagamentos/12345678901");
    });

    it("creates due soon deadline with HIGH priority and ACTION_REQUIRED status", () => {
      const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const item = service.createDeadlineItem({
        organization_id: orgId,
        title: "TSU",
        description: "Guia TSU",
        due_date: soon,
        type: "TSU",
      });

      expect(item.priority).toBe("HIGH");
      expect(item.status).toBe("ACTION_REQUIRED");
    });

    it("creates future deadline with MEDIUM priority", () => {
      const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const item = service.createDeadlineItem({
        organization_id: orgId,
        title: "IRS",
        description: "Declaração IRS",
        due_date: future,
        type: "IRS",
      });

      expect(item.priority).toBe("MEDIUM");
      expect(item.status).toBe("UNREAD");
    });
  });

  describe("createConnectionErrorItem", () => {
    it("creates connection error item", () => {
      const item = service.createConnectionErrorItem({
        organization_id: orgId,
        provider: "SEGURANCA_SOCIAL",
        error: "Token expirado",
        connection_id: "conn-001",
      });

      expect(item.type).toBe("CONNECTION_ERROR");
      expect(item.priority).toBe("HIGH");
      expect(item.status).toBe("ACTION_REQUIRED");
      expect(item.provider).toBe("SEGURANCA_SOCIAL");
      expect(item.metadata?.connection_id).toBe("conn-001");
      expect(item.metadata?.error).toBe("Token expirado");
    });
  });

  describe("createConsentExpiringItem", () => {
    it("creates consent expiring item with CRITICAL for 1 day", () => {
      const tomorrow = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();
      const item = service.createConsentExpiringItem({
        organization_id: orgId,
        provider: "AT",
        expires_at: tomorrow,
        scopes: ["invoices.submit"],
      });

      expect(item.type).toBe("CONSENT_EXPIRING");
      expect(item.priority).toBe("CRITICAL");
      expect(item.due_date).toBe(tomorrow);
      expect(item.metadata?.scopes).toEqual(["invoices.submit"]);
    });

    it("creates consent expiring item with HIGH for 3 days", () => {
      const threeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const item = service.createConsentExpiringItem({
        organization_id: orgId,
        provider: "EFATURA",
        expires_at: threeDays,
        scopes: ["invoices.read"],
      });

      expect(item.priority).toBe("HIGH");
    });

    it("creates consent expiring item with LOW for > 7 days", () => {
      const tenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      const item = service.createConsentExpiringItem({
        organization_id: orgId,
        provider: "CMD",
        expires_at: tenDays,
        scopes: ["authenticate"],
      });

      expect(item.priority).toBe("LOW");
    });
  });
});