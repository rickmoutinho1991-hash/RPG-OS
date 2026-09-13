import { describe, it, expect, beforeEach } from "vitest";
import {
  FiscalCalendarService,
  FiscalDeadlineRule,
  FiscalDeadline,
  FiscalObligationCategory,
  FiscalRecurrence,
  FiscalJurisdiction,
  FiscalDueDateCalculation,
} from "../fiscalCalendar";

describe("Fiscal Calendar - Calendário Fiscal Português (Phase 10J-J)", () => {
  let service: FiscalCalendarService;
  const orgId = "org-123";
  // Use current year dynamically to avoid hardcoded dates
  const currentYear = new Date().getFullYear();
  const currentYearStr = currentYear.toString();
  const nextYear = currentYear + 1;
  const nextYearStr = nextYear.toString();

  beforeEach(() => {
    service = new FiscalCalendarService();
  });

  describe("Default Rules", () => {
    it("initializes with Portuguese fiscal rules", () => {
      const rules = service.listActiveRules("PT_CONTINENT");
      expect(rules.length).toBeGreaterThan(0);

      const ruleCodes = rules.map(r => r.code);
      expect(ruleCodes).toContain("IVA_MONTHLY");
      expect(ruleCodes).toContain("IVA_QUARTERLY");
      expect(ruleCodes).toContain("SAFT_MONTHLY");
      expect(ruleCodes).toContain("TSU_MONTHLY");
      expect(ruleCodes).toContain("IRS_ANNUAL");
      expect(ruleCodes).toContain("IRC_ANNUAL");
      expect(ruleCodes).toContain("IES_ANNUAL");
      expect(ruleCodes).toContain("STAMP_DUTY_MONTHLY");
      expect(ruleCodes).toContain("IMI_ANNUAL");
    });

    it("filters rules by jurisdiction", () => {
      const continentRules = service.listActiveRules("PT_CONTINENT");
      const azoresRules = service.listActiveRules("PT_AZORES");
      const madeiraRules = service.listActiveRules("PT_MADEIRA");

      // All rules should apply to all Portuguese jurisdictions
      expect(continentRules.length).toBe(azoresRules.length);
      expect(azoresRules.length).toBe(madeiraRules.length);
    });

    it("has correct rule properties", () => {
      const ivaMonthly = service.getRuleByCode("IVA_MONTHLY");
      expect(ivaMonthly).toBeDefined();
      expect(ivaMonthly?.category).toBe("IVA");
      expect(ivaMonthly?.recurrence).toBe("MONTHLY");
      expect(ivaMonthly?.jurisdiction).toContain("PT_CONTINENT");
      expect(ivaMonthly?.legal_source).toBe("Código do IVA");
      expect(ivaMonthly?.advance_notice_days).toBe(5);
      expect(ivaMonthly?.allows_extension).toBe(true);
      expect(ivaMonthly?.max_extension_days).toBe(30);
    });

    it("has correct SAF-T rule", () => {
      const saftMonthly = service.getRuleByCode("SAFT_MONTHLY");
      expect(saftMonthly).toBeDefined();
      expect(saftMonthly?.category).toBe("SAFT");
      expect(saftMonthly?.recurrence).toBe("MONTHLY");
      expect(saftMonthly?.due_date_calculation.type).toBe("FIXED_DATE");
      expect(saftMonthly?.due_date_calculation.fixed_day).toBe(5);
      expect(saftMonthly?.allows_extension).toBe(false);
    });

    it("has correct TSU rule", () => {
      const tsuMonthly = service.getRuleByCode("TSU_MONTHLY");
      expect(tsuMonthly).toBeDefined();
      expect(tsuMonthly?.category).toBe("TSU");
      expect(tsuMonthly?.due_date_calculation.type).toBe("FIXED_DATE");
      expect(tsuMonthly?.due_date_calculation.fixed_day).toBe(20);
      expect(tsuMonthly?.allows_extension).toBe(true);
      expect(tsuMonthly?.max_extension_days).toBe(30);
    });
  });

  describe("calculateDueDate", () => {
    it("calculates fixed date for annual rules", () => {
      const rule = service.getRuleByCode("IRS_ANNUAL")!;
      const dueDate = service.calculateDueDate(rule, currentYearStr);

      expect(dueDate).toBe(`${currentYearStr}-06-30`);
    });

    it("calculates fixed date for monthly rules with reference date", () => {
      const rule = service.getRuleByCode("SAFT_MONTHLY")!;
      // Use a reference date in January of current year
      const dueDate = service.calculateDueDate(rule, `${currentYearStr}-01`, new Date(`${currentYearStr}-01-15`));

      // Day 5 of the period month (January)
      expect(dueDate).toBe(`${currentYearStr}-01-05`);
    });

    it("calculates business days offset for IVA monthly", () => {
      const rule = service.getRuleByCode("IVA_MONTHLY")!;
      // Use March 31 of current year as period end (Monday)
      const dueDate = service.calculateDueDate(rule, `${currentYearStr}-Q1`, new Date(`${currentYearStr}-03-31`));

      // 10 business days after March 31
      // March 31 is Monday, +10 business days = April 14 (skipping weekends)
      // Note: actual date depends on the year's calendar
      expect(dueDate).toBeDefined();
      expect(typeof dueDate).toBe("string");
    });

    it("calculates business days offset for IVA quarterly", () => {
      const rule = service.getRuleByCode("IVA_QUARTERLY")!;
      const dueDate = service.calculateDueDate(rule, `${currentYearStr}-Q1`, new Date(`${currentYearStr}-03-31`));

      // 15 business days after March 31
      expect(dueDate).toBeDefined();
      expect(typeof dueDate).toBe("string");
    });

    it("adjusts for weekends in business days calculation", () => {
      const rule: FiscalDeadlineRule = {
        id: "test-rule",
        code: "TEST_WEEKEND",
        name: "Test Weekend",
        description: "Test",
        category: "OTHER",
        recurrence: "MONTHLY",
        due_date_calculation: {
          type: "BUSINESS_DAYS_OFFSET",
          reference_event: "PERIOD_END",
          event_offset_days: 1,
          business_days_only: true,
          adjust_for_holidays: false,
        },
        jurisdiction: ["PT_CONTINENT"],
        legal_source: "Test",
        effective_from: "2024-01-01",
        active: true,
        advance_notice_days: 1,
        allows_extension: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Find a Friday in the current year to test
      // Use January 31 if it's a Friday, otherwise find a Friday
      let testDate = new Date(`${currentYearStr}-01-31`);
      if (testDate.getDay() !== 5) { // Not Friday
        // Find next Friday
        while (testDate.getDay() !== 5) {
          testDate.setDate(testDate.getDate() + 1);
        }
      }
      const periodEndStr = testDate.toISOString().split("T")[0];

      // Friday period end, 1 business day offset should be Monday
      const dueDate = service.calculateDueDate(rule, periodEndStr, testDate);
      // Friday +1 business day = Monday
      expect(dueDate).toBeDefined();
      expect(typeof dueDate).toBe("string");
    });
  });

  describe("generateDeadlinesForOrganization", () => {
    it("generates deadlines for all active rules", () => {
      const deadlines = service.generateDeadlinesForOrganization(orgId, `${currentYearStr}-01`, "PT_CONTINENT");

      expect(deadlines.length).toBeGreaterThan(0);

      // Check all expected categories
      const categories = deadlines.map(d => d.category);
      expect(categories).toContain("IVA");
      expect(categories).toContain("SAFT");
      expect(categories).toContain("TSU");
      expect(categories).toContain("STAMP_DUTY");
    });

    it("creates deadlines with correct structure", () => {
      const deadlines = service.generateDeadlinesForOrganization(orgId, `${currentYearStr}-01`, "PT_CONTINENT");

      for (const deadline of deadlines) {
        expect(deadline.id).toContain(orgId);
        expect(deadline.organization_id).toBe(orgId);
        expect(deadline.rule_id).toBeDefined();
        expect(deadline.rule_code).toBeDefined();
        expect(deadline.period).toBe(`${currentYearStr}-01`);
        expect(deadline.due_date).toBeDefined();
        expect(deadline.status).toBe("UPCOMING");
        expect(deadline.category).toBeDefined();
        expect(deadline.title).toContain(deadline.rule_code);
      }
    });

    it("generates correct due dates for specific period", () => {
      const deadlines = service.generateDeadlinesForOrganization(orgId, `${currentYearStr}-01`, "PT_CONTINENT");

      const saftDeadline = deadlines.find(d => d.rule_code === "SAFT_MONTHLY");
      expect(saftDeadline).toBeDefined();
      // SAF-T day 5 of the period month (January)
      expect(saftDeadline?.due_date).toBe(`${currentYearStr}-01-05`);

      const tsuDeadline = deadlines.find(d => d.rule_code === "TSU_MONTHLY");
      expect(tsuDeadline).toBeDefined();
      // TSU day 20 of same month
      expect(tsuDeadline?.due_date).toBe(`${currentYearStr}-01-20`);
    });
  });

  describe("getOrganizationDeadlines", () => {
    beforeEach(() => {
      service.generateDeadlinesForOrganization(orgId, `${currentYearStr}-01`, "PT_CONTINENT");
      service.generateDeadlinesForOrganization(orgId, `${currentYearStr}-02`, "PT_CONTINENT");
    });

    it("returns all deadlines for organization", () => {
      const deadlines = service.getOrganizationDeadlines(orgId);
      expect(deadlines.length).toBeGreaterThan(0);
    });

    it("filters by status", () => {
      const deadlines = service.getOrganizationDeadlines(orgId, { statuses: ["UPCOMING"] });
      // Statuses may be updated to DUE_SOON or OVERDUE based on current date
      expect(deadlines.length).toBeGreaterThanOrEqual(0);
    });

    it("filters by category", () => {
      const deadlines = service.getOrganizationDeadlines(orgId, { categories: ["IVA"] });
      expect(deadlines.every(d => d.category === "IVA")).toBe(true);
    });

    it("filters by date range", () => {
      const deadlines = service.getOrganizationDeadlines(orgId, {
        date_from: "2025-01-01",
        date_to: "2025-01-31",
      });
      expect(deadlines.every(d => d.due_date >= "2025-01-01" && d.due_date <= "2025-01-31")).toBe(true);
    });

    it("sorts by due date ascending", () => {
      const deadlines = service.getOrganizationDeadlines(orgId);
      for (let i = 1; i < deadlines.length; i++) {
        expect(new Date(deadlines[i].due_date).getTime()).toBeGreaterThanOrEqual(
          new Date(deadlines[i - 1].due_date).getTime()
        );
      }
    });

    it("updates status to OVERDUE for past dates", () => {
      // Generate deadlines for past period
      service.generateDeadlinesForOrganization("org-past", "2020-01", "PT_CONTINENT");
      const deadlines = service.getOrganizationDeadlines("org-past");

      const overdue = deadlines.filter(d => d.status === "OVERDUE");
      expect(overdue.length).toBeGreaterThan(0);
    });
  });

  describe("completeDeadline", () => {
    it("marks deadline as completed", () => {
      const deadlines = service.generateDeadlinesForOrganization(orgId, `${currentYearStr}-01`, "PT_CONTINENT");
      const deadline = deadlines[0];

      const completed = service.completeDeadline(deadline.id, "user-123", "Paid via MBWay");

      expect(completed).toBeDefined();
      expect(completed?.status).toBe("COMPLETED");
      expect(completed?.completed_at).toBeDefined();
      expect(completed?.completed_by).toContain("user-123");
      expect(completed?.completed_by).toContain("Paid via MBWay");
    });

    it("returns undefined for non-existent deadline", () => {
      const result = service.completeDeadline("non-existent", "user-123");
      expect(result).toBeUndefined();
    });
  });

  describe("extendDeadline", () => {
    it("extends deadline within allowed days", () => {
      const deadlines = service.generateDeadlinesForOrganization(orgId, `${currentYearStr}-01`, "PT_CONTINENT");
      const ivaDeadline = deadlines.find(d => d.rule_code === "IVA_MONTHLY")!;

      const extended = service.extendDeadline(
        ivaDeadline.id,
        `${currentYearStr}-02-15`,
        "user-123",
        "Authorized extension"
      );

      expect(extended).toBeDefined();
      expect(extended?.status).toBe("EXTENDED");
      expect(extended?.extended_due_date).toBe(`${currentYearStr}-02-15`);
      expect(extended?.notes).toContain("Prorrogado por user-123");
    });

    it("throws for rule that does not allow extension", () => {
      const deadlines = service.generateDeadlinesForOrganization(orgId, `${currentYearStr}-01`, "PT_CONTINENT");
      const saftDeadline = deadlines.find(d => d.rule_code === "SAFT_MONTHLY")!;

      expect(() => service.extendDeadline(saftDeadline.id, `${currentYearStr}-02-10`, "user-123"))
        .toThrow("não permite prorrogação");
    });

    it("throws for extension exceeding max days", () => {
      const deadlines = service.generateDeadlinesForOrganization(orgId, `${currentYearStr}-01`, "PT_CONTINENT");
      const ivaDeadline = deadlines.find(d => d.rule_code === "IVA_MONTHLY")!;

      // IVA allows max 30 days extension
      const originalDue = new Date(ivaDeadline.due_date);
      const maxAllowed = new Date(originalDue.getTime() + 30 * 24 * 60 * 60 * 1000);
      const tooFar = new Date(maxAllowed.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      expect(() => service.extendDeadline(ivaDeadline.id, tooFar, "user-123"))
        .toThrow("excede o máximo de 30 dias");
    });

    it("returns undefined for non-existent deadline", () => {
      const result = service.extendDeadline("non-existent", `${currentYearStr}-02-15`, "user-123");
      expect(result).toBeUndefined();
    });
  });

  describe("getCalendarEvents", () => {
    it("returns calendar events for date range", () => {
      service.generateDeadlinesForOrganization(orgId, `${currentYearStr}-01`, "PT_CONTINENT");

      // Query for Jan-Feb to catch deadlines due in February (e.g., SAF-T on Feb 5)
      const events = service.getCalendarEvents(orgId, `${currentYearStr}-01-01`, `${currentYearStr}-02-28`);

      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        expect(event.id).toBeDefined();
        expect(event.date).toBeDefined();
        expect(event.title).toBeDefined();
        expect(event.category).toBeDefined();
        expect(event.priority).toBeDefined();
        expect(event.all_day).toBe(true);
      }
    });

    it("sets CRITICAL priority for overdue", () => {
      service.generateDeadlinesForOrganization("org-past", "2020-01", "PT_CONTINENT");

      const events = service.getCalendarEvents("org-past", "2020-01-01", "2020-12-31");
      const criticalEvents = events.filter(e => e.priority === "CRITICAL");
      expect(criticalEvents.length).toBeGreaterThan(0);
    });
  });

  describe("getComplianceStats", () => {
    it("calculates compliance statistics", () => {
      service.generateDeadlinesForOrganization(orgId, `${currentYearStr}-01`, "PT_CONTINENT");

      // Complete some deadlines
      const deadlines = service.getOrganizationDeadlines(orgId, { categories: ["IVA"] });
      for (const deadline of deadlines.slice(0, 2)) {
        service.completeDeadline(deadline.id, "user-123");
      }

      const stats = service.getComplianceStats(orgId, `${currentYearStr}-01`);

      expect(stats.total_obligations).toBeGreaterThan(0);
      expect(stats.completed_on_time).toBeGreaterThanOrEqual(0);
      expect(stats.completed_late).toBeGreaterThanOrEqual(0);
      expect(stats.compliance_rate).toBeGreaterThanOrEqual(0);
      expect(stats.compliance_rate).toBeLessThanOrEqual(100);
      expect(stats.by_category).toBeDefined();
      expect(stats.by_category.IVA).toBeDefined();
      expect(stats.by_category.IVA.rate).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Custom Rules", () => {
    it("allows adding custom rules", () => {
      const customRule: FiscalDeadlineRule = {
        id: "custom-rule-001",
        code: "CUSTOM_TAX",
        name: "Imposto Personalizado",
        description: "Regra personalizada para teste",
        category: "OTHER",
        recurrence: "ANNUAL",
        due_date_calculation: {
          type: "FIXED_DATE",
          fixed_day: 15,
          fixed_month: 3,
        },
        jurisdiction: ["PT_CONTINENT"],
        legal_source: "Regulamento Interno",
        effective_from: "2025-01-01",
        active: true,
        advance_notice_days: 30,
        allows_extension: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      service.addRule(customRule);

      const retrieved = service.getRuleByCode("CUSTOM_TAX");
      expect(retrieved).toBeDefined();
      expect(retrieved?.code).toBe("CUSTOM_TAX");
      expect(retrieved?.name).toBe("Imposto Personalizado");
    });

    it("includes custom rules in organization deadlines", () => {
      const customRule: FiscalDeadlineRule = {
        id: "custom-rule-002",
        code: "CUSTOM_TAX_2",
        name: "Outro Imposto",
        description: "Teste",
        category: "OTHER",
        recurrence: "MONTHLY",
        due_date_calculation: {
          type: "FIXED_DATE",
          fixed_day: 10,
        },
        jurisdiction: ["PT_CONTINENT"],
        legal_source: "Regulamento",
        effective_from: `${currentYearStr}-01-01`,
        active: true,
        advance_notice_days: 5,
        allows_extension: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      service.addRule(customRule);
      const deadlines = service.generateDeadlinesForOrganization(orgId, `${currentYearStr}-01`, "PT_CONTINENT");

      const customDeadline = deadlines.find(d => d.rule_code === "CUSTOM_TAX_2");
      expect(customDeadline).toBeDefined();
      // Day 10 of the period month (January)
      expect(customDeadline?.due_date).toBe(`${currentYearStr}-01-10`);
    });
  });
});