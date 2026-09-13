import { describe, it, expect } from "vitest";
import {
  buildWorkflowProgress,
  WORKFLOW_STEP_VISUAL_LABELS,
} from "../workflowService";

const defSteps = [
  { key: "SUBMITTED", name: "Submetido", position: 0 },
  { key: "REVIEW", name: "Revisão", position: 1, requiredPermission: "financeiro.aprovar" },
  { key: "APPROVED", name: "Aprovado", position: 2 },
  { key: "REJECTED", name: "Rejeitado", position: 3 },
];

describe("buildWorkflowProgress", () => {
  it("PENDING a meio do fluxo: anteriores done, atual current, futuros future", () => {
    const view = buildWorkflowProgress(defSteps, "REVIEW", "PENDING");
    expect(view.map((v) => v.state)).toEqual([
      "done",
      "current",
      "future",
      "future",
    ]);
    expect(view[1].name).toBe("Revisão");
    expect(view[1].requiredPermission).toBe("financeiro.aprovar");
  });

  it("início do fluxo: primeiro passo é o atual", () => {
    const view = buildWorkflowProgress(defSteps, "SUBMITTED", "PENDING");
    expect(view.map((v) => v.state)).toEqual([
      "current",
      "future",
      "future",
      "future",
    ]);
  });

  it("APPROVED no passo terminal: marcado como completed, anteriores done", () => {
    const view = buildWorkflowProgress(
      [defSteps[0], defSteps[1], defSteps[2]],
      "APPROVED",
      "APPROVED",
    );
    expect(view.map((v) => v.state)).toEqual(["done", "done", "completed"]);
  });

  it("REJECTED: passo final rejected, anteriores done", () => {
    const view = buildWorkflowProgress(defSteps, "REJECTED", "REJECTED");
    expect(view.map((v) => v.state)).toEqual([
      "done",
      "done",
      "done",
      "rejected",
    ]);
  });

  it("CANCELLED: passo atual cancelado, anteriores mantêm done", () => {
    const view = buildWorkflowProgress(defSteps, "REVIEW", "CANCELLED");
    expect(view.map((v) => v.state)).toEqual([
      "done",
      "cancelled",
      "future",
      "future",
    ]);
  });

  it("passo persistido desconhecido (definição alterada): vista conservadora sem concluídos", () => {
    const view = buildWorkflowProgress(defSteps, "GHOST_STEP", "PENDING");
    expect(view.every((v) => v.state === "future")).toBe(true);

    const viewRejected = buildWorkflowProgress(
      defSteps,
      "GHOST_STEP",
      "REJECTED",
    );
    // só o último passo mostra o resultado global
    expect(viewRejected.slice(0, -1).every((v) => v.state === "future")).toBe(
      true,
    );
    expect(viewRejected.at(-1)?.state).toBe("rejected");
  });

  it("sem passos ou sem definição devolve [] — UI legada intacta", () => {
    expect(buildWorkflowProgress([], "REVIEW", "PENDING")).toEqual([]);
    expect(buildWorkflowProgress(undefined as never, "X", "PENDING")).toEqual(
      [],
    );
  });

  it("respeita a ordenação por posição e é case-insensitive no passo atual", () => {
    const unordered = [
      { key: "APPROVED", position: 2 },
      { key: "SUBMITTED", position: 0 },
      { key: "REVIEW", position: 1 },
    ];
    const view = buildWorkflowProgress(unordered, "review", "PENDING");
    expect(view.map((v) => v.key)).toEqual([
      "SUBMITTED",
      "REVIEW",
      "APPROVED",
    ]);
    expect(view[1].state).toBe("current");
  });

  it("etiquetas PT cobrem todos os estados visuais", () => {
    for (const state of [
      "done",
      "current",
      "future",
      "completed",
      "rejected",
      "cancelled",
    ] as const) {
      expect(WORKFLOW_STEP_VISUAL_LABELS[state].label.length).toBeGreaterThan(0);
    }
  });
});