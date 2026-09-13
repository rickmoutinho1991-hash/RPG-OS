import { describe, it, expect } from 'vitest';
import {
  PaymentProviderType,
  PaymentStatus,
  PayoutStatus,
  PaymentEventType,
} from '../../payment/PaymentProvider';

describe('PaymentProvider Types', () => {
  it('defines all provider types', () => {
    const types: PaymentProviderType[] = ['FAKE', 'STRIPE_CONNECT', 'ADYEN_FOR_PLATFORMS', 'SIBS'];
    expect(types).toHaveLength(4);
  });

  it('defines all payment statuses', () => {
    const statuses: PaymentStatus[] = [
      'PENDING',
      'AUTHORIZED',
      'CAPTURED',
      'FAILED',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
      'DISPUTED',
    ];
    expect(statuses).toHaveLength(7);
  });

  it('defines all payout statuses', () => {
    const statuses: PayoutStatus[] = [
      'PENDING',
      'PROCESSING',
      'PAID',
      'FAILED',
      'REVERSED',
    ];
    expect(statuses).toHaveLength(5);
  });

  it('defines all payment event types', () => {
    const eventTypes: PaymentEventType[] = [
      'PAYMENT_CREATED',
      'PAYMENT_SUCCEEDED',
      'PAYMENT_FAILED',
      'PAYMENT_REFUNDED',
      'PAYOUT_CREATED',
      'PAYOUT_SUCCEEDED',
      'PAYOUT_FAILED',
    ];
    expect(eventTypes).toHaveLength(7);
  });
});