import { describe, it, expect } from "vitest";
import {
  canDecideWorkflow,
  canCancelWorkflow,
  WORKFLOW_STATUS_LABEL,
  type WorkflowInstanceLike,
} from "../workflowService";

const fakeInstance = (overrides: Partial<WorkflowInstanceLike> = {}): WorkflowInstanceLike => ({
  id: "wf-1",
  organizationId: "org-1",
  entityType: "DOCUMENT",
  entityId: "entity-1",
  status: "PENDING",
  requestedBy: "user-requester",
  approverId: "user-approver",
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("canDecideWorkflow (aprovar/rejeitar)", () => {
  it("permite decidir ao aprovador designado", () => {
    const res = canDecideWorkflow(
      fakeInstance({ approverId: "user-approver" }),
      { actorId: "user-approver", canApproveForOrg: false },
    );
    expect(res.allowed).toBe(true);
  });

  it("não permite decidir a alguém que não seja o aprovador designado", () => {
    const res = canDecideWorkflow(
      fakeInstance({ approverId: "user-approver" }),
      { actorId: "user-other", canApproveForOrg: true },
    );
    expect(res.allowed).toBe(false);
    expect("reason" in res && res.reason).toBe("NOT_ASSIGNED_APPROVER");
  });

  it("bloqueia decidir pedidos já decididos ou cancelados", () => {
    const res = canDecideWorkflow(
      fakeInstance({ status: "APPROVED", approverId: "user-approver" }),
      { actorId: "user-approver", canApproveForOrg: true },
    );
    expect(res.allowed).toBe(false);
    expect("reason" in res && res.reason).toBe("NOT_PENDING");
  });

  it("permite decidir a quem tem permissão de organização em fluxos sem aprovador", () => {
    const res = canDecideWorkflow(
      fakeInstance({ approverId: null }),
      { actorId: "manager", canApproveForOrg: true },
    );
    expect(res.allowed).toBe(true);
  });

  it("requer permissão de organização para fluxos sem aprovador designado", () => {
    const res = canDecideWorkflow(
      fakeInstance({ approverId: null }),
      { actorId: "staff", canApproveForOrg: false },
    );
    expect(res.allowed).toBe(false);
    expect("reason" in res && res.reason).toBe("MISSING_ORG_APPROVE_PERMISSION");
  });
});

describe("canCancelWorkflow", () => {
  it("permite cancelar ao requerente do pedido PENDING", () => {
    const res = canCancelWorkflow(
      fakeInstance({ requestedBy: "user-requester" }),
      { actorId: "user-requester", canApproveForOrg: false, canManageForOrg: false },
    );
    expect(res.allowed).toBe(true);
  });

  it("bloqueia cancelar ao aprovador não requerente", () => {
    const res = canCancelWorkflow(
      fakeInstance({ requestedBy: "user-requester", approverId: "manager" }),
      { actorId: "manager", canApproveForOrg: true },
    );
    expect(res.allowed).toBe(false);
    expect("reason" in res && res.reason).toBe("NOT_REQUESTER");
  });

  it("bloqueia cancelar pedidos já decididos", () => {
    const res = canCancelWorkflow(
      fakeInstance({ requestedBy: "user-requester", status: "APPROVED" }),
      { actorId: "user-requester", canApproveForOrg: false },
    );
    expect(res.allowed).toBe(false);
    expect("reason" in res && res.reason).toBe("NOT_PENDING");
  });
});

describe("WORKFLOW_STATUS_LABEL", () => {
  it("tem rótulos legíveis em PT para cada estado", () => {
    expect(WORKFLOW_STATUS_LABEL.PENDING).toBe("Pendente");
    expect(WORKFLOW_STATUS_LABEL.APPROVED).toBe("Aprovado");
    expect(WORKFLOW_STATUS_LABEL.REJECTED).toBe("Rejeitado");
    expect(WORKFLOW_STATUS_LABEL.CANCELLED).toBe("Cancelado");
  });
});