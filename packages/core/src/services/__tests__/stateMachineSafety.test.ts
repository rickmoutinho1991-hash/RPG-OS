/**
 * RPG-OS — FASE D: State Machine Safety Audit
 *
 * Invariantes críticas garantidas pelas máquinas de estado do ecossistema:
 *  - Estados terminais são fechados (nunca saem).
 *  - Nenhuma transição salta etapas obrigatórias (ex.: pagamento exige
 *    PENDING -> AUTHORIZED -> CAPTURED; contrato exige SIGNED antes de ACTIVE).
 *  - Eventos (webhooks) nunca contornam a tabela de transições nem movem
 *    estados terminais.
 *  - Pagamento só pode ser devolvido/stornado (refund) após CAPTURED.
 *  - Disputa não pode abrir sem pagamento capturado; não há loop DISPUTED.
 *  - Milestone exige SUBMITTED antes de APPROVED; APPROVED -> PAID só liberta
 *    fundos após aprovação.
 *
 * Guardas de autorização (quem pode) vivem nos flows de serviço
 * (OrderMilestoneFlow.assertResponsibleParty, ContractFlow.activate) e são
 * cobertas pelos respetivos testes de fluxo.
 */

import { describe, it, expect } from "vitest";
import { PaymentStateMachine, PayoutStateMachine } from "../payment/StateMachine";
import {
  MarketplaceQuoteStateMachine,
  MarketplaceOrderStateMachine,
} from "../marketplace/MarketplaceStateMachine";
import {
  ContractStatusStateMachine,
  ContractSignatureStateMachine,
} from "../contract/ContractStateMachine";
import { OrderStatusStateMachine, MilestoneStatusStateMachine } from "../order/OrderStateMachine";

describe("FASE D — Payment state machine safety", () => {
  it("never refunds before capture", () => {
    expect(PaymentStateMachine.canTransition("PENDING", "REFUNDED")).toBe(false);
    expect(PaymentStateMachine.canTransition("AUTHORIZED", "REFUNDED")).toBe(false);
    expect(PaymentStateMachine.canTransition("PENDING", "PARTIALLY_REFUNDED")).toBe(false);
  });

  it("requires PENDING -> AUTHORIZED -> CAPTURED (no leap)", () => {
    expect(PaymentStateMachine.canTransition("PENDING", "CAPTURED")).toBe(false);
    expect(PaymentStateMachine.canTransition("PENDING", "AUTHORIZED")).toBe(true);
    expect(PaymentStateMachine.canTransition("AUTHORIZED", "CAPTURED")).toBe(true);
  });

  it("events never move terminal states", () => {
    expect(PaymentStateMachine.getNextStateFromEvent("REFUNDED", "PAYMENT_FAILED")).toBe("REFUNDED");
    expect(PaymentStateMachine.getNextStateFromEvent("FAILED", "DISPUTE_OPENED")).toBe("FAILED");
    expect(PaymentStateMachine.getNextStateFromEvent("REFUNDED", "DISPUTE_OPENED")).toBe("REFUNDED");
  });

  it("events never bypass the transition table", () => {
    expect(PaymentStateMachine.getNextStateFromEvent("PENDING", "PAYMENT_SUCCEEDED")).toBe("PENDING");
    expect(PaymentStateMachine.getNextStateFromEvent("PENDING", "DISPUTE_OPENED")).toBe("PENDING");
    expect(PaymentStateMachine.getNextStateFromEvent("CAPTURED", "PAYMENT_SUCCEEDED")).toBe("CAPTURED");
  });

  it("dispute only opens after capture", () => {
    expect(PaymentStateMachine.canTransition("PENDING", "DISPUTED")).toBe(false);
    expect(PaymentStateMachine.canTransition("AUTHORIZED", "DISPUTED")).toBe(false);
    expect(PaymentStateMachine.canTransition("CAPTURED", "DISPUTED")).toBe(true);
  });
});

describe("FASE D — Payout state machine safety", () => {
  it("events never move terminal states", () => {
    expect(PayoutStateMachine.getNextStateFromEvent("FAILED", "PAYOUT_SUCCEEDED")).toBe("FAILED");
    expect(PayoutStateMachine.getNextStateFromEvent("FAILED", "PAYOUT_CREATED")).toBe("FAILED");
    expect(PayoutStateMachine.getNextStateFromEvent("REVERSED", "PAYOUT_SUCCEEDED")).toBe("REVERSED");
    expect(PayoutStateMachine.getNextStateFromEvent("PAID", "PAYOUT_FAILED")).toBe("PAID");
  });

  it("does not skip PROCESSING", () => {
    expect(PayoutStateMachine.canTransition("PENDING", "PAID")).toBe(false);
    expect(PayoutStateMachine.getNextStateFromEvent("PENDING", "PAYOUT_SUCCEEDED")).toBe("PENDING");
  });

  it("seals terminal states", () => {
    for (const terminal of ["FAILED", "REVERSED"] as const) {
      expect(PayoutStateMachine.getNextValidStates(terminal)).toHaveLength(0);
      expect(PayoutStateMachine.isTerminal(terminal)).toBe(true);
    }
  });
});

describe("FASE D — Marketplace quote state machine safety", () => {
  it("seals terminal states", () => {
    for (const terminal of ["REJECTED", "EXPIRED", "WITHDRAWN", "CONVERTED_TO_CONTRACT"] as const) {
      expect(MarketplaceQuoteStateMachine.getNextValidStates(terminal)).toHaveLength(0);
      expect(MarketplaceQuoteStateMachine.isTerminal(terminal)).toBe(true);
    }
  });

  it("does not skip DRAFT/VIEWED stages", () => {
    expect(MarketplaceQuoteStateMachine.canTransition("DRAFT", "ACCEPTED")).toBe(false);
    expect(MarketplaceQuoteStateMachine.canTransition("SENT", "CONVERTED_TO_CONTRACT")).toBe(false);
  });

  it("only converts to contract from ACCEPTED", () => {
    expect(MarketplaceQuoteStateMachine.canTransition("ACCEPTED", "CONVERTED_TO_CONTRACT")).toBe(true);
    expect(MarketplaceQuoteStateMachine.canTransition("VIEWED", "CONVERTED_TO_CONTRACT")).toBe(false);
  });
});

describe("FASE D — Marketplace order state machine safety", () => {
  it("never disputes before payment", () => {
    expect(MarketplaceOrderStateMachine.canTransition("PENDING_PAYMENT", "DISPUTED")).toBe(false);
    expect(MarketplaceOrderStateMachine.canTransition("PAYMENT_PROCESSING", "DISPUTED")).toBe(true);
  });

  it("does not loop DISPUTED -> CANCELLED -> DISPUTED", () => {
    expect(MarketplaceOrderStateMachine.canTransition("DISPUTED", "CANCELLED")).toBe(false);
  });

  it("seals terminal REFUNDED", () => {
    expect(MarketplaceOrderStateMachine.getNextValidStates("REFUNDED")).toHaveLength(0);
    expect(MarketplaceOrderStateMachine.isTerminal("REFUNDED")).toBe(true);
  });

  it("never completes an unpaid order", () => {
    expect(MarketplaceOrderStateMachine.canTransition("PENDING_PAYMENT", "COMPLETED")).toBe(false);
  });
});

describe("FASE D — Contract state machine safety", () => {
  it("cannot activate without being signed first", () => {
    expect(ContractStatusStateMachine.canTransition("DRAFT", "ACTIVE")).toBe(false);
    expect(ContractStatusStateMachine.canTransition("PENDING_REVIEW", "ACTIVE")).toBe(false);
    expect(ContractStatusStateMachine.canTransition("SIGNED", "ACTIVE")).toBe(true);
  });

  it("only reaches SIGNED from PENDING_SIGNATURE", () => {
    expect(ContractStatusStateMachine.canTransition("DRAFT", "SIGNED")).toBe(false);
    expect(ContractStatusStateMachine.canTransition("PENDING_REVIEW", "SIGNED")).toBe(false);
    expect(ContractStatusStateMachine.canTransition("PENDING_SIGNATURE", "SIGNED")).toBe(true);
  });

  it("seals terminal ARCHIVED", () => {
    expect(ContractStatusStateMachine.getNextValidStates("ARCHIVED")).toHaveLength(0);
    expect(ContractStatusStateMachine.isTerminal("ARCHIVED")).toBe(true);
  });
});

describe("FASE D — Signature state machine safety", () => {
  it("cannot sign without the request being sent/viewed", () => {
    expect(ContractSignatureStateMachine.canTransition("PENDING", "SIGNED")).toBe(false);
    expect(ContractSignatureStateMachine.canTransition("PENDING", "DECLINED")).toBe(false);
  });

  it("seals terminal states", () => {
    for (const terminal of ["DECLINED", "EXPIRED", "REVOKED"] as const) {
      expect(ContractSignatureStateMachine.getNextValidStates(terminal)).toHaveLength(0);
      expect(ContractSignatureStateMachine.isTerminal(terminal)).toBe(true);
    }
  });
});

describe("FASE D — Order / Milestone state machine safety", () => {
  it("never approves a milestone that was not submitted", () => {
    expect(OrderStatusStateMachine.canTransition("MILESTONE_DUE", "MILESTONE_APPROVED")).toBe(false);
    expect(MilestoneStatusStateMachine.canTransition("IN_PROGRESS", "APPROVED")).toBe(false);
    expect(MilestoneStatusStateMachine.canTransition("SUBMITTED", "APPROVED")).toBe(true);
  });

  it("releases funds only after approval (APPROVED -> PAID)", () => {
    expect(MilestoneStatusStateMachine.canTransition("APPROVED", "PAID")).toBe(true);
    expect(MilestoneStatusStateMachine.canTransition("SUBMITTED", "PAID")).toBe(false);
  });

  it("seals terminal REFUNDED order", () => {
    expect(OrderStatusStateMachine.getNextValidStates("REFUNDED")).toHaveLength(0);
    expect(OrderStatusStateMachine.isTerminal("REFUNDED")).toBe(true);
  });
});