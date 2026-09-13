/**
 * RPG-OS — Transições do motor de Workflows (lado do domínio).
 * Lógica pura para avançar uma `workflow_instance` ao longo dos passos
 * configurados numa `workflow_definition` (steps + transitions). Não depende
 * de Next.js/Supabase; nunca confia em IDs fornecidos pelo cliente.
 *
 * O `workflow_instances.current_step` guarda a chave do passo atual. As
 * transições podem portar `condition.decision` ('APPROVED'|'REJECTED') para
 * distinguir o caminho de aprovação do de rejeição.
 */

export type ExecutionDecision = "APPROVED" | "REJECTED";

export interface ExecutionStepDef {
  key: string;
  name?: string;
  position?: number;
  requiredPermission?: string;
}

export interface ExecutionTransitionDef {
  fromStep: string;
  toStep: string;
  requiredPermission?: string;
  condition?: Record<string, unknown> | null;
}

export type NextStepResult =
  | { type: "ADVANCE"; toStep: string }
  | { type: "COMPLETED" }
  | { type: "ERROR"; reason: ExecutionErrorReason };

export type ExecutionErrorReason =
  | "INVALID_CURRENT_STEP"
  | "MISSING_TARGET_STEP";

/** Passo inicial = o de menor position (ou primeiro da lista). */
export function getExecutionInitialStep(
  steps: ExecutionStepDef[],
): string | null {
  if (!steps || steps.length === 0) return null;
  const sorted = [...steps].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  return sorted[0].key;
}

/** Um passo é terminal se não tiver nenhuma transição a sair dele. */
export function isExecutionTerminalStep(
  transitions: ExecutionTransitionDef[],
  stepKey: string,
): boolean {
  const current = stepKey.toUpperCase();
  return !transitions.some(
    (t) => (t.fromStep || "").toUpperCase() === current,
  );
}

/**
 * Resolve o passo seguinte a partir do passo atual e da decisão.
 * - Aprovação: transição com `condition.decision='APPROVED'`, ou ainda uma
 *   transição genérica (sem `condition`).
 * - Rejeição: transição com `condition.decision='REJECTED'`, ou uma transição
 *   que termine num passo terminal chamado 'REJECTED'.
 * - Sem transição aplicável: COMPLETED (decisão é terminal).
 * - Transição apontando para passo inexistente: ERROR (config invalid).
 */
export function resolveExecutionNextStep(
  currentStep: string,
  decision: ExecutionDecision,
  steps: ExecutionStepDef[],
  transitions: ExecutionTransitionDef[],
): NextStepResult {
  const stepKeys = new Set(steps.map((s) => (s.key || "").toUpperCase()));
  const current = (currentStep || "").toUpperCase();

  if (!stepKeys.has(current)) {
    return { type: "ERROR", reason: "INVALID_CURRENT_STEP" };
  }

  const from = transitions.filter(
    (t) => (t.fromStep || "").toUpperCase() === current,
  );
  const decisionUpper = decision.toUpperCase() as ExecutionDecision;

  // Transição explícita para esta decisão (via condition.decision)
  const explicit = from.find(
    (t) =>
      String((t.condition as Record<string, unknown> | null)?.decision ?? "")
        .toUpperCase() === decisionUpper,
  );
  if (explicit) {
    const target = (explicit.toStep || "").toUpperCase();
    if (!stepKeys.has(target)) {
      return { type: "ERROR", reason: "MISSING_TARGET_STEP" };
    }
    return { type: "ADVANCE", toStep: explicit.toStep };
  }

  if (decisionUpper === "APPROVED") {
    // Aprovação genérica: transição sem condition
    const generic = from.find(
      (t) =>
        t.condition == null ||
        typeof t.condition !== "object" ||
        !("decision" in t.condition),
    );
    if (generic) {
      const target = (generic.toStep || "").toUpperCase();
      if (!stepKeys.has(target)) {
        return { type: "ERROR", reason: "MISSING_TARGET_STEP" };
      }
      return { type: "ADVANCE", toStep: generic.toStep };
    }
    return { type: "COMPLETED" };
  }

  // Rejeição: preferir transição para um passo terminal 'REJECTED'
  const rejectTerminal = from.find(
    (t) => (t.toStep || "").toUpperCase() === "REJECTED",
  );
  if (rejectTerminal) {
    const target = (rejectTerminal.toStep || "").toUpperCase();
    if (!stepKeys.has(target)) {
      return { type: "ERROR", reason: "MISSING_TARGET_STEP" };
    }
    return { type: "ADVANCE", toStep: rejectTerminal.toStep };
  }

  return { type: "COMPLETED" };
}