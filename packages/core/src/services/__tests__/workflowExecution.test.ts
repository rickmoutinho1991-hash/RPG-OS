import { describe, it, expect } from "vitest";
import {
  getExecutionInitialStep,
  isExecutionTerminalStep,
  resolveExecutionNextStep,
  type ExecutionStepDef,
  type ExecutionTransitionDef,
} from "../workflowExecution";

const steps: ExecutionStepDef[] = [
  { key: "SUBMITTED", position: 0 },
  { key: "REVIEW", position: 1, requiredPermission: "workflows.approve" },
  { key: "APPROVED", position: 2 },
  { key: "REJECTED", position: 3 },
];

const transitions: ExecutionTransitionDef[] = [
  { fromStep: "SUBMITTED", toStep: "REVIEW" },
  { fromStep: "REVIEW", toStep: "APPROVED" },
  {
    fromStep: "REVIEW",
    toStep: "REJECTED",
    condition: { decision: "REJECTED" },
  },
];

describe("getExecutionInitialStep", () => {
  it("devolve o passo de menor position (primeiro)", () => {
    expect(getExecutionInitialStep(steps)).toBe("SUBMITTED");
  });

  it("devolve null sem passos", () => {
    expect(getExecutionInitialStep([])).toBeNull();
  });
});

describe("isExecutionTerminalStep", () => {
  it("passo sem transições de saída é terminal", () => {
    expect(isExecutionTerminalStep(transitions, "APPROVED")).toBe(true);
    expect(isExecutionTerminalStep(transitions, "REJECTED")).toBe(true);
  });
  it("passo com transições de saída não é terminal", () => {
    expect(isExecutionTerminalStep(transitions, "REVIEW")).toBe(false);
  });
});

describe("resolveExecutionNextStep", () => {
  it("avança na aprovação genérica (SUBMITTED → REVIEW)", () => {
    const res = resolveExecutionNextStep("SUBMITTED", "APPROVED", steps, transitions);
    expect(res.type).toBe("ADVANCE");
    if (res.type === "ADVANCE") expect(res.toStep).toBe("REVIEW");
  });

  it("avança na aprovação até terminal (REVIEW → APPROVED)", () => {
    const res = resolveExecutionNextStep("REVIEW", "APPROVED", steps, transitions);
    expect(res.type).toBe("ADVANCE");
    if (res.type === "ADVANCE") expect(res.toStep).toBe("APPROVED");
  });

  it("segue a rejeição configurada (REVIEW → REJECTED)", () => {
    const res = resolveExecutionNextStep("REVIEW", "REJECTED", steps, transitions);
    expect(res.type).toBe("ADVANCE");
    if (res.type === "ADVANCE") expect(res.toStep).toBe("REJECTED");
  });

  it("completa quando não há transição aplicável", () => {
    expect(
      resolveExecutionNextStep("APPROVED", "APPROVED", steps, transitions).type,
    ).toBe("COMPLETED");
    expect(
      resolveExecutionNextStep("SUBMITTED", "REJECTED", steps, transitions).type,
    ).toBe("COMPLETED");
  });

  it("retorna ERROR quando a transição aponta para passo inexistente", () => {
    const bad: ExecutionTransitionDef[] = [
      { fromStep: "SUBMITTED", toStep: "GHOST" },
    ];
    const res = resolveExecutionNextStep("SUBMITTED", "APPROVED", steps, bad);
    expect(res.type).toBe("ERROR");
    if (res.type === "ERROR") expect(res.reason).toBe("MISSING_TARGET_STEP");
  });

  it("retorna ERROR para passo atual inválido", () => {
    const res = resolveExecutionNextStep("NOPE", "APPROVED", steps, transitions);
    expect(res.type).toBe("ERROR");
    if (res.type === "ERROR") expect(res.reason).toBe("INVALID_CURRENT_STEP");
  });

  it("não deixa saltar passos: sem transição a partir do passo atual não avança", () => {
    // Saltar SUBMITTED directamente para APPROVED não é possível via decisão única
    const [init] = [getExecutionInitialStep(steps)];
    expect(init).toBe("SUBMITTED");
    // A primeira aprovação avança apenas para REVIEW (nunca pula para APPROVED)
    const res = resolveExecutionNextStep(String(init), "APPROVED", steps, transitions);
    expect(res.type).toBe("ADVANCE");
    if (res.type === "ADVANCE") expect(res.toStep).not.toBe("APPROVED");
  });
});