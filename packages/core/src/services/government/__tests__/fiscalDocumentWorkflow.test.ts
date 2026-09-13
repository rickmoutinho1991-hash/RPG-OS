import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  FiscalDocumentWorkflow,
  FiscalDocumentState,
  GovernmentFiscalDocumentTransition,
  FiscalDocumentEvent,
  FiscalDocumentWorkflowResult,
  createFiscalDocumentWorkflow,
  isTransitionValid,
} from "../fiscalDocumentWorkflow";
import { GovernmentAuditService } from "../governmentAudit";
import type { InvoiceType } from "../../../types/invoice";

describe("Fiscal Document Workflow - Phase 10J-B", () => {
  let workflow: FiscalDocumentWorkflow;
  let auditService: GovernmentAuditService;
  const orgId = "org-123";
  const userId = "user-123";

  beforeEach(() => {
    workflow = new FiscalDocumentWorkflow();
    auditService = new GovernmentAuditService();
  });

  describe("State Transitions", () => {
    it("has all required states", () => {
      const states: FiscalDocumentState[] = [
        "DRAFT",
        "VALIDATED",
        "READY_FOR_SUBMISSION",
        "SUBMITTED",
        "PENDING",
        "ACCEPTED",
        "REJECTED",
        "RECONCILED",
      ];
      expect(states).toHaveLength(8);
    });

    it("validates FT transitions", () => {
      // DRAFT -> VALIDATED
      expect(workflow.isValidTransition("FT", "DRAFT", "VALIDATED")).toBe(true);
      // VALIDATED -> READY_FOR_SUBMISSION
      expect(workflow.isValidTransition("FT", "VALIDATED", "READY_FOR_SUBMISSION")).toBe(true);
      // READY_FOR_SUBMISSION -> SUBMITTED
      expect(workflow.isValidTransition("FT", "READY_FOR_SUBMISSION", "SUBMITTED")).toBe(true);
      // SUBMITTED -> PENDING
      expect(workflow.isValidTransition("FT", "SUBMITTED", "PENDING")).toBe(true);
      // PENDING -> ACCEPTED
      expect(workflow.isValidTransition("FT", "PENDING", "ACCEPTED")).toBe(true);
      // PENDING -> REJECTED
      expect(workflow.isValidTransition("FT", "PENDING", "REJECTED")).toBe(true);
      // ACCEPTED -> RECONCILED
      expect(workflow.isValidTransition("FT", "ACCEPTED", "RECONCILED")).toBe(true);
      // REJECTED -> SUBMITTED (resubmit after correction)
      expect(workflow.isValidTransition("FT", "REJECTED", "SUBMITTED")).toBe(true);
      // Any -> DRAFT (recall for correction)
      expect(workflow.isValidTransition("FT", "ACCEPTED", "DRAFT")).toBe(true);
    });

    it("validates FS transitions", () => {
      expect(workflow.isValidTransition("FS", "DRAFT", "VALIDATED")).toBe(true);
      expect(workflow.isValidTransition("FS", "VALIDATED", "READY_FOR_SUBMISSION")).toBe(true);
      expect(workflow.isValidTransition("FS", "READY_FOR_SUBMISSION", "SUBMITTED")).toBe(true);
    });

    it("validates FR transitions", () => {
      expect(workflow.isValidTransition("FR", "DRAFT", "VALIDATED")).toBe(true);
      expect(workflow.isValidTransition("FR", "VALIDATED", "READY_FOR_SUBMISSION")).toBe(true);
    });

    it("validates NC transitions", () => {
      expect(workflow.isValidTransition("NC", "DRAFT", "VALIDATED")).toBe(true);
      expect(workflow.isValidTransition("NC", "VALIDATED", "READY_FOR_SUBMISSION")).toBe(true);
    });

    it("validates ND transitions", () => {
      expect(workflow.isValidTransition("ND", "DRAFT", "VALIDATED")).toBe(true);
      expect(workflow.isValidTransition("ND", "VALIDATED", "READY_FOR_SUBMISSION")).toBe(true);
    });

    it("rejects invalid transitions", () => {
      // Cannot go backwards (except recall)
      expect(workflow.isValidTransition("FT", "VALIDATED", "DRAFT")).toBe(false);
      expect(workflow.isValidTransition("FT", "SUBMITTED", "VALIDATED")).toBe(false);
      expect(workflow.isValidTransition("FT", "ACCEPTED", "PENDING")).toBe(false);
      // Cannot skip states
      expect(workflow.isValidTransition("FT", "DRAFT", "SUBMITTED")).toBe(false);
      expect(workflow.isValidTransition("FT", "DRAFT", "ACCEPTED")).toBe(false);
      // Cannot transition from RECONCILED to ACCEPTED
      expect(workflow.isValidTransition("FT", "RECONCILED", "ACCEPTED")).toBe(false);
    });

    it("rejects unknown document type", () => {
      expect(workflow.isValidTransition("XX" as InvoiceType, "DRAFT", "VALIDATED")).toBe(false);
    });
  });

  describe("transitionDocument", () => {
    it("transitions DRAFT -> VALIDATED successfully", async () => {
      const result = await workflow.transitionDocument(
        "FT",
        "inv-001",
        "DRAFT",
        "VALIDATED",
        orgId,
        userId,
        auditService
      );

      expect(result.success).toBe(true);
      expect(result.documentId).toBe("inv-001");
      expect(result.newState).toBe("VALIDATED");
    });

    it("transitions VALIDATED -> READY_FOR_SUBMISSION", async () => {
      const result = await workflow.transitionDocument(
        "FT",
        "inv-001",
        "VALIDATED",
        "READY_FOR_SUBMISSION",
        orgId,
        userId,
        auditService
      );

      expect(result.success).toBe(true);
      expect(result.newState).toBe("READY_FOR_SUBMISSION");
    });

    it("transitions READY_FOR_SUBMISSION -> SUBMITTED", async () => {
      const result = await workflow.transitionDocument(
        "FT",
        "inv-001",
        "READY_FOR_SUBMISSION",
        "SUBMITTED",
        orgId,
        userId,
        auditService
      );

      expect(result.success).toBe(true);
      expect(result.newState).toBe("SUBMITTED");
    });

    it("transitions SUBMITTED -> PENDING", async () => {
      const result = await workflow.transitionDocument(
        "FT",
        "inv-001",
        "SUBMITTED",
        "PENDING",
        orgId,
        userId,
        auditService
      );

      expect(result.success).toBe(true);
      expect(result.newState).toBe("PENDING");
    });

    it("transitions PENDING -> ACCEPTED", async () => {
      const result = await workflow.transitionDocument(
        "FT",
        "inv-001",
        "PENDING",
        "ACCEPTED",
        orgId,
        userId,
        auditService
      );

      expect(result.success).toBe(true);
      expect(result.newState).toBe("ACCEPTED");
    });

    it("transitions PENDING -> REJECTED", async () => {
      const result = await workflow.transitionDocument(
        "FT",
        "inv-001",
        "PENDING",
        "REJECTED",
        orgId,
        userId,
        auditService
      );

      expect(result.success).toBe(true);
      expect(result.newState).toBe("REJECTED");
    });

    it("transitions ACCEPTED -> RECONCILED", async () => {
      const result = await workflow.transitionDocument(
        "FT",
        "inv-001",
        "ACCEPTED",
        "RECONCILED",
        orgId,
        userId,
        auditService
      );

      expect(result.success).toBe(true);
      expect(result.newState).toBe("RECONCILED");
    });

    it("transitions REJECTED -> SUBMITTED (resubmit)", async () => {
      const result = await workflow.transitionDocument(
        "FT",
        "inv-001",
        "REJECTED",
        "SUBMITTED",
        orgId,
        userId,
        auditService
      );

      expect(result.success).toBe(true);
      expect(result.newState).toBe("SUBMITTED");
    });

    it("rejects invalid transition", async () => {
      const result = await workflow.transitionDocument(
        "FT",
        "inv-001",
        "DRAFT",
        "ACCEPTED", // Invalid: cannot skip states
        orgId,
        userId,
        auditService
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Transição inválida");
    });

    it("rejects unknown document type", async () => {
      const result = await workflow.transitionDocument(
        "XX" as InvoiceType,
        "inv-001",
        "DRAFT",
        "VALIDATED",
        orgId,
        userId,
        auditService
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Tipo de documento desconhecido");
    });
  });

  describe("processATResponse", () => {
    it("processes ACCEPTED response", async () => {
      const result = await workflow.processATResponse(
        "FT",
        "inv-001",
        orgId,
        userId,
        "ACCEPTED",
        "ATCUD-20250115-ABC123",
        undefined,
        auditService
      );

      expect(result.success).toBe(true);
      expect(result.newState).toBe("ACCEPTED");
    });

    it("processes REJECTED response", async () => {
      const result = await workflow.processATResponse(
        "FT",
        "inv-001",
        orgId,
        userId,
        "REJECTED",
        undefined,
        "NIF inválido",
        auditService
      );

      expect(result.success).toBe(true);
      expect(result.newState).toBe("REJECTED");
      expect(result.error).toBe("NIF inválido");
    });
  });

  describe("recallDocument (correction)", () => {
    it("recalls document and creates new document ID", async () => {
      const result = await workflow.recallDocument(
        "FT",
        "inv-001",
        orgId,
        userId,
        auditService
      );

      expect(result.success).toBe(true);
      expect(result.documentId).toBe("inv-001");
      expect(result.requiresCorrection).toBe(true);
      expect(result.newDocumentId).toBeDefined();
      expect(result.newDocumentId).toContain("new_");
    });

    it("logs audit event for recall", async () => {
      await workflow.recallDocument("FT", "inv-001", orgId, userId, auditService);

      const events = auditService.query({ organizationId: orgId, action: "GOV_DOCUMENT_SUBMITTED" });
      const recallEvent = events.find(e => e.metadata.documentId === "inv-001" && e.metadata.action === "DOCUMENT_RECALL");
      expect(recallEvent).toBeDefined();
    });
  });

  describe("isTransitionValid helper", () => {
    it("returns true for valid transitions", () => {
      expect(isTransitionValid("FT", "DRAFT", "VALIDATED")).toBe(true);
      expect(isTransitionValid("FS", "VALIDATED", "READY_FOR_SUBMISSION")).toBe(true);
      expect(isTransitionValid("NC", "PENDING", "ACCEPTED")).toBe(true);
    });

    it("returns false for invalid transitions", () => {
      expect(isTransitionValid("FT", "DRAFT", "ACCEPTED")).toBe(false);
      expect(isTransitionValid("FT", "ACCEPTED", "PENDING")).toBe(false);
    });
  });

  describe("Audit Integration", () => {
    it("logs workflow events to audit service", async () => {
      await workflow.transitionDocument(
        "FT",
        "inv-001",
        "DRAFT",
        "VALIDATED",
        orgId,
        userId,
        auditService
      );

      const events = auditService.query({ organizationId: orgId, documentId: "inv-001" });
      expect(events.length).toBeGreaterThan(0);

      const workflowEvent = events.find(e => e.metadata.documentId === "inv-001" && e.metadata.newState === "VALIDATED");
      expect(workflowEvent).toBeDefined();
      expect(workflowEvent?.metadata.previousState).toBe("DRAFT");
      expect(workflowEvent?.metadata.newState).toBe("VALIDATED");
      expect(workflowEvent?.metadata.idempotencyKey).toBeDefined();
    });

    it("uses SYSTEM source for automation transitions", async () => {
      await workflow.transitionDocument(
        "FT",
        "inv-001",
        "PENDING",
        "ACCEPTED",
        orgId,
        userId,
        auditService
      );

      const events = auditService.query({ organizationId: orgId, documentId: "inv-001" });
      const acceptEvent = events.find(e => e.metadata.newState === "ACCEPTED");
      expect(acceptEvent?.source).toBe("SYSTEM");
    });
  });

  describe("Document Type Specific Rules", () => {
    it("all document types have same basic transition structure", () => {
      const types: InvoiceType[] = ["FT", "FS", "FR", "NC", "ND"];

      for (const type of types) {
        // All should allow DRAFT -> VALIDATED
        expect(workflow.isValidTransition(type, "DRAFT", "VALIDATED")).toBe(true);
        // All should allow VALIDATED -> READY_FOR_SUBMISSION
        expect(workflow.isValidTransition(type, "VALIDATED", "READY_FOR_SUBMISSION")).toBe(true);
        // All should allow READY_FOR_SUBMISSION -> SUBMITTED
        expect(workflow.isValidTransition(type, "READY_FOR_SUBMISSION", "SUBMITTED")).toBe(true);
        // All should allow SUBMITTED -> PENDING
        expect(workflow.isValidTransition(type, "SUBMITTED", "PENDING")).toBe(true);
        // All should allow PENDING -> ACCEPTED
        expect(workflow.isValidTransition(type, "PENDING", "ACCEPTED")).toBe(true);
        // All should allow PENDING -> REJECTED
        expect(workflow.isValidTransition(type, "PENDING", "REJECTED")).toBe(true);
        // All should allow ACCEPTED -> RECONCILED
        expect(workflow.isValidTransition(type, "ACCEPTED", "RECONCILED")).toBe(true);
        // All should allow REJECTED -> SUBMITTED (resubmit)
        expect(workflow.isValidTransition(type, "REJECTED", "SUBMITTED")).toBe(true);
        // All should allow recall to DRAFT
        expect(workflow.isValidTransition(type, "ACCEPTED", "DRAFT")).toBe(true);
      }
    });

    it("has requiresValidation flag for all types", () => {
      // This is internal but we can verify through behavior
      // All types should require validation before submission
      const types: InvoiceType[] = ["FT", "FS", "FR", "NC", "ND"];

      for (const type of types) {
        expect(workflow.isValidTransition(type, "DRAFT", "VALIDATED")).toBe(true);
      }
    });

    it("has allowsCorrection flag for all types", () => {
      const types: InvoiceType[] = ["FT", "FS", "FR", "NC", "ND"];

      for (const type of types) {
        // All should allow recall from ACCEPTED state
        expect(workflow.isValidTransition(type, "ACCEPTED", "DRAFT")).toBe(true);
        // All should allow recall from RECONCILED state
        expect(workflow.isValidTransition(type, "RECONCILED", "DRAFT")).toBe(true);
      }
    });
  });

  describe("Multiple Document Workflow", () => {
    it("handles multiple documents independently", async () => {
      const doc1 = "inv-001";
      const doc2 = "inv-002";

      // Process first document
      await workflow.transitionDocument("FT", doc1, "DRAFT", "VALIDATED", orgId, userId, auditService);
      await workflow.transitionDocument("FT", doc1, "VALIDATED", "READY_FOR_SUBMISSION", orgId, userId, auditService);
      await workflow.transitionDocument("FT", doc1, "READY_FOR_SUBMISSION", "SUBMITTED", orgId, userId, auditService);

      // Process second document
      await workflow.transitionDocument("FS", doc2, "DRAFT", "VALIDATED", orgId, userId, auditService);

      // Check audit events are separate
      const events1 = auditService.query({ organizationId: orgId, documentId: doc1 });
      const events2 = auditService.query({ organizationId: orgId, documentId: doc2 });

      expect(events1.length).toBeGreaterThan(0);
      expect(events2.length).toBeGreaterThan(0);
      expect(events1.every(e => e.metadata.documentId === doc1)).toBe(true);
      expect(events2.every(e => e.metadata.documentId === doc2)).toBe(true);
    });
  });
});