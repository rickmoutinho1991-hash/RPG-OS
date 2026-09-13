import { describe, it, expect } from "vitest";
import {
  validateFiscalTransition,
  type FiscalDocumentStatus,
  type InvoiceType,
} from "../../revenue";

describe("Fiscal Document Lifecycle - Phase 10I-A", () => {
  const validTransitions: Array<{
    from: FiscalDocumentStatus;
    to: FiscalDocumentStatus;
    invoiceTypes?: InvoiceType[];
    description: string;
  }> = [
    { from: "draft", to: "issued", description: "DRAFT -> ISSUED" },
    { from: "draft", to: "cancelled", description: "DRAFT -> CANCELLED" },
    { from: "issued", to: "validated", description: "ISSUED -> VALIDATED" },
    { from: "issued", to: "cancelled", description: "ISSUED -> CANCELLED" },
    { from: "issued", to: "submitted", description: "ISSUED -> SUBMITTED" },
    { from: "validated", to: "submitted", description: "VALIDATED -> SUBMITTED" },
    { from: "validated", to: "rejected", description: "VALIDATED -> REJECTED" },
    { from: "submitted", to: "accepted", description: "SUBMITTED -> ACCEPTED" },
    { from: "submitted", to: "rejected", description: "SUBMITTED -> REJECTED" },
    { from: "accepted", to: "reconciled", description: "ACCEPTED -> RECONCILED" },
    { from: "rejected", to: "reconciled", description: "REJECTED -> RECONCILED" },
  ];

  const invalidTransitions: Array<{
    from: FiscalDocumentStatus;
    to: FiscalDocumentStatus;
    description: string;
  }> = [
    { from: "draft", to: "validated", description: "DRAFT -> VALIDATED (must go through ISSUED)" },
    { from: "draft", to: "submitted", description: "DRAFT -> SUBMITTED (must go through ISSUED)" },
    { from: "draft", to: "accepted", description: "DRAFT -> ACCEPTED (invalid)" },
    { from: "draft", to: "rejected", description: "DRAFT -> REJECTED (invalid)" },
    { from: "draft", to: "reconciled", description: "DRAFT -> RECONCILED (invalid)" },
    { from: "draft", to: "void", description: "DRAFT -> VOID (invalid)" },
    { from: "issued", to: "accepted", description: "ISSUED -> ACCEPTED (must go through SUBMITTED)" },
    { from: "issued", to: "rejected", description: "ISSUED -> REJECTED (must go through VALIDATED/SUBMITTED)" },
    { from: "issued", to: "reconciled", description: "ISSUED -> RECONCILED (invalid)" },
    { from: "issued", to: "void", description: "ISSUED -> VOID (invalid)" },
    { from: "validated", to: "accepted", description: "VALIDATED -> ACCEPTED (must go through SUBMITTED)" },
    { from: "validated", to: "cancelled", description: "VALIDATED -> CANCELLED (invalid after validation)" },
    { from: "validated", to: "void", description: "VALIDATED -> VOID (invalid)" },
    { from: "submitted", to: "cancelled", description: "SUBMITTED -> CANCELLED (invalid after submission)" },
    { from: "submitted", to: "validated", description: "SUBMITTED -> VALIDATED (invalid backwards)" },
    { from: "submitted", to: "void", description: "SUBMITTED -> VOID (invalid)" },
    { from: "accepted", to: "issued", description: "ACCEPTED -> ISSUED (invalid backwards)" },
    { from: "accepted", to: "validated", description: "ACCEPTED -> VALIDATED (invalid backwards)" },
    { from: "accepted", to: "submitted", description: "ACCEPTED -> SUBMITTED (invalid backwards)" },
    { from: "accepted", to: "cancelled", description: "ACCEPTED -> CANCELLED (invalid after acceptance)" },
    { from: "accepted", to: "rejected", description: "ACCEPTED -> REJECTED (invalid)" },
    { from: "accepted", to: "void", description: "ACCEPTED -> VOID (invalid)" },
    { from: "rejected", to: "issued", description: "REJECTED -> ISSUED (invalid backwards)" },
    { from: "rejected", to: "validated", description: "REJECTED -> VALIDATED (invalid backwards)" },
    { from: "rejected", to: "submitted", description: "REJECTED -> SUBMITTED (invalid backwards)" },
    { from: "rejected", to: "accepted", description: "REJECTED -> ACCEPTED (invalid)" },
    { from: "rejected", to: "cancelled", description: "REJECTED -> CANCELLED (invalid)" },
    { from: "rejected", to: "void", description: "REJECTED -> VOID (invalid)" },
    { from: "cancelled", to: "issued", description: "CANCELLED -> ISSUED (invalid backwards)" },
    { from: "cancelled", to: "validated", description: "CANCELLED -> VALIDATED (invalid)" },
    { from: "cancelled", to: "submitted", description: "CANCELLED -> SUBMITTED (invalid)" },
    { from: "cancelled", to: "accepted", description: "CANCELLED -> ACCEPTED (invalid)" },
    { from: "cancelled", to: "rejected", description: "CANCELLED -> REJECTED (invalid)" },
    { from: "cancelled", to: "reconciled", description: "CANCELLED -> RECONCILED (invalid)" },
    { from: "cancelled", to: "void", description: "CANCELLED -> VOID (should be blocked)" },
    { from: "void", to: "draft", description: "VOID -> DRAFT (terminal state)" },
    { from: "void", to: "issued", description: "VOID -> ISSUED (terminal state)" },
    { from: "void", to: "validated", description: "VOID -> VALIDATED (terminal state)" },
    { from: "void", to: "submitted", description: "VOID -> SUBMITTED (terminal state)" },
    { from: "void", to: "accepted", description: "VOID -> ACCEPTED (terminal state)" },
    { from: "void", to: "rejected", description: "VOID -> REJECTED (terminal state)" },
    { from: "void", to: "cancelled", description: "VOID -> CANCELLED (terminal state)" },
    { from: "void", to: "reconciled", description: "VOID -> RECONCILED (terminal state)" },
    { from: "reconciled", to: "draft", description: "RECONCILED -> DRAFT (terminal state)" },
    { from: "reconciled", to: "issued", description: "RECONCILED -> ISSUED (terminal state)" },
    { from: "reconciled", to: "validated", description: "RECONCILED -> VALIDATED (terminal state)" },
    { from: "reconciled", to: "submitted", description: "RECONCILED -> SUBMITTED (terminal state)" },
    { from: "reconciled", to: "accepted", description: "RECONCILED -> ACCEPTED (terminal state)" },
    { from: "reconciled", to: "rejected", description: "RECONCILED -> REJECTED (terminal state)" },
    { from: "reconciled", to: "cancelled", description: "RECONCILED -> CANCELLED (terminal state)" },
    { from: "reconciled", to: "void", description: "RECONCILED -> VOID (terminal state)" },
  ];

  describe("Valid Transitions", () => {
    for (const t of validTransitions) {
      it(`should allow ${t.description}`, () => {
        const result = validateFiscalTransition(t.from, t.to);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    }
  });

  describe("Invalid Transitions", () => {
    for (const t of invalidTransitions) {
      it(`should reject ${t.description}`, () => {
        const result = validateFiscalTransition(t.from, t.to);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(
          result.error!.includes("Invalid transition") ||
            result.error!.includes("Transition not allowed"),
        ).toBe(true);
      });
    }
  });

  describe("Invoice Type Specific Rules", () => {
    it("should allow FT specific transitions", () => {
      const result = validateFiscalTransition("draft", "issued", "FT");
      expect(result.valid).toBe(true);
    });

    it("should allow FS specific transitions", () => {
      const result = validateFiscalTransition("draft", "issued", "FS");
      expect(result.valid).toBe(true);
    });

    it("should allow NC specific transitions", () => {
      const result = validateFiscalTransition("draft", "issued", "NC");
      expect(result.valid).toBe(true);
    });

    it("should allow ND specific transitions", () => {
      const result = validateFiscalTransition("draft", "issued", "ND");
      expect(result.valid).toBe(true);
    });

    it("should allow FR specific transitions", () => {
      const result = validateFiscalTransition("draft", "issued", "FR");
      expect(result.valid).toBe(true);
    });
  });

  describe("Current Status Parameter", () => {
    it("should accept currentStatus parameter without affecting validation", () => {
      const result = validateFiscalTransition("draft", "issued", "FT", "draft");
      expect(result.valid).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should reject self-transitions", () => {
      const statuses: FiscalDocumentStatus[] = [
        "draft",
        "issued",
        "validated",
        "submitted",
        "accepted",
        "rejected",
        "cancelled",
        "void",
        "reconciled",
      ];

      for (const status of statuses) {
        const result = validateFiscalTransition(status, status);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid transition");
      }
    });

    it("should handle all status types", () => {
      const allStatuses: FiscalDocumentStatus[] = [
        "draft",
        "issued",
        "validated",
        "submitted",
        "accepted",
        "rejected",
        "cancelled",
        "void",
        "reconciled",
      ];

      for (const from of allStatuses) {
        for (const to of allStatuses) {
          if (from !== to) {
            const result = validateFiscalTransition(from, to);
            const isValid = validTransitions.some(
              (t) => t.from === from && t.to === to,
            );
            expect(result.valid).toBe(isValid);
          }
        }
      }
    });
  });
});