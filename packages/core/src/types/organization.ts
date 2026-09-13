/**
 * RPG-OS — Tipos do modelo de identidade e organizações.
 * USER → PROFILE → ORGANIZATION → DEPARTMENT → TEAM → ROLE → PERMISSIONS
 */

export type MemberStatus = "ACTIVE" | "INVITED" | "SUSPENDED" | "REMOVED";

export type OrgRoleScope = "ORGANIZATION" | "DEPARTMENT" | "TEAM";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  legalName?: string;
  taxNumber?: string;
  planTier?: string;
  createdAt: string;
}

export interface Department {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
}

export interface Team {
  id: string;
  organizationId: string;
  departmentId?: string;
  name: string;
}

/** Membro de uma organização: cargo(s), departamento e equipas. */
export interface OrgMembership {
  id: string;
  organizationId: string;
  userId: string;
  roleKey: string;
  /** Cargo personalizado definido pela organização (sobrepõe roleKey se presente). */
  customRoleId?: string;
  departmentId?: string;
  status: MemberStatus;
  isPrimary?: boolean;
  title?: string;
  permissionsOverride?: string[];
  validFrom?: string;
  validUntil?: string;
}

export interface CustomRole {
  id: string;
  organizationId: string;
  key: string;
  label: string;
  permissions: string[];
  scope?: OrgRoleScope;
}

/** Contexto de sessão enriquecido — usado por toda a aplicação. */
export interface SessionContext {
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string;
  };
  /** Organização ativa (null = contexto pessoal). */
  organization: Pick<Organization, "id" | "name" | "slug" | "taxNumber"> | null;
  membership: OrgMembership | null;
  /** Permissões efetivas = cargo base + overrides + wildcards. */
  permissions: string[];
  /** Perfis disponíveis para troca de contexto. */
  availableOrganizations: Array<Pick<Organization, "id" | "name" | "slug" | "taxNumber"> & { roleKey: string }>;
}
