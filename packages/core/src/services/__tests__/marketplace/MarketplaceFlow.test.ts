import { describe, it, expect } from "vitest";
import {
  MarketplaceQuoteStateMachine,
  MarketplaceOrderStateMachine,
} from "../../marketplace/MarketplaceStateMachine";
import { MarketplaceFlow } from "../../marketplace/MarketplaceFlow";
import type { ServiceQuote, ServiceRequest } from "../../../types/marketplace";

function makeQuote(overrides: Partial<ServiceQuote> = {}): ServiceQuote {
  return {
    id: "quote-1",
    requestId: "request-1",
    providerId: "provider-1",
    items: [
      {
        id: "item-1",
        description: "Serviço A",
        quantity: 1,
        unit: "h",
        unitPriceCents: 5000,
        taxRate: 0.23,
        totalCents: 6150,
      },
    ],
    subtotalCents: 6150,
    taxCents: 0,
    totalCents: 6150,
    currency: "EUR",
    validUntil: "2026-12-31T00:00:00.000Z",
    status: "SENT",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeRequest(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: "request-1",
    clientId: "client-1",
    categoryId: "cat-1",
    title: "Preciso de um serviço",
    description: "desc",
    budget: { type: "FIXED", amountCents: 10000, currency: "EUR" },
    location: {},
    urgency: "MEDIUM",
    attachments: [],
    status: "QUOTES_RECEIVED",
    quotes: [],
    moderation: { status: "APPROVED" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("MarketplaceQuoteStateMachine", () => {
  it("allows DRAFT -> SENT", () => {
    expect(MarketplaceQuoteStateMachine.canTransition("DRAFT", "SENT")).toBe(true);
  });

  it("allows SENT -> ACCEPTED / REJECTED / WITHDRAWN", () => {
    expect(MarketplaceQuoteStateMachine.canTransition("SENT", "ACCEPTED")).toBe(true);
    expect(MarketplaceQuoteStateMachine.canTransition("SENT", "REJECTED")).toBe(true);
    expect(MarketplaceQuoteStateMachine.canTransition("SENT", "WITHDRAWN")).toBe(true);
  });

  it("allows ACCEPTED -> CONVERTED_TO_CONTRACT", () => {
    expect(
      MarketplaceQuoteStateMachine.canTransition("ACCEPTED", "CONVERTED_TO_CONTRACT"),
    ).toBe(true);
  });

  it("rejects invalid DRAFT -> ACCEPTED", () => {
    expect(MarketplaceQuoteStateMachine.canTransition("DRAFT", "ACCEPTED")).toBe(false);
  });

  it("rejects transitions from terminal states", () => {
    expect(MarketplaceQuoteStateMachine.canTransition("REJECTED", "SENT")).toBe(false);
    expect(MarketplaceQuoteStateMachine.canTransition("EXPIRED", "SENT")).toBe(false);
  });

  it("flags quote terminal states", () => {
    expect(MarketplaceQuoteStateMachine.isTerminal("REJECTED")).toBe(true);
    expect(MarketplaceQuoteStateMachine.isTerminal("SENT")).toBe(false);
  });
});

describe("MarketplaceOrderStateMachine", () => {
  it("allows PENDING_PAYMENT -> PAYMENT_PROCESSING", () => {
    expect(
      MarketplaceOrderStateMachine.canTransition("PENDING_PAYMENT", "PAYMENT_PROCESSING"),
    ).toBe(true);
  });

  it("allows PAYMENT_PROCESSING -> PAID", () => {
    expect(
      MarketplaceOrderStateMachine.canTransition("PAYMENT_PROCESSING", "PAID"),
    ).toBe(true);
  });

  it("allows the milestone cycle", () => {
    expect(MarketplaceOrderStateMachine.canTransition("CONFIRMED", "IN_PROGRESS")).toBe(true);
    expect(
      MarketplaceOrderStateMachine.canTransition("IN_PROGRESS", "MILESTONE_SUBMITTED"),
    ).toBe(true);
    expect(
      MarketplaceOrderStateMachine.canTransition("MILESTONE_SUBMITTED", "MILESTONE_APPROVED"),
    ).toBe(true);
    expect(
      MarketplaceOrderStateMachine.canTransition("MILESTONE_APPROVED", "COMPLETED"),
    ).toBe(true);
  });

  it("rejects completing an unpaid order", () => {
    expect(MarketplaceOrderStateMachine.canTransition("PENDING_PAYMENT", "COMPLETED")).toBe(false);
  });

  it("rejects escaping terminal REFUNDED", () => {
    expect(MarketplaceOrderStateMachine.canTransition("REFUNDED", "DISPUTED")).toBe(false);
  });

  it("rejects opening a dispute before any payment", () => {
    expect(MarketplaceOrderStateMachine.canTransition("PENDING_PAYMENT", "DISPUTED")).toBe(false);
  });

  it("does not loop DISPUTED -> CANCELLED -> DISPUTED", () => {
    expect(MarketplaceOrderStateMachine.canTransition("DISPUTED", "CANCELLED")).toBe(false);
  });

  it("resolves DISPUTED back to an active state", () => {
    expect(MarketplaceOrderStateMachine.canTransition("DISPUTED", "REFUNDED")).toBe(true);
    expect(MarketplaceOrderStateMachine.canTransition("DISPUTED", "COMPLETED")).toBe(true);
  });
});

describe("MarketplaceFlow quotes", () => {
  const flow = new MarketplaceFlow({
    now: () => "2026-02-01T00:00:00.000Z",
    createId: () => "evt-1",
  });

  it("accepts a quote when the requester is the actor", () => {
    const quote = makeQuote({ status: "VIEWED" });
    const request = makeRequest();
    const result = flow.acceptQuote(quote, request, "client-1");
    expect(result.entity.status).toBe("ACCEPTED");
    expect(result.newState).toBe("ACCEPTED");
    expect(result.events[0].type).toBe("QUOTE_ACCEPTED");
  });

  it("rejects acceptance by a non-requester", () => {
    const quote = makeQuote({ status: "VIEWED" });
    const request = makeRequest();
    expect(() => flow.acceptQuote(quote, request, "provider-1")).toThrow(
      "Only the requesting client",
    );
  });

  it("rejects acceptance from an invalid state", () => {
    const quote = makeQuote({ status: "REJECTED" });
    const request = makeRequest();
    expect(() => flow.acceptQuote(quote, request, "client-1")).toThrow(
      "Invalid marketplace quote transition",
    );
  });

  it("marks withdraw by the provider", () => {
    const result = flow.withdrawQuote(makeQuote(), "provider-1");
    expect(result.entity.status).toBe("WITHDRAWN");
    expect(result.events).toHaveLength(0);
  });

  it("denies withdrawal by a stranger", () => {
    expect(() => flow.withdrawQuote(makeQuote(), "client-1")).toThrow(
      "Only the quote provider",
    );
  });

  it("marks quote sent/viewed with events", () => {
    const sent = flow.markQuoteSent(makeQuote({ status: "DRAFT" }), "provider-1");
    expect(sent.entity.status).toBe("SENT");
    expect(sent.events[0].type).toBe("QUOTE_SENT");
    const viewed = flow.markQuoteViewed(makeQuote({ status: "SENT" }), "client-1");
    expect(viewed.entity.status).toBe("VIEWED");
    expect(viewed.events[0].type).toBe("QUOTE_VIEWED");
  });

  it("expires a quote", () => {
    const result = flow.expireQuote(makeQuote({ status: "SENT" }));
    expect(result.entity.status).toBe("EXPIRED");
    expect(result.events[0].type).toBe("QUOTE_EXPIRED");
  });
});

describe("MarketplaceFlow order creation", () => {
  const flow = new MarketplaceFlow({
    now: () => "2026-02-01T00:00:00.000Z",
    createId: () => `id-${Math.random()}`,
  });

  it("creates a PENDING_PAYMENT order from an accepted quote", () => {
    const result = flow.createOrderFromQuote({
      quote: makeQuote({ status: "ACCEPTED" }),
      clientId: "client-1",
      providerId: "provider-1",
      title: "Ordem do serviço",
    });
    const order = result.entity;
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.financial.totalCents).toBe(6150);
    expect(order.financial.dueCents).toBe(6150);
    expect(order.financial.paidCents).toBe(0);
    expect(order.sourceType).toBe("MARKETPLACE");
    expect(order.sourceId).toBe("request-1");
    expect(order.clientId).toBe("client-1");
    expect(order.providerId).toBe("provider-1");
    expect(result.events[0].type).toBe("ORDER_CREATED");
  });

  it("maps quote items into order items with the same money values", () => {
    const result = flow.createOrderFromQuote({
      quote: makeQuote({ status: "ACCEPTED" }),
      clientId: "client-1",
      providerId: "provider-1",
      title: "Ordem",
    });
    expect(result.entity.items[0].unitPriceCents).toBe(5000);
    expect(result.entity.items[0].totalCents).toBe(6150);
    expect(result.entity.items[0].type).toBe("SERVICE");
  });

  it("rejects order creation from a non-accepted quote", () => {
    expect(() =>
      flow.createOrderFromQuote({
        quote: makeQuote({ status: "SENT" }),
        clientId: "client-1",
        providerId: "provider-1",
        title: "Ordem",
      }),
    ).toThrow("Only an accepted quote");
  });

  it("rejects order creation when the provider differs from the quote", () => {
    expect(() =>
      flow.createOrderFromQuote({
        quote: makeQuote({ status: "ACCEPTED" }),
        clientId: "client-1",
        providerId: "other-provider",
        title: "Ordem",
      }),
    ).toThrow("must match the quote provider");
  });

  it("rejects quote financial inconsistencies", () => {
    const broken = makeQuote({
      status: "ACCEPTED",
      items: [
        {
          id: "item-1",
          description: "Serviço A",
          quantity: 1,
          unit: "h",
          unitPriceCents: 5000,
          taxRate: 0.23,
          totalCents: 9999,
        },
      ],
      subtotalCents: 6150,
      totalCents: 6150,
    });
    expect(() =>
      flow.createOrderFromQuote({
        quote: broken,
        clientId: "client-1",
        providerId: "provider-1",
        title: "Ordem",
      }),
    ).toThrow("does not match subtotalCents");
  });

  it("validates cents are integers", () => {
    const broken = makeQuote({
      status: "ACCEPTED",
      totalCents: 6150.5,
      taxCents: 0,
    });
    expect(() =>
      flow.createOrderFromQuote({
        quote: broken,
        clientId: "client-1",
        providerId: "provider-1",
        title: "Ordem",
      }),
    ).toThrow("non-negative integer");
  });

  it("converts an accepted quote to contract status", () => {
    const result = flow.convertToContract(makeQuote({ status: "ACCEPTED" }));
    expect(result.entity.status).toBe("CONVERTED_TO_CONTRACT");
  });

  it("refuses converting a non-accepted quote", () => {
    expect(() => flow.convertToContract(makeQuote({ status: "SENT" }))).toThrow(
      "Only an accepted quote",
    );
  });

  it("produces a payment schedule covering the full total", () => {
    const result = flow.createOrderFromQuote({
      quote: makeQuote({ status: "ACCEPTED" }),
      clientId: "client-1",
      providerId: "provider-1",
      title: "Ordem",
    });
    const scheduleTotal = result.entity.financial.paymentSchedule.reduce(
      (sum, p) => sum + p.amountCents,
      0,
    );
    expect(scheduleTotal).toBe(result.entity.financial.totalCents);
  });
});