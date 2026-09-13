import { describe, it, expect } from "vitest";
import {
  ContractStatusStateMachine,
  ContractSignatureStateMachine,
  evaluateSignatureAssurance,
} from "../../contract/ContractStateMachine";
import { ContractFlow } from "../../contract/ContractFlow";
import type { Contract, ContractParty } from "../../../types/contract";

function makeParty(overrides: Partial<ContractParty> = {}): ContractParty {
  return {
    id: "part-1",
    actorId: "client-1",
    role: "CLIENT",
    legalName: "Cliente",
    contact: { email: "client@example.com" },
    signingOrder: 1,
    signed: false,
    ...overrides,
  };
}

function makeContract(overrides: Partial<Contract> = {}): Contract {
  const parties = [makeParty(), makeParty({ id: "part-2", actorId: "provider-1", role: "PROVIDER", signingOrder: 2 })];
  return {
    id: "contract-1",
    type: "SERVICE_AGREEMENT",
    title: "Contrato de serviço",
    parties,
    currentVersion: 1,
    versions: [],
    milestones: [
      {
        id: "cms-1",
        title: "Fase 1",
        dueDate: "2026-06-01T00:00:00.000Z",
        amountCents: 10000,
        currency: "EUR",
        deliverables: [],
        acceptanceCriteria: [],
        status: "PENDING",
        evidence: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    financial: {
      currency: "EUR",
      totalValueCents: 10000,
      paymentSchedule: [
        {
          id: "cp-1",
          description: "Pagamento",
          amountCents: 10000,
          dueDate: "2026-06-01T00:00:00.000Z",
          trigger: "MILESTONE",
          triggerReference: "cms-1",
          status: "PENDING",
        },
      ],
      penalties: [],
      invoicing: { issuer: "PROVIDER", timing: "MILESTONE", paymentTermsDays: 30, vatHandling: "INCLUDED" },
    },
    status: "PENDING_REVIEW",
    dates: { createdAt: "2026-01-01T00:00:00.000Z", autoRenew: false },
    language: "pt",
    tags: [],
    customFields: {},
    settings: {
      allowAmendments: true,
      requireAllPartyApproval: true,
      allowEarlyTermination: true,
      terminationNoticeDays: 30,
      autoArchive: true,
      archiveAfterDays: 365,
      confidentiality: "CONFIDENTIAL",
      isTemplate: false,
    },
    auditTrail: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ContractStatusStateMachine", () => {
  it("allows the review→signature→signed→active path", () => {
    expect(ContractStatusStateMachine.canTransition("DRAFT", "PENDING_REVIEW")).toBe(true);
    expect(ContractStatusStateMachine.canTransition("PENDING_REVIEW", "PENDING_SIGNATURE")).toBe(true);
    expect(ContractStatusStateMachine.canTransition("PENDING_SIGNATURE", "SIGNED")).toBe(true);
    expect(ContractStatusStateMachine.canTransition("SIGNED", "ACTIVE")).toBe(true);
  });

  it("rejects signing a draft", () => {
    expect(ContractStatusStateMachine.canTransition("DRAFT", "SIGNED")).toBe(false);
  });

  it("allows terminate between active states", () => {
    expect(ContractStatusStateMachine.canTransition("ACTIVE", "TERMINATED")).toBe(true);
    expect(ContractStatusStateMachine.canTransition("SUSPENDED", "ACTIVE")).toBe(true);
  });

  it("archives terminated contracts", () => {
    expect(ContractStatusStateMachine.canTransition("TERMINATED", "ARCHIVED")).toBe(true);
    expect(ContractStatusStateMachine.isTerminal("ARCHIVED")).toBe(true);
  });
});

describe("ContractSignatureStateMachine", () => {
  it("allows SENT -> VIEWED -> SIGNED", () => {
    expect(ContractSignatureStateMachine.canTransition("SENT", "VIEWED")).toBe(true);
    expect(ContractSignatureStateMachine.canTransition("VIEWED", "SIGNED")).toBe(true);
  });

  it("rejects signing before sending", () => {
    expect(ContractSignatureStateMachine.canTransition("PENDING", "SIGNED")).toBe(false);
  });

  it("allows decline, expire and revoke", () => {
    expect(ContractSignatureStateMachine.canTransition("SENT", "DECLINED")).toBe(true);
    expect(ContractSignatureStateMachine.canTransition("SENT", "EXPIRED")).toBe(true);
    expect(ContractSignatureStateMachine.canTransition("SIGNED", "REVOKED")).toBe(true);
  });

  it("detects terminal signature states", () => {
    expect(ContractSignatureStateMachine.isTerminal("DECLINED")).toBe(true);
    expect(ContractSignatureStateMachine.isTerminal("SIGNED")).toBe(false);
  });
});

describe("evaluateSignatureAssurance", () => {
  it("rejects SIMPLE without email confirmation", () => {
    const r = evaluateSignatureAssurance("SIMPLE", {});
    expect(r.valid).toBe(false);
    expect(r.level).toBe("REJECT");
  });

  it("accepts SIMPLE with email confirmation at MEDIUM", () => {
    const r = evaluateSignatureAssurance("SIMPLE", { emailConfirmed: true });
    expect(r.valid).toBe(true);
    expect(r.level).toBe("MEDIUM");
  });

  it("rejects ELECTRONIC without identity verified event", () => {
    expect(evaluateSignatureAssurance("ELECTRONIC", {}).valid).toBe(false);
  });

  it("accepts ELECTRONIC with identity verified event at MEDIUM", () => {
    const r = evaluateSignatureAssurance("ELECTRONIC", {
      identityVerifiedEvent: { provider: "autenticacao-gov", verifiedAt: "2026-01-01T00:00:00.000Z" },
    });
    expect(r.valid).toBe(true);
    expect(r.level).toBe("MEDIUM");
  });

  it("requires signature data for ADVANCED", () => {
    const withoutData = evaluateSignatureAssurance("ADVANCED", {
      identityVerifiedEvent: { provider: "autenticacao-gov" },
    });
    expect(withoutData.valid).toBe(false);
    const withData = evaluateSignatureAssurance("ADVANCED", {
      identityVerifiedEvent: { provider: "autenticacao-gov" },
      signatureData: "base64-drawing",
    });
    expect(withData.valid).toBe(true);
    expect(withData.level).toBe("HIGH");
  });

  it("rejects QUALIFIED without a certificate", () => {
    expect(evaluateSignatureAssurance("QUALIFIED", {}).valid).toBe(false);
  });

  it("accepts QUALIFIED with a valid certificate and timestamp", () => {
    const r = evaluateSignatureAssurance("QUALIFIED", {
      certificate: {
        issuer: "TestQTSP",
        serialNumber: "abc",
        subject: "CN=Client, C=PT",
        validFrom: "2025-01-01T00:00:00.000Z",
        validTo: "2027-01-01T00:00:00.000Z",
        fingerprint: "abcdef",
      },
      signedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(r.valid).toBe(true);
    expect(r.level).toBe("QUALIFIED");
  });

  it("rejects QUALIFIED outside the certificate window", () => {
    const r = evaluateSignatureAssurance("QUALIFIED", {
      certificate: {
        issuer: "TestQTSP",
        serialNumber: "abc",
        subject: "CN=Client",
        validFrom: "2020-01-01T00:00:00.000Z",
        validTo: "2021-01-01T00:00:00.000Z",
        fingerprint: "abcdef",
      },
      signedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(r.valid).toBe(false);
  });

  it("treats HANDWRITTEN as low assurance but valid", () => {
    const r = evaluateSignatureAssurance("HANDWRITTEN", {});
    expect(r.valid).toBe(true);
    expect(r.level).toBe("LOW");
  });
});

describe("ContractFlow", () => {
  const flow = new ContractFlow({
    now: () => "2026-02-01T00:00:00.000Z",
    createId: () => `id-${Math.random()}`,
  });

  it("validates financial consistency", () => {
    const broken = makeContract({ financial: { ...makeContract().financial, totalValueCents: 20000 } });
    expect(() => flow.validateContractFinancials(broken)).toThrow(
      "does not match totalValueCents",
    );
  });

  it("rejects milestones exceeding the total value", () => {
    const broken = makeContract({ financial: { ...makeContract().financial, totalValueCents: 5000 } });
    expect(() => flow.validateContractFinancials(broken)).toThrow(
      "exceeds totalValueCents",
    );
  });

  it("sends a party for signature", () => {
    const result = flow.sendForSignature({
      contract: makeContract(),
      partyId: "part-1",
      type: "ELECTRONIC",
      actorId: "client-1",
    });
    expect(result.contract.status).toBe("PENDING_SIGNATURE");
    expect(result.contract.parties[0].signature?.status).toBe("SENT");
    expect(result.events[0].type).toBe("CONTRACT_SENT_FOR_SIGNATURE");
  });

  it("refuses sending a draft for signature", () => {
    expect(() =>
      flow.sendForSignature({
        contract: makeContract({ status: "DRAFT" }),
        partyId: "part-1",
        type: "ELECTRONIC",
        actorId: "client-1",
      }),
    ).toThrow("Cannot send for signature a contract in status DRAFT");
  });

  it("rejects a signature that fails assurance", () => {
    const sent = flow.sendForSignature({
      contract: makeContract(),
      partyId: "part-1",
      type: "ELECTRONIC",
      actorId: "client-1",
    });
    expect(() =>
      flow.sign({
        contract: sent.contract,
        partyId: "part-1",
        actorId: "client-1",
        type: "ELECTRONIC",
        assurance: {},
      }),
    ).toThrow("Signature rejected");
  });

  it("signs with a valid ELECTRONIC assurance but does not fully sign", () => {
    const sent = flow.sendForSignature({
      contract: makeContract(),
      partyId: "part-1",
      type: "ELECTRONIC",
      actorId: "client-1",
    });
    const signed = flow.sign({
      contract: sent.contract,
      partyId: "part-1",
      actorId: "client-1",
      type: "ELECTRONIC",
      assurance: {
        identityVerifiedEvent: { provider: "autenticacao-gov", verifiedAt: "2026-01-05T00:00:00.000Z" },
      },
    });
    expect(signed.contract.parties[0].signed).toBe(true);
    expect(signed.contract.parties[1].signed).toBe(false);
    expect(signed.contract.status).toBe("PENDING_SIGNATURE");
  });

  it("fully signs and activates when all parties sign with SIMPLE+electron equivalent", () => {
    let contract = makeContract();
    const send1 = flow.sendForSignature({
      contract,
      partyId: "part-1",
      type: "ELECTRONIC",
      actorId: "client-1",
    });
    const sign1 = flow.sign({
      contract: send1.contract,
      partyId: "part-1",
      actorId: "client-1",
      type: "ELECTRONIC",
      assurance: { identityVerifiedEvent: { provider: "autenticacao-gov" } },
    });
    contract = sign1.contract;
    const send2 = flow.sendForSignature({
      contract,
      partyId: "part-2",
      type: "ELECTRONIC",
      actorId: "provider-1",
    });
    const sign2 = flow.sign({
      contract: send2.contract,
      partyId: "part-2",
      actorId: "provider-1",
      type: "ELECTRONIC",
      assurance: { identityVerifiedEvent: { provider: "autenticacao-gov" } },
    });
    expect(sign2.contract.status).toBe("SIGNED");
    expect(sign2.contract.parties.every((p) => p.signed)).toBe(true);
    const activated = flow.activate(sign2.contract, "client-1");
    expect(activated.contract.status).toBe("ACTIVE");
    expect(activated.contract.effectiveAt).toBeDefined();
    expect(activated.events[0].type).toBe("CONTRACT_ACTIVATED");
  });

  it("rejects signing by a non-party actor", () => {
    const sent = flow.sendForSignature({
      contract: makeContract(),
      partyId: "part-1",
      type: "SIMPLE",
      actorId: "client-1",
    });
    expect(() =>
      flow.sign({
        contract: sent.contract,
        partyId: "part-1",
        actorId: "intruder-1",
        type: "SIMPLE",
        assurance: { emailConfirmed: true },
      }),
    ).toThrow("does not match the contract party");
  });

  it("rejects signing before being sent", () => {
    expect(() =>
      flow.sign({
        contract: makeContract(),
        partyId: "part-1",
        actorId: "client-1",
        type: "ELECTRONIC",
        assurance: { identityVerifiedEvent: { provider: "autenticacao-gov" } },
      }),
    ).toThrow("Cannot sign a contract in status PENDING_REVIEW");
  });

  it("terminates and archives an active contract", () => {
    const active = makeContract({ status: "ACTIVE" });
    const terminated = flow.terminate(active, "client-1", "mútuo acordo");
    expect(terminated.contract.status).toBe("TERMINATED");
    expect(terminated.contract.terminatedAt).toBeDefined();
    const archived = flow.archive(terminated.contract, "client-1");
    expect(archived.contract.status).toBe("ARCHIVED");
    expect(archived.events[0].type).toBe("CONTRACT_ARCHIVED");
  });

  it("rejects activation by non-party", () => {
    const signed = makeContract({ status: "SIGNED" });
    const signedContract = {
      ...signed,
      parties: signed.parties.map((p) => ({ ...p, signed: true })),
    };
    expect(() => flow.activate(signedContract, "intruder-1")).toThrow(
      "Actor is not a party",
    );
  });

  it("rejects termination by non-party", () => {
    expect(() =>
      flow.terminate(makeContract({ status: "ACTIVE" }), "intruder-1", "x"),
    ).toThrow("Actor is not a party");
  });

  it("rejects archive by non-party", () => {
    expect(() =>
      flow.archive(makeContract({ status: "TERMINATED" }), "intruder-1"),
    ).toThrow("Actor is not a party");
  });

  it("approves a submitted contract milestone and marks the schedule paid", () => {
    const active = makeContract({ status: "ACTIVE" });
    const milestone = { ...active.milestones[0], status: "SUBMITTED" as const };
    const contract = { ...active, milestones: [milestone] };
    const result = flow.approveContractMilestone(contract, milestone, "client-1", ["del-1"]);
    expect(result.contract.milestones[0].status).toBe("PAID");
    expect(result.contract.milestones[0].approval?.approvedBy).toBe("client-1");
    expect(result.contract.financial.paymentSchedule[0].status).toBe("PAID");
    expect(result.events[0].type).toBe("CONTRACT_MILESTONE_PAID");
  });

  it("refuses milestone approval on a non-active contract", () => {
    expect(() =>
      flow.approveContractMilestone(makeContract(), makeContract().milestones[0], "client-1"),
    ).toThrow("Cannot approve milestones on a contract in status PENDING_REVIEW");
  });
});