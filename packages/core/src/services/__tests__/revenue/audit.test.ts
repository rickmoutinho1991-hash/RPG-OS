import { describe, it, expect } from "vitest";
import {
  REVENUE_AUDIT_ACTIONS,
  isRevenueAuditAction,
  REVENUE_ORIGINS,
  isRevenuePlanId,
  REVENUE_PLAN_IDS,
} from "../../revenue";

describe("Revenue audit constants (7L)", () => {
  it("contém as ações canónicas de auditoria", () => {
    for (const a of [
      "PAYMENT_CREATED",
      "PAYMENT_SUCCEEDED",
      "PAYMENT_FAILED",
      "PLATFORM_FEE_CALCULATED",
      "REVENUE_RECORDED",
      "REFUND_CREATED",
      "REVENUE_REVERSED",
      "SUBSCRIPTION_CREATED",
      "SUBSCRIPTION_CANCELLED",
      "FEE_CONFIG_CHANGED",
    ]) {
      expect(isRevenueAuditAction(a)).toBe(true);
    }
    expect(isRevenueAuditAction("BOGUS")).toBe(false);
  });

  it("origens identificáveis disponíveis", () => {
    expect(REVENUE_ORIGINS).toContain("USER");
    expect(REVENUE_ORIGINS).toContain("ADMIN");
    expect(REVENUE_ORIGINS).toContain("SYSTEM");
    expect(REVENUE_ORIGINS).toContain("AUTOMATION");
  });
});

describe("Revenue plan IDs (7C)", () => {
  it("IDs válidos e fallback", () => {
    expect(REVENUE_PLAN_IDS).toEqual(["FREE", "STARTER", "PRO", "BUSINESS", "ENTERPRISE"]);
    expect(isRevenuePlanId("PRO")).toBe(true);
    expect(isRevenuePlanId("ENTERPRISE")).toBe(true);
    expect(isRevenuePlanId("NOPE")).toBe(false);
  });
});
