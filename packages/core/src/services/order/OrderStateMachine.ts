/**
 * RPG-OS — Order & Milestone State Machines
 *
 * Order e Milestone lifecycles. Transições apenas pelas arestas declaradas.
 */

import type { OrderStatus, MilestoneStatus } from "../../types/order";

export class OrderStatusStateMachine {
  private static readonly VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    DRAFT: ["PENDING_PAYMENT", "CANCELLED"],
    PENDING_PAYMENT: ["PAYMENT_PROCESSING", "PAID", "CANCELLED", "DISPUTED"],
    PAYMENT_PROCESSING: ["PAID", "CANCELLED", "DISPUTED"],
    PAID: ["CONFIRMED", "REFUNDED", "PARTIALLY_REFUNDED", "DISPUTED"],
    CONFIRMED: ["IN_PROGRESS", "CANCELLED", "REFUNDED", "DISPUTED", "ON_HOLD"],
    IN_PROGRESS: [
      "MILESTONE_DUE",
      "MILESTONE_SUBMITTED",
      "MILESTONE_UNDER_REVIEW",
      "MILESTONE_APPROVED",
      "MILESTONE_REJECTED",
      "COMPLETED",
      "CANCELLED",
      "ON_HOLD",
      "DISPUTED",
    ],
    MILESTONE_DUE: ["MILESTONE_SUBMITTED", "CANCELLED", "DISPUTED", "ON_HOLD"],
    MILESTONE_SUBMITTED: [
      "MILESTONE_UNDER_REVIEW",
      "MILESTONE_APPROVED",
      "MILESTONE_REJECTED",
      "DISPUTED",
    ],
    MILESTONE_UNDER_REVIEW: [
      "MILESTONE_APPROVED",
      "MILESTONE_REJECTED",
      "IN_PROGRESS",
      "MILESTONE_DUE",
      "DISPUTED",
    ],
    MILESTONE_APPROVED: ["IN_PROGRESS", "MILESTONE_DUE", "COMPLETED", "DISPUTED"],
    MILESTONE_REJECTED: ["MILESTONE_DUE", "IN_PROGRESS", "CANCELLED", "DISPUTED"],
    COMPLETED: ["REFUNDED", "PARTIALLY_REFUNDED", "DISPUTED"],
    CANCELLED: ["REFUNDED", "PARTIALLY_REFUNDED", "DISPUTED"],
    REFUNDED: [],
    PARTIALLY_REFUNDED: ["REFUNDED", "DISPUTED"],
    DISPUTED: [
      "ON_HOLD",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
      "REFUNDED",
      "PARTIALLY_REFUNDED",
    ],
    ON_HOLD: ["IN_PROGRESS", "CANCELLED", "DISPUTED"],
  };

  private static readonly TERMINAL_STATES: OrderStatus[] = ["REFUNDED"];

  static canTransition(from: OrderStatus, to: OrderStatus): boolean {
    if (from === to) return true;
    return (this.VALID_TRANSITIONS[from] ?? []).includes(to);
  }

  static isTerminal(status: OrderStatus): boolean {
    return this.TERMINAL_STATES.includes(status);
  }

  static getNextValidStates(current: OrderStatus): OrderStatus[] {
    return [...(this.VALID_TRANSITIONS[current] ?? [])];
  }

  static validateTransition(from: OrderStatus, to: OrderStatus): void {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Invalid order state transition: ${from} -> ${to}. ` +
          `Valid transitions from ${from}: ${this.getNextValidStates(from).join(", ")}`,
      );
    }
  }
}

export class MilestoneStatusStateMachine {
  private static readonly VALID_TRANSITIONS: Record<MilestoneStatus, MilestoneStatus[]> = {
    PENDING: ["SCHEDULED", "IN_PROGRESS", "SKIPPED", "CANCELLED"],
    SCHEDULED: ["IN_PROGRESS", "SKIPPED", "CANCELLED"],
    IN_PROGRESS: ["SUBMITTED", "SCHEDULED", "CANCELLED"],
    SUBMITTED: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
    UNDER_REVIEW: ["APPROVED", "REJECTED", "REVISION_REQUESTED"],
    APPROVED: ["PAID"],
    REJECTED: ["IN_PROGRESS", "SUBMITTED", "REVISION_REQUESTED", "CANCELLED"],
    REVISION_REQUESTED: ["IN_PROGRESS", "SUBMITTED", "CANCELLED"],
    PAID: [],
    SKIPPED: [],
    CANCELLED: [],
  };

  private static readonly TERMINAL_STATES: MilestoneStatus[] = ["PAID", "SKIPPED", "CANCELLED"];

  static canTransition(from: MilestoneStatus, to: MilestoneStatus): boolean {
    if (from === to) return true;
    return (this.VALID_TRANSITIONS[from] ?? []).includes(to);
  }

  static isTerminal(status: MilestoneStatus): boolean {
    return this.TERMINAL_STATES.includes(status);
  }

  static getNextValidStates(current: MilestoneStatus): MilestoneStatus[] {
    return [...(this.VALID_TRANSITIONS[current] ?? [])];
  }

  static validateTransition(from: MilestoneStatus, to: MilestoneStatus): void {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Invalid milestone state transition: ${from} -> ${to}. ` +
          `Valid transitions from ${from}: ${this.getNextValidStates(from).join(", ")}`,
      );
    }
  }
}