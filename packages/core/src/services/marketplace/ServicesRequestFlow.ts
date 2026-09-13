/**
 * RPG-OS — Marketplace Services Request Flow (Phase 2)
 *
 * Ciclo comercial: REQUEST → QUOTES → ADJUDICAÇÃO → CONTRACT PREPARATION.
 *
 * Regras de segurança:
 *  - Apenas o owner do request (client) pode publicar, adjudicar ou cancelar;
 *  - Nenhuma autoridade vem do browser — o servidor resolve owner/contexto;
 *  - A adjudicação é auditável: regista quem/quando/contexto/versão/preço/condições;
 *  - Uma request em estado terminal (CONTRACTED/COMPLETED/CANCELLED/DISPUTED)
 *    não aceita mutações.
 */

import type {
  ServiceRequest,
  ServiceQuote,
  AdjudicationRecord,
  RequestKind,
  MarketplaceEvent,
  MarketplaceQuoteStatus,
} from "../../types/marketplace";
import { MarketplaceQuoteStateMachine } from "./MarketplaceStateMachine";

const SYSTEM_ACTOR = "system";

const TERMINAL_REQUEST_STATES: ReadonlySet<ServiceRequest["status"]> = new Set([
  "CONTRACTED",
  "COMPLETED",
  "CANCELLED",
  "DISPUTED",
]);

const ADJUDICABLE_QUOTE_STATES: ReadonlySet<MarketplaceQuoteStatus> = new Set([
  "SENT",
  "VIEWED",
]);

export interface ServicesRequestFlowOptions {
  now?: () => string;
  createId?: () => string;
}

export interface ServicesRequestFlowResult<T> {
  entity: T;
  events: MarketplaceEvent[];
}

export interface CreateRequestInput {
  clientId: string;
  kind: RequestKind;
  categoryId: string;
  title: string;
  description: string;
  /** Budget em cents inteiros — validado server-side. */
  budget: {
    type: "FIXED" | "RANGE" | "NEGOTIABLE";
    amountCents?: number;
    minCents?: number;
    maxCents?: number;
    currency: string;
  };
  urgency?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  desiredStartDate?: string;
  desiredEndDate?: string;
}

function assertCents(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new Error(`${label} must be a non-negative integer (cents), got ${value}`);
  }
}

function buildDefaultId(): string {
  const crypto_ = globalThis.crypto;
  if (crypto_ && typeof crypto_.randomUUID === "function") {
    return crypto_.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class ServicesRequestFlow {
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(options: ServicesRequestFlowOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? buildDefaultId;
  }

  createRequest(input: CreateRequestInput): ServicesRequestFlowResult<ServiceRequest> {
    const { clientId, kind, categoryId, title, description, budget, desiredStartDate } = input;
    if (!clientId || !kind || !categoryId || !title?.trim() || !description?.trim()) {
      throw new Error("Request requires clientId, kind, categoryId, title and description");
    }
    this.validateBudget(budget);
    if (desiredStartDate && !Number.isNaN(Date.parse(desiredStartDate))) {
      // accettável
    }
    const now = this.now();
    const request: ServiceRequest = {
      id: this.createId(),
      clientId,
      categoryId,
      title,
      description,
      budget: {
        type: budget.type,
        amountCents: budget.amountCents,
        minCents: budget.minCents,
        maxCents: budget.maxCents,
        currency: budget.currency,
      },
      urgency: input.urgency ?? "MEDIUM",
      desiredStartDate: input.desiredStartDate,
      desiredEndDate: input.desiredEndDate,
      location: { serviceMode: "BOTH" },
      attachments: [],
      status: "DRAFT",
      quotes: [],
      moderation: { status: "APPROVED" },
      createdAt: now,
      updatedAt: now,
    };
    return {
      entity: request,
      events: [this.emit("REQUEST_CREATED", clientId, "service_request", request.id, {
        requestId: request.id,
        kind,
        categoryId,
      })],
    };
  }

  publishRequest(request: ServiceRequest, clientId: string): ServicesRequestFlowResult<ServiceRequest> {
    this.assertOwner(request, clientId);
    if (request.status !== "DRAFT") {
      throw new Error(`Cannot publish a request in status ${request.status}`);
    }
    return {
      entity: this.updated(request, { status: "PUBLISHED", publishedAt: this.now() }),
      events: [this.emit("REQUEST_PUBLISHED", clientId, "service_request", request.id, {
        requestId: request.id,
      })],
    };
  }

  addQuoteToRequest(request: ServiceRequest, quote: ServiceQuote): ServicesRequestFlowResult<ServiceRequest> {
    if (quote.requestId !== request.id) {
      throw new Error("Quote does not belong to this request");
    }
    this.assertMutable(request);
    const already = request.quotes.some((q) => q.id === quote.id);
    const quotes = already ? request.quotes : [...request.quotes, quote];
    const status: ServiceRequest["status"] = request.status === "PUBLISHED" || request.status === "DRAFT"
      ? "QUOTES_RECEIVED"
      : request.status;
    return {
      entity: this.updated(request, { quotes, status }),
      events: [],
    };
  }

  /**
   * Adjudicação: o client (owner) escolhe uma quote.
   * Cria o registo auditable e move quote → ACCEPTED, request → ADJUDICATED.
   * A quote aceite fica imutável até conversão para contrato.
   */
  adjudicateQuote(input: {
    request: ServiceRequest;
    quote: ServiceQuote;
    clientId: string;
    context?: string;
    conditions?: string[];
  }): ServicesRequestFlowResult<{ request: ServiceRequest; adjudication: AdjudicationRecord }> {
    const { request, quote, clientId } = input;
    this.assertOwner(request, clientId);
    this.assertMutable(request);
    if (quote.requestId !== request.id) {
      throw new Error("Quote does not belong to this request");
    }
    if (!ADJUDICABLE_QUOTE_STATES.has(quote.status)) {
      throw new Error(`Quote in status ${quote.status} cannot be adjudicated`);
    }
    MarketplaceQuoteStateMachine.validateTransition(quote.status, "ACCEPTED");
    this.validateQuoteFinancials(quote);

    const adjudication: AdjudicationRecord = {
      id: this.createId(),
      requestId: request.id,
      quoteId: quote.id,
      adjudicatedBy: clientId,
      context: input.context ?? "client selected quote during adjudication",
      quoteVersion: quote.id,
      priceCents: quote.totalCents,
      currency: quote.currency,
      conditions: input.conditions ?? [],
      createdAt: this.now(),
    };

    const updatedRequest: ServiceRequest = {
      ...this.updated(request, { status: "ADJUDICATED", adjudicatedQuoteId: quote.id, updatedAt: this.now() }),
      quotes: request.quotes.map((q) =>
        q.id === quote.id
          ? { ...q, status: "ACCEPTED" as const, updatedAt: this.now(), respondedAt: q.respondedAt ?? this.now() }
          : q,
      ),
    };

    return {
      entity: { request: updatedRequest, adjudication },
      events: [
        this.emit("QUOTE_ACCEPTED", clientId, "marketplace_quote", quote.id, {
          quoteId: quote.id,
          requestId: request.id,
          providerId: quote.providerId,
          priceCents: quote.totalCents,
          currency: quote.currency,
        }),
        this.emit("REQUEST_ADJUDICATED", clientId, "service_request", request.id, {
          requestId: request.id,
          quoteId: quote.id,
          priceCents: quote.totalCents,
          currency: quote.currency,
        }),
      ],
    };
  }

  cancelRequest(request: ServiceRequest, clientId: string): ServicesRequestFlowResult<ServiceRequest> {
    this.assertOwner(request, clientId);
    if (request.status === "CONTRACTED" || request.status === "COMPLETED") {
      throw new Error(`Cannot cancel a request in status ${request.status}`);
    }
    return {
      entity: this.updated(request, { status: "CANCELLED" }),
      events: [this.emit("ORDER_CANCELLED", clientId, "service_request", request.id, {
        requestId: request.id,
      })],
    };
  }

  /** Apenas o sistema converte para CONTRACTING após conversão em contrato. */
  markContracting(request: ServiceRequest): ServicesRequestFlowResult<ServiceRequest> {
    if (request.status !== "ADJUDICATED") {
      throw new Error(`Cannot move to CONTRACTING from ${request.status}`);
    }
    return {
      entity: this.updated(request, { status: "CONTRACTING" }),
      events: [this.emit("REQUEST_PUBLISHED", SYSTEM_ACTOR, "service_request", request.id, {
        requestId: request.id,
      })],
    };
  }

  private validateBudget(budget: CreateRequestInput["budget"]): void {
    assertCents(budget.amountCents, "budget.amountCents");
    assertCents(budget.minCents, "budget.minCents");
    assertCents(budget.maxCents, "budget.maxCents");
    if (budget.type === "FIXED" && budget.amountCents === undefined) {
      throw new Error("Fixed budget requires amountCents");
    }
    if (budget.minCents !== undefined && budget.maxCents !== undefined && budget.maxCents < budget.minCents) {
      throw new Error("budget.maxCents must be >= budget.minCents");
    }
  }

  private validateQuoteFinancials(quote: ServiceQuote): void {
    assertCents(quote.subtotalCents, "subtotalCents");
    assertCents(quote.taxCents, "taxCents");
    assertCents(quote.totalCents, "totalCents");
    if (quote.subtotalCents + quote.taxCents !== quote.totalCents) {
      throw new Error("Quote subtotal + tax must equal total");
    }
  }

  private assertOwner(request: ServiceRequest, actorId: string): void {
    if (request.clientId !== actorId) {
      throw new Error("Only the request owner (client) can perform this action");
    }
  }

  private assertMutable(request: ServiceRequest): void {
    if (TERMINAL_REQUEST_STATES.has(request.status)) {
      throw new Error(`Request in terminal status ${request.status} cannot be mutated`);
    }
  }

  private updated(request: ServiceRequest, patch: Partial<ServiceRequest>): ServiceRequest {
    return { ...request, ...patch, updatedAt: this.now() };
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