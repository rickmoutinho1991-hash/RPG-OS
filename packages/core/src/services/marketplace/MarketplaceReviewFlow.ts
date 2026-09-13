/**
 * RPG-OS — Marketplace Review Flow (Phase 2)
 *
 * Reputação explicável, não mágica:
 *  - Review apenas em ORDER_COMPLETED com decisão de aceitação do cliente
 *    (business rule passed by caller) — ou em interação elegível;
 *  - Uma vez por reviewer/order (não-dup);
 *  - rating 1..5 inteiro; categories 1..5; ligado ao order;
 *  - Nenhuma pontuação inventada fora dos valores reais;
 *  - Reviewer = client, reviewee = provider do order.
 */

import type { MarketplaceReview, MarketplaceEvent } from "../../types/marketplace";

export interface ReviewFlowOptions {
  now?: () => string;
  createId?: () => string;
}

export interface ReviewFlowResult {
  review: MarketplaceReview;
  events: MarketplaceEvent[];
}

const RATING_MIN = 1;
const RATING_MAX = 5;

function buildDefaultId(): string {
  const crypto_ = globalThis.crypto;
  if (crypto_ && typeof crypto_.randomUUID === "function") {
    return crypto_.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class MarketplaceReviewFlow {
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(options: ReviewFlowOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? buildDefaultId;
  }

  submitReview(input: {
    orderId: string;
    clientId: string;
    orderClientId: string;
    orderProviderId: string;
    rating: number;
    comment?: string;
    categories?: Record<string, number>;
    /** true = order completado e aceite (regra de negócio validada pelo servidor). */
    eligible: boolean;
    existing?: MarketplaceReview | null;
  }): ReviewFlowResult {
    const {
      orderId,
      clientId,
      orderClientId,
      orderProviderId,
      rating,
      comment,
      categories,
      eligible,
      existing,
    } = input;

    if (!eligible) {
      throw new Error("Review not eligible: order is not completed or interaction not eligible");
    }
    if (clientId !== orderClientId) {
      throw new Error("Only the order client can review the provider");
    }
    if (!Number.isInteger(rating) || rating < RATING_MIN || rating > RATING_MAX) {
      throw new Error(`Rating must be an integer between ${RATING_MIN} and ${RATING_MAX}`);
    }
    if (existing) {
      throw new Error("A review already exists for this reviewer and order");
    }
    this.validateCategories(categories);

    const review: MarketplaceReview = {
      id: this.createId(),
      orderId,
      reviewerId: clientId,
      revieweeId: orderProviderId,
      rating,
      comment,
      categories: categories ?? {},
      createdAt: this.now(),
      verified: true,
    };

    return {
      review,
      events: [
        this.emit("REVIEW_CREATED", clientId, "marketplace_review", review.id, {
          orderId,
          reviewerId: clientId,
          revieweeId: orderProviderId,
          rating,
        }),
      ],
    };
  }

  /** Média simples de ratings reais (nunca inventada). */
  static aggregate(ratingValues: number[]): number | null {
    if (ratingValues.length === 0) return null;
    const total = ratingValues.reduce((sum, v) => sum + v, 0);
    return Math.round((total / ratingValues.length) * 100) / 100;
  }

  private validateCategories(categories: Record<string, number> | undefined): void {
    if (!categories) return;
    for (const [key, value] of Object.entries(categories)) {
      if (!Number.isInteger(value) || value < RATING_MIN || value > RATING_MAX) {
        throw new Error(`Category '${key}' rating must be an integer between ${RATING_MIN} and ${RATING_MAX}`);
      }
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