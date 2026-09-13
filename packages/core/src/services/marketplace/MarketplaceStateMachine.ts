/**
 * RPG-OS — Marketplace State Machines
 *
 * Quote e Order lifecycles (domain-specific). Apenas as transições
 * declaradas são válidas; estados terminais ficam fechados.
 */

import type { MarketplaceQuoteStatus, MarketplaceOrderStatus } from "../../types/marketplace";

export class MarketplaceQuoteStateMachine {
  private static readonly VALID_TRANSITIONS: Record<
    MarketplaceQuoteStatus,
    MarketplaceQuoteStatus[]
  > = {
    DRAFT: ["SENT"],
    SENT: ["VIEWED", "ACCEPTED", "REJECTED", "EXPIRED", "WITHDRAWN"],
    VIEWED: ["ACCEPTED", "REJECTED", "EXPIRED", "WITHDRAWN"],
    ACCEPTED: ["CONVERTED_TO_CONTRACT"],
    REJECTED: [],
    EXPIRED: [],
    WITHDRAWN: [],
    CONVERTED_TO_CONTRACT: [],
  };

  private static readonly TERMINAL_STATES: MarketplaceQuoteStatus[] = [
    "REJECTED",
    "EXPIRED",
    "WITHDRAWN",
    "CONVERTED_TO_CONTRACT",
  ];

  static canTransition(from: MarketplaceQuoteStatus, to: MarketplaceQuoteStatus): boolean {
    if (from === to) return true;
    return (this.VALID_TRANSITIONS[from] ?? []).includes(to);
  }

  static isTerminal(status: MarketplaceQuoteStatus): boolean {
    return this.TERMINAL_STATES.includes(status);
  }

  static getNextValidStates(current: MarketplaceQuoteStatus): MarketplaceQuoteStatus[] {
    return [...(this.VALID_TRANSITIONS[current] ?? [])];
  }

  static validateTransition(from: MarketplaceQuoteStatus, to: MarketplaceQuoteStatus): void {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Invalid marketplace quote transition: ${from} -> ${to}. ` +
          `Valid transitions from ${from}: ${this.getNextValidStates(from).join(", ")}`,
      );
    }
  }
}

export class MarketplaceOrderStateMachine {
  private static readonly VALID_TRANSITIONS: Record<
    MarketplaceOrderStatus,
    MarketplaceOrderStatus[]
  > = {
    PENDING_PAYMENT: ["PAYMENT_PROCESSING", "CANCELLED"],
    PAYMENT_PROCESSING: ["PAID", "CANCELLED", "DISPUTED"],
    PAID: ["CONFIRMED", "REFUNDED", "DISPUTED"],
    CONFIRMED: ["IN_PROGRESS", "CANCELLED", "REFUNDED", "DISPUTED"],
    IN_PROGRESS: [
      "MILESTONE_DUE",
      "MILESTONE_SUBMITTED",
      "MILESTONE_APPROVED",
      "COMPLETED",
      "CANCELLED",
      "REFUNDED",
      "DISPUTED",
    ],
    MILESTONE_DUE: ["MILESTONE_SUBMITTED", "CANCELLED", "DISPUTED"],
    MILESTONE_SUBMITTED: ["MILESTONE_APPROVED", "MILESTONE_DUE", "DISPUTED"],
    MILESTONE_APPROVED: ["IN_PROGRESS", "MILESTONE_DUE", "COMPLETED", "DISPUTED"],
    COMPLETED: ["REFUNDED", "DISPUTED"],
    CANCELLED: ["REFUNDED", "DISPUTED"],
    REFUNDED: [],
    DISPUTED: ["COMPLETED", "REFUNDED"],
  };

  private static readonly TERMINAL_STATES: MarketplaceOrderStatus[] = ["REFUNDED"];

  static canTransition(from: MarketplaceOrderStatus, to: MarketplaceOrderStatus): boolean {
    if (from === to) return true;
    return (this.VALID_TRANSITIONS[from] ?? []).includes(to);
  }

  static isTerminal(status: MarketplaceOrderStatus): boolean {
    return this.TERMINAL_STATES.includes(status);
  }

  static getNextValidStates(current: MarketplaceOrderStatus): MarketplaceOrderStatus[] {
    return [...(this.VALID_TRANSITIONS[current] ?? [])];
  }

  static validateTransition(from: MarketplaceOrderStatus, to: MarketplaceOrderStatus): void {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Invalid marketplace order transition: ${from} -> ${to}. ` +
          `Valid transitions from ${from}: ${this.getNextValidStates(from).join(", ")}`,
      );
    }
  }
}