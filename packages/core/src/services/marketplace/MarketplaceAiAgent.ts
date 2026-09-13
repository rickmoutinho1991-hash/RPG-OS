/**
 * RPG-OS — Marketplace AI Agent (Phase 2)
 *
 * A IA pode recomendar, preparar e coordenar — NUNCA pode:
 *  - adjudicar, assinar, confirmar pagamento, libertar fundos,
 *    alterar preço, aceitar disputa ou alterar permissões.
 *
 * Cada ação gera um AiProposal que requer aprovação humana antes
 * de ser executada. A execução é feita por um ator autorizado
 * (humano ou sistema), registando o AiProposal como referência.
 *
 * SECURITY: actionAborted + capabilityGuard garantem que nenhuma
 * capability restrita passa sequer para o pipeline de aprovação.
 */

import type {
  AiMarketplaceCapability,
  AiProposal,
  AiProposalStatus,
  MarketplaceEvent,
} from "../../types/marketplace";
import { hasPermission } from "../../constants/permissions";

export interface AiAgentFlowOptions {
  now?: () => string;
  createId?: () => string;
}

export interface AiAgentFlowResult {
  proposal: AiProposal;
  events: MarketplaceEvent[];
}

/** Capability list — para validação e future allowed-actions list. */
export const AI_MARKETPLACE_CAPABILITIES: ReadonlyArray<AiMarketplaceCapability> = [
  "REQUEST_CLARIFY",
  "REQUEST_STRUCTURE",
  "LISTING_SUGGEST",
  "PROVIDER_SEARCH",
  "QUOTE_COMPARE",
  "QUOTE_EXPLAIN",
  "CONTRACT_PREPARE",
  "MILESTONE_REMIND",
  "EVIDENCE_REQUEST",
  "STATUS_EXPLAIN",
];

/**
 * Permissão mínima (formato "<modulo>.<acao>") exigida para decidir/executar
 * uma proposta. Verificada sobre o conjunto de permissões efetivas do ator
 * (server-derived) com as mesmas semânticas do RBAC (wildcards, manage/admin).
 */
export const AI_MARKETPLACE_REQUIRED_PERMISSION: Record<
  AiMarketplaceCapability,
  string
> = {
  REQUEST_CLARIFY: "marketplace.view",
  REQUEST_STRUCTURE: "marketplace.edit",
  LISTING_SUGGEST: "marketplace.edit",
  PROVIDER_SEARCH: "marketplace.view",
  QUOTE_COMPARE: "marketplace.view",
  QUOTE_EXPLAIN: "marketplace.view",
  CONTRACT_PREPARE: "contracts.edit",
  MILESTONE_REMIND: "orders.edit",
  EVIDENCE_REQUEST: "evidence.create",
  STATUS_EXPLAIN: "marketplace.view",
};

/**
 * Ações que a IA pode NUNCA assumir — mesmo via API/permissioning.
 * Esta lista é uma garantia estática; o сервер valida contra ela.
 */
export const AI_FORBIDDEN_ACTIONS = [
  "ADJUDICATE",
  "SIGN",
  "CONFIRM_PAYMENT",
  "RELEASE_FUNDS",
  "CHANGE_PRICE",
  "ACCEPT_DISPUTE",
  "CHANGE_PERMISSIONS",
  "ACTIVATE_CONTRACT",
] as const;

function buildDefaultId(): string {
  const crypto_ = globalThis.crypto;
  if (crypto_ && typeof crypto_.randomUUID === "function") {
    return crypto_.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class MarketplaceAiAgent {
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(options: AiAgentFlowOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? buildDefaultId;
  }

  propose(input: {
    aiActorId: string;
    kind: AiMarketplaceCapability;
    organizationId?: string;
    targetEntityType: string;
    targetEntityId?: string;
    payload: Record<string, unknown>;
    rationale: string;
    forbiddenAction?: string;
  }): AiAgentFlowResult {
    const {
      aiActorId,
      kind,
      organizationId,
      targetEntityType,
      targetEntityId,
      payload,
      rationale,
      forbiddenAction,
    } = input;

    if (!AI_MARKETPLACE_CAPABILITIES.includes(kind)) {
      throw new Error(`Unknown AI marketplace capability: ${kind}`);
    }
    if (forbiddenAction && (AI_FORBIDDEN_ACTIONS as readonly string[]).includes(forbiddenAction)) {
      throw new Error(
        `AI is forbidden from performing action '${forbiddenAction}'`,
      );
    }

    const proposal: AiProposal = {
      id: this.createId(),
      kind,
      aiActorId,
      organizationId,
      targetEntityType,
      targetEntityId,
      payload,
      rationale,
      requiresHumanApproval: true,
      status: "PROPOSED",
      createdAt: this.now(),
    };

    return {
      proposal,
      events: [
        this.emit("AI_PROPOSAL_CREATED", aiActorId, "ai_proposal", proposal.id, {
          proposalId: proposal.id,
          kind,
          targetEntityType,
          targetEntityId,
        }),
      ],
    };
  }

  approve(input: {
    proposal: AiProposal;
    approverId: string;
    /** Permissões efetivas do aprovador (server-derived, nunca do caller). */
    permissions: string[];
    organizationId?: string;
  }): AiAgentFlowResult {
    const { proposal, approverId, permissions, organizationId } = input;
    if (!proposal.requiresHumanApproval) {
      throw new Error("Proposal does not require approval");
    }
    if (proposal.status !== "PROPOSED") {
      throw new Error(`Cannot approve a proposal in status ${proposal.status}`);
    }
    const required = AI_MARKETPLACE_REQUIRED_PERMISSION[proposal.kind];
    if (!hasPermission(permissions, required)) {
      throw new Error(
        `Insufficient permissions to approve proposal of kind ${proposal.kind} (requires ${required})`,
      );
    }
    if (proposal.organizationId !== undefined && proposal.organizationId !== organizationId) {
      throw new Error("Proposal tenant does not match the caller tenant");
    }
    if (approverId === proposal.aiActorId) {
      throw new Error("AI agent cannot approve its own proposal");
    }

    const updated: AiProposal = {
      ...proposal,
      status: "APPROVED" as const,
      decidedAt: this.now(),
      decidedBy: approverId,
    };

    return {
      proposal: updated,
      events: [
        this.emit("AI_PROPOSAL_APPROVED", approverId, "ai_proposal", proposal.id, {
          proposalId: proposal.id,
          kind: proposal.kind,
        }),
      ],
    };
  }

  deny(input: {
    proposal: AiProposal;
    denierId: string;
    reason?: string;
    /** Permissões efetivas do decisor (server-derived, nunca do caller). */
    permissions: string[];
    organizationId?: string;
  }): AiAgentFlowResult {
    const { proposal, denierId, reason, permissions, organizationId } = input;
    if (proposal.status !== "PROPOSED") {
      throw new Error(`Cannot deny a proposal in status ${proposal.status}`);
    }
    const required = AI_MARKETPLACE_REQUIRED_PERMISSION[proposal.kind];
    if (!hasPermission(permissions, required)) {
      throw new Error(
        `Insufficient permissions to deny proposal of kind ${proposal.kind} (requires ${required})`,
      );
    }
    if (proposal.organizationId !== undefined && proposal.organizationId !== organizationId) {
      throw new Error("Proposal tenant does not match the caller tenant");
    }
    if (denierId === proposal.aiActorId) {
      throw new Error("AI agent cannot deny its own proposal");
    }

    const updated: AiProposal = {
      ...proposal,
      status: "DENIED" as const,
      decidedAt: this.now(),
      decidedBy: denierId,
    };

    return {
      proposal: updated,
      events: [
        this.emit("AI_PROPOSAL_DENIED", denierId, "ai_proposal", proposal.id, {
          proposalId: proposal.id,
          kind: proposal.kind,
          reason,
        }),
      ],
    };
  }

  /**
   * Execução: apenas por ator autorizado (permissões server-derived),
   * NUNCA pelo próprio agente. O antigo booleano `authorized` (fornecido
   * pelo caller) foi removido — a autorização deriva das permissões.
   */
  execute(input: {
    proposal: AiProposal;
    executorId: string;
    /** Permissões efetivas do executor (server-derived, nunca do caller). */
    permissions: string[];
    organizationId?: string;
    isAiActor: boolean;
  }): AiAgentFlowResult {
    const { proposal, executorId, permissions, organizationId, isAiActor } = input;
    if (isAiActor) {
      throw new Error("AI agents cannot execute their own proposals directly");
    }
    if (executorId === proposal.aiActorId) {
      throw new Error("AI agent cannot execute its own proposal");
    }
    if (proposal.status !== "APPROVED") {
      throw new Error("Only approved proposals can be executed");
    }
    const required = AI_MARKETPLACE_REQUIRED_PERMISSION[proposal.kind];
    if (!hasPermission(permissions, required)) {
      throw new Error(
        `Insufficient permissions to execute proposal of kind ${proposal.kind} (requires ${required})`,
      );
    }
    if (proposal.organizationId !== undefined && proposal.organizationId !== organizationId) {
      throw new Error("Proposal tenant does not match the caller tenant");
    }

    const updated: AiProposal = {
      ...proposal,
      status: "EXECUTED" as const,
      executedBy: executorId,
      executedAt: this.now(),
    };

    return {
      proposal: updated,
      events: [],
    };
  }

  private emit(
    type: MarketplaceEvent["type"],
    actorId: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>,
  ): MarketplaceEvent {
    return { id: this.createId(), type, actorId, entityType, entityId, payload, timestamp: this.now() };
  }
}