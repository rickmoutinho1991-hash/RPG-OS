/**
 * RPG-OS — Configuração de Definições de Workflow (lado do domínio).
 * Validação pura das definições guardadas em `workflow_definitions`,
 * `workflow_steps` e `workflow_transitions`. Sem Next.js/Supabase, testável.
 *
 * A mesma validação é usada nas Server Actions do Admin (nunca confiar no cliente).
 */

export type WorkflowDefinitionEntityType =
  | "DOCUMENT"
  | "INVOICE"
  | "QUOTE"
  | "PROJECT"
  | "EXPENSE"
  | "TASK"
  | "MEMBER"
  | "PLATFORM_FEE_CONFIG"
  | "OTHER";

export const WORKFLOW_ENTITY_TYPES: WorkflowDefinitionEntityType[] = [
  "DOCUMENT",
  "INVOICE",
  "QUOTE",
  "PROJECT",
  "EXPENSE",
  "TASK",
  "MEMBER",
  "PLATFORM_FEE_CONFIG",
  "OTHER",
];

export const WORKFLOW_ENTITY_LABELS: Record<WorkflowDefinitionEntityType, string> = {
  DOCUMENT: "Documento",
  INVOICE: "Fatura",
  QUOTE: "Orçamento",
  PROJECT: "Obra / Projeto",
  EXPENSE: "Despesa",
  TASK: "Tarefa",
  MEMBER: "Membro",
  PLATFORM_FEE_CONFIG: "Taxa RPG-OS",
  OTHER: "Registo",
};

export interface WorkflowDefinitionConfigInput {
  name: string;
  key: string;
  entityType: string;
  description?: string;
}

export interface WorkflowStepConfigInput {
  key: string;
  name?: string;
  position?: number;
  requiredPermission?: string;
}

export interface WorkflowTransitionConfigInput {
  fromStep: string;
  toStep: string;
  requiredPermission?: string;
  condition?: Record<string, unknown>;
}

export interface WorkflowConfigValidation {
  ok: boolean;
  errors: string[];
}

/** Normaliza um identificador: maiúsculas, só A-Z 0-9 e underscore. */
export function normalizeWorkflowKey(key: string): string {
  return key
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
}

/** Passos por defeito sugeridos para uma aprovação simples em 2 etapas. */
export function defaultWorkflowSteps(): WorkflowStepConfigInput[] {
  return [
    { key: "SUBMITTED", name: "Submetido", position: 0 },
    {
      key: "REVIEW",
      name: "Em revisão",
      position: 1,
      requiredPermission: "workflows.approve",
    },
    {
      key: "APPROVED",
      name: "Aprovado",
      position: 2,
      requiredPermission: "workflows.approve",
    },
    {
      key: "REJECTED",
      name: "Rejeitado",
      position: 3,
      requiredPermission: "workflows.approve",
    },
  ];
}

/** Transições padrão ligando os passos sugeridos. */
export function defaultWorkflowTransitions(): WorkflowTransitionConfigInput[] {
  return [
    { fromStep: "SUBMITTED", toStep: "REVIEW", requiredPermission: "workflows.approve" },
    { fromStep: "REVIEW", toStep: "APPROVED", requiredPermission: "workflows.approve" },
    {
      fromStep: "REVIEW",
      toStep: "REJECTED",
      requiredPermission: "workflows.approve",
      condition: { decision: "REJECTED" },
    },
  ];
}

/**
 * Valida uma configuração completa de definição de workflow.
 * Regras:
 *  - nome, key e entity_type obrigatórios; entity_type num conjunto conhecido;
 *  - pelo menos um passo; keys de passos únicas e não vazias;
 *  - posições >= 0;
 *  - cada transição referencia passos de origem e destino existentes e distintos.
 */
export function validateWorkflowConfig(
  definition: WorkflowDefinitionConfigInput,
  steps: WorkflowStepConfigInput[],
  transitions: WorkflowTransitionConfigInput[],
): WorkflowConfigValidation {
  const errors: string[] = [];

  const name = definition.name?.trim() ?? "";
  const key = normalizeWorkflowKey(definition.key ?? "");
  const entityType = (definition.entityType ?? "").trim().toUpperCase();

  if (!name) errors.push("Nome da definição é obrigatório.");
  if (!key) errors.push("Identificador (key) é obrigatório.");
  if (!entityType) {
    errors.push("Tipo de entidade é obrigatório.");
  } else if (!(WORKFLOW_ENTITY_TYPES as string[]).includes(entityType)) {
    errors.push(`Tipo de entidade inválido: "${entityType}".`);
  }

  if (!Array.isArray(steps) || steps.length === 0) {
    errors.push("A definição precisa de pelo menos um passo.");
  }

  const stepKeys = new Set<string>();
  if (Array.isArray(steps)) {
    const seenKeys = new Set<string>();
    steps.forEach((step, index) => {
      const label = `Passo ${index + 1}`;
      const stepKey = normalizeWorkflowKey(step?.key ?? "");
      if (!stepKey) {
        errors.push(`${label}: identificador obrigatório.`);
        return;
      }
      if (seenKeys.has(stepKey)) errors.push(`${label}: identificador "${stepKey}" repetido.`);
      seenKeys.add(stepKey);
      stepKeys.add(stepKey);
      if (typeof step?.position === "number" && step.position < 0) {
        errors.push(`${label} "${stepKey}": posição não pode ser negativa.`);
      }
    });
  }

  if (Array.isArray(transitions)) {
    transitions.forEach((transition, index) => {
      if (!transition) return;
      const label = `Transição ${index + 1}`;
      const from = normalizeWorkflowKey(transition.fromStep ?? "");
      const to = normalizeWorkflowKey(transition.toStep ?? "");
      if (!from) errors.push(`${label}: origem em falta.`);
      else if (!stepKeys.has(from)) {
        errors.push(`${label}: passo de origem "${transition.fromStep}" inexistente.`);
      }
      if (!to) errors.push(`${label}: destino em falta.`);
      else if (!stepKeys.has(to)) {
        errors.push(`${label}: passo de destino "${transition.toStep}" inexistente.`);
      }
      if (from && to && from === to) {
        errors.push(`${label}: não pode ir para si própria ("${from}").`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}