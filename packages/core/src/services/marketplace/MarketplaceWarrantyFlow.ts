/**
 * RPG-OS — Marketplace Warranty Flow (Phase 2)
 *
 * Garantia de serviço:
 *  - warranty_period/start/end/coverage com referência ao order e contrato;
 *  - Provider atribui; client pode abrir claim dentro da janela;
 *  - Claim: OPEN → UNDER_REVIEW → ACCEPTED|REJECTED → CLOSED;
 *  - Decisão apenas por ator autorizado (provider ou plataforma) — auditada;
 *  - Datas determinadas no servidor (cliente nunca escolhe janela).
 */

import type { MarketplaceEvent, Warranty, WarrantyClaim, WarrantyClaimStatus } from "../../types/marketplace";

export interface WarrantyFlowOptions {
  now?: () => string;
  createId?: () => string;
}

export interface WarrantyFlowResult<T> {
  entity: T;
  events: MarketplaceEvent[];
}

const VALID_CLAIM_MOVES: Record<WarrantyClaimStatus, WarrantyClaimStatus[]> = {
  OPEN: ["UNDER_REVIEW", "CLOSED"],
  UNDER_REVIEW: ["ACCEPTED", "REJECTED", "CLOSED"],
  ACCEPTED: ["CLOSED"],
  REJECTED: ["CLOSED"],
  CLOSED: [],
};

function buildDefaultId(): string {
  const crypto_ = globalThis.crypto;
  if (crypto_ && typeof crypto_.randomUUID === "function") {
    return crypto_.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class MarketplaceWarrantyFlow {
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(options: WarrantyFlowOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? buildDefaultId;
  }

  activateWarranty(input: {
    orderId: string;
    contractId?: string;
    providerId: string;
    clientId: string;
    warrantyPeriodMonths: number;
    coverage: string;
    /** data de início da garantia (server-side). */
    startDate: string;
  }): WarrantyFlowResult<Warranty> {
    const { orderId, contractId, providerId, clientId, warrantyPeriodMonths, coverage, startDate } = input;
    if (!Number.isInteger(warrantyPeriodMonths) || warrantyPeriodMonths <= 0) {
      throw new Error("warrantyPeriodMonths must be a positive integer");
    }
    if (!Number.isNaN(Date.parse(startDate))) {
      // valid ISO date
    } else {
      throw new Error("startDate must be a valid ISO timestamp");
    }
    if (!coverage?.trim()) {
      throw new Error("Warranty requires coverage description");
    }

    const start = new Date(startDate);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + warrantyPeriodMonths);

    const warranty: Warranty = {
      id: this.createId(),
      orderId,
      contractId,
      providerId,
      clientId,
      warrantyPeriodMonths,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      coverage,
      status: "ACTIVE",
      createdAt: this.now(),
      updatedAt: this.now(),
    };

    return {
      entity: warranty,
      events: [
        this.emit("WARRANTY_ACTIVATED", providerId, "warranty", warranty.id, {
          orderId,
          warrantyId: warranty.id,
          endDate: warranty.endDate,
        }),
      ],
    };
  }

  openClaim(input: {
    warranty: Warranty;
    clientId: string;
    description: string;
  }): WarrantyFlowResult<WarrantyClaim> {
    const { warranty, clientId, description } = input;
    if (warranty.clientId !== clientId) {
      throw new Error("Only the warranty client can open a claim");
    }
    if (warranty.status !== "ACTIVE") {
      throw new Error(`Cannot open a claim on warranty in status ${warranty.status}`);
    }
    if (new Date(warranty.endDate) < new Date(this.now())) {
      throw new Error("Cannot open a claim after the warranty window has ended");
    }
    if (!description?.trim()) {
      throw new Error("Claim requires a description");
    }

    const claim: WarrantyClaim = {
      id: this.createId(),
      warrantyId: warranty.id,
      orderId: warranty.orderId,
      clientId,
      description,
      status: "OPEN",
      openedAt: this.now(),
      createdAt: this.now(),
      updatedAt: this.now(),
    };

    return {
      entity: claim,
      events: [
        this.emit("WARRANTY_CLAIM_OPENED", clientId, "warranty_claim", claim.id, {
          warrantyId: warranty.id,
          orderId: warranty.orderId,
        }),
      ],
    };
  }

  decideClaim(input: {
    claim: WarrantyClaim;
    actorId: string;
    to: WarrantyClaimStatus;
    /** Provider ou resolver autorizado da plataforma. */
    authorized: boolean;
    resolution?: string;
  }): WarrantyFlowResult<WarrantyClaim> {
    const { claim, actorId, to, authorized, resolution } = input;
    if (!authorized) {
      throw new Error("Only the provider or an authorized resolver can decide a claim");
    }
    const allowed = VALID_CLAIM_MOVES[claim.status] ?? [];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid warranty claim transition: ${claim.status} -> ${to}`);
    }
    if ((to === "ACCEPTED" || to === "REJECTED") && !resolution?.trim()) {
      throw new Error("A resolution is required when accepting or rejecting a claim");
    }

    const updated: WarrantyClaim = {
      ...claim,
      status: to,
      decidedAt: to === "ACCEPTED" || to === "REJECTED" || to === "CLOSED" ? this.now() : claim.decidedAt,
      decidedBy: actorId,
      resolution: resolution ?? claim.resolution,
      updatedAt: this.now(),
    };

    return {
      entity: updated,
      events: [
        this.emit("WARRANTY_CLAIM_DECIDED", actorId, "warranty_claim", claim.id, {
          warrantyId: claim.warrantyId,
          orderId: claim.orderId,
          to,
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