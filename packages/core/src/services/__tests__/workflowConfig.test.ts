import { describe, it, expect } from "vitest";
import {
  normalizeWorkflowKey,
  validateWorkflowConfig,
  defaultWorkflowSteps,
  defaultWorkflowTransitions,
  WORKFLOW_ENTITY_TYPES,
} from "../workflowConfig";

describe("normalizeWorkflowKey", () => {
  it("normaliza para maiúsculas com underscore", () => {
    expect(normalizeWorkflowKey("invoice-approval")).toBe("INVOICE_APPROVAL");
    expect(normalizeWorkflowKey("  invoice-approval  ")).toBe("INVOICE_APPROVAL");
  });
  it("trata vazio como vazio", () => {
    expect(normalizeWorkflowKey("")).toBe("");
  });
});

describe("validateWorkflowConfig", () => {
  const base = {
    definition: { name: "Aprovação", key: "FAVOR_N", entityType: "INVOICE" },
    steps: [
      { key: "SUBMITTED", name: "Submetido", position: 0 },
      {
        key: "REVIEW",
        name: "Em revisão",
        position: 1,
        requiredPermission: "workflows.approve",
      },
    ],
    transitions: [{ fromStep: "SUBMITTED", toStep: "REVIEW" }],
  };

  it("aceita uma configuração válida", () => {
    const result = validateWorkflowConfig(
      base.definition,
      base.steps,
      base.transitions,
    );
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejeita entity_type desconhecido", () => {
    const result = validateWorkflowConfig(
      { ...base.definition, entityType: "ALIEN" },
      base.steps,
      base.transitions,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Tipo de entidade inválido"))).toBe(
      true,
    );
  });

  it("rejeita passo duplicado", () => {
    const result = validateWorkflowConfig(base.definition, [
      { key: "SUBMITTED", position: 0 },
      { key: "SUBMITTED", position: 1 },
    ], []);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("repetido"))).toBe(true);
  });

  it("rejeita transição com passo de origem/destino inexistente", () => {
    const result = validateWorkflowConfig(base.definition, base.steps, [
      { fromStep: "SUBMITTED", toStep: "GHOST" },
      { fromStep: "NOWHERE", toStep: "REVIEW" },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("destino \"GHOST\""))).toBe(true);
    expect(result.errors.some((e) => e.includes("origem \"NOWHERE\""))).toBe(true);
  });

  it("rejeita transição para si própria", () => {
    const result = validateWorkflowConfig(base.definition, base.steps, [
      { fromStep: "REVIEW", toStep: "REVIEW" },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("si própria"))).toBe(true);
  });

  it("exige pelo menos um passo", () => {
    const result = validateWorkflowConfig(base.definition, [], []);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("pelo menos um passo"))).toBe(true);
  });

  it("exige nome e key", () => {
    const result = validateWorkflowConfig(
      { name: "", key: "", entityType: "DOCUMENT" },
      base.steps,
      base.transitions,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Nome"))).toBe(true);
    expect(result.errors.some((e) => e.includes("Identificador"))).toBe(true);
  });
});

describe("defaults e tipos de entidade", () => {
  it("gera passos e transições consistentes com a validação", () => {
    const steps = defaultWorkflowSteps();
    const transitions = defaultWorkflowTransitions();
    const result = validateWorkflowConfig(
      { name: "X", key: "X", entityType: "EXPENSE" },
      steps,
      transitions,
    );
    expect(result.ok).toBe(true);
  });

  it("expõe tipos de entidade esperados", () => {
    expect(WORKFLOW_ENTITY_TYPES).toContain("DOCUMENT");
    expect(WORKFLOW_ENTITY_TYPES).toContain("EXPENSE");
    expect(WORKFLOW_ENTITY_TYPES).toContain("INVOICE");
  });
});