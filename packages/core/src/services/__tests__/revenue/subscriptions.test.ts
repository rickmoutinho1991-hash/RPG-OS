import { describe, it, expect } from "vitest";
import {
  validateSubscriptionTransition,
  isSubscriptionExpired,
  subscriptionRemainingDays,
  canTransitionSubscription,
  type OrganizationSubscription,
} from "../../revenue";

function sub(overrides?: Partial<OrganizationSubscription>): OrganizationSubscription {
  return {
    id: "s1",
    organizationId: "orgA",
    planId: "PRO",
    status: "ACTIVE",
    monthlyPriceCents: 2490,
    billingInterval: "MONTH",
    periodPriceCents: 2490,
    currentPeriodStart: "2026-08-01T00:00:00.000Z",
    currentPeriodEnd: "2026-09-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Subscription state machine (7H)", () => {
  it("valida transições válidas", () => {
    expect(validateSubscriptionTransition({ from: "TRIALING", to: "ACTIVE" }).ok).toBe(true);
    expect(validateSubscriptionTransition({ from: "ACTIVE", to: "PAST_DUE" }).ok).toBe(true);
    expect(validateSubscriptionTransition({ from: "PAST_DUE", to: "PAUSED" }).ok).toBe(true);
    expect(validateSubscriptionTransition({ from: "PAUSED", to: "ACTIVE" }).ok).toBe(true);
    expect(validateSubscriptionTransition({ from: "ACTIVE", to: "CANCELLED" }).ok).toBe(true);
  });

  it("rejeita transições inválidas", () => {
    expect(validateSubscriptionTransition({ from: "ACTIVE", to: "TRIALING" }).ok).toBe(false);
    expect(validateSubscriptionTransition({ from: "CANCELLED", to: "ACTIVE" }).ok).toBe(false);
    expect(validateSubscriptionTransition({ from: "TRIALING", to: "PAST_DUE" }).ok).toBe(false);
    expect(canTransitionSubscription("CANCELLED", "ACTIVE")).toBe(false);
  });

  it("deteta expiração por fim de período", () => {
    const now = new Date("2026-09-02T00:00:00.000Z");
    expect(isSubscriptionExpired(sub(), now)).toBe(true);
    const now2 = new Date("2026-08-15T00:00:00.000Z");
    expect(isSubscriptionExpired(sub(), now2)).toBe(false);
    expect(isSubscriptionExpired(sub({ status: "CANCELLED" }), now2)).toBe(true);
  });

  it("calcula dias restantes do período", () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    expect(subscriptionRemainingDays(sub(), now)).toBeGreaterThan(0);
    const end = new Date("2026-09-01T00:00:00.000Z");
    const diffDays = Math.floor((end.getTime() - now.getTime()) / 86400000);
    expect(subscriptionRemainingDays(sub(), now)).toBe(diffDays);
    const expired = new Date("2026-09-05T00:00:00.000Z");
    expect(subscriptionRemainingDays(sub(), expired)).toBe(0);
  });
});
