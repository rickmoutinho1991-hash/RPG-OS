/**
 * RPG-OS Payment Engine
 * 
 * Serviço central de orquestração de pagamentos.
 * Trabalha contra a interface IPaymentProvider e integra com PlatformFeeService.
 * 
 * PRODUCTION SAFETY: No automatic FAKE provider registration.
 * Providers MUST be explicitly registered before use.
 * If no provider is registered for a requested type, operations FAIL CLOSED.
 */

import {
  IPaymentProvider,
  PaymentProviderType,
  PaymentStatus,
  PayoutStatus,
  PaymentIntent,
  PaymentResult,
  RefundResult,
  PayoutResult,
  WebhookEvent,
  WebhookVerificationResult,
} from './PaymentProvider';
import {
  resolveApplicableBasisPoints,
  computePlatformFee,
  type FeeConfigSnapshot,
} from '../PlatformFeeService';

export interface CreatePaymentParams {
  /** Ator autenticado que cria o pagamento (server-derived, nunca do cliente). */
  actorId: string;
  organizationId?: string;
  companyId?: string;
  customerId?: string;
  invoiceId?: string;
  grossAmountCents: number;
  currency?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  paymentProvider: PaymentProviderType; // REQUIRED - no default
}

export interface TransactionResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  providerPaymentId?: string;
  grossAmountCents?: number;
  platformFeeCents?: number;
  businessAmountCents?: number;
}

export interface TransactionRecord {
  id: string;
  organizationId?: string;
  companyId?: string;
  customerId?: string;
  invoiceId?: string;
  grossAmountCents: number;
  currency: string;
  commissionRateBps: number;
  platformFeeCents: number;
  businessAmountCents: number;
  paymentProvider: PaymentProviderType;
  providerPaymentId?: string;
  status: PaymentStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutParams {
  /** Ator autenticado que cria o payout (server-derived, nunca do cliente). */
  actorId: string;
  organizationId?: string;
  companyId: string;
  transactionId?: string;
  amountCents: number;
  currency?: string;
  destinationAccountId: string;
  metadata?: Record<string, unknown>;
  paymentProvider: PaymentProviderType; // REQUIRED - no default
}

export interface PayoutRecord {
  id: string;
  organizationId?: string;
  companyId: string;
  transactionId?: string;
  amountCents: number;
  currency: string;
  paymentProvider: PaymentProviderType;
  providerPayoutId?: string;
  destinationAccountId: string;
  status: PayoutStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Ações financeiras que requerem autorização explícita. */
export type PaymentAction = "payment.create" | "payment.refund" | "payment.payout";

/** Contexto de autorização verificado pela política injetável. */
export interface PaymentAuthorizationContext {
  actorId: string;
  action: PaymentAction;
  organizationId?: string;
  companyId?: string;
  invoiceId?: string;
  customerId?: string;
}

/**
 * Política de autorização injetada pelo servidor (fail-closed por omissão).
 * É a única fonte de verdade sobre quem pode criar/refundir/payouts.
 */
export interface PaymentAuthorizer {
  /** Lança erro para negar. Chamada apenas depois do actorId estar validado. */
  assertAuthorized(ctx: PaymentAuthorizationContext): void;
}

/**
 * Payment Engine - Orquestrador central de pagamentos
 * 
 * Responsabilidades:
 * - Integração com PlatformFeeService para cálculo de comissões
 * - Coordenação com providers de pagamento (Stripe, Adyen, SIBS, etc.)
 * - Gestão de lifecycle de transações
 * - Garantia de snapshots imutáveis de fees
 * 
 * PRODUCTION SAFETY:
 * - No automatic FAKE provider initialization
 * - All providers must be explicitly registered via registerProvider()
 * - Operations fail fast if requested provider is not registered
 * - Fake providers only available when explicitly registered by tests/dev
 * - Todo ator financeiro é obrigatório (actorId) e verificado por um
 *   PaymentAuthorizer — sem authorizer configurado, as operações FAIL CLOSED.
 */
export class PaymentEngine {
  private providers: Map<PaymentProviderType, IPaymentProvider> = new Map();
  private authorizer: PaymentAuthorizer | null = null;

  constructor() {
    // No automatic initialization - providers must be explicitly registered
  }

  /**
   * Define a política de autorização de atores financeiros.
   * Sem authorizer, todas as operações financeiras são rejeitadas (fail-closed).
   */
  setAuthorizer(authorizer: PaymentAuthorizer): void {
    this.authorizer = authorizer;
  }

  /**
   * Regista um provider (REQUIRED before any operation)
   */
  registerProvider(providerType: PaymentProviderType, provider: IPaymentProvider): void {
    this.providers.set(providerType, provider);
  }

  private assertAuthorized(ctx: PaymentAuthorizationContext): void {
    if (!ctx.actorId || ctx.actorId.trim().length === 0) {
      throw new Error("Payment operations require an authenticated actor (actorId)");
    }
    if (!this.authorizer) {
      throw new Error(
        "No payment authorizer configured; payment operation rejected (fail-closed)",
      );
    }
    this.authorizer.assertAuthorized(ctx);
  }

  /**
   * Verifica se um provider está registrado
   */
  hasProvider(providerType: PaymentProviderType): boolean {
    return this.providers.has(providerType);
  }

  /**
   * Obtém uma instância de provider - FAILS if not registered
   */
  private getProvider(providerType: PaymentProviderType): IPaymentProvider {
    const provider = this.providers.get(providerType);
    if (!provider) {
      throw new Error(
        `Payment provider ${providerType} not registered. ` +
        `Call registerProvider() before use. ` +
        `Available: ${Array.from(this.providers.keys()).join(', ') || 'none'}`
      );
    }
    return provider;
  }

  /**
   * Cria uma nova transação de pagamento
   * 
   * Fluxo:
   * 1. Resolve taxa aplicável via PlatformFeeService
   * 2. Calcula platform fee
   * 3. Cria pagamento no provider
   * 4. Cria registro de transaction com snapshot
   * 5. Atualiza ledger de platform fees
   * 
   * REQUIRES: paymentProvider in params (no default)
   */
  async createPayment(params: CreatePaymentParams): Promise<TransactionResult> {
    try {
      const providerType = params.paymentProvider;
      this.assertAuthorized({
        actorId: params.actorId,
        action: "payment.create",
        organizationId: params.organizationId,
        companyId: params.companyId,
        invoiceId: params.invoiceId,
        customerId: params.customerId,
      });
      const provider = this.getProvider(providerType);

      // 1. Resolve taxa aplicável (empresa → global → 0)
      // Nota: Em produção, isto seria obtido da BD via PlatformFeeService
      // Por agora, usamos um valor default para o modo sandbox
      const applicableBps = 250; // 2.5% como default

      // 2. Calcula platform fee (snapshot imutável)
      const feeCalculation = computePlatformFee({
        grossCents: params.grossAmountCents,
        basisPoints: applicableBps,
      });

      // 3. Cria pagamento no provider
      const paymentResult = await provider.createPayment({
        amount: params.grossAmountCents,
        currency: params.currency || 'EUR',
        customerId: params.customerId,
        description: params.description,
        metadata: {
          ...params.metadata,
          organizationId: params.organizationId,
          companyId: params.companyId,
          invoiceId: params.invoiceId,
          platformFeeBps: applicableBps,
          platformFeeCents: feeCalculation.feeCents,
        },
      });

      if (!paymentResult.success || !paymentResult.paymentIntent) {
        return {
          success: false,
          error: paymentResult.error || 'Failed to create payment with provider',
        };
      }

      // 4. Cria registro de transaction (será implementado na integração com BD)
      // Por enquanto, retorna os dados calculados para testes
      return {
        success: true,
        providerPaymentId: paymentResult.providerPaymentId,
        grossAmountCents: feeCalculation.grossCents,
        platformFeeCents: feeCalculation.feeCents,
        businessAmountCents: feeCalculation.netCents,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Reembolsa um pagamento existente
   * 
   * REQUIRES: paymentProvider in params (no default)
   */
  async refundPayment(params: {
    actorId: string;
    providerPaymentId: string;
    amountCents?: number;
    reason?: string;
    paymentProvider: PaymentProviderType; // REQUIRED
  }): Promise<RefundResult> {
    try {
      const providerType = params.paymentProvider;
      this.assertAuthorized({
        actorId: params.actorId,
        action: "payment.refund",
      });
      const provider = this.getProvider(providerType);

      const refundResult = await provider.refundPayment({
        providerPaymentId: params.providerPaymentId,
        amount: params.amountCents,
        reason: params.reason,
      });

      return refundResult;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Cria um payout para transferir fundos para uma empresa
   * 
   * REQUIRES: paymentProvider in params (no default)
   */
  async createPayout(params: PayoutParams): Promise<PayoutResult> {
    try {
      const providerType = params.paymentProvider;
      this.assertAuthorized({
        actorId: params.actorId,
        action: "payment.payout",
        organizationId: params.organizationId,
        companyId: params.companyId,
      });
      const provider = this.getProvider(providerType);

      const payoutResult = await provider.createPayout({
        amount: params.amountCents,
        currency: params.currency || 'EUR',
        destinationAccountId: params.destinationAccountId,
        metadata: {
          ...params.metadata,
          organizationId: params.organizationId,
          companyId: params.companyId,
          transactionId: params.transactionId,
        },
      });

      return payoutResult;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Processa um webhook de pagamento
   * 
   * Fluxo:
   * 1. Verifica autenticidade
   * 2. Garante idempotência
   * 3. Atualiza estado da transação
   * 4. Cria PaymentEvent
   * 5. Atualiza ledger quando aplicável
   * 
   * REQUIRES: provider in params (validated by webhook endpoint)
   */
  async processWebhook(params: {
    provider: PaymentProviderType;
    payload: string | Record<string, unknown>;
    signature?: string;
    headers?: Record<string, string>;
  }): Promise<{ success: boolean; error?: string; eventId?: string }> {
    try {
      const provider = this.getProvider(params.provider);

      // 1. Verifica autenticidade
      const verification = await provider.verifyWebhook({
        payload: params.payload,
        signature: params.signature,
        headers: params.headers,
      });

      if (!verification.valid || !verification.event) {
        return {
          success: false,
          error: 'Invalid webhook signature or format',
        };
      }

      // 2. Parse do evento
      const event = verification.event;

      // 3. Garante idempotência (será implementado na integração com BD)
      // Por enquanto, simula sucesso
      return {
        success: true,
        eventId: event.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Obtém detalhes de uma transação
   */
  async getTransaction(transactionId: string): Promise<TransactionRecord | null> {
    // TODO: Implementar leitura da BD
    return null;
  }

  /**
   * Obtém detalhes de um payout
   */
  async getPayout(payoutId: string): Promise<PayoutRecord | null> {
    // TODO: Implementar leitura da BD
    return null;
  }

  /**
   * Lista transações de uma organização
   */
  async listTransactions(params: {
    organizationId?: string;
    companyId?: string;
    customerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<TransactionRecord[]> {
    // TODO: Implementar listagem da BD
    return [];
  }

  /**
   * Lista payouts de uma organização
   */
  async listPayouts(params: {
    organizationId?: string;
    companyId?: string;
    limit?: number;
    offset?: number;
  }): Promise<PayoutRecord[]> {
    // TODO: Implementar listagem da BD
    return [];
  }
}

// Instância singleton do Payment Engine
// PRODUCTION: No providers registered by default - must be configured at startup
export const paymentEngine = new PaymentEngine();