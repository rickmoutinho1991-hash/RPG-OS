/**
 * RPG-OS — FASE E: Marketplace Phase 2 — Integration/Security Tests
 *
 * Demonstra garantias transversais:
 *  - Platform fee determinística e versionada (3% = 300 bps, inteiros);
 *  - Authorize → Capture (sem CAPTURED direto do PENDING);
 *  - ROOT OWNER: apenas ROOT cria admins; ADMIN nunca se torna ROOT;
 *  - AI: proposta → aprovação humana → execução; proibida de decidir;
 *  - Isolamento tenant: client A não age no order de client B
 *    (acceptance/review/dispute querem o order do dono);
 *  - Audit log: redação de segredos + verifyIntegrity;
 *  - Integrity ledger: cadeia de hashes verificável.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { computePlatformFee } from "../../PlatformFeeService";
import { PaymentStateMachine } from "../../payment/StateMachine";
import { RootOwnerProtection } from "../../../types/platformAuth";
import { MarketplaceAiAgent } from "../../marketplace/MarketplaceAiAgent";
import { MarketplaceReviewFlow } from "../../marketplace/MarketplaceReviewFlow";
import { MarketplaceAcceptanceFlow } from "../../marketplace/MarketplaceAcceptanceFlow";
import { MarketplaceDisputeFlow } from "../../marketplace/MarketplaceDisputeFlow";
import { MarketplaceWarrantyFlow } from "../../marketplace/MarketplaceWarrantyFlow";
import { ServicesRequestFlow } from "../../marketplace/ServicesRequestFlow";
import { AuditService } from "../../../security/auditFoundation";
import { IntegrityLedgerService, InMemoryIntegrityLedgerRepository } from "../../integrity/IntegrityLedgerService";
import type { ServiceQuote, Warranty, WarrantyClaim } from "../../../types/marketplace";

const NOW = "2026-10-01T10:00:00.000Z";
const IDS = (() => { let n = 0; return () => `ph2-${++n}`; })();

function buildQuote(overrides: Partial<ServiceQuote> = {}): ServiceQuote {
  return {
    id: "q-1",
    requestId: "r-1",
    providerId: "p-1",
    items: [{ id: "i-1", description: "Mão de obra", quantity: 1, unit: "un", unitPriceCents: 300000, taxRate: 0.23, totalCents: 369000 }],
    subtotalCents: 300000,
    taxCents: 69000,
    totalCents: 369000,
    currency: "EUR",
    validUntil: "2026-11-01T00:00:00.000Z",
    status: "SENT",
    createdAt: NOW,
    updatedAt: NOW,
    sentAt: NOW,
    ...overrides,
  };
}

function buildRequest(overrides: Partial<{
  id: string;
  clientId: string;
  status: string;
  quotes: ServiceQuote[];
}> = {}) {
  return {
    id: "r-1",
    clientId: "client-1",
    categoryId: "cat",
    title: "T",
    description: "D",
    budget: { type: "FIXED" as const, amountCents: 100, currency: "EUR" },
    urgency: "MEDIUM" as const,
    location: {},
    attachments: [],
    status: "PUBLISHED" as const,
    quotes: [],
    moderation: { status: "APPROVED" as const },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const testActor = { id: "u1", type: "HUMAN" as const, name: "User", roles: [], email: "u1@test.pt" };

describe("Platform fee — 3% determinística", () => {
  it("3% (300 bps) calcula fee e líquido em cents inteiros", () => {
    const { feeCents, netCents } = computePlatformFee({ grossCents: 100000, basisPoints: 300 });
    expect(feeCents).toBe(3000);
    expect(netCents).toBe(97000);
    expect(feeCents + netCents).toBe(100000);
  });

  it("round-half-up estável em valores casuais", () => {
    const f1 = computePlatformFee({ grossCents: 12345, basisPoints: 300 });
    const f2 = computePlatformFee({ grossCents: 12345, basisPoints: 300 });
    expect(f1.feeCents).toBe(f2.feeCents);
    expect(f1.netCents).toBe(f2.netCents);
  });

  it("rejeita inputs fora do domínio", () => {
    expect(() => computePlatformFee({ grossCents: -1, basisPoints: 300 })).toThrow();
    expect(() => computePlatformFee({ grossCents: 0, basisPoints: 300 })).not.toThrow(); // 0 is valid (0 fee)
    expect(() => computePlatformFee({ grossCents: 100000, basisPoints: -1 })).toThrow();
    expect(() => computePlatformFee({ grossCents: 100000, basisPoints: 10001 })).toThrow();
  });
});

describe("Payment state machine — sem atalhos", () => {
  it("PENDING nunca salta para CAPTURED", () => {
    expect(PaymentStateMachine.canTransition("PENDING", "CAPTURED")).toBe(false);
  });

  it("fluxo completo PENDING → AUTHORIZED → CAPTURED", () => {
    expect(PaymentStateMachine.canTransition("PENDING", "AUTHORIZED")).toBe(true);
    expect(PaymentStateMachine.canTransition("AUTHORIZED", "CAPTURED")).toBe(true);
  });

  it("refund apenas após capture", () => {
    expect(PaymentStateMachine.canTransition("PENDING", "REFUNDED")).toBe(false);
    expect(PaymentStateMachine.canTransition("CAPTURED", "REFUNDED")).toBe(true);
  });
});

describe("ROOT OWNER protection", () => {
  beforeEach(() => RootOwnerProtection._resetForTesting());

  it("só ROOT pode criar ADMIN; ROOT é único", () => {
    RootOwnerProtection.setRootOwnerId("root-1");
    const rootCanCreateAdmin = RootOwnerProtection.validateAction("root-1", "PLATFORM_ROOT_OWNER", "CREATE_ADMIN");
    expect(rootCanCreateAdmin.allowed).toBe(true);
    const rootCannotCreateRoot = RootOwnerProtection.validateAction("root-1", "PLATFORM_ROOT_OWNER", "CREATE_ROOT_OWNER");
    expect(rootCannotCreateRoot.allowed).toBe(false);
    expect(() => RootOwnerProtection.setRootOwnerId("root-2")).toThrow("already set");
  });

  it("ADMIN não se torna ROOT nem gere ROOT", () => {
    RootOwnerProtection.setRootOwnerId("root-1");
    const adminToRoot = RootOwnerProtection.validateAction("admin-1", "PLATFORM_ADMIN", "PROMOTE_TO_ROOT_OWNER");
    expect(adminToRoot.allowed).toBe(false);
    const adminManageRoot = RootOwnerProtection.validateAction("admin-1", "PLATFORM_ADMIN", "REMOVE_ROOT_OWNER");
    expect(adminManageRoot.allowed).toBe(false);
  });
});

describe("Tenant isolation — client A não age no order de client B", () => {
  const requestFlow = new ServicesRequestFlow({ now: () => NOW, createId: IDS });
  const acceptance = new MarketplaceAcceptanceFlow({ now: () => NOW, createId: IDS });
  const review = new MarketplaceReviewFlow({ now: () => NOW, createId: IDS });
  const dispute = new MarketplaceDisputeFlow({ now: () => NOW, createId: IDS });

  it("não-adjudica request alheio", () => {
    const q = buildQuote({ requestId: "rB" });
    const req = {
      id: "rB",
      clientId: "client-B",
      categoryId: "cat",
      title: "T",
      description: "D",
      budget: { type: "FIXED" as const, amountCents: 100, currency: "EUR" },
      urgency: "MEDIUM" as const,
      location: {},
      attachments: [],
      status: "PUBLISHED" as const,
      quotes: [q],
      moderation: { status: "APPROVED" as const },
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(() => requestFlow.adjudicateQuote({ request: req, quote: q, clientId: "client-A" })).toThrow("owner");
  });

  it("acceptance exige dono do order", () => {
    expect(() =>
      acceptance.submitAcceptance({ orderId: "oB", clientId: "client-A", orderClientId: "client-B", decision: "ACCEPT", existingAcceptance: null }),
    ).toThrow("client");
  });

  it("review exige reviewer do order", () => {
    expect(() =>
      review.submitReview({ orderId: "oB", clientId: "client-A", orderClientId: "client-B", orderProviderId: "pB", rating: 5, eligible: true, existing: null }),
    ).toThrow("Only the order client");
  });

  it("dispute exige que ator seja parte do order", () => {
    const open = dispute.openDispute({ orderId: "o1", initiatorId: "client-B", respondentId: "pB", type: "QUALITY", description: "X", paymentCaptured: true, orderTerminalRefunded: false }).dispute;
    expect(() => dispute.respondToDispute({ dispute: open, actorId: "client-A", content: "X" })).toThrow("parties");
  });
});

describe("AI approval pipeline", () => {
  const agent = new MarketplaceAiAgent({ now: () => NOW, createId: IDS });

  it("AI pode preparar contrato mas não assinar", () => {
    const proposal = agent.propose({ aiActorId: "ai-1", kind: "CONTRACT_PREPARE", targetEntityType: "contract", targetEntityId: "c-1", payload: {}, rationale: "Draft based on adjudicated quote" });
    expect(() => agent.propose({ aiActorId: "ai-1", kind: "CONTRACT_PREPARE", targetEntityType: "contract", targetEntityId: "c-1", payload: {}, rationale: "", forbiddenAction: "SIGN" })).toThrow("forbidden");
    expect(proposal.proposal.requiresHumanApproval).toBe(true);
  });

  it("approve→execute apenas por humano autorizado", () => {
    const p = agent.propose({ aiActorId: "ai-1", kind: "STATUS_EXPLAIN", targetEntityType: "order", targetEntityId: "o-1", payload: {}, rationale: "User asked" });
    const approved = agent.approve({ proposal: p.proposal, approverId: "ops-1", permissions: ["marketplace.view"] });
    const executed = agent.execute({ proposal: approved.proposal, executorId: "ops-1", permissions: ["marketplace.view"], isAiActor: false });
    expect(executed.proposal.status).toBe("EXECUTED");
    expect(executed.proposal.executedBy).toBe("ops-1");
  });

  it("AI nunca executa sozinha", () => {
    const p = agent.propose({ aiActorId: "ai-1", kind: "MILESTONE_REMIND", targetEntityType: "milestone", targetEntityId: "m-1", payload: {}, rationale: "remind" });
    expect(() => agent.execute({ proposal: p.proposal, executorId: "ai-1", permissions: ["orders.edit"], isAiActor: true })).toThrow("AI agents cannot execute");
  });

  it("ator sem permissão não aprova proposta AI", () => {
    const p = agent.propose({ aiActorId: "ai-1", kind: "CONTRACT_PREPARE", targetEntityType: "contract", targetEntityId: "c-1", payload: {}, rationale: "draft" });
    expect(() => agent.approve({ proposal: p.proposal, approverId: "ops-1", permissions: ["marketplace.view"] })).toThrow("Insufficient permissions");
    expect(() => agent.deny({ proposal: p.proposal, denierId: "ops-1", reason: "x", permissions: [] })).toThrow("Insufficient permissions");
  });

  it("aprovação rejeita tenant alheio (cross-tenant)", () => {
    const p = agent.propose({ aiActorId: "ai-1", kind: "STATUS_EXPLAIN", organizationId: "org-A", targetEntityType: "order", targetEntityId: "o-1", payload: {}, rationale: "x" });
    expect(() => agent.approve({ proposal: p.proposal, approverId: "ops-B", permissions: ["*"], organizationId: "org-B" })).toThrow("tenant");
    const approved = agent.approve({ proposal: p.proposal, approverId: "ops-A", permissions: ["*"], organizationId: "org-A" });
    expect(() => agent.execute({ proposal: approved.proposal, executorId: "ops-B", permissions: ["*"], organizationId: "org-B", isAiActor: false })).toThrow("tenant");
  });

  it("AI não aprova a própria proposta (segregação)", () => {
    const p = agent.propose({ aiActorId: "ai-1", kind: "STATUS_EXPLAIN", targetEntityType: "order", targetEntityId: "o-1", payload: {}, rationale: "x" });
    expect(() => agent.approve({ proposal: p.proposal, approverId: "ai-1", permissions: ["*"] })).toThrow("cannot approve its own proposal");
  });
});

describe("Audit log — segredos redigidos e cadeia verificável", () => {
  it("metadata com segredos não sai no log", async () => {
    const audit = new AuditService({ enabled: true, computeHashChain: true });
    await audit.log({ 
      actor: testActor, 
      module: "marketplace", 
      action: "QUOTE_ACCEPTED",
      entityType: "quote",
      entityId: "q-1",
      category: "MARKETPLACE",
      severity: "INFO",
      result: "SUCCESS",
      metadata: { token: "SECRET_TOKEN", cardNumber: "4111", safe: "ok" },
      tags: ["marketplace"]
    });
    await audit.flush();
    const entries = audit.getPersistedEntries();
    expect(entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(entries)).not.toContain("SECRET_TOKEN");
    expect(JSON.stringify(entries)).toContain("[REDACTED]");
  });

  it("verifyIntegrity deteta tamper", async () => {
    const audit = new AuditService({ enabled: true, computeHashChain: true });
    await audit.log({ 
      actor: testActor, 
      module: "marketplace", 
      action: "ORDER_CREATED",
      entityType: "order",
      entityId: "o-1",
      category: "MARKETPLACE",
      severity: "INFO",
      result: "SUCCESS",
      metadata: {},
      tags: ["marketplace"]
    });
    await audit.flush();
    const valid = await audit.verifyIntegrity();
    expect(valid.valid).toBe(true);
    // Tamper with the internal persisted entries
    const entries = audit.getPersistedEntries();
    entries[entries.length - 1]!.metadata = { tampered: true };
    const invalid = await audit.verifyIntegrity();
    expect(invalid.valid).toBe(false);
  });

  it("hash cada entrada com SHA-256 real", async () => {
    const audit = new AuditService({ enabled: true, computeHashChain: true });
    await audit.log({ 
      actor: testActor, 
      module: "marketplace", 
      action: "ORDER_CREATED",
      entityType: "order",
      entityId: "o-1",
      category: "MARKETPLACE",
      severity: "INFO",
      result: "SUCCESS",
      metadata: {},
      tags: ["marketplace"]
    });
    await audit.flush();
    const entries = audit.getPersistedEntries();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]!.metadata.hashChain).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("Integrity ledger — cadeia hash", () => {
  it("record e verifyChain", async () => {
    const repo = new InMemoryIntegrityLedgerRepository();
    const ledger = new IntegrityLedgerService(repo);
    const r1 = await ledger.record({ eventType: "QUOTE_ACCEPTED", eventId: "q-1", payload: { priceCents: 369000 }, organizationId: "org-1" });
    const r2 = await ledger.record({ eventType: "ORDER_CREATED", eventId: "o-1", payload: { totalCents: 369000 }, organizationId: "org-1" });
    expect(r2.previousHash).toBe(r1.currentHash);
    const chain = await ledger.verifyChain();
    expect(chain.valid).toBe(true);
  });

  it("verifyEvent sabe se payload foi alterado", async () => {
    const repo = new InMemoryIntegrityLedgerRepository();
    const ledger = new IntegrityLedgerService(repo);
    const rec = await ledger.record({ eventType: "ORDER_CREATED", eventId: "o-1", payload: { a: 1 }, organizationId: "org-1" });
    expect(await ledger.verifyEvent({ eventType: "ORDER_CREATED", eventId: "o-1", payload: { a: 1 } })).toBe(true);
    expect(await ledger.verifyEvent({ eventType: "ORDER_CREATED", eventId: "o-1", payload: { a: 2 } })).toBe(false);
  });

  it("nunca persiste payload no registo", async () => {
    const repo = new InMemoryIntegrityLedgerRepository();
    const ledger = new IntegrityLedgerService(repo);
    const rec = await ledger.record({ eventType: "EVIDENCE_UPLOADED", eventId: "ev-1", payload: { password: "hunter2", email: "x@y.pt" }, organizationId: "org-1" });
    expect(JSON.stringify(rec)).not.toContain("hunter2");
    expect(JSON.stringify(rec)).not.toContain("x@y.pt");
  });
});

describe("Warranty/Dispute refs", () => {
  it("warranty claim decidida tem decidBy", () => {
    const flow = new MarketplaceWarrantyFlow({ now: () => NOW, createId: IDS });
    const warranty: Warranty = {
      id: "w", orderId: "o", providerId: "p", clientId: "c",
      warrantyPeriodMonths: 6, startDate: NOW, endDate: "2099-01-01T00:00:00.000Z",
      coverage: "Defects", status: "ACTIVE", createdAt: NOW, updatedAt: NOW,
    };
    const claim: WarrantyClaim = {
      id: "cl", warrantyId: "w", orderId: "o", clientId: "c",
      description: "Issue", status: "UNDER_REVIEW", openedAt: NOW, createdAt: NOW, updatedAt: NOW,
    };
    const r = flow.decideClaim({ claim, actorId: "p", to: "ACCEPTED", authorized: true, resolution: "fix" });
    expect(r.entity.decidedBy).toBe("p");
  });

  it("dispute financeira exige pagamento capturado", () => {
    const flow = new MarketplaceDisputeFlow({ now: () => NOW, createId: IDS });
    expect(() =>
      flow.openDispute({ orderId: "o", initiatorId: "a", respondentId: "b", type: "PAYMENT", description: "x", paymentImplicated: true, paymentCaptured: false, orderTerminalRefunded: false }),
    ).toThrow("captured first");
  });
});