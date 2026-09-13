import { describe, it, expect } from 'vitest';
import { PaymentStateMachine, PayoutStateMachine } from '../../payment/StateMachine';
import { PaymentStatus, PayoutStatus } from '../../payment/PaymentProvider';

describe('PaymentStateMachine', () => {
  describe('canTransition', () => {
    it('allows valid PENDING -> AUTHORIZED transition', () => {
      expect(PaymentStateMachine.canTransition('PENDING', 'AUTHORIZED')).toBe(true);
    });

    it('allows valid AUTHORIZED -> CAPTURED transition', () => {
      expect(PaymentStateMachine.canTransition('AUTHORIZED', 'CAPTURED')).toBe(true);
    });

    it('allows valid CAPTURED -> REFUNDED transition', () => {
      expect(PaymentStateMachine.canTransition('CAPTURED', 'REFUNDED')).toBe(true);
    });

    it('allows valid CAPTURED -> PARTIALLY_REFUNDED transition', () => {
      expect(PaymentStateMachine.canTransition('CAPTURED', 'PARTIALLY_REFUNDED')).toBe(true);
    });

    it('rejects invalid PENDING -> CAPTURED transition', () => {
      expect(PaymentStateMachine.canTransition('PENDING', 'CAPTURED')).toBe(false);
    });

    it('rejects invalid AUTHORIZED -> REFUNDED transition', () => {
      expect(PaymentStateMachine.canTransition('AUTHORIZED', 'REFUNDED')).toBe(false);
    });

    it('rejects invalid FAILED -> CAPTURED transition', () => {
      expect(PaymentStateMachine.canTransition('FAILED', 'CAPTURED')).toBe(false);
    });

    it('allows same state transition (no-op)', () => {
      expect(PaymentStateMachine.canTransition('PENDING', 'PENDING')).toBe(true);
      expect(PaymentStateMachine.canTransition('CAPTURED', 'CAPTURED')).toBe(true);
    });
  });

  describe('isTerminal', () => {
    it('identifies FAILED as terminal', () => {
      expect(PaymentStateMachine.isTerminal('FAILED')).toBe(true);
    });

    it('identifies REFUNDED as terminal', () => {
      expect(PaymentStateMachine.isTerminal('REFUNDED')).toBe(true);
    });

    it('does not identify PENDING as terminal', () => {
      expect(PaymentStateMachine.isTerminal('PENDING')).toBe(false);
    });

    it('does not identify AUTHORIZED as terminal', () => {
      expect(PaymentStateMachine.isTerminal('AUTHORIZED')).toBe(false);
    });

    it('does not identify CAPTURED as terminal', () => {
      expect(PaymentStateMachine.isTerminal('CAPTURED')).toBe(false);
    });
  });

  describe('getNextValidStates', () => {
    it('returns valid next states for PENDING', () => {
      const nextStates = PaymentStateMachine.getNextValidStates('PENDING');
      expect(nextStates).toContain('AUTHORIZED');
      expect(nextStates).toContain('FAILED');
      expect(nextStates).toHaveLength(2);
    });

    it('returns valid next states for AUTHORIZED', () => {
      const nextStates = PaymentStateMachine.getNextValidStates('AUTHORIZED');
      expect(nextStates).toContain('CAPTURED');
      expect(nextStates).toContain('FAILED');
      expect(nextStates).toHaveLength(2);
    });

    it('returns valid next states for CAPTURED', () => {
      const nextStates = PaymentStateMachine.getNextValidStates('CAPTURED');
      expect(nextStates).toContain('REFUNDED');
      expect(nextStates).toContain('PARTIALLY_REFUNDED');
      expect(nextStates).toContain('DISPUTED');
      expect(nextStates).toHaveLength(3);
    });

    it('returns empty array for terminal states', () => {
      expect(PaymentStateMachine.getNextValidStates('FAILED')).toEqual([]);
      expect(PaymentStateMachine.getNextValidStates('REFUNDED')).toEqual([]);
    });
  });

  describe('validateTransition', () => {
    it('does not throw for valid transitions', () => {
      expect(() => {
        PaymentStateMachine.validateTransition('PENDING', 'AUTHORIZED');
      }).not.toThrow();
    });

    it('throws for invalid transitions', () => {
      expect(() => {
        PaymentStateMachine.validateTransition('PENDING', 'CAPTURED');
      }).toThrow('Invalid payment state transition');
    });

    it('includes valid transitions in error message', () => {
      try {
        PaymentStateMachine.validateTransition('PENDING', 'CAPTURED');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toContain('AUTHORIZED');
        expect(message).toContain('FAILED');
      }
    });
  });

  describe('getNextStateFromEvent', () => {
    it('does not leap PENDING to CAPTURED on PAYMENT_SUCCEEDED (must go through AUTHORIZED)', () => {
      const nextState = PaymentStateMachine.getNextStateFromEvent('PENDING', 'PAYMENT_SUCCEEDED');
      expect(nextState).toBe('PENDING');
    });

    it('moves AUTHORIZED to CAPTURED on PAYMENT_SUCCEEDED', () => {
      const nextState = PaymentStateMachine.getNextStateFromEvent('AUTHORIZED', 'PAYMENT_SUCCEEDED');
      expect(nextState).toBe('CAPTURED');
    });

    it('does not move terminal REFUNDED on PAYMENT_FAILED', () => {
      const nextState = PaymentStateMachine.getNextStateFromEvent('REFUNDED', 'PAYMENT_FAILED');
      expect(nextState).toBe('REFUNDED');
    });

    it('does not open a dispute before capture', () => {
      const nextState = PaymentStateMachine.getNextStateFromEvent('PENDING', 'DISPUTE_OPENED');
      expect(nextState).toBe('PENDING');
    });

    it('transitions to FAILED on PAYMENT_FAILED', () => {
      const nextState = PaymentStateMachine.getNextStateFromEvent('PENDING', 'PAYMENT_FAILED');
      expect(nextState).toBe('FAILED');
    });

    it('transitions to REFUNDED on PAYMENT_REFUNDED from CAPTURED', () => {
      const nextState = PaymentStateMachine.getNextStateFromEvent('CAPTURED', 'PAYMENT_REFUNDED');
      expect(nextState).toBe('REFUNDED');
    });

    it('transitions to PARTIALLY_REFUNDED on PAYMENT_PARTIALLY_REFUNDED', () => {
      const nextState = PaymentStateMachine.getNextStateFromEvent('CAPTURED', 'PAYMENT_PARTIALLY_REFUNDED');
      expect(nextState).toBe('PARTIALLY_REFUNDED');
    });

    it('transitions to DISPUTED on DISPUTE_OPENED', () => {
      const nextState = PaymentStateMachine.getNextStateFromEvent('CAPTURED', 'DISPUTE_OPENED');
      expect(nextState).toBe('DISPUTED');
    });

    it('resolves DISPUTE to CAPTURED on DISPUTE_CLOSED', () => {
      const nextState = PaymentStateMachine.getNextStateFromEvent('DISPUTED', 'DISPUTE_CLOSED');
      expect(nextState).toBe('CAPTURED');
    });

    it('maintains current state for unknown events', () => {
      const nextState = PaymentStateMachine.getNextStateFromEvent('PENDING', 'UNKNOWN_EVENT');
      expect(nextState).toBe('PENDING');
    });
  });
});

describe('PayoutStateMachine', () => {
  describe('canTransition', () => {
    it('allows valid PENDING -> PROCESSING transition', () => {
      expect(PayoutStateMachine.canTransition('PENDING', 'PROCESSING')).toBe(true);
    });

    it('allows valid PROCESSING -> PAID transition', () => {
      expect(PayoutStateMachine.canTransition('PROCESSING', 'PAID')).toBe(true);
    });

    it('allows valid PAID -> REVERSED transition', () => {
      expect(PayoutStateMachine.canTransition('PAID', 'REVERSED')).toBe(true);
    });

    it('rejects invalid PENDING -> PAID transition', () => {
      expect(PayoutStateMachine.canTransition('PENDING', 'PAID')).toBe(false);
    });

    it('rejects invalid PROCESSING -> REVERSED transition', () => {
      expect(PayoutStateMachine.canTransition('PROCESSING', 'REVERSED')).toBe(false);
    });

    it('allows same state transition (no-op)', () => {
      expect(PayoutStateMachine.canTransition('PENDING', 'PENDING')).toBe(true);
      expect(PayoutStateMachine.canTransition('PAID', 'PAID')).toBe(true);
    });
  });

  describe('isTerminal', () => {
    it('identifies FAILED as terminal', () => {
      expect(PayoutStateMachine.isTerminal('FAILED')).toBe(true);
    });

    it('identifies REVERSED as terminal', () => {
      expect(PayoutStateMachine.isTerminal('REVERSED')).toBe(true);
    });

    it('does not identify PENDING as terminal', () => {
      expect(PayoutStateMachine.isTerminal('PENDING')).toBe(false);
    });

    it('does not identify PROCESSING as terminal', () => {
      expect(PayoutStateMachine.isTerminal('PROCESSING')).toBe(false);
    });

    it('does not identify PAID as terminal', () => {
      expect(PayoutStateMachine.isTerminal('PAID')).toBe(false);
    });
  });

  describe('getNextValidStates', () => {
    it('returns valid next states for PENDING', () => {
      const nextStates = PayoutStateMachine.getNextValidStates('PENDING');
      expect(nextStates).toContain('PROCESSING');
      expect(nextStates).toContain('FAILED');
      expect(nextStates).toHaveLength(2);
    });

    it('returns valid next states for PROCESSING', () => {
      const nextStates = PayoutStateMachine.getNextValidStates('PROCESSING');
      expect(nextStates).toContain('PAID');
      expect(nextStates).toContain('FAILED');
      expect(nextStates).toHaveLength(2);
    });

    it('returns valid next states for PAID', () => {
      const nextStates = PayoutStateMachine.getNextValidStates('PAID');
      expect(nextStates).toContain('REVERSED');
      expect(nextStates).toHaveLength(1);
    });

    it('returns empty array for terminal states', () => {
      expect(PayoutStateMachine.getNextValidStates('FAILED')).toEqual([]);
      expect(PayoutStateMachine.getNextValidStates('REVERSED')).toEqual([]);
    });
  });

  describe('validateTransition', () => {
    it('does not throw for valid transitions', () => {
      expect(() => {
        PayoutStateMachine.validateTransition('PENDING', 'PROCESSING');
      }).not.toThrow();
    });

    it('throws for invalid transitions', () => {
      expect(() => {
        PayoutStateMachine.validateTransition('PENDING', 'PAID');
      }).toThrow('Invalid payout state transition');
    });

    it('includes valid transitions in error message', () => {
      try {
        PayoutStateMachine.validateTransition('PENDING', 'PAID');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toContain('PROCESSING');
        expect(message).toContain('FAILED');
      }
    });
  });

  describe('getNextStateFromEvent', () => {
    it('transitions to PROCESSING on PAYOUT_CREATED from PENDING', () => {
      const nextState = PayoutStateMachine.getNextStateFromEvent('PENDING', 'PAYOUT_CREATED');
      expect(nextState).toBe('PROCESSING');
    });

    it('transitions to PAID on PAYOUT_SUCCEEDED from PROCESSING', () => {
      const nextState = PayoutStateMachine.getNextStateFromEvent('PROCESSING', 'PAYOUT_SUCCEEDED');
      expect(nextState).toBe('PAID');
    });

    it('transitions to FAILED on PAYOUT_FAILED', () => {
      const nextState = PayoutStateMachine.getNextStateFromEvent('PROCESSING', 'PAYOUT_FAILED');
      expect(nextState).toBe('FAILED');
    });

    it('does not move terminal PAID payout to FAILED', () => {
      const nextState = PayoutStateMachine.getNextStateFromEvent('PAID', 'PAYOUT_FAILED');
      expect(nextState).toBe('PAID');
    });

    it('transitions to REVERSED on PAYOUT_REVERSED from PAID', () => {
      const nextState = PayoutStateMachine.getNextStateFromEvent('PAID', 'PAYOUT_REVERSED');
      expect(nextState).toBe('REVERSED');
    });

    it('transitions to REVERSED on PAYOUT_REVERSED from PROCESSING', () => {
      const nextState = PayoutStateMachine.getNextStateFromEvent('PROCESSING', 'PAYOUT_REVERSED');
      expect(nextState).toBe('PROCESSING'); // PROCESSING cannot go directly to REVERSED
    });

    it('maintains current state for unknown events', () => {
      const nextState = PayoutStateMachine.getNextStateFromEvent('PENDING', 'UNKNOWN_EVENT');
      expect(nextState).toBe('PENDING');
    });
  });
});