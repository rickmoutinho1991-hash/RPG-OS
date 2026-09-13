/**
 * RPG-OS Fake Payment Provider
 * 
 * Provider simulado para desenvolvimento e testes (sandbox mode).
 * Não processa pagamentos reais - apenas simula o fluxo completo.
 */

import {
  IPaymentProvider,
  PaymentProviderType,
  PaymentStatus,
  PayoutStatus,
  PaymentEventType,
  PaymentIntent,
  PaymentResult,
  RefundResult,
  PayoutResult,
  WebhookEvent,
  WebhookVerificationResult,
  PaymentProviderConfig,
} from './PaymentProvider';

/**
 * Armazenamento em memória para pagamentos simulados
 * Em produção, isto seria substituído por integração real com Stripe/Adyen
 */
class FakePaymentStore {
  private payments: Map<string, PaymentIntent> = new Map();
  private refunds: Map<string, { id: string; amount: number; paymentId: string }> = new Map();
  private payouts: Map<string, { id: string; amount: number; status: PayoutStatus }> = new Map();
  private webhooks: WebhookEvent[] = [];

  savePayment(payment: PaymentIntent): void {
    this.payments.set(payment.providerPaymentId, payment);
  }

  getPayment(providerPaymentId: string): PaymentIntent | null {
    return this.payments.get(providerPaymentId) || null;
  }

  updatePayment(providerPaymentId: string, updates: Partial<PaymentIntent>): void {
    const payment = this.payments.get(providerPaymentId);
    if (payment) {
      this.payments.set(providerPaymentId, { ...payment, ...updates });
    }
  }

  saveRefund(refund: { id: string; amount: number; paymentId: string }): void {
    this.refunds.set(refund.id, refund);
  }

  savePayout(payout: { id: string; amount: number; status: PayoutStatus }): void {
    this.payouts.set(payout.id, payout);
  }

  addWebhook(event: WebhookEvent): void {
    this.webhooks.push(event);
  }

  getWebhooks(): WebhookEvent[] {
    return [...this.webhooks];
  }

  clear(): void {
    this.payments.clear();
    this.refunds.clear();
    this.payouts.clear();
    this.webhooks = [];
  }
}

const store = new FakePaymentStore();

export class FakePaymentProvider implements IPaymentProvider {
  readonly providerType: PaymentProviderType = 'FAKE';

  constructor(private readonly config: PaymentProviderConfig = {}) {
    // Configuração opcional para comportamento simulado
    this.config = {
      providerType: 'FAKE',
      environment: 'sandbox',
      ...config,
    };
  }

  /**
   * Cria um pagamento simulado
   * Por defeito, retorna sucesso após 1 segundo (simula network delay)
   */
  async createPayment(params: {
    amount: number;
    currency: string;
    customerId?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaymentResult> {
    // Simula delay de rede
    await this.simulateDelay(100);

    const providerPaymentId = `fake_pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const paymentIntent: PaymentIntent = {
      id: `int_${providerPaymentId}`,
      amount: params.amount,
      currency: params.currency,
      customerId: params.customerId,
      metadata: params.metadata,
      status: 'AUTHORIZED', // Fake provider sempre autoriza imediatamente
      providerPaymentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    store.savePayment(paymentIntent);

    // Simula webhook de pagamento autorizado
    store.addWebhook({
      id: `evt_${Date.now()}`,
      type: 'PAYMENT_SUCCEEDED',
      provider: this.providerType,
      providerEventId: `evt_${Date.now()}`,
      payload: { paymentIntentId: paymentIntent.id, amount: params.amount },
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      paymentIntent,
      providerPaymentId,
    };
  }

  /**
   * Obtém detalhes de um pagamento simulado
   */
  async getPayment(providerPaymentId: string): Promise<PaymentIntent | null> {
    await this.simulateDelay(50);
    return store.getPayment(providerPaymentId);
  }

  /**
   * Reembolsa um pagamento simulado
   */
  async refundPayment(params: {
    providerPaymentId: string;
    amount?: number;
    reason?: string;
  }): Promise<RefundResult> {
    await this.simulateDelay(200);

    const payment = store.getPayment(params.providerPaymentId);
    if (!payment) {
      return {
        success: false,
        error: 'Payment not found',
      };
    }

    const refundAmount = params.amount || payment.amount;
    const refundId = `fake_ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Atualiza status do pagamento
    const newStatus = refundAmount === payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    store.updatePayment(params.providerPaymentId, {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });

    store.saveRefund({
      id: refundId,
      amount: refundAmount,
      paymentId: params.providerPaymentId,
    });

    // Simula webhook de reembolso
    store.addWebhook({
      id: `evt_${Date.now()}`,
      type: 'PAYMENT_REFUNDED',
      provider: this.providerType,
      providerEventId: `evt_${Date.now()}`,
      payload: { refundId, amount: refundAmount, paymentId: params.providerPaymentId },
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      refundId,
      amount: refundAmount,
    };
  }

  /**
   * Cria um payout simulado
   */
  async createPayout(params: {
    amount: number;
    currency: string;
    destinationAccountId: string;
    metadata?: Record<string, unknown>;
  }): Promise<PayoutResult> {
    await this.simulateDelay(300);

    const payoutId = `fake_payout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    store.savePayout({
      id: payoutId,
      amount: params.amount,
      status: 'PROCESSING',
    });

    // Simula sucesso do payout após delay
    setTimeout(() => {
      store.savePayout({
        id: payoutId,
        amount: params.amount,
        status: 'PAID',
      });

      store.addWebhook({
        id: `evt_${Date.now()}`,
        type: 'PAYOUT_SUCCEEDED',
        provider: this.providerType,
        providerEventId: `evt_${Date.now()}`,
        payload: { payoutId, amount: params.amount },
        timestamp: new Date().toISOString(),
      });
    }, 1000);

    return {
      success: true,
      payoutId,
    };
  }

  /**
   * Verifica webhook simulado (sempre válido em sandbox)
   */
  async verifyWebhook(params: {
    payload: string | Record<string, unknown>;
    signature?: string;
    headers?: Record<string, string>;
  }): Promise<WebhookVerificationResult> {
    await this.simulateDelay(50);

    // Em sandbox, sempre consideramos válido
    const payload = typeof params.payload === 'string' 
      ? JSON.parse(params.payload) 
      : params.payload;

    return {
      valid: true,
      event: {
        id: payload.id || `evt_${Date.now()}`,
        type: payload.type || 'PAYMENT_SUCCEEDED',
        provider: this.providerType,
        providerEventId: payload.id || `evt_${Date.now()}`,
        payload,
        timestamp: payload.timestamp || new Date().toISOString(),
      },
    };
  }

  /**
   * Parse de webhook simulado
   */
  parseWebhookEvent(payload: Record<string, unknown>): WebhookEvent | null {
    return {
      id: String(payload.id || `evt_${Date.now()}`),
      type: (payload.type as PaymentEventType) || 'PAYMENT_SUCCEEDED',
      provider: this.providerType,
      providerEventId: String(payload.id || `evt_${Date.now()}`),
      payload,
      timestamp: String(payload.timestamp || new Date().toISOString()),
    };
  }

  /**
   * Método utilitário para testing - limpa o store
   */
  static clearStore(): void {
    store.clear();
  }

  /**
   * Método utilitário para testing - obtém webhooks gerados
   */
  static getWebhooks(): WebhookEvent[] {
    return store.getWebhooks();
  }

  /**
   * Simula delay de rede para realism em testes
   */
  private simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}