/**
 * RPG-OS — Order & Milestone Flow
 *
 * Mover um milestone: SUBMIT → REVIEW → APPROVE → PAY.
 * O pagamento só é libertado após approval. Money em cents.
 */

import type { Order, OrderEvent, OrderEventType, OrderMilestone } from "../../types/order";
import { OrderStatusStateMachine, MilestoneStatusStateMachine } from "./OrderStateMachine";

export interface OrderFlowOptions {
  now?: () => string;
  createId?: () => string;
}

export interface OrderFlowResult {
  order: Order;
  events: OrderEvent[];
}

export interface SubmitMilestoneInput {
  order: Order;
  milestone: OrderMilestone;
  actorId: string;
  evidence?: {
    id?: string;
    deliverableId?: string;
    title: string;
    url?: string;
    content?: string;
    hash?: string;
  }[];
}

export interface ApproveMilestoneInput {
  order: Order;
  milestone: OrderMilestone;
  actorId: string;
  evidenceReviewed?: string[];
  notes?: string;
}

function assertCents(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer (cents), got ${value}`);
  }
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;

function buildDefaultId(): string {
  const crypto_ = globalThis.crypto;
  if (crypto_ && typeof crypto_.randomUUID === "function") {
    return crypto_.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class OrderMilestoneFlow {
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(options: OrderFlowOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? buildDefaultId;
  }

  validateOrderFinancials(order: Order): void {
    assertCents(order.financial.subtotalCents, "financial.subtotalCents");
    assertCents(order.financial.taxCents, "financial.taxCents");
    assertCents(order.financial.discountCents, "financial.discountCents");
    assertCents(order.financial.totalCents, "financial.totalCents");
    assertCents(order.financial.paidCents, "financial.paidCents");
    assertCents(order.financial.dueCents, "financial.dueCents");
    assertCents(order.financial.platformFeeCents, "financial.platformFeeCents");
    assertCents(order.financial.providerPayoutCents, "financial.providerPayoutCents");

    const itemsTotal = order.items.reduce((sum, item) => sum + item.totalCents, 0);
    if (itemsTotal !== order.financial.totalCents) {
      throw new Error(
        `Order items total (${itemsTotal}) does not match financial.totalCents (${order.financial.totalCents})`,
      );
    }

    const scheduleTotal = order.financial.paymentSchedule.reduce(
      (sum, item) => sum + item.amountCents,
      0,
    );
    if (scheduleTotal !== order.financial.totalCents) {
      throw new Error(
        `Payment schedule total (${scheduleTotal}) does not match financial.totalCents (${order.financial.totalCents})`,
      );
    }

    if (order.financial.dueCents !== order.financial.totalCents - order.financial.paidCents) {
      throw new Error(
        "financial.dueCents must equal totalCents minus paidCents",
      );
    }

    if (
      order.financial.providerPayoutCents !==
      order.financial.totalCents - order.financial.platformFeeCents
    ) {
      throw new Error(
        "financial.providerPayoutCents must equal totalCents minus platformFeeCents",
      );
    }
  }

  submitMilestone(input: SubmitMilestoneInput): OrderFlowResult {
    const { order, milestone, actorId, evidence } = input;

    if (OrderStatusStateMachine.isTerminal(order.status)) {
      throw new Error(`Cannot submit a milestone on a terminal order (${order.status})`);
    }

    this.assertResponsibleParty(order, milestone, actorId, "submit");

    MilestoneStatusStateMachine.validateTransition(milestone.status, "SUBMITTED");

    if (evidence) {
      for (const piece of evidence) {
        if (piece.hash && !HASH_PATTERN.test(piece.hash)) {
          throw new Error(`Evidence hash must be a 64-char hex SHA-256 digest`);
        }
      }
    }

    const missing = milestone.deliverables
      .filter((d) => d.required)
      .filter(
        (d) =>
          !d.evidenceId &&
          d.status !== "SUBMITTED" &&
          !(evidence?.some((e) => e.deliverableId === d.id)),
      );
    if (missing.length > 0) {
      throw new Error(
        `Missing required deliverables: ${missing.map((d) => d.name).join(", ")}`,
      );
    }

    const submittedAt = this.now();
    const newMilestones = order.milestones.map((m) =>
      m.id === milestone.id
        ? {
            ...m,
            status: "SUBMITTED" as const,
            submittedAt,
            updatedAt: this.now(),
            deliverables: evidence
              ? m.deliverables.map((d) =>
                  evidence.some((e) => e.deliverableId === d.id)
                    ? { ...d, status: "SUBMITTED" as const, submittedAt }
                    : d,
                )
              : m.deliverables,
          }
        : m,
    );

    const hops: Order["status"][] =
      order.status === "IN_PROGRESS"
        ? ["MILESTONE_SUBMITTED"]
        : ["IN_PROGRESS", "MILESTONE_SUBMITTED"];

    const updatedOrder: Order = {
      ...order,
      milestones: newMilestones,
      status: this.moveOrderStatus(order.status, hops),
      updatedAt: this.now(),
      auditTrail: [
        ...order.auditTrail,
        {
          id: this.createId(),
          timestamp: this.now(),
          actorId,
          action: "milestone.submitted",
          details: { milestoneId: milestone.id, evidenceCount: evidence?.length ?? 0 },
        },
      ],
    };

    const events: OrderEvent[] = [this.event("MILESTONE_SUBMITTED", updatedOrder, actorId, milestone.id, {
      evidenceCount: evidence?.length ?? 0,
      milestoneId: milestone.id,
    })];

    if (evidence && evidence.length > 0) {
      events.push(
        this.event("EVIDENCE_SUBMITTED", updatedOrder, actorId, milestone.id, {
          evidenceCount: evidence.length,
        }),
      );
    }

    return { order: updatedOrder, events };
  }

  approveMilestone(input: ApproveMilestoneInput): OrderFlowResult {
    const { order, milestone, actorId, evidenceReviewed, notes } = input;

    if (milestone.status !== "SUBMITTED" && milestone.status !== "UNDER_REVIEW") {
      throw new Error(`Cannot approve a milestone in status ${milestone.status}`);
    }

    this.assertResponsibleParty(order, milestone, actorId, "approve");

    MilestoneStatusStateMachine.validateTransition(milestone.status, "APPROVED");

    const approvedAt = this.now();
    const now = this.now();

    const milestoneStatus: OrderMilestone["status"] = order.settings.autoReleasePayment
      ? "PAID"
      : "APPROVED";

    const milestonePaymentStatus: OrderMilestone["paymentStatus"] =
      order.settings.autoReleasePayment ? "CAPTURED" : "PENDING";

    const isLast = order.milestones.every((m) => m.id === milestone.id || this.isDone(m));

    const autoReleasedCents = milestoneStatus === "PAID" ? milestone.amountCents : 0;
    const newPaidCents = order.financial.paidCents + autoReleasedCents;
    const outcome = this.determineOrderStatusAfterApproval(
      order,
      isLast,
      newPaidCents,
      order.financial.totalCents,
    );

    const baseHop: Order["status"] = "MILESTONE_APPROVED";
    const orderHops: Order["status"][] =
      outcome === baseHop
        ? [baseHop]
        : [baseHop, outcome];
    const orderStatus = this.moveOrderStatus(order.status, orderHops);

    const newMilestone: OrderMilestone = {
      ...milestone,
      status: milestoneStatus,
      approvedAt,
      paymentStatus: milestonePaymentStatus,
      paymentReference: milestoneStatus === "PAID" ? this.createId() : milestone.paymentReference,
      approval: {
        approvedBy: actorId,
        approvedAt,
        type: "CLIENT",
        evidenceReviewed: evidenceReviewed ?? [],
        notes,
      },
      updatedAt: now,
    };

    const updatedOrder: Order = this.withMilestone(order, newMilestone);
    const financial = { ...updatedOrder.financial };
    if (milestoneStatus === "PAID") {
      financial.paidCents = newPaidCents;
      financial.dueCents = Math.max(0, financial.totalCents - newPaidCents);
      financial.paymentStatus = "CAPTURED";
      financial.paymentSchedule = financial.paymentSchedule.map((p) =>
        p.triggerReference === milestone.id
          ? { ...p, status: "PAID", paidAt: now, paidAmountCents: p.amountCents }
          : p,
      );
    }
    const finalOrder: Order = {
      ...updatedOrder,
      financial,
      status: orderStatus,
      updatedAt: now,
      ...(orderStatus === "COMPLETED" ? { completedAt: now } : {}),
      auditTrail: [
        ...updatedOrder.auditTrail,
        {
          id: this.createId(),
          timestamp: now,
          actorId,
          action: "milestone.approved",
          details: { milestoneId: milestone.id, amountReleasedCents: milestone.amountCents },
        },
      ],
    };

    const events: OrderEvent[] = [
      this.event("MILESTONE_APPROVED", finalOrder, actorId, milestone.id, {
        amountReleasedCents: milestoneStatus === "PAID" ? milestone.amountCents : 0,
      }),
    ];
    if (milestoneStatus === "PAID") {
      events.push(this.event("MILESTONE_PAID", finalOrder, actorId, milestone.id, {}));
      events.push(this.event("PAYMENT_RELEASED", finalOrder, actorId, milestone.id, {}));
    }
    if (orderStatus === "COMPLETED") {
      events.push(this.event("ORDER_COMPLETED", finalOrder, actorId, milestone.id, {}));
    }
    return { order: finalOrder, events };
  }

  requestRevision(order: Order, milestone: OrderMilestone, actorId: string): OrderFlowResult {
    if (milestone.status !== "UNDER_REVIEW") {
      throw new Error(`Cannot request revision from status ${milestone.status}`);
    }
    if (order.status !== "MILESTONE_UNDER_REVIEW") {
      throw new Error(`Order must be in MILESTONE_UNDER_REVIEW to request a revision`);
    }
    MilestoneStatusStateMachine.validateTransition(milestone.status, "REVISION_REQUESTED");
    const now = this.now();
    const revised: OrderMilestone = {
      ...milestone,
      status: "REVISION_REQUESTED",
      updatedAt: now,
    };
    const orderStatus = this.moveOrderStatus(order.status, ["IN_PROGRESS"]);
    const updatedOrder: Order = {
      ...this.withMilestone(order, revised),
      status: orderStatus,
      updatedAt: now,
      auditTrail: [
        ...order.auditTrail,
        {
          id: this.createId(),
          timestamp: now,
          actorId,
          action: "milestone.revision_requested",
          details: { milestoneId: milestone.id },
        },
      ],
    };
    return {
      order: updatedOrder,
      events: [this.event("MILESTONE_REVISION_REQUESTED", updatedOrder, actorId, milestone.id, {})],
    };
  }

  rejectMilestone(order: Order, milestone: OrderMilestone, actorId: string): OrderFlowResult {
    if (milestone.status !== "SUBMITTED" && milestone.status !== "UNDER_REVIEW") {
      throw new Error(`Cannot reject a milestone in status ${milestone.status}`);
    }
    MilestoneStatusStateMachine.validateTransition(milestone.status, "REJECTED");
    const now = this.now();
    const rejected: OrderMilestone = { ...milestone, status: "REJECTED", updatedAt: now };
    const hops: Order["status"][] =
      order.status === "MILESTONE_UNDER_REVIEW"
        ? ["MILESTONE_REJECTED"]
        : ["MILESTONE_REJECTED"];
    const orderStatus = this.moveOrderStatus(order.status, hops);
    const updatedOrder: Order = {
      ...this.withMilestone(order, rejected),
      status: orderStatus,
      updatedAt: now,
      auditTrail: [
        ...order.auditTrail,
        {
          id: this.createId(),
          timestamp: now,
          actorId,
          action: "milestone.rejected",
          details: { milestoneId: milestone.id },
        },
      ],
    };
    return {
      order: updatedOrder,
      events: [this.event("MILESTONE_REJECTED", updatedOrder, actorId, milestone.id, {})],
    };
  }

  completeOrder(order: Order, actorId: string, completedBy?: string): OrderFlowResult {
    const unfinished = order.milestones.filter((m) => !this.isDone(m));
    if (unfinished.length > 0) {
      throw new Error(
        `Order has unfinished milestones: ${unfinished.map((m) => m.title).join(", ")}`,
      );
    }
    if (order.financial.paidCents < order.financial.totalCents) {
      throw new Error("Cannot complete an order that has not been fully paid");
    }
    this.assertReachable(order.status, "COMPLETED");
    const now = this.now();
    const updatedOrder: Order = {
      ...order,
      status: "COMPLETED",
      completedAt: now,
      updatedAt: now,
      auditTrail: [
        ...order.auditTrail,
        {
          id: this.createId(),
          timestamp: now,
          actorId,
          action: "order.completed",
          details: { completedBy },
        },
      ],
    };
    return {
      order: updatedOrder,
      events: [this.event("ORDER_COMPLETED", updatedOrder, actorId, order.milestones[0]?.id, {})],
    };
  }

  private moveOrderStatus(from: Order["status"], hops: Order["status"][]): Order["status"] {
    let current = from;
    for (const hop of hops) {
      OrderStatusStateMachine.validateTransition(current, hop);
      current = hop;
    }
    return current;
  }

  private assertReachable(from: Order["status"], to: Order["status"]): void {
    if (from === to) return;
    const queue = [from];
    const seen = new Set<Order["status"]>(queue);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const next of OrderStatusStateMachine.getNextValidStates(cur)) {
        if (next === to) return;
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    throw new Error(`No valid path from order status ${from} to ${to}`);
  }

  private determineOrderStatusAfterApproval(
    order: Order,
    isLast: boolean,
    paidCentsAfter: number,
    totalCents: number,
  ): Order["status"] {
    if (isLast && paidCentsAfter >= totalCents) {
      return "COMPLETED";
    }
    if (isLast) {
      return "MILESTONE_APPROVED";
    }
    return order.settings.autoAdvanceMilestones ? "MILESTONE_DUE" : "MILESTONE_APPROVED";
  }

  private isDone(milestone: OrderMilestone): boolean {
    return (
      milestone.status === "PAID" ||
      milestone.status === "SKIPPED" ||
      milestone.status === "CANCELLED"
    );
  }

  private withMilestone(order: Order, milestone: OrderMilestone): Order {
    return {
      ...order,
      milestones: order.milestones.map((m) => (m.id === milestone.id ? milestone : m)),
    };
  }

  private assertResponsibleParty(
    order: Order,
    milestone: OrderMilestone,
    actorId: string,
    action: string,
  ): void {
    const isClient = actorId === order.clientId;
    const isProvider = order.providerId != null && actorId === order.providerId;
    if (!isClient && !isProvider) {
      throw new Error("Actor is not a party to this order");
    }
    if (action === "submit") {
      if (milestone.responsibleParty === "CLIENT" && !isClient) {
        throw new Error("Only the client can submit this milestone");
      }
      if (milestone.responsibleParty === "PROVIDER" && !isProvider) {
        throw new Error("Only the provider can submit this milestone");
      }
      return;
    }
    if (milestone.responsibleParty === "CLIENT") {
      if (!isProvider) {
        throw new Error("Only the provider can approve a client-submitted milestone");
      }
      return;
    }
    if (!isClient) {
      throw new Error("Only the client can approve this milestone");
    }
  }

  private event(
    type: OrderEventType,
    order: Order,
    actorId: string,
    milestoneId?: string,
    payload: Record<string, unknown> = {},
  ): OrderEvent {
    return {
      id: this.createId(),
      type,
      orderId: order.id,
      actorId,
      milestoneId,
      payload,
      timestamp: this.now(),
    };
  }
}