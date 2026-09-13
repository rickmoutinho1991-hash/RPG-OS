/**
 * RPG-OS — Marketplace Flow
 *
 * Coordena o percurso QUOTE → ACCEPT → ORDER. Money em cents (inteiro).
 * Nenhuma transição é permitida fora da máquina de estados.
 */

import type {
  ServiceQuote,
  ServiceRequest,
  MarketplaceEvent,
  MarketplaceEventType,
} from "../../types/marketplace";
import type {
  Order,
  OrderItem,
  OrderType,
  OrderSettings,
  OrderTimeline,
} from "../../types/order";
import { MarketplaceQuoteStateMachine } from "./MarketplaceStateMachine";

const SYSTEM_ACTOR = "system";

export interface MarketplaceFlowOptions {
  now?: () => string;
  createId?: () => string;
}

export interface MarketplaceFlowResult<T> {
  entity: T;
  previousState: string;
  newState: string;
  events: MarketplaceEvent[];
}

type DomainEventName = Extract<
  MarketplaceEventType,
  | "QUOTE_SENT"
  | "QUOTE_VIEWED"
  | "QUOTE_ACCEPTED"
  | "QUOTE_REJECTED"
  | "QUOTE_EXPIRED"
  | "ORDER_CREATED"
>;

function assertCents(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer (cents), got ${value}`);
  }
}

function defaultCreateId(): string {
  const crypto_ = globalThis.crypto;
  if (crypto_ && typeof crypto_.randomUUID === "function") {
    return crypto_.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class MarketplaceFlow {
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(options: MarketplaceFlowOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? defaultCreateId;
  }

  private emit(
    type: DomainEventName,
    actorId: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>,
  ): MarketplaceEvent {
    return {
      id: this.createId(),
      type,
      actorId,
      entityType,
      entityId,
      payload,
      timestamp: this.now(),
    };
  }

  markQuoteSent(quote: ServiceQuote, providerId: string): MarketplaceFlowResult<ServiceQuote> {
    this.assertQuoteActor(quote, providerId, "provider");
    MarketplaceQuoteStateMachine.validateTransition(quote.status, "SENT");
    return this.transitionQuote(quote, "SENT", providerId, "QUOTE_SENT");
  }

  markQuoteViewed(quote: ServiceQuote, clientId: string): MarketplaceFlowResult<ServiceQuote> {
    MarketplaceQuoteStateMachine.validateTransition(quote.status, "VIEWED");
    return this.transitionQuote(quote, "VIEWED", clientId, "QUOTE_VIEWED");
  }

  acceptQuote(
    quote: ServiceQuote,
    request: Pick<ServiceRequest, "id" | "clientId">,
    clientId: string,
  ): MarketplaceFlowResult<ServiceQuote> {
    if (request.clientId !== clientId) {
      throw new Error("Only the requesting client can accept a quote");
    }
    MarketplaceQuoteStateMachine.validateTransition(quote.status, "ACCEPTED");
    return this.transitionQuote(quote, "ACCEPTED", clientId, "QUOTE_ACCEPTED");
  }

  rejectQuote(
    quote: ServiceQuote,
    request: Pick<ServiceRequest, "id" | "clientId">,
    clientId: string,
  ): MarketplaceFlowResult<ServiceQuote> {
    if (request.clientId !== clientId) {
      throw new Error("Only the requesting client can reject a quote");
    }
    MarketplaceQuoteStateMachine.validateTransition(quote.status, "REJECTED");
    return this.transitionQuote(quote, "REJECTED", clientId, "QUOTE_REJECTED");
  }

  withdrawQuote(quote: ServiceQuote, providerId: string): MarketplaceFlowResult<ServiceQuote> {
    this.assertQuoteActor(quote, providerId, "provider");
    MarketplaceQuoteStateMachine.validateTransition(quote.status, "WITHDRAWN");
    return this.transitionQuote(quote, "WITHDRAWN", providerId);
  }

  expireQuote(quote: ServiceQuote): MarketplaceFlowResult<ServiceQuote> {
    MarketplaceQuoteStateMachine.validateTransition(quote.status, "EXPIRED");
    return this.transitionQuote(quote, "EXPIRED", SYSTEM_ACTOR, "QUOTE_EXPIRED");
  }

  convertToContract(quote: ServiceQuote): MarketplaceFlowResult<ServiceQuote> {
    if (quote.status !== "ACCEPTED") {
      throw new Error("Only an accepted quote can be converted to contract");
    }
    MarketplaceQuoteStateMachine.validateTransition(quote.status, "CONVERTED_TO_CONTRACT");
    return this.transitionQuote(quote, "CONVERTED_TO_CONTRACT", SYSTEM_ACTOR);
  }

  createOrderFromQuote(
    input: BuildOrderFromQuoteInput,
  ): MarketplaceFlowResult<Order> {
    const { quote, clientId, providerId, title } = input;
    if (quote.status !== "ACCEPTED") {
      throw new Error("Only an accepted quote can produce an order");
    }
    if (providerId !== quote.providerId) {
      throw new Error("Order provider must match the quote provider");
    }
    this.assertQuoteFinancials(quote);

    const items = buildOrderItems(quote);
    const platformFeeCents = 0;
    const order: Order = {
      id: this.createId(),
      type: input.type ?? "MARKETPLACE",
      orderNumber: `ORD-${this.now().replace(/\D/g, "").slice(0, 14)}`,
      title,
      description: quote.responseToQuestions ?? undefined,
      clientId,
      providerId,
      sourceType: "MARKETPLACE",
      sourceId: quote.requestId,
      financial: {
        currency: quote.currency,
        subtotalCents: quote.subtotalCents,
        taxCents: quote.taxCents,
        discountCents: 0,
        totalCents: quote.totalCents,
        paidCents: 0,
        dueCents: quote.totalCents,
        paymentSchedule: [
          {
            id: this.createId(),
            description: `Pagamento integral — ${title}`,
            amountCents: quote.totalCents,
            dueDate: quote.validUntil,
            trigger: "MANUAL",
            status: "PENDING",
          },
        ],
        paymentStatus: "PENDING",
        platformFeeCents,
        providerPayoutCents: quote.totalCents - platformFeeCents,
        invoiceIds: [],
      },
      timeline: {
        estimatedStartDate: quote.estimatedStartDate,
        estimatedEndDate: undefined,
        timezone: "UTC",
        bufferDays: 0,
      },
      milestones: [],
      currentMilestoneIndex: 0,
      status: "PENDING_PAYMENT",
      items,
      settings: {
        autoAdvanceMilestones: true,
        requireClientApproval: true,
        allowRevisions: true,
        maxRevisions: 1,
        autoReleasePayment: false,
        approvalGracePeriodDays: 3,
        allowClientCancellation: true,
        cancellationPolicy: {
          allowed: true,
          noticePeriodDays: 3,
          refundPolicy: "PARTIAL",
        },
      },
      tags: input.tags ?? [],
      customFields: input.customFields ?? {},
      auditTrail: [],
      createdAt: this.now(),
      updatedAt: this.now(),
    };

    const event = this.emit(
      "ORDER_CREATED",
      clientId,
      "marketplace_order",
      order.id,
      {
        orderId: order.id,
        quoteId: quote.id,
        requestId: quote.requestId,
        totalCents: order.financial.totalCents,
        currency: order.financial.currency,
      },
    );

    return {
      entity: order,
      previousState: "ACCEPTED",
      newState: order.status,
      events: [event],
    };
  }

  private assertQuoteActor(
    quote: ServiceQuote,
    actorId: string,
    role: "provider" | "client",
  ): void {
    if (role === "provider" && quote.providerId !== actorId) {
      throw new Error("Only the quote provider can perform this action");
    }
  }

  assertQuoteFinancials(quote: ServiceQuote): void {
    assertCents(quote.subtotalCents, "subtotalCents");
    assertCents(quote.taxCents, "taxCents");
    assertCents(quote.totalCents, "totalCents");
    for (const item of quote.items) {
      assertCents(item.unitPriceCents, `items[${item.id}].unitPriceCents`);
      assertCents(item.totalCents, `items[${item.id}].totalCents`);
    }
    const itemsTotal = quote.items.reduce((sum, item) => sum + item.totalCents, 0);
    if (itemsTotal !== quote.subtotalCents) {
      throw new Error(
        `Quote items total (${itemsTotal}) does not match subtotalCents (${quote.subtotalCents})`,
      );
    }
    if (quote.subtotalCents + quote.taxCents !== quote.totalCents) {
      throw new Error(
        "Quote subtotal + tax must equal total (quote totals use no discount at this stage)",
      );
    }
  }

  private transitionQuote(
    quote: ServiceQuote,
    to: ServiceQuote["status"],
    actorId: string,
    eventType?: DomainEventName,
  ): MarketplaceFlowResult<ServiceQuote> {
    const previousState = quote.status;
    const updated: ServiceQuote = {
      ...quote,
      status: to,
      updatedAt: this.now(),
      ...(to === "SENT" ? { sentAt: quote.sentAt ?? this.now() } : {}),
      ...(to === "VIEWED" ? { viewedAt: quote.viewedAt ?? this.now() } : {}),
      ...((to === "ACCEPTED" || to === "REJECTED") ? { respondedAt: quote.respondedAt ?? this.now() } : {}),
    };
    const events = eventType
      ? [this.emit(eventType, actorId, "marketplace_quote", quote.id, {
          quoteId: quote.id,
          requestId: quote.requestId,
          providerId: quote.providerId,
        })]
      : [];
    return { entity: updated, previousState, newState: to, events };
  }
}

export interface BuildOrderFromQuoteInput {
  quote: ServiceQuote;
  clientId: string;
  providerId: string;
  title: string;
  type?: OrderType;
  settings?: Partial<OrderSettings>;
  timeline?: Partial<OrderTimeline>;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

function buildOrderItems(quote: ServiceQuote): OrderItem[] {
  return quote.items.map((item, index) => {
    assertCents(item.unitPriceCents, `items[${index}].unitPriceCents`);
    assertCents(item.totalCents, `items[${index}].totalCents`);
    return {
      id: item.id,
      type: "SERVICE",
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: item.unitPriceCents,
      taxRate: item.taxRate,
      discountCents: 0,
      totalCents: item.totalCents,
      metadata: {},
    };
  });
}