/**
 * RPG-OS — Contract Flow
 *
 * VERSION → REVIEW → SIGNATURE → ACTIVATION → EXECUTION.
 * Assinaturas avaliadas por `evaluateSignatureAssurance` (deny-closed
 * para os tipos que exigem prova). Money em cents.
 */

import type {
  Contract,
  ContractEvent,
  ContractEventType,
  ContractParty,
  ContractMilestone,
  SignatureType,
} from "../../types/contract";
import { ContractStatusStateMachine, ContractSignatureStateMachine } from "./ContractStateMachine";
import {
  evaluateSignatureAssurance,
  type SignatureAssuranceInput,
} from "./ContractStateMachine";

export interface ContractFlowOptions {
  now?: () => string;
  createId?: () => string;
}

export interface ContractFlowResult {
  contract: Contract;
  events: ContractEvent[];
}

export interface SendForSignatureInput {
  contract: Contract;
  partyId: string;
  type: SignatureType;
  actorId: string;
}

export interface SignContractInput {
  contract: Contract;
  partyId: string;
  actorId: string;
  type: SignatureType;
  assurance: SignatureAssuranceInput;
}

function assertCents(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer (cents), got ${value}`);
  }
}

function buildDefaultId(): string {
  const crypto_ = globalThis.crypto;
  if (crypto_ && typeof crypto_.randomUUID === "function") {
    return crypto_.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class ContractFlow {
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(options: ContractFlowOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? buildDefaultId;
  }

  validateContractFinancials(contract: Contract): void {
    assertCents(contract.financial.totalValueCents, "financial.totalValueCents");
    for (const milestone of contract.milestones) {
      assertCents(milestone.amountCents, `milestones[${milestone.id}].amountCents`);
    }
    const milestoneTotal = contract.milestones.reduce((sum, m) => sum + m.amountCents, 0);
    if (milestoneTotal > contract.financial.totalValueCents) {
      throw new Error(
        `Milestones total (${milestoneTotal}) exceeds totalValueCents (${contract.financial.totalValueCents})`,
      );
    }
    const scheduleTotal = contract.financial.paymentSchedule.reduce(
      (sum, p) => sum + p.amountCents,
      0,
    );
    if (scheduleTotal !== contract.financial.totalValueCents) {
      throw new Error(
        `Payment schedule total (${scheduleTotal}) does not match totalValueCents (${contract.financial.totalValueCents})`,
      );
    }
  }

  sendForSignature(input: SendForSignatureInput): ContractFlowResult {
    const { contract, partyId, type, actorId } = input;
    if (contract.status !== "PENDING_REVIEW" && contract.status !== "PENDING_SIGNATURE") {
      throw new Error(`Cannot send for signature a contract in status ${contract.status}`);
    }
    const party = this.party(contract, partyId);
    if (party.actorId !== actorId) {
      throw new Error("Only the party actor can request their own signature");
    }

    const now = this.now();
    const signature: ContractParty["signature"] = {
      id: this.createId(),
      partyId,
      type,
      status: "SENT",
      auditTrail: [
        {
          timestamp: now,
          action: "SENT",
          details: { actorId },
        },
      ],
    };

    const newParties = contract.parties.map((p) =>
      p.id === partyId && (!p.signature || p.signature.status === "PENDING")
        ? { ...p, signature }
        : p,
    );

    const contractStatus = this.moveStatus(contract.status, ["PENDING_SIGNATURE"]);

    const updated: Contract = {
      ...contract,
      parties: newParties,
      status: contractStatus,
      updatedAt: now,
      auditTrail: [
        ...contract.auditTrail,
        {
          id: this.createId(),
          timestamp: now,
          actorId,
          action: "contract.sent_for_signature",
          details: { partyId, signatureType: type },
        },
      ],
    };

    return {
      contract: updated,
      events: [this.event("CONTRACT_SENT_FOR_SIGNATURE", updated, actorId, { partyId, signatureType: type })],
    };
  }

  sign(input: SignContractInput): ContractFlowResult {
    const { contract, partyId, actorId, type, assurance } = input;
    if (contract.status !== "PENDING_SIGNATURE") {
      throw new Error(`Cannot sign a contract in status ${contract.status}`);
    }
    const party = this.party(contract, partyId);
    if (party.actorId !== actorId) {
      throw new Error("Signature actor does not match the contract party");
    }
    const currentSignature = party.signature;
    if (!currentSignature) {
      throw new Error("Signature was not requested for this party");
    }
    if (currentSignature.type !== type) {
      throw new Error("Signature type does not match the requested type");
    }
    ContractSignatureStateMachine.validateTransition(currentSignature.status, "SIGNED");

    const result = evaluateSignatureAssurance(type, assurance);
    if (!result.valid) {
      throw new Error(`Signature rejected: ${result.reasons.join("; ")}`);
    }

    const now = this.now();
    const signedSignature: ContractParty["signature"] = {
      ...currentSignature,
      status: "SIGNED",
      signedAt: now,
      ip: assurance.ipAddress ?? currentSignature.ip,
      userAgent: assurance.userAgent ?? currentSignature.userAgent,
      auditTrail: [
        ...currentSignature.auditTrail,
        {
          timestamp: now,
          action: "SIGNED",
          ip: assurance.ipAddress,
          userAgent: assurance.userAgent,
          details: { assuranceLevel: result.level },
        },
      ],
    };

    const newParties = contract.parties.map((p) =>
      p.id === partyId
        ? { ...p, signed: true, signature: signedSignature }
        : p,
    );

    const allSigned = newParties.every((p) => p.signed);
    const contractStatus: Contract["status"] = allSigned ? "SIGNED" : "PENDING_SIGNATURE";
    const updated: Contract = {
      ...contract,
      parties: newParties,
      status: contractStatus,
      signedAt: allSigned ? now : contract.signedAt,
      updatedAt: now,
      auditTrail: [
        ...contract.auditTrail,
        {
          id: this.createId(),
          timestamp: now,
          actorId,
          action: "contract.party_signed",
          details: { partyId, signatureType: type, assuranceLevel: result.level },
        },
      ],
    };

    const events: ContractEvent[] = [
      this.event("CONTRACT_SIGNED", updated, actorId, { partyId, signatureType: type }),
    ];
    if (allSigned) {
      events.push(this.event("CONTRACT_FULLY_SIGNED", updated, actorId, { parties: newParties.length }));
    }
    return { contract: updated, events };
  }

  activate(contract: Contract, actorId: string): ContractFlowResult {
    if (contract.status !== "SIGNED") {
      throw new Error(`Cannot activate a contract in status ${contract.status}`);
    }
    if (!contract.parties.every((p) => p.signed)) {
      throw new Error("Cannot activate a contract that is not fully signed");
    }
    this.assertParty(contract, actorId);
    const status = this.moveStatus(contract.status, ["ACTIVE"]);
    const now = this.now();
    const updated: Contract = {
      ...contract,
      status,
      effectiveAt: now,
      updatedAt: now,
      auditTrail: [
        ...contract.auditTrail,
        { id: this.createId(), timestamp: now, actorId, action: "contract.activated", details: {} },
      ],
    };
    return {
      contract: updated,
      events: [this.event("CONTRACT_ACTIVATED", updated, actorId, {})],
    };
  }

  terminate(contract: Contract, actorId: string, reason: string): ContractFlowResult {
    this.assertParty(contract, actorId);
    const status = this.moveStatus(contract.status, ["TERMINATED"]);
    const now = this.now();
    const updated: Contract = {
      ...contract,
      status,
      terminatedAt: now,
      updatedAt: now,
      auditTrail: [
        ...contract.auditTrail,
        {
          id: this.createId(),
          timestamp: now,
          actorId,
          action: "contract.terminated",
          details: { reason },
        },
      ],
    };
    return {
      contract: updated,
      events: [this.event("CONTRACT_TERMINATED", updated, actorId, { reason })],
    };
  }

  archive(contract: Contract, actorId: string): ContractFlowResult {
    this.assertParty(contract, actorId);
    const status = this.moveStatus(contract.status, ["ARCHIVED"]);
    const now = this.now();
    const updated: Contract = {
      ...contract,
      status,
      updatedAt: now,
      auditTrail: [
        ...contract.auditTrail,
        { id: this.createId(), timestamp: now, actorId, action: "contract.archived", details: {} },
      ],
    };
    return {
      contract: updated,
      events: [this.event("CONTRACT_ARCHIVED", updated, actorId, {})],
    };
  }

  approveContractMilestone(
    contract: Contract,
    milestone: ContractMilestone,
    actorId: string,
    evidenceReviewed?: string[],
  ): ContractFlowResult {
    if (contract.status !== "ACTIVE") {
      throw new Error(`Cannot approve milestones on a contract in status ${contract.status}`);
    }
    if (milestone.status !== "SUBMITTED" && milestone.status !== "UNDER_REVIEW") {
      throw new Error(`Cannot approve milestone in status ${milestone.status}`);
    }
    this.validateContractFinancials(contract);
    if (contract.parties.every((p) => p.actorId !== actorId)) {
      throw new Error("Actor is not a party to this contract");
    }

    const now = this.now();
    const paidMilestone: ContractMilestone = {
      ...milestone,
      status: "PAID",
      paymentReference: this.createId(),
      approval: {
        approvedBy: actorId,
        approvedAt: now,
        evidenceReviewed: evidenceReviewed ?? [],
      },
      updatedAt: now,
    };

    const milestones = contract.milestones.map((m) =>
      m.id === milestone.id ? paidMilestone : m,
    );
    const schedule = contract.financial.paymentSchedule.map((p) =>
      p.triggerReference === milestone.id && p.status !== "PAID"
        ? { ...p, status: "PAID" as const, paidAt: now, paidAmountCents: p.amountCents }
        : p,
    );

    const updated: Contract = {
      ...contract,
      milestones,
      financial: { ...contract.financial, paymentSchedule: schedule },
      updatedAt: now,
      auditTrail: [
        ...contract.auditTrail,
        {
          id: this.createId(),
          timestamp: now,
          actorId,
          action: "contract.milestone_approved",
          details: { milestoneId: milestone.id, amountCents: milestone.amountCents },
        },
      ],
    };

    return {
      contract: updated,
      events: [
        this.event("CONTRACT_MILESTONE_PAID", updated, actorId, {
          milestoneId: milestone.id,
          amountCents: milestone.amountCents,
        }),
      ],
    };
  }

  private party(contract: Contract, partyId: string): ContractParty {
    const party = contract.parties.find((p) => p.id === partyId);
    if (!party) {
      throw new Error(`Party ${partyId} not found in contract`);
    }
    return party;
  }

  private assertParty(contract: Contract, actorId: string): void {
    if (contract.parties.every((p) => p.actorId !== actorId)) {
      throw new Error("Actor is not a party to this contract");
    }
  }

  private moveStatus(from: Contract["status"], hops: Contract["status"][]): Contract["status"] {
    let current = from;
    for (const hop of hops) {
      ContractStatusStateMachine.validateTransition(current, hop);
      current = hop;
    }
    return current;
  }

  private event(
    type: ContractEventType,
    contract: Contract,
    actorId: string,
    payload: Record<string, unknown>,
  ): ContractEvent {
    return {
      id: this.createId(),
      type,
      contractId: contract.id,
      actorId,
      payload,
      timestamp: this.now(),
    };
  }
}