/**
 * RPG-OS — FASE E: Marketplace Phase 2 — Unit Tests
 *
 * Cobertura: Request+Adjudicação, Acceptance, Review, Warranty, Dispute, AI Agent.
 * Valida: owner-only, audit, terminal guards, financial guards, role guards, AI-forbidden.
 */

import { describe, it, expect } from "vitest";
import type { ServiceRequest, ServiceQuote, Warranty, WarrantyClaim, Dispute } from "../../../types/marketplace";
import { ServicesRequestFlow } from "../../marketplace/ServicesRequestFlow";
import { MarketplaceAcceptanceFlow } from "../../marketplace/MarketplaceAcceptanceFlow";
import { MarketplaceReviewFlow } from "../../marketplace/MarketplaceReviewFlow";
import { MarketplaceWarrantyFlow } from "../../marketplace/MarketplaceWarrantyFlow";
import { MarketplaceDisputeFlow } from "../../marketplace/MarketplaceDisputeFlow";
import { MarketplaceAiAgent, AI_FORBIDDEN_ACTIONS } from "../../marketplace/MarketplaceAiAgent";

const NOW = "2026-10-01T10:00:00.000Z";
const IDS = (() => { let n = 0; return () => `id-${++n}`; })();

function buildRequest(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: IDS(),
    clientId: "client-1",
    categoryId: "cat-1",
    title: "Instalação fotovoltaica",
    description: "Preciso de instalação completa",
    budget: { type: "FIXED", amountCents: 500000, currency: "EUR" },
    urgency: "HIGH",
    location: {},
    attachments: [],
    status: "DRAFT",
    quotes: [],
    moderation: { status: "APPROVED" },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildQuote(overrides: Partial<ServiceQuote> = {}): ServiceQuote {
  return {
    id: IDS(),
    requestId: "req-1",
    providerId: "provider-1",
    items: [{ id: IDS(), description: "Mão de obra", quantity: 1, unit: "un", unitPriceCents: 300000, taxRate: 0.23, totalCents: 369000 }],
    subtotalCents: 300000,
    taxCents: 69000,
    totalCents: 369000,
    currency: "EUR",
    validUntil: "2026-11-01T00:00:00.000Z",
    warrantyMonths: 12,
    status: "SENT",
    createdAt: NOW,
    updatedAt: NOW,
    sentAt: NOW,
    ...overrides,
  };
}

describe("Request + Adjudication", () => {
  const flow = new ServicesRequestFlow({ now: () => NOW, createId: IDS });

  it("creates a request with correct owner", () => {
    const result = flow.createRequest({ clientId: "c1", kind: "SERVICE_REQUEST", categoryId: "cat", title: "T", description: "D", budget: { type: "FIXED", amountCents: 1000, currency: "EUR" } });
    expect(result.entity.clientId).toBe("c1");
    expect(result.entity.status).toBe("DRAFT");
    expect(result.events).toHaveLength(1);
  });

  it("publishRequest requires owner", () => {
    const { entity } = flow.createRequest({ clientId: "c1", kind: "SERVICE_REQUEST", categoryId: "cat", title: "T", description: "D", budget: { type: "RANGE", minCents: 100, maxCents: 200, currency: "EUR" } });
    const pub = flow.publishRequest(entity, "c1");
    expect(pub.entity.status).toBe("PUBLISHED");
    expect(() => flow.publishRequest(entity, "OTHER")).toThrow("owner");
  });

  it("adjudication creates auditable record", () => {
    const q = buildQuote({ requestId: "r1" });
    const req = buildRequest({ id: "r1", clientId: "client-1", status: "PUBLISHED", quotes: [q] });
    const result = flow.adjudicateQuote({ request: req, quote: q, clientId: "client-1", context: "best price", conditions: ["12 months warranty"] });
    expect(result.entity.request.status).toBe("ADJUDICATED");
    expect(result.entity.adjudication.priceCents).toBe(q.totalCents);
    expect(result.entity.adjudication.conditions).toContain("12 months warranty");
    expect(result.events.some((e) => e.type === "QUOTE_ACCEPTED")).toBe(true);
    expect(result.events.some((e) => e.type === "REQUEST_ADJUDICATED")).toBe(true);
    expect(q.status).toBe("SENT");
  });

  it("rejects adjudication on terminal request", () => {
    const q = buildQuote({ requestId: "r2" });
    const req = buildRequest({ id: "r2", clientId: "client-1", status: "CANCELLED", quotes: [q] });
    expect(() => flow.adjudicateQuote({ request: req, quote: q, clientId: "client-1" })).toThrow("terminal");
  });

  it("non-owner cannot adjudicate", () => {
    const q = buildQuote({ requestId: "r3" });
    const req = buildRequest({ id: "r3", status: "PUBLISHED", quotes: [q] });
    expect(() => flow.adjudicateQuote({ request: req, quote: q, clientId: "OTHER" })).toThrow("owner");
  });

  it("adds quote to request", () => {
    const req = buildRequest({ status: "PUBLISHED" });
    const q = buildQuote({ requestId: req.id, id: "q1" });
    const result = flow.addQuoteToRequest(req, q);
    expect(result.entity.quotes).toHaveLength(1);
    expect(result.entity.status).toBe("QUOTES_RECEIVED");
  });

  it("rejects add quote on terminal request", () => {
    const req = buildRequest({ status: "CONTRACTED" });
    const q = buildQuote({ requestId: req.id });
    expect(() => flow.addQuoteToRequest(req, q)).toThrow("terminal");
  });
});

describe("Acceptance", () => {
  const flow = new MarketplaceAcceptanceFlow({ now: () => NOW, createId: IDS });

  it("client can accept after completion", () => {
    const result = flow.submitAcceptance({
      orderId: "o1",
      clientId: "c1",
      orderClientId: "c1",
      decision: "ACCEPT",
      reason: "Great work",
      existingAcceptance: null,
    });
    expect(result.acceptance.decision).toBe("ACCEPT");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.type).toBe("ORDER_ACCEPTED");
  });

  it("non-client cannot submit acceptance", () => {
    expect(() =>
      flow.submitAcceptance({ orderId: "o1", clientId: "OTHER", orderClientId: "c1", decision: "ACCEPT", existingAcceptance: null }),
    ).toThrow("client");
  });

  it("cannot submit twice", () => {
    const existing = { id: "x", orderId: "o1", clientId: "c1", decision: "ACCEPT" as const, createdAt: NOW, updatedAt: NOW };
    expect(() =>
      flow.submitAcceptance({ orderId: "o1", clientId: "c1", orderClientId: "c1", decision: "ACCEPT", existingAcceptance: existing }),
    ).toThrow("already exists");
  });

  it("reject and request_revision accepted", () => {
    const r = flow.submitAcceptance({ orderId: "o1", clientId: "c1", orderClientId: "c1", decision: "REJECT", existingAcceptance: null });
    expect(r.acceptance.decision).toBe("REJECT");
    expect(r.events[0]!.type).toBe("ORDER_REJECTED");
  });
});

describe("Review", () => {
  const flow = new MarketplaceReviewFlow({ now: () => NOW, createId: IDS });

  it("client reviews provider after completed order", () => {
    const r = flow.submitReview({
      orderId: "o1",
      clientId: "c1",
      orderClientId: "c1",
      orderProviderId: "p1",
      rating: 4,
      comment: "Muito bom",
      eligible: true,
      existing: null,
    });
    expect(r.review.rating).toBe(4);
    expect(r.review.reviewerId).toBe("c1");
    expect(r.review.revieweeId).toBe("p1");
    expect(r.review.verified).toBe(true);
  });

  it("rejects ineligible review", () => {
    expect(() =>
      flow.submitReview({ orderId: "o1", clientId: "c1", orderClientId: "c1", orderProviderId: "p1", rating: 5, eligible: false, existing: null }),
    ).toThrow("not eligible");
  });

  it("rejects non-owner reviewing", () => {
    expect(() =>
      flow.submitReview({ orderId: "o1", clientId: "OTHER", orderClientId: "c1", orderProviderId: "p1", rating: 5, eligible: true, existing: null }),
    ).toThrow("Only the order client");
  });

  it("rejects duplicate", () => {
    const existing = { id: "r1", orderId: "o1", reviewerId: "c1", revieweeId: "p1", rating: 5, categories: {}, createdAt: NOW, verified: true };
    expect(() =>
      flow.submitReview({ orderId: "o1", clientId: "c1", orderClientId: "c1", orderProviderId: "p1", rating: 5, eligible: true, existing }),
    ).toThrow("already exists");
  });

  it("rating out of bounds", () => {
    expect(() =>
      flow.submitReview({ orderId: "o1", clientId: "c1", orderClientId: "c1", orderProviderId: "p1", rating: 6, eligible: true, existing: null }),
    ).toThrow("integer between");
  });

  it("aggregate helper", () => {
    expect(MarketplaceReviewFlow.aggregate([3, 4, 5])).toBe(4);
    expect(MarketplaceReviewFlow.aggregate([])).toBeNull();
  });
});

describe("Warranty", () => {
  const flow = new MarketplaceWarrantyFlow({ now: () => NOW, createId: IDS });

  it("activate warranty computes correct end date", () => {
    const w = flow.activateWarranty({
      orderId: "o1",
      providerId: "p1",
      clientId: "c1",
      warrantyPeriodMonths: 12,
      coverage: "Todos os defeitos",
      startDate: "2026-01-01T00:00:00.000Z",
    });
    expect(w.entity.status).toBe("ACTIVE");
    expect(w.entity.warrantyPeriodMonths).toBe(12);
    // Adding 12 months to 2026-01-01 gives 2027-01-01 (month 0 = January)
    expect(new Date(w.entity.endDate).getUTCMonth()).toBe(0);
  });

  it("client opens claim within window", () => {
    const warranty: Warranty = {
      id: "w1", orderId: "o1", providerId: "p1", clientId: "c1",
      warrantyPeriodMonths: 12, startDate: NOW, endDate: "2099-01-01T00:00:00.000Z",
      coverage: "Defectos", status: "ACTIVE", createdAt: NOW, updatedAt: NOW,
    };
    const claim = flow.openClaim({ warranty, clientId: "c1", description: "Avaria" });
    expect(claim.entity.status).toBe("OPEN");
    expect(claim.events[0]!.type).toBe("WARRANTY_CLAIM_OPENED");
  });

  it("non-client cannot open claim", () => {
    const warranty: Warranty = {
      id: "w1", orderId: "o1", providerId: "p1", clientId: "c1",
      warrantyPeriodMonths: 12, startDate: NOW, endDate: "2099-01-01T00:00:00.000Z",
      coverage: "Defectos", status: "ACTIVE", createdAt: NOW, updatedAt: NOW,
    };
    expect(() => flow.openClaim({ warranty, clientId: "OTHER", description: "Avaria" })).toThrow("client");
  });

  it("cannot open claim on expired warranty", () => {
    const warranty: Warranty = {
      id: "w1", orderId: "o1", providerId: "p1", clientId: "c1",
      warrantyPeriodMonths: 12, startDate: "2020-01-01T00:00:00.000Z", endDate: "2021-01-01T00:00:00.000Z",
      coverage: "Defectos", status: "ACTIVE", createdAt: NOW, updatedAt: NOW,
    };
    expect(() => flow.openClaim({ warranty, clientId: "c1", description: "X" })).toThrow("ended");
  });

  it("provider accepts claim with resolution", () => {
    const claim: WarrantyClaim = {
      id: "cl1", warrantyId: "w1", orderId: "o1", clientId: "c1",
      description: "Broken", status: "UNDER_REVIEW", openedAt: NOW, createdAt: NOW, updatedAt: NOW,
    };
    const result = flow.decideClaim({ claim, actorId: "p1", to: "ACCEPTED", authorized: true, resolution: "Replaced part" });
    expect(result.entity.status).toBe("ACCEPTED");
    expect(result.entity.decidedBy).toBe("p1");
  });

  it("unauthorized actor cannot decide claim", () => {
    const claim: WarrantyClaim = {
      id: "cl1", warrantyId: "w1", orderId: "o1", clientId: "c1",
      description: "Broken", status: "UNDER_REVIEW", openedAt: NOW, createdAt: NOW, updatedAt: NOW,
    };
    expect(() => flow.decideClaim({ claim, actorId: "p1", to: "ACCEPTED", authorized: false })).toThrow("authorized");
  });
});

describe("Dispute", () => {
  const flow = new MarketplaceDisputeFlow({ now: () => NOW, createId: IDS });

  it("opens dispute with distinct parties", () => {
    const result = flow.openDispute({
      orderId: "o1", initiatorId: "c1", respondentId: "p1",
      type: "QUALITY", description: "Bad install", paymentCaptured: true,
      orderTerminalRefunded: false,
    });
    expect(result.dispute.status).toBe("OPEN");
    expect(result.dispute.initiatorId).toBe("c1");
    expect(result.events[0]!.type).toBe("DISPUTE_OPENED");
  });

  it("rejects financial dispute without captured payment", () => {
    expect(() => flow.openDispute({
      orderId: "o1", initiatorId: "c1", respondentId: "p1",
      type: "PAYMENT", description: "X", paymentImplicated: true, paymentCaptured: false,
      orderTerminalRefunded: false,
    })).toThrow("captured first");
  });

  it("rejects dispute on terminal refunded order", () => {
    expect(() => flow.openDispute({
      orderId: "o1", initiatorId: "c1", respondentId: "p1",
      type: "OTHER", description: "X", paymentCaptured: true,
      orderTerminalRefunded: true,
    })).toThrow("fully refunded");
  });

  it("party responds with evidence", () => {
    const d = flow.openDispute({ orderId: "o1", initiatorId: "c1", respondentId: "p1", type: "TIMELINE", description: "X", paymentCaptured: true, orderTerminalRefunded: false }).dispute;
    const result = flow.respondToDispute({ dispute: d, actorId: "p1", content: "I delivered on time", evidence: [{ type: "DOCUMENT", url: "https://example.com/proof.pdf", content: "Proof of delivery" }] });
    expect(result.dispute.evidence.length).toBe(1);
  });

  it("non-party cannot respond", () => {
    const d = flow.openDispute({ orderId: "o1", initiatorId: "c1", respondentId: "p1", type: "OTHER", description: "X", paymentCaptured: true, orderTerminalRefunded: false }).dispute;
    expect(() => flow.respondToDispute({ dispute: d, actorId: "OTHER", content: "X" })).toThrow("parties");
  });

  it("resolution requires authorized resolver", () => {
    const d = flow.openDispute({ orderId: "o1", initiatorId: "c1", respondentId: "p1", type: "PAYMENT", description: "X", paymentCaptured: true, orderTerminalRefunded: false }).dispute;
    expect(() => flow.resolveDispute({ dispute: d, resolverId: "p1", resolutionType: "REFUND_FULL", description: "Agreed", authorizedResolver: false })).toThrow("authorized");
  });

  it("resolution freezes dispute", () => {
    const d = flow.openDispute({ orderId: "o1", initiatorId: "c1", respondentId: "p1", type: "QUALITY", description: "X", paymentCaptured: true, orderTerminalRefunded: false }).dispute;
    const resolved = flow.resolveDispute({ dispute: d, resolverId: "platform-1", resolutionType: "COMPENSATION", description: "Compensation agreed", amountCents: 5000, authorizedResolver: true });
    expect(resolved.dispute.status).toBe("RESOLVED");
    expect(resolved.dispute.resolution!.amountCents).toBe(5000);
    expect(resolved.dispute.resolution!.agreedByInitiator).toBe(false);
    expect(resolved.events[0]!.type).toBe("DISPUTE_RESOLVED");
  });
});

describe("AI Agent", () => {
  const agent = new MarketplaceAiAgent({ now: () => NOW, createId: IDS });

  it("proposes a capability", () => {
    const r = agent.propose({ aiActorId: "ai-1", kind: "STATUS_EXPLAIN", targetEntityType: "order", targetEntityId: "o-1", payload: {}, rationale: "User asked" });
    expect(r.proposal.status).toBe("PROPOSED");
    expect(r.proposal.requiresHumanApproval).toBe(true);
    expect(r.events[0]!.type).toBe("AI_PROPOSAL_CREATED");
  });

  it("forbids adjudicate via forbiddenAction", () => {
    expect(() => agent.propose({ aiActorId: "ai-1", kind: "QUOTE_COMPARE", targetEntityType: "quote", targetEntityId: "q-1", payload: {}, rationale: "", forbiddenAction: "ADJUDICATE" })).toThrow("forbidden");
  });

  it("cannot approve own proposal", () => {
    const r = agent.propose({ aiActorId: "ai-1", kind: "MILESTONE_REMIND", targetEntityType: "milestone", targetEntityId: "m-1", payload: {}, rationale: "r" });
    expect(() => agent.execute({ proposal: r.proposal, executorId: "ai-1", permissions: ["orders.edit"], isAiActor: true })).toThrow("AI agents cannot execute");
    expect(() => agent.approve({ proposal: r.proposal, approverId: "ai-1", permissions: ["orders.edit"] })).toThrow("cannot approve its own proposal");
  });

  it("approve then execute by human", () => {
    const r = agent.propose({ aiActorId: "ai-1", kind: "CONTRACT_PREPARE", targetEntityType: "contract", targetEntityId: "c-1", payload: {}, rationale: "Prepare draft" });
    const approved = agent.approve({ proposal: r.proposal, approverId: "admin-1", permissions: ["contracts.edit"] });
    expect(approved.proposal.status).toBe("APPROVED");
    const executed = agent.execute({ proposal: approved.proposal, executorId: "ops-1", permissions: ["contracts.edit"], isAiActor: false });
    expect(executed.proposal.status).toBe("EXECUTED");
    expect(executed.proposal.executedBy).toBe("ops-1");
  });

  it("deny blocks execution", () => {
    const r = agent.propose({ aiActorId: "ai-1", kind: "EVIDENCE_REQUEST", targetEntityType: "milestone", targetEntityId: "m-1", payload: {}, rationale: "Request docs" });
    const denied = agent.deny({ proposal: r.proposal, denierId: "owner-1", reason: "Not needed", permissions: ["evidence.create"] });
    expect(denied.proposal.status).toBe("DENIED");
    expect(() => agent.execute({ proposal: denied.proposal, executorId: "ops-1", permissions: ["evidence.create"], isAiActor: false })).toThrow("Only approved proposals");
  });

  it("executor without required permission cannot run", () => {
    const r = agent.propose({ aiActorId: "ai-1", kind: "LISTING_SUGGEST", targetEntityType: "listing", targetEntityId: "l-1", payload: {}, rationale: "suggest" });
    const approved = agent.approve({ proposal: r.proposal, approverId: "admin-1", permissions: ["marketplace.edit"] });
    expect(() => agent.execute({ proposal: approved.proposal, executorId: "ops-1", permissions: [], isAiActor: false })).toThrow("Insufficient permissions");
  });

  it("FORBIDDEN_ACTIONS list is stable", () => {
    expect(AI_FORBIDDEN_ACTIONS).toContain("ADJUDICATE");
    expect(AI_FORBIDDEN_ACTIONS).toContain("SIGN");
    expect(AI_FORBIDDEN_ACTIONS).toContain("CONFIRM_PAYMENT");
    expect(AI_FORBIDDEN_ACTIONS).toContain("RELEASE_FUNDS");
    expect(AI_FORBIDDEN_ACTIONS).toContain("CHANGE_PRICE");
    expect(AI_FORBIDDEN_ACTIONS).toContain("ACCEPT_DISPUTE");
    expect(AI_FORBIDDEN_ACTIONS).toContain("CHANGE_PERMISSIONS");
    expect(AI_FORBIDDEN_ACTIONS).toContain("ACTIVATE_CONTRACT");
  });
});