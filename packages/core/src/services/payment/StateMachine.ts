/**
 * RPG-OS Payment State Machine
 * 
 * Define transições válidas para estados de pagamentos e payouts
 * Garante que transições arbitrárias não são permitidas
 */

import { PaymentStatus, PayoutStatus } from './PaymentProvider';

/**
 * Máquina de estados para pagamentos
 * Define quais transições são válidas a partir de cada estado
 */
export class PaymentStateMachine {
  private static readonly VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
    'PENDING': ['AUTHORIZED', 'FAILED'],
    'AUTHORIZED': ['CAPTURED', 'FAILED'], // REFUNDED removido - só após CAPTURED
    'CAPTURED': ['REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'],
    'FAILED': [], // Terminal state
    'REFUNDED': [], // Terminal state
    'PARTIALLY_REFUNDED': ['REFUNDED', 'DISPUTED'],
    'DISPUTED': ['REFUNDED', 'PARTIALLY_REFUNDED', 'CAPTURED'], // Dispute pode ser resolvido
  };

  private static readonly TERMINAL_STATES: PaymentStatus[] = ['FAILED', 'REFUNDED'];

  /**
   * Verifica se uma transição é válida
   */
  static canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
    // Mesmo estado é sempre válido (no-op)
    if (from === to) return true;

    const validNextStates = this.VALID_TRANSITIONS[from] || [];
    return validNextStates.includes(to);
  }

  /**
   * Verifica se um estado é terminal
   */
  static isTerminal(status: PaymentStatus): boolean {
    return this.TERMINAL_STATES.includes(status);
  }

  /**
   * Obtém os próximos estados válidos a partir de um estado atual
   */
  static getNextValidStates(current: PaymentStatus): PaymentStatus[] {
    return [...(this.VALID_TRANSITIONS[current] || [])];
  }

  /**
   * Valida uma transição e lança erro se inválida
   */
  static validateTransition(from: PaymentStatus, to: PaymentStatus): void {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Invalid payment state transition: ${from} -> ${to}. ` +
        `Valid transitions from ${from}: ${this.getNextValidStates(from).join(', ')}`
      );
    }
  }

  /**
   * Determina o próximo estado baseado num evento.
   * O resultado é sempre validado contra a tabela de transições,
   * de modo que um evento nunca pode contornar a máquina de estados
   * nem mover um estado terminal.
   */
  static getNextStateFromEvent(current: PaymentStatus, event: string): PaymentStatus {
    let candidate: PaymentStatus = current;
    switch (event) {
      case 'PAYMENT_SUCCEEDED':
        candidate = 'CAPTURED';
        break;
      case 'PAYMENT_FAILED':
        candidate = 'FAILED';
        break;
      case 'PAYMENT_REFUNDED':
        candidate = 'REFUNDED';
        break;
      case 'PAYMENT_PARTIALLY_REFUNDED':
        candidate = 'PARTIALLY_REFUNDED';
        break;
      case 'DISPUTE_OPENED':
        candidate = 'DISPUTED';
        break;
      case 'DISPUTE_CLOSED':
        candidate = 'CAPTURED';
        break;
      default:
        return current;
    }
    return this.canTransition(current, candidate) ? candidate : current;
  }
}

/**
 * Máquina de estados para payouts
 * Define quais transições são válidas a partir de cada estado
 */
export class PayoutStateMachine {
  private static readonly VALID_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
    'PENDING': ['PROCESSING', 'FAILED'],
    'PROCESSING': ['PAID', 'FAILED'], // REVERSED removido - só após PAID
    'PAID': ['REVERSED'], // Payout pago pode ser revertido
    'FAILED': [], // Terminal state
    'REVERSED': [], // Terminal state
  };

  private static readonly TERMINAL_STATES: PayoutStatus[] = ['FAILED', 'REVERSED'];

  /**
   * Verifica se uma transição é válida
   */
  static canTransition(from: PayoutStatus, to: PayoutStatus): boolean {
    // Mesmo estado é sempre válido (no-op)
    if (from === to) return true;

    const validNextStates = this.VALID_TRANSITIONS[from] || [];
    return validNextStates.includes(to);
  }

  /**
   * Verifica se um estado é terminal
   */
  static isTerminal(status: PayoutStatus): boolean {
    return this.TERMINAL_STATES.includes(status);
  }

  /**
   * Obtém os próximos estados válidos a partir de um estado atual
   */
  static getNextValidStates(current: PayoutStatus): PayoutStatus[] {
    return [...(this.VALID_TRANSITIONS[current] || [])];
  }

  /**
   * Valida uma transição e lança erro se inválida
   */
  static validateTransition(from: PayoutStatus, to: PayoutStatus): void {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Invalid payout state transition: ${from} -> ${to}. ` +
        `Valid transitions from ${from}: ${this.getNextValidStates(from).join(', ')}`
      );
    }
  }

  /**
   * Determina o próximo estado baseado num evento.
   * O resultado é sempre validado contra a tabela de transições,
   * de modo que um evento nunca pode contornar a máquina de estados
   * nem mover um estado terminal.
   */
  static getNextStateFromEvent(current: PayoutStatus, event: string): PayoutStatus {
    let candidate: PayoutStatus = current;
    switch (event) {
      case 'PAYOUT_CREATED':
        candidate = 'PROCESSING';
        break;
      case 'PAYOUT_SUCCEEDED':
        candidate = 'PAID';
        break;
      case 'PAYOUT_FAILED':
        candidate = 'FAILED';
        break;
      case 'PAYOUT_REVERSED':
        candidate = 'REVERSED';
        break;
      default:
        return current;
    }
    return this.canTransition(current, candidate) ? candidate : current;
  }
}