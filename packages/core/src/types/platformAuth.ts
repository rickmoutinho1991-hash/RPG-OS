/**
 * RPG-OS — Platform Root Owner & Admin Foundation
 *
 * ROOT_OWNER is the ultimate authority. Protected against privilege escalation.
 * Platform admins/sub-users are managed by ROOT_OWNER only.
 */

import type { UniversalActor, HumanActor, ActorType, ActorCapability } from "./actor";

/** Platform-specific actor types */
export type PlatformActorType =
  | "PLATFORM_ROOT_OWNER"
  | "PLATFORM_ADMIN"
  | "PLATFORM_MANAGER"
  | "PLATFORM_ACCOUNTANT"
  | "PLATFORM_LAWYER"
  | "PLATFORM_FINANCE"
  | "PLATFORM_SUPPORT"
  | "PLATFORM_MODERATOR"
  | "PLATFORM_OPERATIONS"
  | "PLATFORM_TECHNICAL"
  | "PLATFORM_AUDITOR";

/** Platform role definition */
export interface PlatformRoleDefinition {
  key: PlatformActorType;
  label: string;
  description: string;
  level: number; // 0 = ROOT_OWNER, higher = less privilege
  permissions: string[];
  /** Capabilities this role grants */
  capabilities: string[];
  /** Whether this role can manage other platform roles */
  canManageRoles: boolean;
  /** Maximum role level this role can assign (must be >= own level) */
  maxAssignableLevel: number;
  /** Whether this role can create sub-users */
  canCreateSubUsers: boolean;
}

/** Built-in platform roles */
export const PLATFORM_ROLES: Record<PlatformActorType, PlatformRoleDefinition> = {
  PLATFORM_ROOT_OWNER: {
    key: "PLATFORM_ROOT_OWNER",
    label: "Proprietário da Plataforma",
    description: "Autoridade máxima. Pode gerir tudo, incluindo outros ROOT_OWNER (não implementado — apenas um).",
    level: 0,
    permissions: ["*"],
    capabilities: ["*"],
    canManageRoles: true,
    maxAssignableLevel: 0,
    canCreateSubUsers: true,
  },
  PLATFORM_ADMIN: {
    key: "PLATFORM_ADMIN",
    label: "Administrador da Plataforma",
    description: "Gestão completa da plataforma, exceto criar/promover/remover ROOT_OWNER.",
    level: 1,
    permissions: [
      "platform.admin",
      "platform.users.manage",
      "platform.organizations.manage",
      "platform.config.manage",
      "platform.audit.read",
      "platform.metrics.read",
      "platform.billing.manage",
      "platform.security.manage",
    ],
    capabilities: [
      "platform.manage_users",
      "platform.manage_organizations",
      "platform.manage_config",
      "platform.view_audit",
      "platform.view_metrics",
      "platform.manage_billing",
      "platform.manage_security",
    ],
    canManageRoles: true,
    maxAssignableLevel: 1,
    canCreateSubUsers: true,
  },
  PLATFORM_MANAGER: {
    key: "PLATFORM_MANAGER",
    label: "Gestor da Plataforma",
    description: "Gestão operacional de organizações, utilizadores e configurações não-críticas.",
    level: 2,
    permissions: [
      "platform.organizations.manage",
      "platform.users.read",
      "platform.config.read",
      "platform.audit.read",
      "platform.metrics.read",
    ],
    capabilities: [
      "platform.manage_organizations",
      "platform.view_users",
      "platform.view_config",
      "platform.view_audit",
      "platform.view_metrics",
    ],
    canManageRoles: false,
    maxAssignableLevel: 2,
    canCreateSubUsers: true,
  },
  PLATFORM_ACCOUNTANT: {
    key: "PLATFORM_ACCOUNTANT",
    label: "Contabilista da Plataforma",
    description: "Acesso a faturação, relatórios financeiros, SAF-T e reconciliação.",
    level: 3,
    permissions: [
      "platform.billing.read",
      "platform.billing.export",
      "platform.reports.financial",
      "platform.revenue.read",
      "platform.revenue.manage",
      "platform.audit.read",
    ],
    capabilities: [
      "platform.view_billing",
      "platform.export_billing",
      "platform.view_financial_reports",
      "platform.manage_revenue",
      "platform.view_audit",
    ],
    canManageRoles: false,
    maxAssignableLevel: 3,
    canCreateSubUsers: false,
  },
  PLATFORM_LAWYER: {
    key: "PLATFORM_LAWYER",
    label: "Jurista da Plataforma",
    description: "Acesso a contratos, disputas, auditoria, compliance e LGPD.",
    level: 3,
    permissions: [
      "platform.contracts.read",
      "platform.contracts.manage",
      "platform.disputes.manage",
      "platform.audit.read",
      "platform.compliance.manage",
      "platform.rgpd.manage",
    ],
    capabilities: [
      "platform.view_contracts",
      "platform.manage_contracts",
      "platform.manage_disputes",
      "platform.view_audit",
      "platform.manage_compliance",
      "platform.manage_rgpd",
    ],
    canManageRoles: false,
    maxAssignableLevel: 3,
    canCreateSubUsers: false,
  },
  PLATFORM_FINANCE: {
    key: "PLATFORM_FINANCE",
    label: "Finanças da Plataforma",
    description: "Gestão de pagamentos, taxas, reconciliação e relatórios de receita.",
    level: 3,
    permissions: [
      "platform.payments.manage",
      "platform.platform_fees.manage",
      "platform.revenue.manage",
      "platform.reports.financial",
      "platform.audit.read",
    ],
    capabilities: [
      "platform.manage_payments",
      "platform.manage_fees",
      "platform.manage_revenue",
      "platform.view_financial_reports",
      "platform.view_audit",
    ],
    canManageRoles: false,
    maxAssignableLevel: 3,
    canCreateSubUsers: false,
  },
  PLATFORM_SUPPORT: {
    key: "PLATFORM_SUPPORT",
    label: "Suporte da Plataforma",
    description: "Acesso a tickets, utilizadores (leitura), organizações (leitura) para suporte.",
    level: 4,
    permissions: [
      "platform.users.read",
      "platform.organizations.read",
      "platform.tickets.manage",
      "platform.audit.read",
    ],
    capabilities: [
      "platform.view_users",
      "platform.view_organizations",
      "platform.manage_tickets",
      "platform.view_audit",
    ],
    canManageRoles: false,
    maxAssignableLevel: 4,
    canCreateSubUsers: false,
  },
  PLATFORM_MODERATOR: {
    key: "PLATFORM_MODERATOR",
    label: "Moderador da Plataforma",
    description: "Moderação de conteúdo, reputação, denúncias e disputas.",
    level: 4,
    permissions: [
      "platform.content.moderate",
      "platform.reputation.moderate",
      "platform.reports.manage",
      "platform.disputes.read",
      "platform.audit.read",
    ],
    capabilities: [
      "platform.moderate_content",
      "platform.moderate_reputation",
      "platform.manage_reports",
      "platform.view_disputes",
      "platform.view_audit",
    ],
    canManageRoles: false,
    maxAssignableLevel: 4,
    canCreateSubUsers: false,
  },
  PLATFORM_OPERATIONS: {
    key: "PLATFORM_OPERATIONS",
    label: "Operações da Plataforma",
    description: "Gestão de workflows, aprovações, SLA e monitorização operacional.",
    level: 3,
    permissions: [
      "platform.workflows.manage",
      "platform.approvals.manage",
      "platform.sla.manage",
      "platform.monitoring.read",
      "platform.audit.read",
    ],
    capabilities: [
      "platform.manage_workflows",
      "platform.manage_approvals",
      "platform.manage_sla",
      "platform.view_monitoring",
      "platform.view_audit",
    ],
    canManageRoles: false,
    maxAssignableLevel: 3,
    canCreateSubUsers: false,
  },
  PLATFORM_TECHNICAL: {
    key: "PLATFORM_TECHNICAL",
    label: "Técnico da Plataforma",
    description: "Acesso a infraestrutura, logs, deploy, integrações e debugging.",
    level: 2,
    permissions: [
      "platform.infra.manage",
      "platform.deploy.manage",
      "platform.integrations.manage",
      "platform.logs.read",
      "platform.debug.read",
      "platform.audit.read",
    ],
    capabilities: [
      "platform.manage_infra",
      "platform.manage_deploy",
      "platform.manage_integrations",
      "platform.view_logs",
      "platform.view_debug",
      "platform.view_audit",
    ],
    canManageRoles: false,
    maxAssignableLevel: 2,
    canCreateSubUsers: false,
  },
  PLATFORM_AUDITOR: {
    key: "PLATFORM_AUDITOR",
    label: "Auditor da Plataforma",
    description: "Acesso apenas de leitura a auditoria, logs, métricas e compliance.",
    level: 3,
    permissions: [
      "platform.audit.read",
      "platform.logs.read",
      "platform.metrics.read",
      "platform.compliance.read",
      "platform.security.read",
    ],
    capabilities: [
      "platform.view_audit",
      "platform.view_logs",
      "platform.view_metrics",
      "platform.view_compliance",
      "platform.view_security",
    ],
    canManageRoles: false,
    maxAssignableLevel: 3,
    canCreateSubUsers: false,
  },
};

/** Platform sub-user — managed by ROOT_OWNER/ADMIN */
export interface PlatformSubUser {
  id: string;
  /** The human actor */
  actorId: string;
  /** Platform role */
  role: PlatformActorType;
  /** Created by (ROOT_OWNER or ADMIN) */
  createdBy: string;
  /** Creation timestamp */
  createdAt: string;
  /** Status */
  status: "ACTIVE" | "SUSPENDED" | "REMOVED";
  /** Suspension reason */
  suspensionReason?: string;
  /** Valid until (for temporary access) */
  validUntil?: string;
  /** Scopes/permissions override */
  permissionsOverride?: string[];
  /** Capabilities override */
  capabilitiesOverride?: string[];
  /** Notes */
  notes?: string;
}

/** Root Owner protection utilities */
export class RootOwnerProtection {
  private static readonly ROOT_OWNER_KEY = "PLATFORM_ROOT_OWNER";
  private static rootOwnerId: string | null = null;

  /** Set the Root Owner ID (called once at startup) */
  static setRootOwnerId(userId: string): void {
    if (this.rootOwnerId !== null && this.rootOwnerId !== userId) {
      throw new Error("ROOT_OWNER already set and cannot be changed");
    }
    this.rootOwnerId = userId;
  }

  /** Reset state — FOR TESTING ONLY */
  static _resetForTesting(): void {
    this.rootOwnerId = null;
  }

  /** Get the Root Owner ID */
  static getRootOwnerId(): string | null {
    return this.rootOwnerId;
  }

  /** Check if a user is the Root Owner */
  static isRootOwner(userId: string): boolean {
    return this.rootOwnerId === userId;
  }

  /** Validate that an action is allowed for the actor */
  static validateAction(
    actorId: string,
    actorRole: PlatformActorType,
    action: "CREATE_ROOT_OWNER" | "PROMOTE_TO_ROOT_OWNER" | "REMOVE_ROOT_OWNER" | "CHANGE_ROOT_OWNER_IDENTITY" | "ASSIGN_ROLE_ABOVE" | "CREATE_ADMIN" | "MANAGE_PLATFORM_ROLES"
  ): { allowed: boolean; reason?: string } {
    const roleDef = PLATFORM_ROLES[actorRole];

    // Root Owner can do everything except create another Root Owner
    if (this.isRootOwner(actorId)) {
      if (action === "CREATE_ROOT_OWNER" || action === "PROMOTE_TO_ROOT_OWNER") {
        return { allowed: false, reason: "ROOT_OWNER cannot create or promote another ROOT_OWNER" };
      }
      return { allowed: true };
    }

    // Non-root checks
    switch (action) {
      case "CREATE_ROOT_OWNER":
      case "PROMOTE_TO_ROOT_OWNER":
      case "REMOVE_ROOT_OWNER":
      case "CHANGE_ROOT_OWNER_IDENTITY":
        return { allowed: false, reason: "Only ROOT_OWNER can manage ROOT_OWNER" };

      case "ASSIGN_ROLE_ABOVE":
        return { allowed: false, reason: "Cannot assign role above own level" };

      case "CREATE_ADMIN":
        if (!roleDef.canCreateSubUsers) {
          return { allowed: false, reason: "Role cannot create sub-users" };
        }
        if (roleDef.maxAssignableLevel > 1) {
          return { allowed: false, reason: "Cannot create ADMIN (level 1) from this level" };
        }
        return { allowed: true };

      case "MANAGE_PLATFORM_ROLES":
        if (!roleDef.canManageRoles) {
          return { allowed: false, reason: "Role cannot manage platform roles" };
        }
        return { allowed: true };

      default:
        return { allowed: true };
    }
  }

  /** Validate role assignment */
  static validateRoleAssignment(
    assignerRole: PlatformActorType,
    targetRole: PlatformActorType
  ): { allowed: boolean; reason?: string } {
    const assignerDef = PLATFORM_ROLES[assignerRole];
    const targetDef = PLATFORM_ROLES[targetRole];

    if (!assignerDef.canManageRoles) {
      return { allowed: false, reason: "Assigner role cannot manage roles" };
    }

    if (targetDef.level < assignerDef.maxAssignableLevel) {
      return { allowed: false, reason: `Cannot assign role ${targetRole} (level ${targetDef.level}) — max assignable level is ${assignerDef.maxAssignableLevel}` };
    }

    if (targetRole === this.ROOT_OWNER_KEY) {
      return { allowed: false, reason: "Cannot assign ROOT_OWNER role" };
    }

    return { allowed: true };
  }

  /** Get all roles assignable by a given role */
  static getAssignableRoles(assignerRole: PlatformActorType): PlatformActorType[] {
    const assignerDef = PLATFORM_ROLES[assignerRole];
    if (!assignerDef.canManageRoles) return [];

    return Object.values(PLATFORM_ROLES)
      .filter((r) => r.level >= assignerDef.maxAssignableLevel && r.key !== this.ROOT_OWNER_KEY)
      .map((r) => r.key);
  }
}

/** Platform admin repository — persistence boundary for platform sub-users */
export interface PlatformAdminRepository {
  getPlatformUser(subUserId: string): PlatformSubUser | undefined;
  findPlatformUserByActor(actorId: string): PlatformSubUser | undefined;
  savePlatformUser(subUser: PlatformSubUser): void;
  updatePlatformUser(subUser: PlatformSubUser): void;
  listPlatformUsers(): PlatformSubUser[];
}

/** In-memory platform admin repository (default). Replace via setPlatformAdminRepository(). */
export class InMemoryPlatformAdminRepository implements PlatformAdminRepository {
  private users = new Map<string, PlatformSubUser>();
  private actorIndex = new Map<string, string>();

  getPlatformUser(subUserId: string): PlatformSubUser | undefined {
    return this.users.get(subUserId);
  }

  findPlatformUserByActor(actorId: string): PlatformSubUser | undefined {
    const id = this.actorIndex.get(actorId);
    if (!id) return undefined;
    return this.users.get(id);
  }

  savePlatformUser(subUser: PlatformSubUser): void {
    this.users.set(subUser.id, subUser);
    this.actorIndex.set(subUser.actorId, subUser.id);
  }

  updatePlatformUser(subUser: PlatformSubUser): void {
    const existing = this.users.get(subUser.id);
    if (!existing) throw new Error(`Platform sub-user ${subUser.id} not found`);
    this.users.set(subUser.id, subUser);
    this.actorIndex.set(subUser.actorId, subUser.id);
  }

  listPlatformUsers(): PlatformSubUser[] {
    return Array.from(this.users.values());
  }
}

let adminRepository: PlatformAdminRepository = new InMemoryPlatformAdminRepository();

/** Set the platform admin persistence backend (e.g. Supabase at boot) */
export function setPlatformAdminRepository(repository: PlatformAdminRepository): void {
  adminRepository = repository;
}

/** Current platform admin persistence backend */
export function getPlatformAdminRepository(): PlatformAdminRepository {
  return adminRepository;
}

/** Platform Admin/Sub-user management */
export class PlatformUserManager {
  /** Bootstrap the single ROOT_OWNER (first run). Throws if already registered. */
  static async bootstrapRootOwner(actorId: string): Promise<PlatformSubUser> {
    if (RootOwnerProtection.getRootOwnerId() !== null) {
      throw new Error("ROOT_OWNER already set and cannot be changed");
    }
    if (adminRepository.findPlatformUserByActor(actorId)) {
      throw new Error("Actor is already a platform user");
    }
    RootOwnerProtection.setRootOwnerId(actorId);
    const root: PlatformSubUser = {
      id: crypto.randomUUID(),
      actorId,
      role: "PLATFORM_ROOT_OWNER",
      createdBy: "SYSTEM",
      createdAt: new Date().toISOString(),
      status: "ACTIVE",
    };
    adminRepository.savePlatformUser(root);
    return root;
  }

  /** Create a platform sub-user (only ROOT_OWNER or privileged roles) */
  static async createSubUser(
    input: {
      actorId: string;
      role: PlatformActorType;
      createdBy: string;
      validUntil?: string;
      permissionsOverride?: string[];
      capabilitiesOverride?: string[];
      notes?: string;
    }
  ): Promise<{ allowed: boolean; subUser?: PlatformSubUser; reason?: string }> {
    const roleDef = PLATFORM_ROLES[input.role];
    if (!roleDef) {
      return { allowed: false, reason: "Invalid platform role" };
    }
    if (input.role === "PLATFORM_ROOT_OWNER") {
      return { allowed: false, reason: "Cannot create another ROOT_OWNER" };
    }
    const assignerRole = await this.getActorRole(input.createdBy);
    if (!assignerRole) {
      return { allowed: false, reason: "Unknown creator actor" };
    }
    const assignerDef = PLATFORM_ROLES[assignerRole];
    if (!assignerDef.canCreateSubUsers) {
      return { allowed: false, reason: "Role cannot create sub-users" };
    }
    if (roleDef.level < assignerDef.maxAssignableLevel) {
      return {
        allowed: false,
        reason: `Cannot assign role ${input.role} (level ${roleDef.level}) — max assignable level is ${assignerDef.maxAssignableLevel}`,
      };
    }
    if (adminRepository.findPlatformUserByActor(input.actorId)) {
      return { allowed: false, reason: "Actor is already a platform sub-user" };
    }

    const subUser: PlatformSubUser = {
      id: crypto.randomUUID(),
      actorId: input.actorId,
      role: input.role,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      status: "ACTIVE",
      validUntil: input.validUntil,
      permissionsOverride: input.permissionsOverride,
      capabilitiesOverride: input.capabilitiesOverride,
      notes: input.notes,
    };

    adminRepository.savePlatformUser(subUser);
    return { allowed: true, subUser };
  }

  /** Find a platform sub-user by actor id */
  static findPlatformUserByActor(actorId: string): PlatformSubUser | undefined {
    return adminRepository.findPlatformUserByActor(actorId);
  }

  /** Get actor's platform role from the repository (no dangerous defaults) */
  private static async getActorRole(actorId: string): Promise<PlatformActorType | undefined> {
    const assigned = adminRepository.findPlatformUserByActor(actorId);
    if (!assigned || assigned.status !== "ACTIVE") return undefined;
    return assigned.role;
  }

  /** Whether an actor can manage (suspend/remove) a target sub-user */
  private static canManageTarget(
    managerRole: PlatformActorType,
    targetRole: PlatformActorType
  ): { allowed: boolean; reason?: string } {
    if (targetRole === "PLATFORM_ROOT_OWNER") {
      return { allowed: false, reason: "Cannot manage ROOT_OWNER" };
    }
    const managerDef = PLATFORM_ROLES[managerRole];
    const targetDef = PLATFORM_ROLES[targetRole];
    if (!managerDef.canManageRoles && !managerDef.canCreateSubUsers) {
      return { allowed: false, reason: "Role cannot manage platform sub-users" };
    }
    if (targetDef.level < managerDef.maxAssignableLevel) {
      return {
        allowed: false,
        reason: `Cannot manage role ${targetRole} (level ${targetDef.level}) — max assignable level is ${managerDef.maxAssignableLevel}`,
      };
    }
    return { allowed: true };
  }

  /** Suspend a sub-user (management requires a role that can govern the target) */
  static async suspendSubUser(
    subUserId: string,
    suspendedBy: string,
    reason: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const target = adminRepository.getPlatformUser(subUserId);
    if (!target) {
      return { allowed: false, reason: "Sub-user not found" };
    }
    const suspendedByRole = await this.getActorRole(suspendedBy);
    if (!suspendedByRole) {
      return { allowed: false, reason: "Unknown suspendedBy actor" };
    }
    const v = PlatformUserManager.canManageTarget(suspendedByRole, target.role);
    if (!v.allowed) {
      return { allowed: false, reason: v.reason };
    }
    adminRepository.updatePlatformUser({ ...target, status: "SUSPENDED", suspensionReason: reason });
    return { allowed: true };
  }

  /** Remove a sub-user (management requires a role that can govern the target) */
  static async removeSubUser(
    subUserId: string,
    removedBy: string
  ): Promise<{ allowed: boolean; subUser?: PlatformSubUser; reason?: string }> {
    const target = adminRepository.getPlatformUser(subUserId);
    if (!target) {
      return { allowed: false, reason: "Sub-user not found" };
    }
    const removedByRole = await this.getActorRole(removedBy);
    if (!removedByRole) {
      return { allowed: false, reason: "Unknown removedBy actor" };
    }
    const v = PlatformUserManager.canManageTarget(removedByRole, target.role);
    if (!v.allowed) {
      return { allowed: false, reason: v.reason };
    }
    const updated = { ...target, status: "REMOVED" as const };
    adminRepository.updatePlatformUser(updated);
    return { allowed: true, subUser: updated };
  }
}