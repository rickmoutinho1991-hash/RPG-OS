/**
 * RPG-OS — Payment Abstraction Foundation
 *
 * Provider-agnostic payment layer.
 * Supports: CARD, MB_WAY, BANK_TRANSFER, CASH, CREDIT_CARD, CHECK, etc.
 * No fund custody. No fake escrow. Webhook verification mandatory.
 */

import type { UniversalActor } from "./actor";

/** Payment method types */
export type PaymentMethodType =
  | "CARD"
  | "MB_WAY"
  | "BANK_TRANSFER"
  | "CASH"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "CHECK"
  | "PIX"
  | "SEPA_DIRECT_DEBIT"
  | "PAYPAL"
  | "APPLE_PAY"
  | "GOOGLE_PAY"
  | "MULTIBANCO"
  | "OTHER";

/** Payment status */
export type PaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "AUTHORIZED"
  | "CAPTURED"
  | "SETTLED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "DISPUTED"
  | "CHARGEBACK"
  | "EXPIRED";

/** Payment intent status */
export type PaymentIntentStatus =
  | "CREATED"
  | "REQUIRES_PAYMENT_METHOD"
  | "REQUIRES_CONFIRMATION"
  | "REQUIRES_ACTION"
  | "PROCESSING"
  | "SUCCEEDED"
  | "CANCELLED";

/** Refund status */
export type RefundStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

/** Dispute status */
export type DisputeStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "WON"
  | "LOST"
  | "ACCEPTED"
  | "CANCELLED";

/** Currency (ISO 4217) */
export type Currency = "EUR" | "USD" | "GBP" | "BRL";

/** Money amount in smallest unit (cents) */
export type MoneyAmount = number & { readonly __brand: unique symbol };

/** Payment provider */
export interface PaymentProvider {
  id: string;
  name: string;
  /** Supported methods */
  supportedMethods: PaymentMethodType[];
  /** Supported currencies */
  supportedCurrencies: Currency[];
  /** Supported countries */
  supportedCountries: string[];
  /** Capabilities */
  capabilities: PaymentProviderCapability[];
  /** Configuration schema */
  configSchema: Record<string, unknown>;
  /** Whether provider supports webhooks */
  supportsWebhooks: boolean;
  /** Whether provider supports refunds */
  supportsRefunds: boolean;
  /** Whether provider supports partial captures */
  supportsPartialCapture: boolean;
  /** Whether provider supports subscriptions */
  supportsSubscriptions: boolean;
  /** Fees (platform + provider) */
  feeStructure: PaymentFeeStructure;
  /** Environment */
  environment: "development" | "staging" | "production";
  /** Active */
  active: boolean;
}

export interface PaymentProviderCapability {
  key: string;
  label: string;
  description?: string;
}

export interface PaymentFeeStructure {
  /** Platform fee percentage */
  platformFeePercentage: number;
  /** Platform fee fixed (cents) */
  platformFeeFixedCents: number;
  /** Provider fee percentage (estimate) */
  providerFeePercentage?: number;
  /** Provider fee fixed (cents) (estimate) */
  providerFeeFixedCents?: number;
  /** Minimum fee (cents) */
  minimumFeeCents?: number;
  /** Maximum fee (cents) */
  maximumFeeCents?: number;
}

/** Payment intent — the intention to collect payment */
export interface PaymentIntent {
  id: string;
  /** External reference (order, contract, etc.) */
  referenceId: string;
  referenceType: "ORDER" | "CONTRACT" | "INVOICE" | "QUOTE" | "SUBSCRIPTION" | "MANUAL";
  /** Amount in cents */
  amountCents: number;
  currency: Currency;
  /** Payment method */
  paymentMethod?: PaymentMethod;
  /** Payment method types allowed */
  allowedPaymentMethods: PaymentMethodType[];
  /** Customer */
  customerId: string;
  /** Customer email */
  customerEmail?: string;
  /** Description */
  description?: string;
  /** Metadata */
  metadata: Record<string, unknown>;
  /** Status */
  status: PaymentIntentStatus;
  /** Client secret for client-side confirmation */
  clientSecret?: string;
  /** Next action required */
  nextAction?: PaymentNextAction;
  /** Cancellation reason */
  cancellationReason?: string;
  /** Expires at */
  expiresAt?: string;
  /** Created at */
  createdAt: string;
  updatedAt: string;
  /** Confirmed at */
  confirmedAt?: string;
  /** Succeeded at */
  succeededAt?: string;
}

/** Payment method attached to customer */
export interface PaymentMethod {
  id: string;
  customerId: string;
  type: PaymentMethodType;
  /** Provider-specific ID */
  providerPaymentMethodId?: string;
  /** Provider */
  provider: string;
  /** Details (card brand, last4, etc.) */
  details: PaymentMethodDetails;
  /** Billing details */
  billingDetails?: PaymentBillingDetails;
  /** Whether this is the default method */
  isDefault: boolean;
  /** Whether method is active */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethodDetails {
  /** For cards */
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    funding: "CREDIT" | "DEBIT" | "PREPAID" | "UNKNOWN";
    country?: string;
  };
  /** For MB Way */
  mbWay?: {
    phoneNumber: string;
  };
  /** For bank transfer */
  bankTransfer?: {
    bankName?: string;
    iban?: string;
    bic?: string;
  };
  /** Generic */
  [key: string]: unknown;
}

export interface PaymentBillingDetails {
  name?: string;
  email?: string;
  phone?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
}

/** Next action required for payment */
export interface PaymentNextAction {
  type: "REDIRECT" | "AUTHENTICATE" | "VERIFY" | "OTP" | "DOCUMENT";
  /** URL for redirect */
  redirectUrl?: string;
  /** Data for authentication */
  authData?: Record<string, unknown>;
  /** Expires at */
  expiresAt?: string;
}

/** Payment — the actual money movement */
export interface Payment {
  id: string;
  /** Payment intent */
  intentId: string;
  /** Provider */
  provider: string;
  /** Provider transaction ID */
  providerTransactionId: string;
  /** Amount in cents */
  amountCents: number;
  currency: Currency;
  /** Payment method used */
  paymentMethod: PaymentMethod;
  /** Status */
  status: PaymentStatus;
  /** Fees */
  fees: PaymentFees;
  /** Net amount (after fees) */
  netAmountCents: number;
  /** Description */
  description?: string;
  /** Metadata */
  metadata: Record<string, unknown>;
  /** Customer */
  customerId: string;
  /** Receipt URL */
  receiptUrl?: string;
  /** Failure details */
  failureDetails?: PaymentFailureDetails;
  /** Dispute info */
  dispute?: PaymentDispute;
  /** Refunds */
  refunds: Refund[];
  /** Created at */
  createdAt: string;
  updatedAt: string;
  /** Authorized at */
  authorizedAt?: string;
  /** Captured at */
  capturedAt?: string;
  /** Settled at */
  settledAt?: string;
  /** Completed at */
  completedAt?: string;
  /** Failed at */
  failedAt?: string;
  /** Cancelled at */
  cancelledAt?: string;
}

export interface PaymentFees {
  /** Platform fee (cents) */
  platformFeeCents: number;
  /** Provider fee (cents) */
  providerFeeCents: number;
  /** Total fees (cents) */
  totalFeesCents: number;
  /** Breakdown */
  breakdown: FeeBreakdown[];
}

export interface FeeBreakdown {
  type: "PLATFORM" | "PROVIDER" | "INTERCHANGE" | "SCHEME" | "OTHER";
  amountCents: number;
  description?: string;
}

export interface PaymentFailureDetails {
  code: string;
  message: string;
  declineCode?: string;
  providerCode?: string;
}

/** Payment dispute */
export interface PaymentDispute {
  id: string;
  paymentId: string;
  /** Reason */
  reason: "FRAUDULENT" | "PRODUCT_NOT_RECEIVED" | "PRODUCT_UNACCEPTABLE" | "CREDIT_NOT_PROCESSED" | "DUPLICATE" | "SUBSCRIPTION_CANCELLED" | "GENERAL" | "OTHER";
  /** Amount disputed (cents) */
  amountCents: number;
  currency: Currency;
  /** Status */
  status: DisputeStatus;
  /** Evidence */
  evidence: DisputeEvidence[];
  /** Due by */
  evidenceDueBy?: string;
  /** Resolution */
  resolution?: DisputeResolution;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeEvidence {
  id: string;
  type: "DOCUMENT" | "IMAGE" | "COMMUNICATION" | "TRACKING" | "REFUND_POLICY" | "CANCELLATION_POLICY" | "OTHER";
  url?: string;
  content?: string;
  submittedAt: string;
}

export interface DisputeResolution {
  outcome: "WON" | "LOST" | "ACCEPTED";
  reason?: string;
  amountCents?: number;
  resolvedAt: string;
}

/** Refund */
export interface Refund {
  id: string;
  paymentId: string;
  /** Amount in cents */
  amountCents: number;
  currency: Currency;
  /** Reason */
  reason: "DUPLICATE" | "FRAUDULENT" | "REQUESTED_BY_CUSTOMER" | "EXPIRED_UNCAPTURED" | "OTHER";
  /** Status */
  status: RefundStatus;
  /** Provider refund ID */
  providerRefundId?: string;
  /** Refunded fees */
  feesRefundedCents: number;
  /** Metadata */
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  failedAt?: string;
}

/** Payout (to providers/sellers) */
export interface Payout {
  id: string;
  /** Destination */
  destinationId: string;
  destinationType: "BANK_ACCOUNT" | "CARD" | "WALLET";
  /** Amount in cents */
  amountCents: number;
  currency: Currency;
  /** Status */
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  /** Source payments */
  paymentIds: string[];
  /** Fees */
  fees: PayoutFees;
  /** Net amount */
  netAmountCents: number;
  /** Provider */
  provider: string;
  /** Provider payout ID */
  providerPayoutId?: string;
  /** Failure details */
  failureDetails?: PaymentFailureDetails;
  /** Metadata */
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface PayoutFees {
  platformFeeCents: number;
  providerFeeCents: number;
  totalFeesCents: number;
}

/** Platform fee configuration */
export interface PlatformFeeConfig {
  id: string;
  name: string;
  /** Fee type */
  type: "PERCENTAGE" | "FIXED" | "TIERED" | "CUSTOM";
  /** Percentage fee */
  percentage?: number;
  /** Fixed fee (cents) */
  fixedCents?: number;
  /** Tiered fees */
  tiers?: FeeTier[];
  /** Minimum fee (cents) */
  minimumCents?: number;
  /** Maximum fee (cents) */
  maximumCents?: number;
  /** Applicable to */
  appliesTo: {
    modules?: string[];
    paymentMethods?: PaymentMethodType[];
    currencies?: Currency[];
    customerTypes?: string[];
  };
  /** Active */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeeTier {
  minAmountCents: number;
  maxAmountCents?: number;
  percentage: number;
  fixedCents?: number;
}

/** Customer payment profile */
export interface CustomerPaymentProfile {
  id: string;
  actorId: string;
  /** Saved payment methods */
  paymentMethods: PaymentMethod[];
  /** Default payment method */
  defaultPaymentMethodId?: string;
  /** Billing address */
  billingAddress?: PaymentBillingDetails;
  /** Tax info */
  taxInfo?: {
    taxNumber?: string;
    vatNumber?: string;
    taxExempt: boolean;
    taxExemptReason?: string;
  };
  /** Payment settings */
  settings: {
    autoPayEnabled: boolean;
    defaultCurrency: Currency;
    receiptEmail?: string;
    invoicePrefix?: string;
  };
  /** Risk assessment */
  risk?: {
    level: "LOW" | "MEDIUM" | "HIGH";
    score?: number;
    factors: string[];
    lastAssessedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

/** Reconciliation entry */
export interface ReconciliationEntry {
  id: string;
  /** Date */
  date: string;
  /** Provider */
  provider: string;
  /** Expected amount (cents) */
  expectedAmountCents: number;
  /** Actual amount (cents) */
  actualAmountCents: number;
  /** Currency */
  currency: Currency;
  /** Difference (cents) */
  differenceCents: number;
  /** Status */
  status: "MATCHED" | "MISMATCH" | "PENDING" | "INVESTIGATING" | "RESOLVED";
  /** Related payments */
  paymentIds: string[];
  /** Related payouts */
  payoutIds: string[];
  /** Notes */
  notes?: string;
  /** Resolved by */
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Webhook event */
export interface PaymentWebhookEvent {
  id: string;
  provider: string;
  /** Event type */
  type: string;
  /** Payload */
  payload: Record<string, unknown>;
  /** Signature */
  signature?: string;
  /** Received at */
  receivedAt: string;
  /** Processed at */
  processedAt?: string;
  /** Status */
  status: "PENDING" | "PROCESSED" | "FAILED" | "IGNORED";
  /** Error if failed */
  error?: string;
  /** Idempotency key */
  idempotencyKey: string;
}

/** Payment provider interface */
export interface PaymentProviderInterface {
  /** Provider ID */
  readonly id: string;

  /** Create payment intent */
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntent>;

  /** Confirm payment intent */
  confirmPaymentIntent(intentId: string, input: ConfirmPaymentIntentInput): Promise<PaymentIntent>;

  /** Cancel payment intent */
  cancelPaymentIntent(intentId: string): Promise<PaymentIntent>;

  /** Capture payment intent (for authorized but not captured) */
  capturePaymentIntent(intentId: string, amountCents?: number): Promise<Payment>;

  /** Create refund */
  createRefund(input: CreateRefundInput): Promise<Refund>;

  /** Create payout */
  createPayout(input: CreatePayoutInput): Promise<Payout>;

  /** Get payment */
  getPayment(paymentId: string): Promise<Payment | null>;

  /** Get payment intent */
  getPaymentIntent(intentId: string): Promise<PaymentIntent | null>;

  /** List payment methods for customer */
  listPaymentMethods(customerId: string): Promise<PaymentMethod[]>;

  /** Attach payment method */
  attachPaymentMethod(customerId: string, paymentMethodId: string): Promise<PaymentMethod>;

  /** Detach payment method */
  detachPaymentMethod(paymentMethodId: string): Promise<void>;

  /** Verify webhook signature */
  verifyWebhook(payload: string | Buffer, signature: string): boolean;

  /** Parse webhook event */
  parseWebhookEvent(payload: Record<string, unknown>, signature?: string): PaymentWebhookEvent;

  /** Health check */
  healthCheck(): Promise<{ healthy: boolean; latencyMs: number }>;
}

export interface CreatePaymentIntentInput {
  referenceId: string;
  referenceType: PaymentIntent["referenceType"];
  amountCents: number;
  currency: Currency;
  customerId: string;
  customerEmail?: string;
  allowedPaymentMethods?: PaymentMethodType[];
  paymentMethodId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: string;
}

export interface ConfirmPaymentIntentInput {
  paymentMethodId?: string;
  returnUrl?: string;
  mandateId?: string;
}

export interface CreateRefundInput {
  paymentId: string;
  amountCents?: number; // undefined = full refund
  reason: Refund["reason"];
  metadata?: Record<string, unknown>;
}

export interface CreatePayoutInput {
  destinationId: string;
  destinationType: Payout["destinationType"];
  amountCents: number;
  currency: Currency;
  paymentIds: string[];
  metadata?: Record<string, unknown>;
}

/** Payment provider registry */
export class PaymentProviderRegistry {
  private static providers: Map<string, PaymentProviderInterface> = new Map();
  private static configs: Map<string, PaymentProvider> = new Map();

  static register(provider: PaymentProviderInterface, config: PaymentProvider): void {
    this.providers.set(provider.id, provider);
    this.configs.set(provider.id, config);
  }

  static get(providerId: string): PaymentProviderInterface | undefined {
    return this.providers.get(providerId);
  }

  static getConfig(providerId: string): PaymentProvider | undefined {
    return this.configs.get(providerId);
  }

  static list(): PaymentProvider[] {
    return Array.from(this.configs.values());
  }

  static getActiveProviders(): PaymentProvider[] {
    return Array.from(this.configs.values()).filter((p) => p.active);
  }

  static getProviderForMethod(method: PaymentMethodType): PaymentProviderInterface | undefined {
    for (const config of this.configs.values()) {
      if (config.active && config.supportedMethods.includes(method)) {
        return this.providers.get(config.id);
      }
    }
    return undefined;
  }
}

/** Default provider registry instance */
export const paymentProviderRegistry = PaymentProviderRegistry;

/** Payment service — orchestrates payment operations */
export class PaymentService {
  /** Create a payment intent */
  async createIntent(input: CreatePaymentIntentInput): Promise<PaymentIntent> {
    const provider = paymentProviderRegistry.getProviderForMethod(
      input.allowedPaymentMethods?.[0] || "CARD"
    );
    if (!provider) {
      throw new Error("No payment provider available for the requested method");
    }
    return provider.createPaymentIntent(input);
  }

  /** Confirm a payment intent */
  async confirmIntent(intentId: string, input: ConfirmPaymentIntentInput): Promise<PaymentIntent> {
    // TODO: Get provider from intent
    throw new Error("Not implemented");
  }

  /** Process a refund */
  async refund(input: CreateRefundInput): Promise<Refund> {
    // TODO: Get provider from payment
    throw new Error("Not implemented");
  }

  /** Create a payout */
  async createPayout(input: CreatePayoutInput): Promise<Payout> {
    // TODO: Implement
    throw new Error("Not implemented");
  }

  /** Handle webhook */
  async handleWebhook(providerId: string, payload: string | Buffer, signature: string): Promise<PaymentWebhookEvent> {
    const provider = paymentProviderRegistry.get(providerId);
    if (!provider) {
      throw new Error(`Payment provider ${providerId} not found`);
    }

    if (!provider.verifyWebhook(payload, signature)) {
      throw new Error("Invalid webhook signature");
    }

    return provider.parseWebhookEvent(payload as any, signature);
  }

  /** Reconcile payments */
  async reconcile(date: string, providerId?: string): Promise<ReconciliationEntry[]> {
    // TODO: Implement
    return [];
  }
}