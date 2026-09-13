import { describe, it, expect } from "vitest";
import {
  buildWorkflowStepHistory,
  type WorkflowAuditDecisionEvent,
} from "../workflowService";

const steps = [{ key: "SUBMITTED" }, { key: "REVIEW" }, { key: "APPROVED" }];

const evt = (
  over: Partial<WorkflowAuditDecisionEvent> = {},
): WorkflowAuditDecisionEvent => ({
  instanceId: "wf-1",
  action: "WORKFLOW_APPROVED",
  userId: "u1",
  decidedStep: "REVIEW",
  timestamp: "2026-01-01T10:00:00Z",
  ...over,
});

describe("buildWorkflowStepHistory", () => {
  it("associa aprovação de passo intermédio ao passo correto", () => {
    const hist = buildWorkflowStepHistory({
      instanceId: "wf-1",
      steps,
      events: [evt()],
      resolveName: () => "Ana",
    });
    expect(hist["REVIEW"]).toHaveLength(1);
    expect(hist["REVIEW"][0]).toMatchObject({
      decision: "APPROVED",
      displayName: "Ana",
      userId: "u1",
    });
  });

  it("associa rejeição com verbo e autor corretos", () => {
    const hist = buildWorkflowStepHistory({
      instanceId: "wf-1",
      steps,
      events: [evt({ action: "WORKFLOW_REJECTED", decidedStep: "SUBMITTED" })],
      resolveName: () => "Bruno",
    });
    expect(hist["SUBMITTED"][0].decision).toBe("REJECTED");
    expect(hist["SUBMITTED"][0].displayName).toBe("Bruno");
  });

  it("agrega vários passos e ordena cronologicamente cada um", () => {
    const hist = buildWorkflowStepHistory({
      instanceId: "wf-1",
      steps,
      events: [
        evt({ decidedStep: "REVIEW", timestamp: "2026-01-02T10:00:00Z", userId: "u2" }),
        evt({ decidedStep: "REVIEW", timestamp: "2026-01-01T09:00:00Z", userId: "u1" }),
        evt({ decidedStep: "SUBMITTED", timestamp: "2026-01-01T08:00:00Z" }),
      ],
      resolveName: (id) => (id === "u1" ? "Ana" : "Bruno"),
    });
    expect(Object.keys(hist).sort()).toEqual(["REVIEW", "SUBMITTED"]);
    // Mais antigo primeiro dentro de cada passo
    expect(hist["REVIEW"].map((e) => e.userId)).toEqual(["u1", "u2"]);
  });

  it("audit log inexistente → histórico vazio (nada inferido)", () => {
    expect(
      buildWorkflowStepHistory({ instanceId: "wf-1", steps, events: [] }),
    ).toEqual({});
  });

  it("evento de outra instância NÃO é associado", () => {
    const hist = buildWorkflowStepHistory({
      instanceId: "wf-1",
      steps,
      events: [evt({ instanceId: "wf-OUTRA" })],
    });
    expect(hist).toEqual({});
  });

  it("workflow legado sem definitionId (decidedStep ausente) é ignorado", () => {
    const hist = buildWorkflowStepHistory({
      instanceId: "wf-1",
      steps,
      events: [
        evt({ decidedStep: null }),
        evt({ decidedStep: undefined }),
        evt({ decidedStep: "" }),
      ],
    });
    expect(hist).toEqual({});
  });

  it("nomes de utilizadores resolvidos pelo callback server-side", () => {
    const hist = buildWorkflowStepHistory({
      instanceId: "wf-1",
      steps,
      events: [evt({ userId: "uuid-xyz" })],
      resolveName: (id) =>
        id === "uuid-xyz" ? "Carla Silva" : `Utilizador ${id ?? "?"}`,
    });
    expect(hist["REVIEW"][0].displayName).toBe("Carla Silva");
  });

  it("actions desconhecidas e passos fantasma são descartados", () => {
    const hist = buildWorkflowStepStepSafe(steps, [
      evt({ action: "WORKFLOW_CANCELLED" }),
      evt({ decidedStep: "GHOST" }),
    ]);
    expect(hist).toEqual({});
  });
});

// Helper local para encurtar o caso anterior sem repetir input.
function buildWorkflowStepStepSafe(
  steps: Array<{ key: string }>,
  events: WorkflowAuditDecisionEvent[],
) {
  return buildWorkflowStepHistory({
    instanceId: "wf-1",
    steps,
    events,
  });
}