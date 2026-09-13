/**
 * RPG-OS — Marketplace Dispute Flow (Phase 2)
 *
 * DISPUTE_OPEN → EVIDENCE/RESPONSE → REVIEW → RESOLUTION.
 *
 * Regras:
 *  - Só uma parte do order abre e responde (initiator/respondent);
 *  - Disputa de natureza financeira exige pagamento já capturado
 *    (PaymentStatus CAPTURED) — server-side, nunca aceite do browser;
 *  - Não abre em order terminal REFUNDED (nada a devolver) nem sem dinheiro movido;
 *  - Resolver com decisão financeira exige autorização real (plataforma),
 *    com registo de quem/quando/resultado; a AI NUNCA resolve;
 *  - Resolução NÃO liberta fundos: o refund é executado por PaymentEngine
 *    (fora deste flow) após decisão autorizada.
 */

import type { Dispute, DisputeEvidence, DisputeResolution, MarketplaceEvent } from "../../types/marketplace";

export interface DisputeFlowOptions {
  now?: () => string;
  createId?: () => string;
}

export interface DisputeFlowResult {
  dispute: Dispute;
  events: MarketplaceEvent[];
}

const OPEN_STATES: ReadonlyArray<Dispute["status"]> = ["OPEN", "MEDIATION", "ARBITRATION"];

function buildDefaultId(): string {
  const crypto_ = globalThis.crypto;
  if (crypto_ && typeof crypto_.randomUUID === "function") {
    return crypto_.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface OpenDisputeInput {
  orderId: string;
  initiatorId: string;
  respondentId: string;
  type: Dispute["type"];
  description: string;
  /** true quando dispara consequência financeira (refund). */
  paymentImplicated?: boolean;
  /** PaymentStatus CAPTURED — exigido para disputas financeiras. */
  paymentCaptured: boolean;
  orderTerminalRefunded: boolean;
  evidence?: Array<Pick<DisputeEvidence, "type" | "url" | "content" | "submittedBy">>;
}

export class MarketplaceDisputeFlow {
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(options: DisputeFlowOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? buildDefaultId;
  }

  openDispute(input: OpenDisputeInput): DisputeFlowResult {
    const {
      orderId,
      initiatorId,
      respondentId,
      type,
      description,
      paymentImplicated = false,
      paymentCaptured,
      orderTerminalRefunded,
      evidence = [],
    } = input;

    if (!initiatorId || !respondentId || initiatorId === respondentId) {
      throw new Error("Dispute requires two distinct parties");
    }
    if (!description?.trim()) {
      throw new Error("Dispute requires a description");
    }
    if (orderTerminalRefunded) {
      throw new Error("Cannot open a dispute on an order already fully refunded");
    }
    if (paymentImplicated && !paymentCaptured) {
      throw new Error("Financial disputes require the payment to have been captured first");
    }

    const now = this.now();
    const dispute: Dispute = {
      id: this.createId(),
      orderId,
      initiatorId,
      respondentId,
      type,
      description,
      evidence: evidence.map((e) => ({
        id: this.createId(),
        type: e.type,
        url: e.url,
        content: e.content,
        submittedBy: e.submittedBy ?? initiatorId,
        submittedAt: now,
      })),
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    };

    return {
      dispute,
      events: [
        this.emit("DISPUTE_OPENED", initiatorId, "marketplace_dispute", dispute.id, {
          orderId,
          type,
          paymentImplicated,
        }),
      ],
    };
  }

  respondToDispute(input: {
    dispute: Dispute;
    actorId: string;
    content?: string;
    evidence?: Array<Pick<DisputeEvidence, "type" | "url" | "content">>;
  }): DisputeFlowResult {
    const { dispute, actorId, content, evidence = [] } = input;
    this.assertParty(dispute, actorId);
    if (!OPEN_STATES.includes(dispute.status)) {
      throw new Error(`Cannot respond to a dispute in status ${dispute.status}`);
    }
    if (!content?.trim() && evidence.length === 0) {
      throw new Error("A response requires content or evidence");
    }

    const now = this.now();
    const added: DisputeEvidence[] = evidence.map((e) => ({
      id: this.createId(),
      type: e.type,
      url: e.url,
      content: e.content,
      submittedBy: actorId,
      submittedAt: now,
    }));

    return {
      dispute: { ...dispute, evidence: [...dispute.evidence, ...added], updatedAt: now },
      events: [
        this.emit("DISPUTE_RESPONDED", actorId, "marketplace_dispute", dispute.id, {
          orderId: dispute.orderId,
        }),
      ],
    };
  }

  /** Passa a mediação/apreciação da plataforma (autorizado a gerir disputas). */
  escalateToMediation(input: {
    dispute: Dispute;
    mediatorId: string;
    authorizedMediator: boolean;
  }): DisputeFlowResult {
    const { dispute, mediatorId, authorizedMediator } = input;
    if (!authorizedMediator) {
      throw new Error("Only an authorized mediator/resolver can handle mediation");
    }
    if (dispute.status !== "OPEN") {
      throw new Error(`Cannot mediate a dispute in status ${dispute.status}`);
    }
    return {
      dispute: { ...dispute, status: "MEDIATION", mediatorId, updatedAt: this.now() },
      events: [],
    };
  }

  resolveDispute(input: {
    dispute: Dispute;
    resolverId: string;
    resolutionType: DisputeResolution["type"];
    description: string;
    amountCents?: number;
    /** true = resolver autorizado da plataforma. A AI NUNCA resolve. */
    authorizedResolver: boolean;
  }): DisputeFlowResult {
    const { dispute, resolverId, resolutionType, description, amountCents, authorizedResolver } = input;
    if (!authorizedResolver) {
      throw new Error("Only an authorized resolver can resolve a dispute (never the AI directly)");
    }
    if (!OPEN_STATES.includes(dispute.status)) {
      throw new Error(`Cannot resolve a dispute in status ${dispute.status}`);
    }
    if (!description?.trim()) {
      throw new Error("Resolution requires a description");
    }
    if (amountCents !== undefined && (!Number.isInteger(amountCents) || amountCents < 0)) {
      throw new Error("amountCents must be a non-negative integer");
    }

    const resolution: DisputeResolution = {
      type: resolutionType,
      description,
      amountCents,
      agreedByInitiator: false,
      agreedByRespondent: false,
      resolvedAt: this.now(),
    };

    return {
      dispute: { ...dispute, status: "RESOLVED", resolution, updatedAt: this.now(), resolvedAt: this.now() },
      events: [
        this.emit("DISPUTE_RESOLVED", resolverId, "marketplace_dispute", dispute.id, {
          orderId: dispute.orderId,
          resolutionType,
          amountCents,
        }),
      ],
    };
  }

  closeDispute(input: { dispute: Dispute; actorId: string; authorized: boolean }): DisputeFlowResult {
    const { dispute, actorId, authorized } = input;
    if (!authorized) {
      throw new Error("Only an authorized resolver can close a dispute");
    }
    if (dispute.status === "CLOSED") {
      throw new Error("Dispute is already closed");
    }
    return {
      dispute: { ...dispute, status: "CLOSED", updatedAt: this.now() },
      events: [],
    };
  }

  private assertParty(dispute: Dispute, actorId: string): void {
    if (dispute.initiatorId !== actorId && dispute.respondentId !== actorId) {
      throw new Error("Only the parties to the dispute can respond");
    }
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