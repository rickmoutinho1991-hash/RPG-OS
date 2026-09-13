import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FakePaymentProvider } from '../../payment/FakePaymentProvider';
import { PaymentProviderType, PaymentStatus } from '../../payment/PaymentProvider';

describe('FakePaymentProvider', () => {
  let provider: FakePaymentProvider;

  beforeEach(() => {
    provider = new FakePaymentProvider({ environment: 'sandbox' });
    FakePaymentProvider.clearStore();
  });

  afterEach(() => {
    FakePaymentProvider.clearStore();
  });

  it('creates payment successfully', async () => {
    const result = await provider.createPayment({
      amount: 10000, // 100 EUR in cents
      currency: 'EUR',
      customerId: 'cust_123',
      description: 'Test payment',
    });

    expect(result.success).toBe(true);
    expect(result.paymentIntent).toBeDefined();
    expect(result.paymentIntent?.amount).toBe(10000);
    expect(result.paymentIntent?.currency).toBe('EUR');
    expect(result.paymentIntent?.status).toBe('AUTHORIZED');
    expect(result.providerPaymentId).toBeDefined();
  });

  it('generates unique payment IDs', async () => {
    const result1 = await provider.createPayment({
      amount: 10000,
      currency: 'EUR',
    });

    const result2 = await provider.createPayment({
      amount: 20000,
      currency: 'EUR',
    });

    expect(result1.providerPaymentId).not.toBe(result2.providerPaymentId);
  });

  it('retrieves payment by provider ID', async () => {
    const createResult = await provider.createPayment({
      amount: 10000,
      currency: 'EUR',
    });

    const payment = await provider.getPayment(createResult.providerPaymentId!);

    expect(payment).toBeDefined();
    expect(payment?.amount).toBe(10000);
    expect(payment?.status).toBe('AUTHORIZED');
  });

  it('returns null for non-existent payment', async () => {
    const payment = await provider.getPayment('non_existent_id');
    expect(payment).toBeNull();
  });

  it('refunds payment successfully', async () => {
    const createResult = await provider.createPayment({
      amount: 10000,
      currency: 'EUR',
    });

    const refundResult = await provider.refundPayment({
      providerPaymentId: createResult.providerPaymentId!,
      amount: 5000, // Partial refund
      reason: 'Customer request',
    });

    expect(refundResult.success).toBe(true);
    expect(refundResult.refundId).toBeDefined();
    expect(refundResult.amount).toBe(5000);

    const payment = await provider.getPayment(createResult.providerPaymentId!);
    expect(payment?.status).toBe('PARTIALLY_REFUNDED');
  });

  it('refunds full payment when amount not specified', async () => {
    const createResult = await provider.createPayment({
      amount: 10000,
      currency: 'EUR',
    });

    const refundResult = await provider.refundPayment({
      providerPaymentId: createResult.providerPaymentId!,
      reason: 'Full refund',
    });

    expect(refundResult.success).toBe(true);
    expect(refundResult.amount).toBe(10000);

    const payment = await provider.getPayment(createResult.providerPaymentId!);
    expect(payment?.status).toBe('REFUNDED');
  });

  it('fails to refund non-existent payment', async () => {
    const refundResult = await provider.refundPayment({
      providerPaymentId: 'non_existent_id',
    });

    expect(refundResult.success).toBe(false);
    expect(refundResult.error).toBe('Payment not found');
  });

  it('creates payout successfully', async () => {
    const payoutResult = await provider.createPayout({
      amount: 9500, // 95 EUR in cents
      currency: 'EUR',
      destinationAccountId: 'acct_123',
    });

    expect(payoutResult.success).toBe(true);
    expect(payoutResult.payoutId).toBeDefined();
  });

  it('verifies webhook successfully in sandbox', async () => {
    const verification = await provider.verifyWebhook({
      payload: { id: 'evt_123', type: 'PAYMENT_SUCCEEDED' },
      signature: 'test_signature',
    });

    expect(verification.valid).toBe(true);
    expect(verification.event).toBeDefined();
  });

  it('parses webhook event correctly', () => {
    const payload = {
      id: 'evt_123',
      type: 'PAYMENT_SUCCEEDED',
      timestamp: '2024-01-01T00:00:00Z',
    };

    const event = provider.parseWebhookEvent(payload);

    expect(event).toBeDefined();
    expect(event?.id).toBe('evt_123');
    expect(event?.type).toBe('PAYMENT_SUCCEEDED');
    expect(event?.provider).toBe('FAKE');
  });

  it('generates webhooks for payment events', async () => {
    FakePaymentProvider.clearStore();

    await provider.createPayment({
      amount: 10000,
      currency: 'EUR',
    });

    const webhooks = FakePaymentProvider.getWebhooks();
    expect(webhooks.length).toBeGreaterThan(0);
    expect(webhooks[0].type).toBe('PAYMENT_SUCCEEDED');
  });

  it('generates webhooks for refund events', async () => {
    FakePaymentProvider.clearStore();

    const createResult = await provider.createPayment({
      amount: 10000,
      currency: 'EUR',
    });

    await provider.refundPayment({
      providerPaymentId: createResult.providerPaymentId!,
    });

    const webhooks = FakePaymentProvider.getWebhooks();
    const refundWebhook = webhooks.find(w => w.type === 'PAYMENT_REFUNDED');
    expect(refundWebhook).toBeDefined();
  });

  it('has correct provider type', () => {
    expect(provider.providerType).toBe('FAKE');
  });
});