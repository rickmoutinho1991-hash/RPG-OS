/**
 * RPG-OS Government Identity Model (FASE 10J-G)
 *
 * Unified identity model for Portuguese government interactions.
 * Supports individuals, companies, representatives, accountants, employees.
 * Critical for Portuguese companies where a user may act on behalf of multiple organizations.
 */

import type { GovernmentProviderId } from "./governmentIntegration";
import {
  formatPortugueseNif,
  formatPortuguesePostalCode,
  isValidPortuguesePostalCode,
} from "../../validation";

/** Identity types in Portuguese context */
export type GovernmentIdentityType =
  | "INDIVIDUAL"           // Pessoa singular (NIF)
  | "COMPANY"              // Pessoa coletiva / Empresa (NIPC)
  | "SOLE_TRADER"          // Empresário em nome individual
  | "PUBLIC_ENTITY"        // Entidade pública
  | "NON_PROFIT"           // Associação / Fundação / Condomínio
  | "HERITAGE";            // Herança indivisa

/** Role when acting on behalf of an organization */
export type GovernmentRepresentationRole =
  | "OWNER"                // Proprietário / Sócio gerente
  | "DIRECTOR"             // Diretor / Gerente
  | "ACCOUNTANT"           // Contabilista Certificado (TOC)
  | "EMPLOYEE"             // Funcionário com poderes
  | "REPRESENTATIVE"       // Representante legal
  | "DELEGATED"            // Poder delegado específico
  | "EXTERNAL_PROFESSIONAL"; // Advogado, Solicitador, etc.

/** Government identity verification status */
export type GovernmentIdentityStatus =
  | "UNVERIFIED"
  | "VERIFIED"
  | "PENDING_VERIFICATION"
  | "VERIFICATION_FAILED"
  | "REVOKED"
  | "EXPIRED";

/** Government identity document */
export interface GovernmentIdentity {
  id: string;
  user_id: string;
  identity_type: GovernmentIdentityType;
  /** NIF/NIPC do titular da identidade */
  tax_number: string;
  /** Nome completo / Razão social */
  legal_name: string;
  /** Nome comercial (se diferente) */
  trade_name?: string;
  /** CAE - Código de Atividade Económica */
  cae_code?: string;
  /** Endereço fiscal */
  fiscal_address: GovernmentAddress;
  /** Contactos */
  contacts: GovernmentContacts;
  /** Status de verificação */
  verification_status: GovernmentIdentityStatus;
  /** Método de verificação */
  verification_method?: "AUTENTICACAO_GOV" | "CMD" | "CARTAO_CIDADAO" | "MANUAL" | "AT_VALIDATION";
  /** Data de verificação */
  verified_at?: string;
  /** Expiração da verificação */
  verification_expires_at?: string;
  /** Metadados adicionais */
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Endereço fiscal português */
export interface GovernmentAddress {
  /** Rua */
  street: string;
  /** Número */
  number?: string;
  /** Complemento */
  complement?: string;
  /** Código postal (XXXX-XXX) */
  postal_code: string;
  /** Localidade */
  locality: string;
  /** Distrito */
  district: string;
  /** Concelho */
  municipality: string;
  /** País (PT) */
  country: string;
  /** Região fiscal (CONTINENT, AZORES, MADEIRA) */
  vat_region?: "CONTINENT" | "AZORES" | "MADEIRA";
}

/** Contactos para notificações governamentais */
export interface GovernmentContacts {
  /** Email principal */
  email?: string;
  /** Telefone principal */
  phone?: string;
  /** Telemóvel (para CMD) */
  mobile?: string;
  /** Email para notificações AT */
  at_notifications_email?: string;
  /** Email para notificações Segurança Social */
  ss_notifications_email?: string;
}

/** Representação de organização por um utilizador */
export interface GovernmentRepresentation {
  id: string;
  user_id: string;
  organization_id: string;
  /** Identidade governativa utilizada */
  identity_id: string;
  /** Papel na organização */
  role: GovernmentRepresentationRole;
  /** Poderes delegados */
  delegated_powers: GovernmentDelegatedPower[];
  /** Fonte da autorização */
  authorization_source: "STATUTORY" | "CONTRACT" | "POWER_OF_ATTORNEY" | "DELEGATION" | "EMPLOYMENT" | "PROFESSIONAL_MANDATE";
  /** Referência do documento de autorização */
  authorization_reference?: string;
  /** Data de início */
  valid_from: string;
  /** Data de fim (se aplicável) */
  valid_until?: string;
  /** Status */
  status: "ACTIVE" | "SUSPENDED" | "REVOKED" | "EXPIRED";
  /** Metadados */
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Poderes delegados específicos */
export type GovernmentDelegatedPower =
  | "SUBMIT_INVOICES"           // Submeter faturas
  | "CANCEL_INVOICES"           // Anular faturas
  | "QUERY_INVOICES"            // Consultar faturas
  | "EXPORT_SAFT"               // Exportar SAF-T
  | "SUBMIT_DECLARATIONS"       // Submeter declarações (IVA, IRS, etc.)
  | "QUERY_OBLIGATIONS"         // Consultar obrigações fiscais
  | "MANAGE_PAYMENTS"           // Gerir pagamentos/referências
  | "MANAGE_REPRESENTATIONS"    // Gerir representações
  | "CONFIGURE_INTEGRATIONS"    // Configurar integrações
  | "VIEW_AUDIT_LOG"            // Ver log de auditoria
  | "MANAGE_CONSENTS";          // Gerir consentimentos

/** Permissão efetiva do utilizador numa organização */
export interface EffectiveGovernmentPermission {
  user_id: string;
  organization_id: string;
  identity_id: string;
  representation_id: string;
  powers: GovernmentDelegatedPower[];
  provider_access: Record<GovernmentProviderId, {
    connected: boolean;
    scopes: string[];
    environment: string;
  }>;
  valid_from: string;
  valid_until?: string;
}

/** Contexto de organização ativa para government operations */
export interface GovernmentOrganizationContext {
  organization_id: string;
  organization_name: string;
  organization_nif: string;
  user_identity: GovernmentIdentity;
  user_representation: GovernmentRepresentation;
  effective_permissions: GovernmentDelegatedPower[];
  active_connections: Record<GovernmentProviderId, {
    connected: boolean;
    environment: string;
    scopes: string[];
    status: string;
  }>;
  consents: Record<GovernmentProviderId, {
    granted: boolean;
    scopes: string[];
    expires_at?: string;
  }>;
}

/** Tipo de entidade para efeitos fiscais */
export type FiscalEntityType =
  | "INDIVIDUAL"
  | "COMPANY"
  | "SOLE_TRADER"
  | "PUBLIC_ENTITY"
  | "NON_PROFIT"
  | "HERITAGE";

/** Map NIF prefix to entity type */
export const NIF_PREFIX_TO_ENTITY_TYPE: Record<string, FiscalEntityType> = {
  "1": "INDIVIDUAL",
  "2": "INDIVIDUAL",
  "3": "INDIVIDUAL",
  "4": "SOLE_TRADER",
  "5": "COMPANY",
  "6": "PUBLIC_ENTITY",
  "7": "HERITAGE",
  "8": "COMPANY",
  "9": "NON_PROFIT",
};

/** Validate Portuguese NIF and determine entity type */
export function classifyPortugueseTaxNumber(nif: string): { valid: boolean; entity_type?: FiscalEntityType; error?: string } {
  const clean = nif.replace(/\s/g, "");

  if (!/^\d{9}$/.test(clean)) {
    return { valid: false, error: "NIF must have exactly 9 digits" };
  }

  const firstDigit = clean[0];
  const entityType = NIF_PREFIX_TO_ENTITY_TYPE[firstDigit];

  if (!entityType) {
    return { valid: false, error: `Invalid NIF prefix: ${firstDigit}` };
  }

  // Module 11 checksum validation
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += parseInt(clean[i], 10) * (9 - i);
  }
  const remainder = sum % 11;
  const checkDigit = remainder < 2 ? 0 : 11 - remainder;

  if (checkDigit !== parseInt(clean[8], 10)) {
    return { valid: false, error: "Invalid NIF checksum" };
  }

  return { valid: true, entity_type: entityType };
}



/** Get VAT region from postal code */
export function getVatRegionFromPostalCode(postalCode: string): "CONTINENT" | "AZORES" | "MADEIRA" {
  const clean = postalCode.replace(/\D/g, "");
  if (clean.length !== 7) return "CONTINENT";

  const district = parseInt(clean.slice(0, 2), 10);

  // Açores districts: 95, 96, 97, 98, 99
  if (district >= 95 && district <= 99) return "AZORES";

  // Madeira districts: 90, 91, 92, 93, 94
  if (district >= 90 && district <= 94) return "MADEIRA";

  return "CONTINENT";
}

/** Check if user can act on behalf of organization for government operations */
export function canUserActForOrganization(
  userId: string,
  organizationId: string,
  requiredPowers: GovernmentDelegatedPower[],
  representations: GovernmentRepresentation[]
): { allowed: boolean; representation?: GovernmentRepresentation; missingPowers?: GovernmentDelegatedPower[] } {
  const now = new Date();

  for (const rep of representations) {
    if (rep.user_id !== userId) continue;
    if (rep.organization_id !== organizationId) continue;
    if (rep.status !== "ACTIVE") continue;
    if (rep.valid_until && new Date(rep.valid_until) < now) continue;

    const missingPowers = requiredPowers.filter(p => !rep.delegated_powers.includes(p));
    if (missingPowers.length === 0) {
      return { allowed: true, representation: rep };
    }
  }

  return { allowed: false, missingPowers: requiredPowers };
}

/** Get effective permissions for user in organization */
export function getEffectiveGovernmentPermissions(
  userId: string,
  organizationId: string,
  identities: GovernmentIdentity[],
  representations: GovernmentRepresentation[],
  connections: Record<GovernmentProviderId, { connected: boolean; scopes: string[]; environment: string }>,
  consents: Record<GovernmentProviderId, { granted: boolean; scopes: string[]; expires_at?: string }>
): EffectiveGovernmentPermission {
  const now = new Date();

  // Find active representation
  const representation = representations.find(r =>
    r.user_id === userId &&
    r.organization_id === organizationId &&
    r.status === "ACTIVE" &&
    (!r.valid_until || new Date(r.valid_until) >= now)
  );

  if (!representation) {
    return {
      user_id: userId,
      organization_id: organizationId,
      identity_id: "",
      representation_id: "",
      powers: [],
      provider_access: {} as any,
      valid_from: now.toISOString(),
    };
  }

  // Find associated identity
  const identity = identities.find(i => i.id === representation.identity_id);

  // Build effective permissions
  const powers = representation.delegated_powers;

  // Build provider access
  const providerIds: GovernmentProviderId[] = ["AT", "EFATURA", "SEGURANCA_SOCIAL", "AUTENTICACAO_GOV", "CMD", "GOV_PT"];
  const providerAccess: Record<GovernmentProviderId, any> = {} as Record<GovernmentProviderId, any>;
  for (const providerId of providerIds) {
    providerAccess[providerId] = {
      connected: connections[providerId]?.connected ?? false,
      scopes: connections[providerId]?.scopes ?? [],
      environment: connections[providerId]?.environment ?? "development",
    };
  }

  return {
    user_id: userId,
    organization_id: organizationId,
    identity_id: identity?.id ?? "",
    representation_id: representation.id,
    powers,
    provider_access: providerAccess,
    valid_from: representation.valid_from,
    valid_until: representation.valid_until,
  };
}

/** Provider scope constants */
export const GOVERNMENT_SCOPES = {
  AT: {
    INVOICES_SUBMIT: "invoices.submit",
    INVOICES_READ: "invoices.read",
    INVOICES_CANCEL: "invoices.cancel",
    SAFT_EXPORT: "saft.export",
    WEBHOOKS: "webhooks",
  },
  EFATURA: {
    INVOICES_SUBMIT: "invoices.submit",
    INVOICES_READ: "invoices.read",
    INVOICES_CANCEL: "invoices.cancel",
    WEBHOOKS: "webhooks",
  },
  SEGURANCA_SOCIAL: {
    OBLIGATIONS_READ: "obligations.read",
    DECLARATIONS_SUBMIT: "declarations.submit",
    PAYMENTS_READ: "payments.read",
    WEBHOOKS: "webhooks",
  },
  AUTENTICACAO_GOV: {
    IDENTITY_READ: "identity.read",
    AUTHENTICATE: "authenticate",
    ORGANIZATION_REPRESENT: "organization.represent",
    SIGNING: "signing",
  },
  CMD: {
    IDENTITY_READ: "identity.read",
    AUTHENTICATE: "authenticate",
  },
  GOV_PT: {
    PROFILE_READ: "profile.read",
    NOTIFICATIONS_READ: "notifications.read",
  },
} as const;