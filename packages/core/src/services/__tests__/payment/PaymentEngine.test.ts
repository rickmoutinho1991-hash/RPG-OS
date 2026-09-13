import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PaymentEngine, paymentEngine } from '../../payment/PaymentEngine';
import { FakePaymentProvider } from '../../payment/FakePaymentProvider';
import { PaymentProviderType } from '../../payment/PaymentProvider';

function setupFakeProvider(): void {
  paymentEngine.registerProvider('FAKE', new FakePaymentProvider({ environment: 'sandbox' }));
}

describe('PaymentEngine', () => {
  beforeEach(() => {
    FakePaymentProvider.clearStore();
    setupFakeProvider();
    paymentEngine.setAuthorizer({ assertAuthorized: () => {} });
  });

  afterEach(() => {
    FakePaymentProvider.clearStore();
  });

  describe('createPayment', () => {
    it('creates payment with platform fee calculation', async () => {
      const result = await paymentEngine.createPayment({
        actorId: 'actor-1',
        customerId: 'cust_123',
        grossAmountCents: 10000, // 100 EUR
        currency: 'EUR',
        description: 'Test payment',
        paymentProvider: 'FAKE',
      });

      expect(result.success).toBe(true);
      expect(result.grossAmountCents).toBe(10000);
      expect(result.platformFeeCents).toBe(250); // 2.5% of 100 EUR = 2.5 EUR = 250 cents
      expect(result.businessAmountCents).toBe(9750); // 100 - 2.5 = 97.5 EUR = 9750 cents
      expect(result.providerPaymentId).toBeDefined();
    });

    it('calculates platform fee correctly for different amounts', async () => {
      const tests = [
        { amount: 10000, expectedFee: 250, expectedBusiness: 9750 }, // 100 EUR
        { amount: 50000, expectedFee: 1250, expectedBusiness: 48750 }, // 500 EUR
        { amount: 100000, expectedFee: 2500, expectedBusiness: 97500 }, // 1000 EUR
      ];

      for (const test of tests) {
        const result = await paymentEngine.createPayment({
          actorId: 'actor-1',
          grossAmountCents: test.amount,
          currency: 'EUR',
          paymentProvider: 'FAKE',
        });

        expect(result.success).toBe(true);
        expect(result.platformFeeCents).toBe(test.expectedFee);
        expect(result.businessAmountCents).toBe(test.expectedBusiness);
      }
    });

    it('creates payment with organization and company context', async () => {
      const result = await paymentEngine.createPayment({
        actorId: 'actor-1',
        organizationId: 'org_123',
        companyId: 'comp_456',
        customerId: 'cust_789',
        grossAmountCents: 10000,
        currency: 'EUR',
        paymentProvider: 'FAKE',
      });

      expect(result.success).toBe(true);
      expect(result.providerPaymentId).toBeDefined();
    });

    it('handles payment creation failure for unregistered provider', async () => {
      const result = await paymentEngine.createPayment({
        actorId: 'actor-1',
        grossAmountCents: 10000,
        currency: 'EUR',
        paymentProvider: 'STRIPE_CONNECT' as PaymentProviderType, // Not registered
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('refundPayment', () => {
    it('refunds payment successfully', async () => {
      const createResult = await paymentEngine.createPayment({
        actorId: 'actor-1',
        grossAmountCents: 10000,
        currency: 'EUR',
        paymentProvider: 'FAKE',
      });

      const refundResult = await paymentEngine.refundPayment({
        actorId: 'actor-1',
        providerPaymentId: createResult.providerPaymentId!,
        amountCents: 5000,
        reason: 'Customer request',
        paymentProvider: 'FAKE',
      });

      expect(refundResult.success).toBe(true);
      expect(refundResult.refundId).toBeDefined();
      expect(refundResult.amount).toBe(5000);
    });

    it('handles refund failure for non-existent payment', async () => {
      const refundResult = await paymentEngine.refundPayment({
        actorId: 'actor-1',
        providerPaymentId: 'non_existent_id',
        paymentProvider: 'FAKE',
      });

      expect(refundResult.success).toBe(false);
      expect(refundResult.error).toBeDefined();
    });
  });

  describe('createPayout', () => {
    it('creates payout successfully', async () => {
      const payoutResult = await paymentEngine.createPayout({
        actorId: 'actor-1',
        companyId: 'comp_123',
        amountCents: 9500,
        currency: 'EUR',
        destinationAccountId: 'acct_456',
        paymentProvider: 'FAKE',
      });

      expect(payoutResult.success).toBe(true);
      expect(payoutResult.payoutId).toBeDefined();
    });

    it('creates payout with organization context', async () => {
      const payoutResult = await paymentEngine.createPayout({
        actorId: 'actor-1',
        organizationId: 'org_123',
        companyId: 'comp_456',
        amountCents: 9500,
        currency: 'EUR',
        destinationAccountId: 'acct_789',
        paymentProvider: 'FAKE',
      });

      expect(payoutResult.success).toBe(true);
      expect(payoutResult.payoutId).toBeDefined();
    });

    it('handles payout failure for unregistered provider', async () => {
      const payoutResult = await paymentEngine.createPayout({
        actorId: 'actor-1',
        companyId: 'comp_123',
        amountCents: 9500,
        currency: 'EUR',
        destinationAccountId: 'acct_456',
        paymentProvider: 'STRIPE_CONNECT' as PaymentProviderType, // Not registered
      });

      expect(payoutResult.success).toBe(false);
      expect(payoutResult.error).toBeDefined();
    });
  });

  describe('processWebhook', () => {
    it('processes webhook successfully', async () => {
      const webhookResult = await paymentEngine.processWebhook({
        provider: 'FAKE',
        payload: {
          id: 'evt_123',
          type: 'PAYMENT_SUCCEEDED',
          data: { amount: 10000 },
        },
        signature: 'test_signature',
      });

      expect(webhookResult.success).toBe(true);
      expect(webhookResult.eventId).toBeDefined();
    });

    it('handles invalid webhook', async () => {
      const webhookResult = await paymentEngine.processWebhook({
        provider: 'FAKE',
        payload: 'invalid json',
        signature: 'test_signature',
      });

      expect(webhookResult.success).toBe(false);
      expect(webhookResult.error).toBeDefined();
    });

    it('handles webhook from unregistered provider', async () => {
      const webhookResult = await paymentEngine.processWebhook({
        provider: 'STRIPE_CONNECT' as PaymentProviderType,
        payload: { id: 'evt_123', type: 'PAYMENT_SUCCEEDED' },
      });

      expect(webhookResult.success).toBe(false);
      expect(webhookResult.error).toBeDefined();
    });
  });

  describe('Provider Registration', () => {
    it('allows custom provider registration', () => {
      const engine = new PaymentEngine();
      
      expect(() => {
        engine.registerProvider(
          'FAKE',
          new FakePaymentProvider({ environment: 'sandbox' })
        );
      }).not.toThrow();
    });

    it('fails fast when provider not registered', async () => {
      const engine = new PaymentEngine();
      engine.setAuthorizer({ assertAuthorized: () => {} });
      
      const result = await engine.createPayment({
        actorId: 'actor-1',
        grossAmountCents: 10000,
        currency: 'EUR',
        paymentProvider: 'FAKE',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not registered');
    });
  });

  describe('Example: Complete Payment Flow', () => {
    it('demonstrates complete payment flow with platform fee', async () => {
      // 1. Create payment
      const paymentResult = await paymentEngine.createPayment({
        actorId: 'actor-1',
        customerId: 'cust_123',
        grossAmountCents: 10000, // 100 EUR
        currency: 'EUR',
        description: 'Professional services',
        paymentProvider: 'FAKE',
      });

      expect(paymentResult.success).toBe(true);
      expect(paymentResult.grossAmountCents).toBe(10000);
      expect(paymentResult.platformFeeCents).toBe(250); // 2.5% fee
      expect(paymentResult.businessAmountCents).toBe(9750); // Net to business

      // 2. Process webhook (simulating payment confirmation)
      const webhookResult = await paymentEngine.processWebhook({
        provider: 'FAKE',
        payload: {
          id: 'evt_payment_succeeded',
          type: 'PAYMENT_SUCCEEDED',
          data: { paymentId: paymentResult.providerPaymentId },
        },
      });

      expect(webhookResult.success).toBe(true);

      // 3. Create payout to business
      const payoutResult = await paymentEngine.createPayout({
        actorId: 'actor-1',
        companyId: 'comp_123',
        amountCents: paymentResult.businessAmountCents!, // 97.50 EUR
        currency: 'EUR',
        destinationAccountId: 'acct_business',
        paymentProvider: 'FAKE',
      });

      expect(payoutResult.success).toBe(true);
      expect(payoutResult.payoutId).toBeDefined();

      // Verify the flow: 100 EUR -> 2.5 EUR fee -> 97.5 EUR to business
      expect(paymentResult.grossAmountCents).toBe(10000);
      expect(paymentResult.platformFeeCents).toBe(250);
      expect(paymentResult.businessAmountCents).toBe(9750);
      expect(payoutResult.payoutId).toBeDefined();
    });
  });

  describe('Payment authorization (P1 security)', () => {
    it('rejects createPayment when no authorizer is configured (fail-closed)', async () => {
      const engine = new PaymentEngine();
      engine.registerProvider('FAKE', new FakePaymentProvider({ environment: 'sandbox' }));
      const result = await engine.createPayment({
        actorId: 'actor-1',
        grossAmountCents: 10000,
        currency: 'EUR',
        paymentProvider: 'FAKE',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('fail-closed');
    });

    it('rejects missing actorId', async () => {
      const engine = new PaymentEngine();
      engine.registerProvider('FAKE', new FakePaymentProvider({ environment: 'sandbox' }));
      engine.setAuthorizer({ assertAuthorized: () => {} });
      const result = await engine.createPayment({
        actorId: '',
        grossAmountCents: 10000,
        currency: 'EUR',
        paymentProvider: 'FAKE',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('actorId');
    });

    it('authorizer denial blocks createPayment', async () => {
      const engine = new PaymentEngine();
      engine.registerProvider('FAKE', new FakePaymentProvider({ environment: 'sandbox' }));
      engine.setAuthorizer({ assertAuthorized: () => { throw new Error('denied by policy'); } });
      const result = await engine.createPayment({
        actorId: 'actor-1',
        grossAmountCents: 10000,
        currency: 'EUR',
        paymentProvider: 'FAKE',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('denied by policy');
    });

    it('authorizer denial blocks refundPayment', async () => {
      const engine = new PaymentEngine();
      engine.registerProvider('FAKE', new FakePaymentProvider({ environment: 'sandbox' }));
      engine.setAuthorizer({
        assertAuthorized: (ctx) => {
          if (ctx.action === 'payment.refund') throw new Error('refund not allowed');
        },
      });
      const result = await engine.refundPayment({
        actorId: 'actor-1',
        providerPaymentId: 'x',
        paymentProvider: 'FAKE',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('refund not allowed');
    });

    it('authorizer denial blocks createPayout', async () => {
      const engine = new PaymentEngine();
      engine.registerProvider('FAKE', new FakePaymentProvider({ environment: 'sandbox' }));
      engine.setAuthorizer({
        assertAuthorized: (ctx) => {
          if (ctx.action === 'payment.payout') throw new Error('payout not allowed');
        },
      });
      const result = await engine.createPayout({
        actorId: 'actor-1',
        companyId: 'comp_123',
        amountCents: 5000,
        destinationAccountId: 'acct_1',
        paymentProvider: 'FAKE',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('payout not allowed');
    });

    it('authorizer receives correct context for createPayment', async () => {
      const captured: Array<{ actorId: string; action: string; organizationId?: string; companyId?: string; invoiceId?: string; customerId?: string }> = [];
      const engine = new PaymentEngine();
      engine.registerProvider('FAKE', new FakePaymentProvider({ environment: 'sandbox' }));
      engine.setAuthorizer({ assertAuthorized: (ctx) => { captured.push(ctx); } });
      await engine.createPayment({
        actorId: 'user-42',
        organizationId: 'org-7',
        companyId: 'comp-3',
        invoiceId: 'inv-1',
        customerId: 'cust-9',
        grossAmountCents: 1000,
        currency: 'EUR',
        paymentProvider: 'FAKE',
      });
      expect(captured.length).toBe(1);
      expect(captured[0]).toEqual({
        actorId: 'user-42',
        action: 'payment.create',
        organizationId: 'org-7',
        companyId: 'comp-3',
        invoiceId: 'inv-1',
        customerId: 'cust-9',
      });
    });
  });
});