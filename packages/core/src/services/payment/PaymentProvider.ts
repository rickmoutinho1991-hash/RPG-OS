/**
 * RPG-OS Payment Provider Abstraction
 *
 * Interface genérica para providers de pagamento (Stripe, Adyen, Fake, etc.)
 * O Payment Engine trabalha contra esta interface, não contra providers específicos.
 */

export type PaymentProviderType = 'FAKE' | 'STRIPE_CONNECT' | 'ADYEN_FOR_PLATFORMS' | 'SIBS';

export type PaymentStatus = 
  | 'PENDING'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'DISPUTED';

export type PayoutStatus = 
  | 'PENDING'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'REVERSED';

export type PaymentEventType = 
  | 'PAYMENT_CREATED'
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REFUNDED'
  | 'PAYOUT_CREATED'
  | 'PAYOUT_SUCCEEDED'
  | 'PAYOUT_FAILED';

export interface PaymentIntent {
  id: string;
  amount: number; // in cents
  currency: string;
  customerId?: string;
  metadata?: Record<string, unknown>;
  status: PaymentStatus;
  providerPaymentId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentResult {
  success: boolean;
  paymentIntent?: PaymentIntent;
  error?: string;
  providerPaymentId?: string;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  amount?: number;
  error?: string;
}

export interface PayoutResult {
  success: boolean;
  payoutId?: string;
  error?: string;
}

export interface WebhookEvent {
  id: string;
  type: PaymentEventType;
  provider: PaymentProviderType;
  providerEventId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  event?: WebhookEvent;
  error?: string;
}

/**
 * Interface base para todos os providers de pagamento
 * Cada provider implementa esta interface com a sua lógica específica
 */
export interface IPaymentProvider {
  /**
   * Identificador único do provider
   */
  readonly providerType: PaymentProviderType;

  /**
   * Cria um novo pagamento
   */
  createPayment(params: {
    amount: number; // in cents
    currency: string;
    customerId?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaymentResult>;

  /**
   * Obtém detalhes de um pagamento existente
   */
  getPayment(providerPaymentId: string): Promise<PaymentIntent | null>;

  /**
   * Reembolsa um pagamento (total ou parcial)
   */
  refundPayment(params: {
    providerPaymentId: string;
    amount?: number; // in cents, se omitido = reembolso total
    reason?: string;
  }): Promise<RefundResult>;

  /**
   * Cria um payout para transferir fundos para uma conta
   */
  createPayout(params: {
    amount: number; // in cents
    currency: string;
    destinationAccountId: string;
    metadata?: Record<string, unknown>;
  }): Promise<PayoutResult>;

  /**
   * Verifica a autenticidade de um webhook
   */
  verifyWebhook(params: {
    payload: string | Record<string, unknown>;
    signature?: string;
    headers?: Record<string, string>;
  }): Promise<WebhookVerificationResult>;

  /**
   * Processa um evento de webhook e converte para formato standardizado
   */
  parseWebhookEvent(payload: Record<string, unknown>): WebhookEvent | null;
}

/**
 * Configuração para criar instâncias de providers
 */
export interface PaymentProviderConfig {
  providerType?: PaymentProviderType;
  apiKey?: string;
  apiSecret?: string;
  webhookSecret?: string;
  environment?: 'sandbox' | 'production';
  [key: string]: unknown;
}