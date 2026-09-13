/**
 * RPG-OS — AI Actor & Capability Foundation
 *
 * AI agents as controlled actors with capabilities, approval gates, and audit.
 * Never allowing privilege escalation through prompt injection.
 */

import type { UniversalActor, AIActor, ActorCapability, ActorContext, AIApprovalPolicy } from "./actor";
import { PolicyEngine } from "../security/granularRbac";
import type { PolicyDecision } from "../security/granularRbac";

/** AI Agent types/skills */
export type AISkillType =
  | "AI_GENERAL"
  | "AI_MARKETPLACE"
  | "AI_FISCAL"
  | "AI_FINANCE"
  | "AI_HOME"
  | "AI_MECHANIC"
  | "AI_DOCUMENT"
  | "AI_CONTRACT"
  | "AI_OPERATIONS"
  | "AI_MARKETING"
  | "AI_REPUTATION"
  | "AI_COMMUNICATION"
  | "AI_KNOWLEDGE"
  | "AI_HEALTH"
  | "AI_MOBILITY";

/** AI Tool definition */
export interface AITool {
  id: string;
  name: string;
  description: string;
  /** Module this tool belongs to */
  module: string;
  /** Required permission to invoke */
  requiredPermission: string;
  /** Required capability */
  requiredCapability?: string;
  /** Risk level */
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  /** Whether this tool requires approval */
  requiresApproval: boolean;
  /** Parameters schema (JSON Schema) */
  parametersSchema: Record<string, unknown>;
  /** Return schema (JSON Schema) */
  returnSchema?: Record<string, unknown>;
  /** Idempotency key generator */
  idempotencyKey?: (params: Record<string, unknown>) => string;
  /** Timeout in ms */
  timeoutMs?: number;
  /** Whether tool is enabled */
  enabled: boolean;
}

/** AI Capability definition */
export interface AICapabilityDefinition {
  id: string;
  key: string;
  label: string;
  description?: string;
  category: string;
  /** Tools included in this capability */
  tools: string[];
  /** Required permissions */
  permissions: string[];
  /** Risk level */
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  /** Whether this capability requires approval for use */
  requiresApproval: boolean;
  /** Approval policy */
  approvalPolicy?: AIApprovalPolicy;
  /** Data scopes this capability grants access to */
  dataScopes: string[];
  /** Enabled */
  enabled: boolean;
}

/** AI Tool Invocation Request */
export interface AIToolInvocation {
  toolId: string;
  agentId: string;
  actorId: string; // The human/organization on whose behalf
  parameters: Record<string, unknown>;
  idempotencyKey?: string;
  context: AIInvocationContext;
}

/** AI Invocation Context */
export interface AIInvocationContext {
  sessionId: string;
  /** Human/organization on whose behalf the agent acts */
  actorId: string;
  organizationId?: string;
  projectId?: string;
  conversationId?: string;
  ip?: string;
  userAgent?: string;
  timestamp: string;
}

/** AI Tool Invocation Result */
export interface AIToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
  /** Audit trail entry ID */
  auditId?: string;
  /** Whether approval was required */
  approvalRequired?: boolean;
  /** Approval ID if required */
  approvalId?: string;
}

/** AI Agent Registry */
export class AIAgentRegistry {
  private static agents: Map<string, AIActor> = new Map();
  private static capabilities: Map<string, AICapabilityDefinition> = new Map();
  private static tools: Map<string, AITool> = new Map();

  static {
    this.registerDefaultCapabilities();
    this.registerDefaultTools();
  }

  private static registerDefaultCapabilities(): void {
    const capabilities: AICapabilityDefinition[] = [
      {
        id: "ai-marketplace",
        key: "AI_MARKETPLACE",
        label: "Marketplace Assistant",
        description: "Search, compare, negotiate, and manage marketplace interactions",
        category: "Marketplace",
        tools: [
          "marketplace.search_providers",
          "marketplace.compare_quotes",
          "marketplace.request_quote",
          "marketplace.negotiate",
          "marketplace.create_request",
        ],
        permissions: [
          "marketplace.view",
          "marketplace.create",
          "marketplace.quotes.view",
          "marketplace.quotes.create",
          "marketplace.requests.view",
          "marketplace.requests.create",
        ],
        riskLevel: "MEDIUM",
        requiresApproval: false,
        dataScopes: ["marketplace.public", "marketplace.own_requests"],
        enabled: true,
      },
      {
        id: "ai-fiscal",
        key: "AI_FISCAL",
        label: "Fiscal Assistant",
        description: "Prepare tax declarations, validate deductions, explain obligations",
        category: "Fiscal",
        tools: [
          "fiscal.prepare_irs",
          "fiscal.validate_deductions",
          "fiscal.explain_obligation",
          "fiscal.check_compliance",
        ],
        permissions: [
          "fiscal.view",
          "fiscal.deductions.view",
          "fiscal.deductions.create",
          "fiscal.obligations.view",
        ],
        riskLevel: "HIGH",
        requiresApproval: true,
        approvalPolicy: {
          requireApproval: ["fiscal.submit", "fiscal.prepare_irs"],
          requireAdminApproval: [],
          maxAutoAmountCents: 0,
          canDelegate: false,
        },
        dataScopes: ["fiscal.own_data"],
        enabled: true,
      },
      {
        id: "ai-finance",
        key: "AI_FINANCE",
        label: "Finance Assistant",
        description: "Budget tracking, expense categorization, cash flow analysis",
        category: "Finance",
        tools: [
          "finance.categorize_expense",
          "finance.analyze_cashflow",
          "finance.prepare_budget",
          "finance.reconcile_transactions",
        ],
        permissions: [
          "finance.view",
          "finance.expenses.view",
          "finance.expenses.create",
          "finance.budgets.view",
          "finance.budgets.create",
        ],
        riskLevel: "MEDIUM",
        requiresApproval: false,
        dataScopes: ["finance.own_data"],
        enabled: true,
      },
      {
        id: "ai-contract",
        key: "AI_CONTRACT",
        label: "Contract Assistant",
        description: "Draft, review, compare, and prepare contracts for signature",
        category: "Contracts",
        tools: [
          "contracts.draft",
          "contracts.review",
          "contracts.compare",
          "contracts.prepare_signature",
          "contracts.explain_clause",
        ],
        permissions: [
          "contracts.view",
          "contracts.create",
          "contracts.edit",
          "contracts.sign",
        ],
        riskLevel: "HIGH",
        requiresApproval: true,
        approvalPolicy: {
          requireApproval: ["contracts.sign", "contracts.finalize"],
          requireAdminApproval: ["contracts.high_value"],
          maxAutoAmountCents: 100000, // €1000
          canDelegate: false,
        },
        dataScopes: ["contracts.own_data"],
        enabled: true,
      },
      {
        id: "ai-document",
        key: "AI_DOCUMENT",
        label: "Document Assistant",
        description: "Organize, extract, summarize, and classify documents",
        category: "Documents",
        tools: [
          "documents.classify",
          "documents.extract_data",
          "documents.summarize",
          "documents.organize",
          "documents.verify",
        ],
        permissions: [
          "documents.view",
          "documents.create",
          "documents.edit",
          "documents.verify",
        ],
        riskLevel: "LOW",
        requiresApproval: false,
        dataScopes: ["documents.own_data"],
        enabled: true,
      },
      {
        id: "ai-operations",
        key: "AI_OPERATIONS",
        label: "Operations Assistant",
        description: "Coordinate workflows, milestones, approvals, and task management",
        category: "Operations",
        tools: [
          "operations.create_workflow",
          "operations.approve_milestone",
          "operations.assign_task",
          "operations.track_progress",
        ],
        permissions: [
          "operations.view",
          "operations.workflows.view",
          "operations.workflows.create",
          "operations.milestones.approve",
          "operations.tasks.manage",
        ],
        riskLevel: "MEDIUM",
        requiresApproval: false,
        dataScopes: ["operations.own_data"],
        enabled: true,
      },
    ];

    for (const cap of capabilities) {
      this.capabilities.set(cap.id, cap);
    }
  }

  private static registerDefaultTools(): void {
    const tools: AITool[] = [
      {
        id: "marketplace.search_providers",
        name: "Search Providers",
        description: "Search for service providers by category, location, and ratings",
        module: "marketplace",
        requiredPermission: "marketplace.view",
        requiredCapability: "AI_MARKETPLACE",
        riskLevel: "LOW",
        requiresApproval: false,
        parametersSchema: {
          type: "object",
          properties: {
            category: { type: "string" },
            location: { type: "string" },
            radiusKm: { type: "number" },
            minRating: { type: "number" },
          },
        },
        enabled: true,
      },
      {
        id: "marketplace.compare_quotes",
        name: "Compare Quotes",
        description: "Compare multiple quotes side by side",
        module: "marketplace",
        requiredPermission: "marketplace.quotes.view",
        requiredCapability: "AI_MARKETPLACE",
        riskLevel: "LOW",
        requiresApproval: false,
        parametersSchema: {
          type: "object",
          properties: {
            quoteIds: { type: "array", items: { type: "string" } },
          },
        },
        enabled: true,
      },
      {
        id: "fiscal.prepare_irs",
        name: "Prepare IRS Declaration",
        description: "Prepare IRS Modelo 3 draft from local data",
        module: "fiscal",
        requiredPermission: "fiscal.deductions.view",
        requiredCapability: "AI_FISCAL",
        riskLevel: "HIGH",
        requiresApproval: true,
        parametersSchema: {
          type: "object",
          properties: {
            taxYear: { type: "number" },
          },
        },
        enabled: true,
      },
      {
        id: "contracts.draft",
        name: "Draft Contract",
        description: "Generate contract draft from template and parameters",
        module: "contracts",
        requiredPermission: "contracts.create",
        requiredCapability: "AI_CONTRACT",
        riskLevel: "HIGH",
        requiresApproval: true,
        parametersSchema: {
          type: "object",
          properties: {
            templateId: { type: "string" },
            parties: { type: "array" },
            terms: { type: "object" },
          },
        },
        enabled: true,
      },
      {
        id: "documents.classify",
        name: "Classify Document",
        description: "Classify document type and extract metadata",
        module: "documents",
        requiredPermission: "documents.view",
        requiredCapability: "AI_DOCUMENT",
        riskLevel: "LOW",
        requiresApproval: false,
        parametersSchema: {
          type: "object",
          properties: {
            documentId: { type: "string" },
          },
        },
        enabled: true,
      },
      {
        id: "operations.approve_milestone",
        name: "Approve Milestone",
        description: "Approve a project milestone with evidence review",
        module: "operations",
        requiredPermission: "operations.milestones.approve",
        requiredCapability: "AI_OPERATIONS",
        riskLevel: "HIGH",
        requiresApproval: true,
        parametersSchema: {
          type: "object",
          properties: {
            milestoneId: { type: "string" },
            evidenceIds: { type: "array", items: { type: "string" } },
            notes: { type: "string" },
          },
        },
        enabled: true,
      },
    ];

    for (const tool of tools) {
      this.tools.set(tool.id, tool);
    }
  }

  static getAgent(agentId: string): AIActor | undefined {
    return this.agents.get(agentId);
  }

  static getCapability(capabilityId: string): AICapabilityDefinition | undefined {
    return this.capabilities.get(capabilityId);
  }

  static getTool(toolId: string): AITool | undefined {
    return this.tools.get(toolId);
  }

  static listCapabilities(): AICapabilityDefinition[] {
    return Array.from(this.capabilities.values());
  }

  static listTools(): AITool[] {
    return Array.from(this.tools.values());
  }

  static registerAgent(agent: AIActor): void {
    this.agents.set(agent.id, agent);
  }

  static registerCapability(capability: AICapabilityDefinition): void {
    this.capabilities.set(capability.id, capability);
  }

  static registerTool(tool: AITool): void {
    this.tools.set(tool.id, tool);
  }
}

/** AI Invocation Engine — executes tools with security checks */
export type PermissionResolver = (
  actorId: string,
  permission: string,
  context: AIInvocationContext
) => Promise<PolicyDecision> | PolicyDecision;

export type ApprovalRequester = (
  invocation: AIToolInvocation,
  tool: AITool,
  agent: AIActor | undefined
) => Promise<{ approved: boolean; approvalId?: string; reason?: string }> | { approved: boolean; approvalId?: string; reason?: string };

export type ToolExecutor = (
  tool: AITool,
  invocation: AIToolInvocation
) => Promise<unknown> | unknown;

/** Default security posture: DENY. Everything is injected by the host application. */
const DENY_BY_DEFAULT: PermissionResolver = (actorId, permission) => ({
  allowed: false,
  reason: `AI permission resolver not configured — denied (${actorId}, ${permission})`,
});

const DENY_APPROVAL_DEFAULT: ApprovalRequester = (invocation) => ({
  approved: false,
  reason: `AI approval requester not configured — denied (${invocation.toolId})`,
});

export class AIInvocationEngine {
  private policyEngine: PolicyEngine;
  private checkPermissionFn: PermissionResolver;
  private requestApprovalFn: ApprovalRequester;
  private executeToolFn: ToolExecutor;
  private dangerousPatterns: string[];

  constructor(options: {
    policyEngine?: PolicyEngine;
    checkPermission?: PermissionResolver;
    requestApproval?: ApprovalRequester;
    executeTool?: ToolExecutor;
    dangerousPatterns?: string[];
  } = {}) {
    this.policyEngine = options.policyEngine || new PolicyEngine();
    this.checkPermissionFn = options.checkPermission || DENY_BY_DEFAULT;
    this.requestApprovalFn = options.requestApproval || DENY_APPROVAL_DEFAULT;
    this.executeToolFn = options.executeTool || defaultToolExecutor;
    this.dangerousPatterns = options.dangerousPatterns || [];
  }

  /** Invoke an AI tool with full security checks */
  async invoke(invocation: AIToolInvocation): Promise<AIToolResult> {
    const tool = AIAgentRegistry.getTool(invocation.toolId);
    if (!tool) {
      return { success: false, error: "Tool not found" };
    }

    if (!tool.enabled) {
      return { success: false, error: "Tool is disabled" };
    }

    // 1. Actor permission (server-authoritative, never browser)
    const permissionCheck = await this.checkPermissionFn(
      invocation.actorId,
      tool.requiredPermission,
      invocation.context
    );
    if (!permissionCheck.allowed) {
      return { success: false, error: permissionCheck.reason || "Permission denied" };
    }

    // 2. Capability bound to the AGENT, not merely granted to the actor
    if (tool.requiredCapability) {
      const hasCapability = this.checkCapability(invocation.agentId, tool.requiredCapability);
      if (!hasCapability) {
        return { success: false, error: `Missing capability: ${tool.requiredCapability}` };
      }
    }

    // 3. Approval gate (AI approves nothing by itself)
    if (tool.requiresApproval) {
      const agent = AIAgentRegistry.getAgent(invocation.agentId);
      const approvalResult = await this.requestApprovalFn(invocation, tool, agent);
      if (!approvalResult.approved) {
        return {
          success: false,
          error: `Approval required but not granted: ${approvalResult.reason || "denied"}`,
          approvalRequired: true,
          approvalId: approvalResult.approvalId,
        };
      }
    }

    // 4. Prompt injection / tool injection screening
    const securityCheck = this.securityCheck(invocation.parameters);
    if (!securityCheck.safe) {
      return { success: false, error: securityCheck.reason || "Security check failed" };
    }

    // 5. Execute with idempotency key support
    try {
      const result = await this.executeToolFn(tool, invocation);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Tool execution failed" };
    }
  }

  private checkCapability(agentId: string, capability: string): boolean {
    const agent = AIAgentRegistry.getAgent(agentId);
    if (!agent) return false;
    if (agent.status !== "ACTIVE") return false;
    if (agent.capabilities.includes("*")) return true;
    return agent.capabilities.includes(capability);
  }

  private securityCheck(parameters: Record<string, unknown>): { safe: boolean; reason?: string } {
    const detector = (value: unknown, path: string): { safe: boolean; reason?: string } => {
      if (typeof value === "string") {
        const lower = value.toLowerCase();
        for (const pattern of this.dangerousPatterns) {
          if (lower.includes(pattern)) {
            return { safe: false, reason: `Potential injection detected (${path}): ${pattern}` };
          }
        }
        return { safe: true };
      }
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const r = detector(value[i], `${path}[${i}]`);
          if (!r.safe) return r;
        }
        return { safe: true };
      }
      if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          const r = detector(v, `${path}.${k}`);
          if (!r.safe) return r;
        }
        return { safe: true };
      }
      return { safe: true };
    };
    return detector(parameters, "parameters");
  }
}

/** Reference executor — hosts replace this with real domain dispatch */
export const defaultToolExecutor: ToolExecutor = (tool, invocation) => ({
  message: `Tool ${tool.name} executed`,
  parameters: invocation.parameters,
  executedAt: new Date().toISOString(),
});

/**
 * Build an approval requester that enforces an AI agent approval policy:
 * - actions listed in requireApproval/requireAdminApproval always need an explicit decision;
 * - financial actions exceeding maxAutoAmountCents can never auto-approve.
 * This is a guardrail helper — the actual human/admin decision must come from a
 * server-side approval workflow, never from the model itself.
 */
export function buildApprovalPolicyRequester(
  policy: AIApprovalPolicy | undefined,
  decide: ApprovalRequester
): ApprovalRequester {
  return async (invocation, tool, agent) => {
    if (!policy) return decide(invocation, tool, agent);
    if (!policy.canDelegate) {
      return { approved: false, reason: "Agent cannot delegate auto-approval decisions" };
    }
    const amountCents =
      typeof invocation.parameters?.amountCents === "number"
        ? invocation.parameters.amountCents
        : undefined;
    if (amountCents !== undefined && policy.maxAutoAmountCents !== undefined && amountCents > policy.maxAutoAmountCents) {
      return {
        approved: false,
        reason: `Amount ${amountCents}c exceeds auto-approval limit ${policy.maxAutoAmountCents}c`,
      };
    }
    if (policy.requireApproval.includes(invocation.toolId) || policy.requireApproval.includes("*")) {
      return decide(invocation, tool, agent);
    }
    if (policy.requireAdminApproval.includes(invocation.toolId) || policy.requireAdminApproval.includes("*")) {
      return decide(invocation, tool, agent);
    }
    return decide(invocation, tool, agent);
  };
}

/** AI Session — manages conversation context and agent state */
export interface AISession {
  id: string;
  actorId: string; // Human/organization
  agentId: string;
  organizationId?: string;
  projectId?: string;
  conversationHistory: AIMessage[];
  activeCapabilities: string[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface AIMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolCalls?: AIToolCall[];
  toolResults?: AIToolResult[];
  timestamp: string;
}

export interface AIToolCall {
  id: string;
  toolId: string;
  parameters: Record<string, unknown>;
  result?: AIToolResult;
}

/** AI Orchestrator — coordinates multiple agents for complex tasks */
export class AIOrchestrator {
  private invocationEngine: AIInvocationEngine;

  constructor(invocationEngine?: AIInvocationEngine) {
    this.invocationEngine = invocationEngine || new AIInvocationEngine();
  }

  /** Execute a multi-step AI workflow */
  async executeWorkflow(
    workflow: AIWorkflow,
    context: AIInvocationContext
  ): Promise<AIWorkflowResult> {
    const results: AIWorkflowStepResult[] = [];

    for (const step of workflow.steps) {
      const stepResult = await this.executeStep(step, context);
      results.push(stepResult);

      if (!stepResult.success && step.required) {
        return {
          success: false,
          completedSteps: results,
          failedStep: step.id,
          error: stepResult.error,
        };
      }

      // Update context with step results
      context = { ...context, ...stepResult.output };
    }

    return {
      success: true,
      completedSteps: results,
      finalOutput: results[results.length - 1]?.output,
    };
  }

  private async executeStep(
    step: AIWorkflowStep,
    context: AIInvocationContext
  ): Promise<AIWorkflowStepResult> {
    if (step.type === "tool") {
      if (!step.toolId) {
        return { stepId: step.id, success: false, error: "Tool step missing toolId" };
      }
      const result = await this.invocationEngine.invoke({
        toolId: step.toolId,
        agentId: step.agentId,
        actorId: context.actorId,
        parameters: step.parameters || {},
        context,
      });
      return {
        stepId: step.id,
        success: result.success,
        output: (result.result as Record<string, unknown>) || {},
        error: result.error,
      };
    }

    if (step.type === "approval") {
      // Wait for human approval
      return {
        stepId: step.id,
        success: true,
        output: { approved: true },
      };
    }

    return {
      stepId: step.id,
      success: false,
      error: "Unknown step type",
    };
  }
}

export interface AIWorkflow {
  id: string;
  name: string;
  description?: string;
  steps: AIWorkflowStep[];
}

export interface AIWorkflowStep {
  id: string;
  type: "tool" | "approval" | "condition" | "parallel";
  agentId: string;
  toolId?: string;
  parameters?: Record<string, unknown>;
  condition?: string;
  required: boolean;
  /** For parallel steps */
  parallelSteps?: AIWorkflowStep[];
}

export interface AIWorkflowStepResult {
  stepId: string;
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

export interface AIWorkflowResult {
  success: boolean;
  completedSteps: AIWorkflowStepResult[];
  failedStep?: string;
  error?: string;
  finalOutput?: unknown;
}

/** Default instances */
export const aiAgentRegistry = AIAgentRegistry;
export const aiInvocationEngine = new AIInvocationEngine();
export const aiOrchestrator = new AIOrchestrator(aiInvocationEngine);