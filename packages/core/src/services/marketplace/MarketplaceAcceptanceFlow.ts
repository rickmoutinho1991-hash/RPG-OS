/**
 * RPG-OS — Marketplace Acceptance Flow (Phase 2)
 *
 * Client acceptance ≠ contract signature.
 * CLIENT_ACCEPTANCE = aceitação/material quality review.
 *  - OWNER (client) only;
 *  - Only once per order;
 *  - Only after order COMPLETED;
 *  - AcceptanceDecision = ACCEPT | REJECT | REQUEST_REVISION;
 *  - Sempre auditável com motivo e timestamp.
 *
 * Pagamento e milestones são governados por OrderMilestoneFlow;
 * assinatura de contrato é governada por ContractFlow.
 * Este flow aceita/rejeita o resultado final do trabalho.
 */

import type { AcceptanceRecord, AcceptanceDecision, MarketplaceEvent } from "../../types/marketplace";

export interface AcceptanceFlowOptions {
  now?: () => string;
  createId?: () => string;
}

export interface AcceptanceFlowResult {
  acceptance: AcceptanceRecord;
  events: MarketplaceEvent[];
}

const VALID_DECISIONS: ReadonlySet<AcceptanceDecision> = new Set(["ACCEPT", "REJECT", "REQUEST_REVISION"]);

function buildDefaultId(): string {
  const crypto_ = globalThis.crypto;
  if (crypto_ && typeof crypto_.randomUUID === "function") {
    return crypto_.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class MarketplaceAcceptanceFlow {
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(options: AcceptanceFlowOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? buildDefaultId;
  }

  /**
   * Regista a decisão de aceitação do cliente.
   * Chamada deve já ter verificado que o order.status === "COMPLETED".
   */
  submitAcceptance(input: {
    orderId: string;
    clientId: string;
    orderClientId: string;
    decision: AcceptanceDecision;
    reason?: string;
    existingAcceptance?: AcceptanceRecord | null;
  }): AcceptanceFlowResult {
    const { orderId, clientId, orderClientId, decision, reason, existingAcceptance } = input;

    if (clientId !== orderClientId) {
      throw new Error("Only the order client can submit an acceptance decision");
    }
    if (!VALID_DECISIONS.has(decision)) {
      throw new Error(`Invalid acceptance decision: ${decision}`);
    }
    if (existingAcceptance) {
      throw new Error(
        "An acceptance decision already exists for this order; use UPDATE later if revision is needed",
      );
    }

    const now = this.now();
    const acceptance: AcceptanceRecord = {
      id: this.createId(),
      orderId,
      clientId,
      decision,
      reason,
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const eventName: MarketplaceEvent["type"] =
      decision === "ACCEPT" ? "ORDER_ACCEPTED" : "ORDER_REJECTED";

    return {
      acceptance,
      events: [
        this.emit(eventName, clientId, "marketplace_acceptance", acceptance.id, {
          orderId,
          decision,
          reason,
        }),
      ],
    };
  }

  private emit(
    type: MarketplaceEvent["type"],
    actorId: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>,
  ): MarketplaceEvent {
    return { id: this.createId(), type, actorId, entityType, entityId, payload, timestamp: this.now() };
  }
}