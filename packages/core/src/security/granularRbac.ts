/**
 * RPG-OS — Granular RBAC + ABAC Foundation
 *
 * Permission format: "<module>.<action>"
 * Actions: view | create | edit | delete | approve | export | share | invite | manage | admin
 * Wildcards: "module.*" or "*"
 *
 * ABAC: subject + resource + action + context + environment
 */

import type { UniversalActor, ActorRole, ActorContext } from "../types/actor";
import type { PermissionAction, ModuleDefinition } from "../constants/permissions";

/** Standard permission format: "module.action" */
export type PermissionString = `${string}.${PermissionAction}` | `${string}.*` | "*";

/** Resource identifier */
export interface ResourceIdentifier {
  type: string;
  id: string;
  /** Organization context */
  organizationId?: string;
  /** Project context */
  projectId?: string;
  /** Owner */
  ownerId?: string;
}

/** ABAC Context for authorization decisions */
export interface ABACContext {
  /** The subject (actor) */
  subject: UniversalActor;
  /** The resource being accessed */
  resource: ResourceIdentifier;
  /** The action requested */
  action: PermissionAction;
  /** Environment context */
  environment: {
    ip?: string;
    userAgent?: string;
    deviceId?: string;
    location?: string;
    timeOfDay: number; // 0-23
    dayOfWeek: number; // 0-6
  };
  /** Additional attributes */
  attributes: Record<string, unknown>;
}

/** Policy decision */
export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  /** Which policy matched */
  policyId?: string;
  /** Obligations (e.g., logging, notifications) */
  obligations?: string[];
  /** Advice (non-binding recommendations) */
  advice?: string[];
}

/** Authorization policy */
export interface AuthorizationPolicy {
  id: string;
  name: string;
  description?: string;
  /** Effect */
  effect: "PERMIT" | "DENY";
  /** Subject matchers */
  subject: PolicyMatcher<UniversalActor>;
  /** Resource matchers */
  resource: PolicyMatcher<ResourceIdentifier>;
  /** Action matchers */
  action: ActionMatcher;
  /** Environment/Context matchers */
  environment?: PolicyMatcher<ABACContext["environment"]>;
  /** Attribute matchers */
  attributes?: PolicyMatcher<Record<string, unknown>>;
  /** Obligations if policy matches */
  obligations?: string[];
  /** Priority (higher = evaluated first) */
  priority: number;
  /** Whether policy is enabled (default true when omitted) */
  enabled?: boolean;
  /** Created by */
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Generic policy matcher */
export interface PolicyMatcher<T> {
  /** Exact match */
  equals?: Partial<T>;
  /** One of values */
  in?: Partial<Record<keyof T, unknown[]>>;
  /** Not one of values */
  notIn?: Partial<Record<keyof T, unknown[]>>;
  /** Custom function (serialized) */
  custom?: string;
  /** All conditions must match (AND) */
  all?: PolicyMatcher<T>[];
  /** Any condition can match (OR) */
  any?: PolicyMatcher<T>[];
}

/** Action matcher (action is a scalar string union, not an object) */
export interface ActionMatcher {
  equals?: PermissionAction;
  in?: PermissionAction[];
  notIn?: PermissionAction[];
  all?: ActionMatcher[];
  any?: ActionMatcher[];
}

/** Policy evaluation result */
export interface PolicyEvaluationResult {
  decision: "PERMIT" | "DENY" | "NOT_APPLICABLE" | "INDETERMINATE";
  matchedPolicies: AuthorizationPolicy[];
  obligations: string[];
  advice: string[];
}

/** Role-based permission set */
export interface RolePermissionSet {
  roleKey: string;
  permissions: string[];
  /** Wildcard permissions (e.g., "faturacao.*") */
  wildcards: string[];
  /** Capabilities */
  capabilities: string[];
  /** Data scopes */
  dataScopes: string[];
}

/** Effective permissions for an actor in a context */
export interface EffectivePermissions {
  actorId: string;
  contextType: "PLATFORM" | "ORGANIZATION" | "PROJECT" | "TEAM" | "MARKETPLACE" | "PERSONAL";
  contextId: string;
  permissions: string[];
  wildcards: string[];
  capabilities: string[];
  dataScopes: string[];
  roles: ActorRole[];
  /** Computed at */
  computedAt: string;
  /** Expires at */
  expiresAt?: string;
}

/** Permission check request */
export interface PermissionCheckRequest {
  actorId: string;
  permission: string;
  resource?: ResourceIdentifier;
  context?: Partial<ABACContext>;
}

/** Batch permission check request */
export interface BatchPermissionCheckRequest {
  actorId: string;
  permissions: string[];
  resource?: ResourceIdentifier;
  context?: Partial<ABACContext>;
}

/** Batch permission check result */
export interface BatchPermissionCheckResult {
  results: Record<string, PolicyDecision>;
  allAllowed: boolean;
}

/** Permission registry — central registry of all permissions */
export class PermissionRegistry {
  private static modules: Map<string, ModuleDefinition> = new Map();
  private static permissions: Map<string, PermissionDefinition> = new Map();

  static {
    // Register core modules
    this.registerModule({ id: "platform", label: "Platform", personal: false });
    this.registerModule({ id: "marketplace", label: "Marketplace", personal: false });
    this.registerModule({ id: "contracts", label: "Contracts", personal: false });
    this.registerModule({ id: "payments", label: "Payments", personal: false });
    this.registerModule({ id: "orders", label: "Orders", personal: false });
    this.registerModule({ id: "evidence", label: "Evidence", personal: false });
    this.registerModule({ id: "audit", label: "Audit", personal: false });
    this.registerModule({ id: "ai", label: "AI", personal: false });
    this.registerModule({ id: "users", label: "Users", personal: false });
    this.registerModule({ id: "organizations", label: "Organizations", personal: false });
    this.registerModule({ id: "finance", label: "Finance", personal: true });
    this.registerModule({ id: "fiscal", label: "Fiscal", personal: true });
    this.registerModule({ id: "health", label: "Health", personal: true });
    this.registerModule({ id: "mobility", label: "Mobility", personal: true });
    this.registerModule({ id: "documents", label: "Documents", personal: true });
    this.registerModule({ id: "reputation", label: "Reputation", personal: true });
    this.registerModule({ id: "communication", label: "Communication", personal: true });
    this.registerModule({ id: "knowledge", label: "Knowledge", personal: true });
    this.registerModule({ id: "operations", label: "Operations", personal: false });
    this.registerModule({ id: "admin", label: "Administration", personal: false });
  }

  static registerModule(module: ModuleDefinition): void {
    this.modules.set(module.id, module);
  }

  static registerPermission(permission: PermissionDefinition): void {
    const key = `${permission.module}.${permission.action}`;
    this.permissions.set(key, permission);
  }

  static getModule(id: string): ModuleDefinition | undefined {
    return this.modules.get(id);
  }

  static getPermission(module: string, action: PermissionAction): PermissionDefinition | undefined {
    return this.permissions.get(`${module}.${action}`);
  }

  static listModules(): ModuleDefinition[] {
    return Array.from(this.modules.values());
  }

  static listPermissions(module?: string): PermissionDefinition[] {
    if (module) {
      return Array.from(this.permissions.values()).filter((p) => p.module === module);
    }
    return Array.from(this.permissions.values());
  }

  static validatePermission(permission: string): boolean {
    if (permission === "*") return true;
    if (permission.endsWith(".*")) {
      const module = permission.slice(0, -2);
      return this.modules.has(module);
    }
    return this.permissions.has(permission);
  }

  static expandWildcard(permission: string): string[] {
    if (permission === "*") {
      return Array.from(this.permissions.keys());
    }
    if (permission.endsWith(".*")) {
      const module = permission.slice(0, -2);
      return this.listPermissions(module).map((p) => `${p.module}.${p.action}`);
    }
    return [permission];
  }
}

/** Permission definition */
export interface PermissionDefinition {
  module: string;
  action: PermissionAction;
  label: string;
  description?: string;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  requiresApproval?: boolean;
}

/** ABAC Policy Engine */
export class PolicyEngine {
  private policies: AuthorizationPolicy[] = [];

  addPolicy(policy: AuthorizationPolicy): void {
    this.policies.push(policy);
    this.policies.sort((a, b) => b.priority - a.priority);
  }

  removePolicy(policyId: string): boolean {
    const index = this.policies.findIndex((p) => p.id === policyId);
    if (index >= 0) {
      this.policies.splice(index, 1);
      return true;
    }
    return false;
  }

  evaluate(context: ABACContext): PolicyEvaluationResult {
    const matchedPolicies: AuthorizationPolicy[] = [];
    const obligations: string[] = [];
    const advice: string[] = [];

    for (const policy of this.policies) {
      if (policy.enabled === false) continue;

      if (this.matchPolicy(policy, context)) {
        matchedPolicies.push(policy);
        if (policy.obligations) {
          obligations.push(...policy.obligations);
        }

        if (policy.effect === "DENY") {
          return {
            decision: "DENY",
            matchedPolicies,
            obligations,
            advice,
          };
        }
      }
    }

    // Default deny if no explicit permit
    if (matchedPolicies.some((p) => p.effect === "PERMIT")) {
      return {
        decision: "PERMIT",
        matchedPolicies,
        obligations,
        advice,
      };
    }

    return {
      decision: "DENY",
      matchedPolicies,
      obligations,
      advice: ["No matching permit policy found"],
    };
  }

  private matchPolicy(policy: AuthorizationPolicy, context: ABACContext): boolean {
    return (
      this.matchSubject(policy.subject, context.subject) &&
      this.matchResource(policy.resource, context.resource) &&
      this.matchAction(policy.action, context.action) &&
      (!policy.environment || this.matchEnvironment(policy.environment, context.environment)) &&
      (!policy.attributes || this.matchAttributes(policy.attributes, context.attributes))
    );
  }

  private matchSubject(matcher: PolicyMatcher<UniversalActor>, subject: UniversalActor): boolean {
    return this.matchObject(matcher, subject);
  }

  private matchResource(matcher: PolicyMatcher<ResourceIdentifier>, resource: ResourceIdentifier): boolean {
    return this.matchObject(matcher, resource);
  }

  private matchAction(matcher: ActionMatcher, action: PermissionAction): boolean {
    if (matcher.equals && matcher.equals !== action) return false;
    if (matcher.in && !matcher.in.includes(action)) return false;
    if (matcher.notIn && matcher.notIn.includes(action)) return false;
    if (matcher.all && !matcher.all.every((m) => this.matchAction(m, action))) return false;
    if (matcher.any && !matcher.any.some((m) => this.matchAction(m, action))) return false;
    return true;
  }

  private matchEnvironment(
    matcher: PolicyMatcher<ABACContext["environment"]>,
    environment: ABACContext["environment"]
  ): boolean {
    return this.matchObject(matcher, environment);
  }

  private matchAttributes(
    matcher: PolicyMatcher<Record<string, unknown>>,
    attributes: Record<string, unknown>
  ): boolean {
    return this.matchObject(matcher, attributes);
  }

  private matchObject<T>(matcher: PolicyMatcher<T>, obj: object): boolean {
    const record = obj as Record<string, unknown>;
    // Exact match
    if (matcher.equals) {
      for (const [key, value] of Object.entries(matcher.equals)) {
        if (record[key] !== value) return false;
      }
    }

    // In
    if (matcher.in) {
      const inMatcher = matcher.in as Record<string, unknown[] | undefined>;
      for (const [key, values] of Object.entries(inMatcher)) {
        if (!values || !values.includes(record[key])) return false;
      }
    }

    // Not in
    if (matcher.notIn) {
      const notInMatcher = matcher.notIn as Record<string, unknown[] | undefined>;
      for (const [key, values] of Object.entries(notInMatcher)) {
        if (values && values.includes(record[key])) return false;
      }
    }

    // All (AND)
    if (matcher.all) {
      for (const subMatcher of matcher.all) {
        if (!this.matchObject(subMatcher, obj)) return false;
      }
    }

    // Any (OR)
    if (matcher.any) {
      let matched = false;
      for (const subMatcher of matcher.any) {
        if (this.matchObject(subMatcher, obj)) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }

    return true;
  }
}

/** Permission checker — main entry point for authorization */
export class PermissionChecker {
  private policyEngine: PolicyEngine;
  private rolePermissionCache: Map<string, RolePermissionSet> = new Map();

  constructor(policyEngine?: PolicyEngine) {
    this.policyEngine = policyEngine || new PolicyEngine();
    this.loadDefaultPolicies();
  }

  private loadDefaultPolicies(): void {
    // Platform owner policy
    this.policyEngine.addPolicy({
      id: "platform-owner-all",
      name: "Platform Root Owner Full Access",
      effect: "PERMIT",
      subject: { equals: { type: "HUMAN" } }, // Will be refined by role check
      resource: { equals: {} },
      action: { equals: "admin" },
      priority: 1000,
      enabled: true,
      createdBy: "system",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Deny by default for critical actions without explicit permit
    this.policyEngine.addPolicy({
      id: "default-deny-critical",
      name: "Default Deny for Critical Actions",
      effect: "DENY",
      subject: { equals: {} },
      resource: { equals: {} },
      action: { in: ["delete", "admin", "approve"] },
      priority: 100,
      enabled: true,
      createdBy: "system",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  /** Check if actor has permission */
  async check(request: PermissionCheckRequest): Promise<PolicyDecision> {
    // Get actor context
    const actor = await this.getActor(request.actorId);
    if (!actor) {
      return { allowed: false, reason: "Actor not found" };
    }

    // Check direct permissions
    const effective = await this.getEffectivePermissions(actor.id, request.resource?.organizationId);
    if (this.hasPermission(effective.permissions, request.permission)) {
      return { allowed: true };
    }

    // Check wildcards
    if (this.hasWildcardPermission(effective.wildcards, request.permission)) {
      return { allowed: true };
    }

    // ABAC evaluation
    if (request.context) {
      const abacContext: ABACContext = {
        subject: actor,
        resource: request.resource || { type: "unknown", id: "unknown" },
        action: this.extractAction(request.permission),
        environment: request.context.environment || {
          timeOfDay: new Date().getHours(),
          dayOfWeek: new Date().getDay(),
        },
        attributes: request.context.attributes || {},
      };

      const result = this.policyEngine.evaluate(abacContext);
      if (result.decision === "PERMIT") {
        return { allowed: true };
      }
    }

    return { allowed: false, reason: `Permission denied: ${request.permission}` };
  }

  /** Batch check permissions */
  async batchCheck(request: BatchPermissionCheckRequest): Promise<BatchPermissionCheckResult> {
    const results: Record<string, PolicyDecision> = {};
    let allAllowed = true;

    for (const permission of request.permissions) {
      const result = await this.check({
        actorId: request.actorId,
        permission,
        resource: request.resource,
        context: request.context,
      });
      results[permission] = result;
      if (!result.allowed) allAllowed = false;
    }

    return { results, allAllowed };
  }

  /** Get effective permissions for actor in organization context */
  async getEffectivePermissions(
    actorId: string,
    organizationId?: string
  ): Promise<EffectivePermissions> {
    // TODO: Implement with actual data source
    // This would query roles, memberships, custom roles, etc.
    return {
      actorId,
      contextType: organizationId ? "ORGANIZATION" : "PERSONAL",
      contextId: organizationId || "personal",
      permissions: [],
      wildcards: [],
      capabilities: [],
      dataScopes: [],
      roles: [],
      computedAt: new Date().toISOString(),
    };
  }

  private hasPermission(permissions: string[], required: string): boolean {
    if (!permissions || permissions.length === 0) return false;
    if (permissions.includes("*")) return true;
    if (permissions.includes(required)) return true;

    const [mod] = required.split(".");
    if (permissions.includes(`${mod}.*`)) return true;
    if (permissions.includes(`${mod}.manage`) || permissions.includes(`${mod}.admin`)) return true;

    return false;
  }

  private hasWildcardPermission(wildcards: string[], required: string): boolean {
    for (const wc of wildcards) {
      if (wc === "*") return true;
      if (wc.endsWith(".*")) {
        const module = wc.slice(0, -2);
        if (required.startsWith(`${module}.`)) return true;
      }
    }
    return false;
  }

  private extractAction(permission: string): PermissionAction {
    const parts = permission.split(".");
    return parts[parts.length - 1] as PermissionAction;
  }

  private async getActor(actorId: string): Promise<UniversalActor | null> {
    // TODO: Implement with actual data source
    return null;
  }
}

/** Default policy engine instance */
export const defaultPolicyEngine = new PolicyEngine();
export const defaultPermissionChecker = new PermissionChecker(defaultPolicyEngine);