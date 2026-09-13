import { describe, it, expect } from "vitest";
import {
  canDecideWorkflowStep,
  getStepRequiredPermission,
  resolveEligibleApproverIds,
  type WorkflowInstanceLike,
} from "../workflowService";
import {
  resolveExecutionNextStep,
  isExecutionTerminalStep,
  getExecutionInitialStep,
  type ExecutionTransitionDef,
} from "../workflowExecution";

/* Definição de referência: SUBMITTED → REVIEW → APPROVED / REJECTED */
const steps = [
  { key: "SUBMITTED", position: 0 },
  { key: "REVIEW", position: 1, requiredPermission: "financeiro.aprovar" },
  { key: "APPROVED", position: 2, requiredPermission: "workflows.approve" },
  { key: "REJECTED", position: 3, requiredPermission: null },
] as unknown as Parameters<typeof resolveExecutionNextStep>[2];

const transitions: ExecutionTransitionDef[] = [
  { fromStep: "SUBMITTED", toStep: "REVIEW" },
  { fromStep: "REVIEW", toStep: "APPROVED" },
  {
    fromStep: "REVIEW",
    toStep: "REJECTED",
    condition: { decision: "REJECTED" },
  },
];

const pendingInstance = (
  overrides: Partial<WorkflowInstanceLike> = {},
): WorkflowInstanceLike => ({
  id: "wf-1",
  organizationId: "org-1",
  entityType: "DOCUMENT",
  entityId: "doc-1",
  currentStep: "REVIEW",
  status: "PENDING",
  requestedBy: "req-user",
  approverId: null,
  ...overrides,
});

const stepDef = (key: string) =>
  steps.find((s) => s.key === key) ?? null;

describe("getStepRequiredPermission", () => {
  it("resolve a permissão do passo atual a partir da definição persistida", () => {
    expect(getStepRequiredPermission(steps, "REVIEW")).toBe(
      "financeiro.aprovar",
    );
    expect(getStepRequiredPermission(steps, "review")).toBe(
      "financeiro.aprovar",
    );
  });

  it("devolve null para passo sem permissão ou desconhecido", () => {
    expect(getStepRequiredPermission(steps, "REJECTED")).toBeNull();
    expect(getStepRequiredPermission(steps, "GHOST_STEP")).toBeNull();
    expect(getStepRequiredPermission(steps, null)).toBeNull();
  });

  it("não herda permissões de outros passos (só o atual conta)", () => {
    expect(getStepRequiredPermission(steps, "REJECTED")).not.toBe(
      getStepRequiredPermission(steps, "APPROVED"),
    );
  });
});

describe("canDecideWorkflowStep — autorização por passo", () => {
  it("utilizador autorizado pode decidir o passo atual", () => {
    const verdict = canDecideWorkflowStep(
      pendingInstance(),
      {
        actorId: "approver-1",
        canApproveForOrg: false,
        actorHasStepPermission: true,
      },
      stepDef("REVIEW"),
    );
    expect(verdict).toEqual({ allowed: true });
  });

  it("utilizador sem a permissão exigida não pode decidir", () => {
    const verdict = canDecideWorkflowStep(
      pendingInstance(),
      {
        actorId: "random-user",
        canApproveForOrg: true, // até com workflows.approve global…
        actorHasStepPermission: false, // …sem financeiro.aprovar é barrado
      },
      stepDef("REVIEW"),
    );
    expect(verdict).toEqual({
      allowed: false,
      reason: "MISSING_STEP_PERMISSION",
    });
  });

  it("a permissão usada é a do passo persistido, nunca a fornecida pelo cliente", () => {
    // Passo APPROVED exige workflows.approve — quem não a detém falha,
    // mesmo que alegue outra permissão no cliente.
    const denied = canDecideWorkflowStep(
      pendingInstance({ currentStep: "APPROVED" }),
      { actorId: "u2", canApproveForOrg: false, actorHasStepPermission: false },
      stepDef("APPROVED"),
    );
    expect(denied).toEqual({
      allowed: false,
      reason: "MISSING_STEP_PERMISSION",
    });
  });

  it("não pode decidir um pedido que já não está PENDING", () => {
    const verdict = canDecideWorkflowStep(
      pendingInstance({ status: "APPROVED" }),
      { actorId: "approver-1", canApproveForOrg: false, actorHasStepPermission: true },
      stepDef("REVIEW"),
    );
    expect(verdict).toEqual({ allowed: false, reason: "NOT_PENDING" });
  });
});

describe("avanço de passos e responsáveis", () => {
  it("aprovação avança ao passo seguinte configurado", () => {
    const res = resolveExecutionNextStep(
      "SUBMITTED",
      "APPROVED",
      steps,
      transitions,
    );
    expect(res.type).toBe("ADVANCE");
    if (res.type === "ADVANCE") expect(res.toStep).toBe("REVIEW");
  });

  it("passo seguinte permanece PENDING (não terminal)", () => {
    const res = resolveExecutionNextStep(
      "SUBMITTED",
      "APPROVED",
      steps,
      transitions,
    );
    if (res.type !== "ADVANCE") throw new Error("esperado ADVANCE");
    expect(isExecutionTerminalStep(transitions, res.toStep)).toBe(false);
  });

  it("não é possível saltar passos na decisão", () => {
    const res = resolveExecutionNextStep(
      "SUBMITTED",
      "APPROVED",
      steps,
      transitions,
    );
    if (res.type !== "ADVANCE") throw new Error("esperado ADVANCE");
    expect(res.toStep.toUpperCase()).not.toBe("APPROVED");
    expect(res.toStep.toUpperCase()).not.toBe("REJECTED");
  });

  it("decisão num passo que não é o atual → ERROR (nunca avança)", () => {
    expect(
      resolveExecutionNextStep("WRONG_STEP", "APPROVED", steps, transitions),
    ).toEqual({ type: "ERROR", reason: "INVALID_CURRENT_STEP" });
  });
});

describe("resolveEligibleApproverIds — resolução de responsáveis", () => {
  const memberships = [
    { organizationId: "org-1", userId: "ceo", roleKey: "CEO" },
    { organizationId: "org-1", userId: "emp", roleKey: "EMPLOYEE" },
    {
      organizationId: "org-1",
      userId: "fin",
      roleKey: "EMPLOYEE",
      permissionsOverride: ["financeiro.aprovar"],
    },
    {
      organizationId: "org-1",
      userId: "cust",
      roleKey: "EMPLOYEE",
      customRoleId: "cr-1",
    },
    {
      organizationId: "org-1",
      userId: "expired",
      roleKey: "EMPLOYEE",
      permissionsOverride: ["financeiro.aprovar"],
      validUntil: "2000-01-01T00:00:00Z",
    },
    { organizationId: "other-org", userId: "outsider", roleKey: "OWNER" },
  ];
  const customRoles = [
    {
      id: "cr-1",
      organization_id: "org-1",
      key: "FINANCEIRO",
      label: "Financeiro",
      permissions: ["financeiro.*"],
    },
  ];

  it("resolve apenas membros elegíveis pela permissão do passo", () => {
    const ids = resolveEligibleApproverIds({
      organizationId: "org-1",
      memberships,
      customRoles,
      requiredPermission: "financeiro.aprovar",
    });
    expect(ids.sort()).toEqual(["cust", "fin"]);
  });

  it("sem elegíveis devolve [] (tratamento seguro)", () => {
    expect(
      resolveEligibleApproverIds({
        organizationId: "org-1",
        memberships: [memberships[1]],
        requiredPermission: "financeiro.aprovar",
      }),
    ).toEqual([]);
    expect(
      resolveEligibleApproverIds({ memberships, requiredPermission: "" }),
    ).toEqual([]);
  });
});

describe("compatibilidade legada", () => {
  it("workflow sem definição: manter comportamento de canDecideWorkflow", () => {
    const allowed = canDecideWorkflowStep(
      pendingInstance(),
      { actorId: "boss", canApproveForOrg: true },
      null,
    );
    expect(allowed).toEqual({ allowed: true });

    const byDesignatedApprover = canDecideWorkflowStep(
      pendingInstance({ approverId: "rev-1" }),
      { actorId: "rev-1", canApproveForOrg: false },
      null,
    );
    expect(byDesignatedApprover).toEqual({ allowed: true });

    const denied = canDecideWorkflowStep(
      pendingInstance({ approverId: "outro-1" }),
      { actorId: "user-x", canApproveForOrg: false },
      null,
    );
    expect(denied).toEqual({
      allowed: false,
      reason: "NOT_ASSIGNED_APPROVER",
    });
  });

  it("inicialização: primeiro passo da definição é usado no arranque", () => {
    expect(getExecutionInitialStep(steps)).toBe("SUBMITTED");
  });
});