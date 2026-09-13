import { describe, it, expect } from "vitest";
import { OrderStatusStateMachine, MilestoneStatusStateMachine } from "../../order/OrderStateMachine";
import { OrderMilestoneFlow } from "../../order/OrderMilestoneFlow";
import type { Order, OrderMilestone } from "../../../types/order";

function makeMilestone(overrides: Partial<OrderMilestone> = {}): OrderMilestone {
  return {
    id: "ms-1",
    orderId: "order-1",
    sequence: 1,
    title: "Fase 1",
    type: "DELIVERABLE",
    trigger: "MANUAL",
    status: "IN_PROGRESS",
    amountCents: 10000,
    currency: "EUR",
    paymentStatus: "PENDING",
    deliverables: [
      {
        id: "del-1",
        milestoneId: "ms-1",
        name: "Relatório",
        type: "REPORT",
        required: true,
        status: "PENDING",
      },
    ],
    acceptanceCriteria: [],
    evidence: [],
    reviews: [],
    dependsOn: [],
    responsibleParty: "PROVIDER",
    customFields: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function creditOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    type: "SERVICE",
    orderNumber: "ORD-1",
    title: "Ordem de teste",
    clientId: "client-1",
    providerId: "provider-1",
    sourceType: "MANUAL",
    financial: {
      currency: "EUR",
      subtotalCents: 10000,
      taxCents: 0,
      discountCents: 0,
      totalCents: 10000,
      paidCents: 0,
      dueCents: 10000,
      paymentSchedule: [
        {
          id: "ms-1",
          description: "Pagamento fase 1",
          amountCents: 10000,
          dueDate: "2026-06-01T00:00:00.000Z",
          trigger: "CLIENT_APPROVAL",
          triggerReference: "ms-1",
          status: "PENDING",
        },
      ],
      paymentStatus: "PENDING",
      platformFeeCents: 0,
      providerPayoutCents: 10000,
      invoiceIds: [],
    },
    timeline: { timezone: "UTC", bufferDays: 0 },
    milestones: [makeMilestone()],
    currentMilestoneIndex: 0,
    status: "CONFIRMED",
    items: [
      {
        id: "item-1",
        type: "SERVICE",
        description: "Serviço",
        quantity: 1,
        unit: "h",
        unitPriceCents: 10000,
        taxRate: 0,
        discountCents: 0,
        totalCents: 10000,
        metadata: {},
      },
    ],
    settings: {
      autoAdvanceMilestones: true,
      requireClientApproval: true,
      allowRevisions: true,
      maxRevisions: 1,
      autoReleasePayment: true,
      approvalGracePeriodDays: 3,
      allowClientCancellation: true,
      cancellationPolicy: { allowed: true, noticePeriodDays: 3, refundPolicy: "FULL" },
    },
    tags: [],
    customFields: {},
    auditTrail: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("OrderStatusStateMachine", () => {
  it("allows the happy payment+execution path", () => {
    expect(OrderStatusStateMachine.canTransition("PENDING_PAYMENT", "PAYMENT_PROCESSING")).toBe(true);
    expect(OrderStatusStateMachine.canTransition("PAYMENT_PROCESSING", "PAID")).toBe(true);
    expect(OrderStatusStateMachine.canTransition("PAID", "CONFIRMED")).toBe(true);
    expect(OrderStatusStateMachine.canTransition("IN_PROGRESS", "MILESTONE_SUBMITTED")).toBe(true);
    expect(OrderStatusStateMachine.canTransition("MILESTONE_SUBMITTED", "MILESTONE_UNDER_REVIEW")).toBe(true);
    expect(OrderStatusStateMachine.canTransition("MILESTONE_SUBMITTED", "MILESTONE_APPROVED")).toBe(true);
  });

  it("rejects completing before payment", () => {
    expect(OrderStatusStateMachine.canTransition("PENDING_PAYMENT", "COMPLETED")).toBe(false);
  });

  it("rejects escaping from a terminal state", () => {
    expect(OrderStatusStateMachine.canTransition("REFUNDED", "COMPLETED")).toBe(false);
  });

  it("allows dispute resolution back to execution", () => {
    expect(OrderStatusStateMachine.canTransition("DISPUTED", "IN_PROGRESS")).toBe(true);
  });
});

describe("MilestoneStatusStateMachine", () => {
  it("allows the submit->approve->pay path", () => {
    expect(MilestoneStatusStateMachine.canTransition("IN_PROGRESS", "SUBMITTED")).toBe(true);
    expect(MilestoneStatusStateMachine.canTransition("SUBMITTED", "UNDER_REVIEW")).toBe(true);
    expect(MilestoneStatusStateMachine.canTransition("UNDER_REVIEW", "APPROVED")).toBe(true);
    expect(MilestoneStatusStateMachine.canTransition("APPROVED", "PAID")).toBe(true);
  });

  it("rejects approving an unsubmitted milestone", () => {
    expect(MilestoneStatusStateMachine.canTransition("IN_PROGRESS", "APPROVED")).toBe(false);
  });

  it("allows revision loops", () => {
    expect(MilestoneStatusStateMachine.canTransition("UNDER_REVIEW", "REVISION_REQUESTED")).toBe(true);
    expect(MilestoneStatusStateMachine.canTransition("REVISION_REQUESTED", "IN_PROGRESS")).toBe(true);
  });

  it("marks PAID as terminal", () => {
    expect(MilestoneStatusStateMachine.isTerminal("PAID")).toBe(true);
    expect(MilestoneStatusStateMachine.isTerminal("SUBMITTED")).toBe(false);
  });
});

describe("OrderMilestoneFlow", () => {
  const flow = new OrderMilestoneFlow({
    now: () => "2026-02-01T00:00:00.000Z",
    createId: () => `id-${Math.random()}`,
  });

  it("rejects financials that do not balance", () => {
    const order = creditOrder({ financial: { ...creditOrder().financial, dueCents: 999 } });
    expect(() => flow.validateOrderFinancials(order)).toThrow("dueCents must equal totalCents minus paidCents");
  });

  it("rejects negative or float amounts", () => {
    const order = creditOrder({ financial: { ...creditOrder().financial, totalCents: 10.5 } });
    expect(() => flow.validateOrderFinancials(order)).toThrow("non-negative integer");
  });

  it("submits a milestone and marks required deliverables", () => {
    const result = flow.submitMilestone({
      order: creditOrder(),
      milestone: creditOrder().milestones[0],
      actorId: "provider-1",
      evidence: [{ deliverableId: "del-1", title: "Relatório", hash: "a".repeat(64) }],
    });
    expect(result.order.status).toBe("MILESTONE_SUBMITTED");
    expect(result.order.milestones[0].status).toBe("SUBMITTED");
    expect(result.order.milestones[0].deliverables[0].status).toBe("SUBMITTED");
    expect(result.events.map((e) => e.type)).toContain("MILESTONE_SUBMITTED");
    expect(result.events.map((e) => e.type)).toContain("EVIDENCE_SUBMITTED");
  });

  it("blocks submission when required deliverables are missing", () => {
    expect(() =>
      flow.submitMilestone({ order: creditOrder(), milestone: creditOrder().milestones[0], actorId: "provider-1" }),
    ).toThrow("Missing required deliverables");
  });

  it("blocks submission by a stranger", () => {
    expect(() =>
      flow.submitMilestone({
        order: creditOrder(),
        milestone: creditOrder().milestones[0],
        actorId: "hacker-1",
        evidence: [{ deliverableId: "del-1", title: "x", hash: "a".repeat(64) }],
      }),
    ).toThrow("not a party");
  });

  it("rejects malformed evidence hash", () => {
    expect(() =>
      flow.submitMilestone({
        order: creditOrder(),
        milestone: creditOrder().milestones[0],
        actorId: "provider-1",
        evidence: [{ deliverableId: "del-1", title: "x", hash: "bad-hash" }],
      }),
    ).toThrow("64-char hex");
  });

  it("approves and auto-releases payment to a completed order", () => {
    const submitted = flow.submitMilestone({
      order: creditOrder(),
      milestone: creditOrder().milestones[0],
      actorId: "provider-1",
      evidence: [{ deliverableId: "del-1", title: "Relatório", hash: "a".repeat(64) }],
    });
    const result = flow.approveMilestone({
      order: submitted.order,
      milestone: submitted.order.milestones[0],
      actorId: "client-1",
      evidenceReviewed: ["del-1"],
      notes: "Aprovado",
    });
    expect(result.order.milestones[0].status).toBe("PAID");
    expect(result.order.milestones[0].paymentStatus).toBe("CAPTURED");
    expect(result.order.status).toBe("COMPLETED");
    expect(result.order.financial.paidCents).toBe(10000);
    expect(result.order.financial.dueCents).toBe(0);
    expect(result.order.financial.paymentSchedule[0].status).toBe("PAID");
    expect(result.order.completedAt).toBeDefined();
    const types = result.events.map((e) => e.type);
    expect(types).toContain("MILESTONE_APPROVED");
    expect(types).toContain("MILESTONE_PAID");
    expect(types).toContain("PAYMENT_RELEASED");
    expect(types).toContain("ORDER_COMPLETED");
  });

  it("does not auto-release when autoReleasePayment is disabled", () => {
    const order = creditOrder({ settings: { ...creditOrder().settings, autoReleasePayment: false } });
    const submitted = flow.submitMilestone({
      order,
      milestone: order.milestones[0],
      actorId: "provider-1",
      evidence: [{ deliverableId: "del-1", title: "x", hash: "a".repeat(64) }],
    });
    const result = flow.approveMilestone({
      order: submitted.order,
      milestone: submitted.order.milestones[0],
      actorId: "client-1",
    });
    expect(result.order.milestones[0].status).toBe("APPROVED");
    expect(result.order.milestones[0].paymentStatus).toBe("PENDING");
    expect(result.order.status).toBe("MILESTONE_APPROVED");
    expect(result.order.financial.paidCents).toBe(0);
  });

  it("blocks approving an unsubmitted milestone", () => {
    const order = creditOrder();
    expect(() =>
      flow.approveMilestone({ order, milestone: order.milestones[0], actorId: "client-1" }),
    ).toThrow("Cannot approve a milestone in status IN_PROGRESS");
  });

  it("blocks approval by the submitting provider for a provider milestone", () => {
    const order = creditOrder({ status: "MILESTONE_SUBMITTED" });
    const milestone = makeMilestone({ status: "SUBMITTED", deliverables: [] });
    const od = { ...order, milestones: [milestone] };
    expect(() =>
      flow.approveMilestone({ order: od, milestone, actorId: "provider-1" }),
    ).toThrow("Only the client can approve");
  });

  it("requests a revision returning the order to IN_PROGRESS", () => {
    const order = creditOrder({ status: "MILESTONE_UNDER_REVIEW" });
    const milestone = makeMilestone({ status: "UNDER_REVIEW", deliverables: [] });
    const od = { ...order, milestones: [milestone] };
    const result = flow.requestRevision(od, milestone, "client-1");
    expect(result.order.milestones[0].status).toBe("REVISION_REQUESTED");
    expect(result.order.status).toBe("IN_PROGRESS");
    expect(result.events[0].type).toBe("MILESTONE_REVISION_REQUESTED");
  });

  it("rejects a milestone and moves the order to MILESTONE_REJECTED", () => {
    const order = creditOrder({ status: "MILESTONE_SUBMITTED" });
    const milestone = makeMilestone({ status: "SUBMITTED", deliverables: [] });
    const od = { ...order, milestones: [milestone] };
    const result = flow.rejectMilestone(od, milestone, "client-1");
    expect(result.order.milestones[0].status).toBe("REJECTED");
    expect(result.order.status).toBe("MILESTONE_REJECTED");
  });

  it("only completes an order when all milestones are done and paid", () => {
    const order = creditOrder({
      status: "IN_PROGRESS",
      milestones: [makeMilestone({ status: "PAID", paymentStatus: "CAPTURED" })],
      financial: {
        ...creditOrder().financial,
        paidCents: 10000,
        dueCents: 0,
        paymentStatus: "CAPTURED",
      },
    });
    const result = flow.completeOrder(order, "client-1");
    expect(result.order.status).toBe("COMPLETED");
    expect(result.events[0].type).toBe("ORDER_COMPLETED");
  });

  it("rejects completing an order with unfinished milestones", () => {
    const order = creditOrder({ status: "IN_PROGRESS" });
    expect(() => flow.completeOrder(order, "client-1")).toThrow("unfinished milestones");
  });
});