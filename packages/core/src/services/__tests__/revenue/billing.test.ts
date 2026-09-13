import { describe, it, expect } from "vitest";
import {
  billingPeriodDays,
  billingPeriodPriceCents,
  computeNextChargeDate,
  calculateUpgradeProration,
  calculateDowngradeProration,
  calculateRenewal,
  calculateNextBillingDate,
  calculateSubscriptionPeriod,
  buildSubscriptionIdempotencyKey,
  subscriptionMrrCents,
  arrFromMrr,
  checkPlanLimit,
  planLimitStatus,
  planLimitMessage,
  isPlanUpgrade,
  isPlanDowngrade,
  calculateSubscriptionRevenue,
  validateSubscriptionTransition,
  SUBSCRIPTION_LIFECYCLE_EVENTS,
  SubscriptionLifecycleEventPayload,
  createUpgradePayload,
  createCreatedPayload,
  createCancelledPayload,
  createRenewedPayload,
  createPaymentFailedPayload,
  type BillingInterval,
  type RevenuePlanId,
} from "../../revenue/billing";
// Debug: verify the function source
console.log("=== BUILD SUBSCRIPTION IDEMPOTENCY KEY DEBUG ===");
console.log("Module path: ../../revenue/billing");
console.log("Function imported successfully");

describe("Billing Engine (FASE 10)", () => {
  describe("billingPeriodDays", () => {
    it("returns 30 for MONTH and 365 for YEAR", () => {
      expect(billingPeriodDays("MONTH")).toBe(30);
      expect(billingPeriodDays("YEAR")).toBe(365);
    });
  });

  describe("billingPeriodPriceCents", () => {
    it("calculates monthly and annual price with discount", () => {
      // STARTER: monthlyPriceCents=1900, annualDiscountBps=2000 (20%)
      // MONTH = monthlyPriceCents (sem discount), YEAR = planIntervalPriceCents(com discount)
      expect(billingPeriodPriceCents("STARTER", "MONTH")).toBe(1900);
      expect(billingPeriodPriceCents("STARTER", "YEAR")).toBe(18240);
      // FREE: monthlyPriceCents=0 → sempre 0
      expect(billingPeriodPriceCents("FREE", "YEAR")).toBe(0);
      // PRO: monthlyPriceCents=4900, annualDiscountBps=2000 (20%)
      // MONTH = 4900, YEAR = planIntervalPriceCents(4900, "YEAR") = round(4900*12*8000/10000) = 47040
      expect(billingPeriodPriceCents("PRO", "YEAR")).toBe(47040);
    });
  });

  describe("computeNextChargeDate", () => {
    it("calculates next charge date correctly", () => {
      const end = new Date("2026-08-31T00:00:00.000Z");
      const next = computeNextChargeDate(end, "MONTH");
      expect(next.getTime()).toBeGreaterThan(end.getTime());
      expect((next.getTime() - end.getTime()) / 1000 / 60 / 60 / 24).toBe(30);
    });
  });

  describe("calculateUpgradeProration", () => {
    it("calculates upgrade prorata in cents", () => {
      const result = calculateUpgradeProration({
        oldPriceCents: 2490,
        newPriceCents: 4990,
        periodDays: 30,
        remainingDays: 10,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.cents).toBe(830);
    });

    it("calculates downgrade prorata (negative delta = credit)", () => {
      const result = calculateDowngradeProration({
        oldPriceCents: 4990,
        newPriceCents: 2490,
        periodDays: 30,
        remainingDays: 10,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.cents).toBe(-830);
    });

    it("rejects invalid period days", () => {
      expect(
        calculateUpgradeProration({ oldPriceCents: 100, newPriceCents: 100, periodDays: 0, remainingDays: 5 }).ok,
      ).toBe(false);
    });

    it("rejects remainingDays outside period", () => {
      expect(
        calculateUpgradeProration({ oldPriceCents: 100, newPriceCents: 100, periodDays: 30, remainingDays: 31 }).ok,
      ).toBe(false);
    });
  });

describe("calculateRenewal", () => {
    it("returns the period price for a plan+interval", () => {
      // PRO: monthlyPriceCents=4900, so MONTH renewal = 4900
      // 2490 era valor de catálogo antigo; atualizar para REVENUE_PLANS fonte de verdade
      expect(calculateRenewal("PRO", "MONTH")).toBe(4900);
      // FREE: monthlyPriceCents=0 → renewal sempre 0
expect(calculateRenewal("FREE", "YEAR")).toBe(0);
    });
  });

  describe("calculateNextBillingDate", () => {
    it("calculates next billing date correctly", () => {
      const end = new Date("2026-08-31T00:00:00.000Z");
      const next = calculateNextBillingDate(end, "MONTH");
      expect(next.getTime()).toBeGreaterThan(end.getTime());
      expect((next.getTime() - end.getTime()) / 1000 / 60 / 60 / 24).toBe(30);
    });
  });

describe("calculateSubscriptionPeriod", () => {
  it("returns start and end dates", () => {
    const periodStart = new Date("2026-08-01T00:00:00.000Z");
    const { start, end } = calculateSubscriptionPeriod(periodStart, "MONTH");
    expect(start.getTime()).toBeLessThan(end.getTime());
    expect(end.getMonth()).toBe(periodStart.getMonth() + 1);
  });
});

  describe("buildSubscriptionIdempotencyKey", () => {
    it("creates stable keys", () => {
      const a = buildSubscriptionIdempotencyKey("org", "payment", "txn-123");
      const b = buildSubscriptionIdempotencyKey("org", "payment", "txn-123");
      const c = buildSubscriptionIdempotencyKey("org", "payment", "txn-456");
      expect(a).toBe(b);
      expect(a).toBe("org:payment:txn-123");
      expect(a).not.toBe(c);
      expect(buildSubscriptionIdempotencyKey("ORG", "Payment")).toBe("org:payment");
    });
  });

  describe("subscriptionMrrCents", () => {
    it("normalizes MRR by month irrespective of interval", () => {
      // STARTER: monthlyPriceCents=1900, annualDiscountBps=2000 (20%)
      // MRR = monthly equivalent, no discount applied for MONTH
      expect(subscriptionMrrCents("STARTER", "MONTH")).toBe(1900);
      // YEAR MRR = monthly equivalent with discount = 1520 (1900 * 80%)
      expect(subscriptionMrrCents("STARTER", "YEAR")).toBe(1520);
      // FREE: monthlyPriceCents=0 → sempre 0
      expect(subscriptionMrrCents("FREE", "YEAR")).toBe(0);
      // arrFromMrr
      expect(arrFromMrr(1900)).toBe(22800); // 1900 * 12
      expect(arrFromMrr(1520)).toBe(18240); // 1520 * 12
    });
  });

describe("checkPlanLimit", () => {
    it("validates plan limits", () => {
      // FREE: maxUsers=1
      expect(checkPlanLimit("FREE", "maxUsers", 0).ok).toBe(true);
      expect(checkPlanLimit("FREE", "maxUsers", 1).ok).toBe(false);
      expect(checkPlanLimit("FREE", "maxUsers", 2).ok).toBe(false);
      expect(checkPlanLimit("FREE", "maxUsers", 2).usagePct).toBe(200);
      // ENTERPRISE: maxUsers=-1 → Infinity
      expect(checkPlanLimit("ENTERPRISE", "maxUsers", 5).ok).toBe(true);
      // STARTER: maxUsers=3
      expect(checkPlanLimit("STARTER", "maxUsers", 2).ok).toBe(true);
      expect(checkPlanLimit("STARTER", "maxUsers", 3).ok).toBe(false);
      expect(checkPlanLimit("STARTER", "maxUsers", 4).ok).toBe(false);
      expect(checkPlanLimit("STARTER", "maxUsers", 3).usagePct).toBe(100);
    });
  });
  });

  describe("planLimitStatus", () => {
    it("returns OK/WARNING/EXCEEDED", () => {
      // FREE: maxUsers=1
      expect(planLimitStatus("FREE", "maxUsers", 0)).toBe("OK");
      expect(planLimitStatus("FREE", "maxUsers", 1)).toBe("EXCEEDED");
      expect(planLimitStatus("FREE", "maxUsers", 2)).toBe("EXCEEDED");
      // STARTER: maxUsers=3
      expect(planLimitStatus("STARTER", "maxUsers", 1)).toBe("OK"); // 33%
      expect(planLimitStatus("STARTER", "maxUsers", 2)).toBe("OK"); // 67% < 80% threshold
      expect(planLimitStatus("STARTER", "maxUsers", 3)).toBe("EXCEEDED"); // 100%
      expect(planLimitStatus("STARTER", "maxUsers", 4)).toBe("EXCEEDED");
      // ENTERPRISE: maxUsers=-1 → Infinity
      expect(planLimitStatus("ENTERPRISE", "maxUsers", 5)).toBe("OK");
});
  });

  describe("planLimitMessage", () => {
    it("generates appropriate messages", () => {
      expect(planLimitMessage("FREE", "maxUsers", 0)).toContain("Within limits");
      expect(planLimitMessage("FREE", "maxUsers", 2)).toContain("upgrade");
      expect(planLimitMessage("ENTERPRISE", "maxUsers", 5)).toContain("Within limits");
    });
  });

  describe("isPlanUpgrade", () => {
    it("classifies plan changes", () => {
      expect(isPlanUpgrade("FREE", "PRO", "MONTH")).toBe(true);
      expect(isPlanUpgrade("BUSINESS", "PRO", "MONTH")).toBe(false);
      expect(isPlanUpgrade("STARTER", "PRO", "MONTH")).toBe(true);
    });
  });

  describe("isPlanDowngrade", () => {
    it("classifies plan downgrades", () => {
      expect(isPlanDowngrade("PRO", "FREE", "MONTH")).toBe(true);
      expect(isPlanDowngrade("FREE", "PRO", "MONTH")).toBe(false);
    });
  });

  describe("calculateSubscriptionRevenue", () => {
    it("calculates commission and net from gross", () => {
      // PRO: platformFeeBps=200 (2%)
      // gross=10000 → commission = floor(10000 * 200 / 10000) = 200
      // net = 10000 - 200 = 9800
      // invariants: gross = fee + net, fee >= 0, net >= 0
      const { commissionCents, netCents } = calculateSubscriptionRevenue(
        "PRO",
        "MONTH",
        10000,
      );
      expect(commissionCents).toBe(200); // 2% of 10000
      expect(netCents).toBe(9800);
      expect(commissionCents + netCents).toBe(10000);
    });
  });

  describe("validateSubscriptionTransition", () => {
    it("validates allowed transitions", () => {
      expect(validateSubscriptionTransition({ from: "ACTIVE", to: "PAST_DUE" }).ok).toBe(true);
      expect(validateSubscriptionTransition({ from: "ACTIVE", to: "CANCELLED" }).ok).toBe(true);
      expect(validateSubscriptionTransition({ from: "ACTIVE", to: "TRIALING" }).ok).toBe(false);
      expect(validateSubscriptionTransition({ from: "CANCELLED", to: "ACTIVE" }).ok).toBe(false);
    });
  });

  describe("SUBSCRIPTION_LIFECYCLE_EVENTS", () => {
    it("contains all expected events", () => {
      expect(SUBSCRIPTION_LIFECYCLE_EVENTS).toContain("SUBSCRIPTION_CREATED");
      expect(SUBSCRIPTION_LIFECYCLE_EVENTS).toContain("SUBSCRIPTION_UPGRADED");
      expect(SUBSCRIPTION_LIFECYCLE_EVENTS).toContain("SUBSCRIPTION_DOWNGRADED");
      expect(SUBSCRIPTION_LIFECYCLE_EVENTS).toContain("SUBSCRIPTION_RENEWED");
      expect(SUBSCRIPTION_LIFECYCLE_EVENTS).toContain("SUBSCRIPTION_CANCELLED");
      expect(SUBSCRIPTION_LIFECYCLE_EVENTS).toContain("SUBSCRIPTION_REACTIVATED");
      expect(SUBSCRIPTION_LIFECYCLE_EVENTS).toContain("SUBSCRIPTION_EXPIRED");
      expect(SUBSCRIPTION_LIFECYCLE_EVENTS).toContain("SUBSCRIPTION_PAYMENT_FAILED");
    });
  });

  describe("SubscriptionLifecycleEventPayload", () => {
    it("creates upgrade payload", () => {
      const payload = createUpgradePayload(
        "org-123",
        "sub-456",
        "FREE",
        "PRO",
        "PROPOSED",
        "ACTIVE",
        "MONTH",
        2490,
        "ADMIN",
        "Upgrade to PRO",
      );
      expect(payload.event).toBe("SUBSCRIPTION_UPGRADED");
      expect(payload.fromPlanId).toBe("FREE");
      expect(payload.toPlanId).toBe("PRO");
      expect(payload.origin).toBe("ADMIN");
      expect(payload.reason).toBe("Upgrade to PRO");
      expect(payload.idempotencyKey).toContain("upgrade");
    });

    it("creates created payload", () => {
      const payload = createCreatedPayload(
        "org-123",
        "sub-456",
        "PRO",
        "MONTH",
        2490,
        "USER",
        "Initial subscription",
      );
      expect(payload.event).toBe("SUBSCRIPTION_CREATED");
      expect(payload.toPlanId).toBe("PRO");
      expect(payload.billingInterval).toBe("MONTH");
      expect(payload.idempotencyKey).toContain("created");
    });

    it("creates cancelled payload", () => {
      const payload = createCancelledPayload(
        "org-123",
        "sub-456",
        "PRO",
        "ACTIVE",
        "ADMIN",
        "Customer requested cancel",
      );
      expect(payload.event).toBe("SUBSCRIPTION_CANCELLED");
      expect(payload.fromPlanId).toBe("PRO");
      expect(payload.idempotencyKey).toContain("cancelled");
    });

    it("creates renewed payload", () => {
      const payload = createRenewedPayload(
        "org-123",
        "sub-456",
        2490,
        "SYSTEM",
        "Automatic renewal",
      );
      expect(payload.event).toBe("SUBSCRIPTION_RENEWED");
      expect(payload.periodPriceCents).toBe(2490);
      expect(payload.idempotencyKey).toContain("renewed");
    });

it("creates payment failed payload", () => {
      const payload = createPaymentFailedPayload(
        "org-123",
        "sub-456",
        "ADMIN",
        "Insufficient funds",
      );
      expect(payload.event).toBe("SUBSCRIPTION_PAYMENT_FAILED");
      expect(payload.idempotencyKey).toContain("payment-failed");
    });
});
