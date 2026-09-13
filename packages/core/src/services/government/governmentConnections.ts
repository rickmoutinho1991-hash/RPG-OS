/**
 * RPG-OS Government Connections & Consent Model (FASE 10J-C, 10J-D)
 *
 * Secure connection management for government integrations.
 * Implements explicit consent records with audit trails.
 * All secrets abstracted - never stored in plaintext.
 */

import type { GovernmentConnectionConfig, GovernmentConsent, GovernmentProviderId, GovernmentEnvironment, GovernmentProviderStatus, GovernmentProviderType } from "./governmentIntegration";

export type { GovernmentConnectionConfig, GovernmentConsent };

/** Government connection entity for database */
export interface GovernmentConnection {
  id: string;
  organization_id: string;
  user_id: string;
  provider_id: GovernmentProviderId;
  environment: GovernmentEnvironment;
  scopes: string[];
  status: GovernmentProviderStatus;
  connected_at: string;
  expires_at?: string;
  last_sync_at?: string;
  last_error?: string;
  external_account_reference?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Government consent entity for database */
export interface GovernmentConsentRecord {
  id: string;
  organization_id: string;
  user_id: string;
  provider_id: GovernmentProviderId;
  scopes: string[];
  granted_at: string;
  expires_at?: string;
  revoked_at?: string;
  source: "USER" | "ADMIN" | "SYSTEM";
  audit_metadata: {
    ip?: string;
    user_agent?: string;
    session_id?: string;
  };
  created_at: string;
  updated_at: string;
}

/** Connection request from UI */
export interface CreateGovernmentConnectionRequest {
  provider_id: GovernmentProviderId;
  environment: GovernmentEnvironment;
  scopes: string[];
  /** Provider-specific configuration (credentials, certificates, etc.) */
  provider_config?: Record<string, unknown>;
}

/** Consent grant request from UI */
export interface GrantGovernmentConsentRequest {
  provider_id: GovernmentProviderId;
  scopes: string[];
  expires_at?: string;
}

/** Connection status response for UI */
export interface GovernmentConnectionStatusResponse {
  connection: GovernmentConnection;
  provider_metadata: {
    provider_id: GovernmentProviderId;
    name: string;
    description: string;
    capabilities: string[];
    documentation_url?: string;
  };
  can_submit_invoices: boolean;
  can_query_status: boolean;
  can_cancel: boolean;
  can_export: boolean;
}

/** Consent status response for UI */
export interface GovernmentConsentStatusResponse {
  consent: GovernmentConsentRecord | null;
  provider_metadata: {
    provider_id: GovernmentProviderId;
    name: string;
    required_scopes: string[];
    optional_scopes: string[];
  };
  can_revoke: boolean;
}

/** Available scopes for each provider */
export const GOVERNMENT_PROVIDER_SCOPES: Record<GovernmentProviderId, { required: string[]; optional: string[] }> = {
  AT: {
    required: ["invoices.submit", "invoices.read"],
    optional: ["invoices.cancel", "saft.export", "webhooks"],
  },
  EFATURA: {
    required: ["invoices.submit", "invoices.read"],
    optional: ["invoices.cancel", "webhooks"],
  },
  SEGURANCA_SOCIAL: {
    required: ["obligations.read"],
    optional: ["declarations.submit", "payments.read", "webhooks"],
  },
  AUTENTICACAO_GOV: {
    required: ["identity.read", "authenticate"],
    optional: ["organization.represent", "signing"],
  },
  CMD: {
    required: ["identity.read", "authenticate"],
    optional: [],
  },
  GOV_PT: {
    required: ["profile.read"],
    optional: ["notifications.read"],
  },
};

/** Provider display information */
export const GOVERNMENT_PROVIDER_DISPLAY: Record<GovernmentProviderId, {
  name: string;
  description: string;
  icon: string;
  color: string;
  documentation_url: string;
  sandbox_available: boolean;
  official_available: boolean;
}> = {
  AT: {
    name: "Autoridade Tributária",
    description: "Portal das Finanças - Submissão de faturas, SAF-T, consultas fiscais",
    icon: "🏛️",
    color: "#1e40af",
    documentation_url: "https://www.portaldasfinancas.gov.pt",
    sandbox_available: true,
    official_available: true,
  },
  EFATURA: {
    name: "e-Fatura",
    description: "Comunicação de faturas à AT (FT, FS, FR, NC, ND)",
    icon: "📄",
    color: "#059669",
    documentation_url: "https://www.portaldasfinancas.gov.pt/at/html/index.html",
    sandbox_available: true,
    official_available: true,
  },
  SEGURANCA_SOCIAL: {
    name: "Segurança Social Direta",
    description: "Declarações de remunerações, guias TSU, obrigações contributivas",
    icon: "🏥",
    color: "#dc2626",
    documentation_url: "https://www.seg-social.pt",
    sandbox_available: true,
    official_available: true,
  },
  AUTENTICACAO_GOV: {
    name: "Autenticação.gov",
    description: "Autenticação oficial do Estado Português (OAuth2/OIDC)",
    icon: "🔐",
    color: "#7c3aed",
    documentation_url: "https://www.autenticacao.gov.pt",
    sandbox_available: true,
    official_available: true,
  },
  CMD: {
    name: "Chave Móvel Digital",
    description: "Autenticação via telemóvel certificado pela AMA",
    icon: "📱",
    color: "#ea580c",
    documentation_url: "https://www.chavemoveldigital.gov.pt",
    sandbox_available: false,
    official_available: true,
  },
  GOV_PT: {
    name: "Gov.pt",
    description: "Portal único dos serviços públicos",
    icon: "🇵🇹",
    color: "#0891b2",
    documentation_url: "https://www.gov.pt",
    sandbox_available: false,
    official_available: true,
  },
};

/** Type for provider type display */
export const GOVERNMENT_PROVIDER_TYPE_DISPLAY: Record<GovernmentProviderType, {
  label: string;
  description: string;
  color: string;
  warning?: string;
}> = {
  FAKE: {
    label: "Simulação Local",
    description: "Apenas para desenvolvimento e testes locais. Não conecta a serviços reais.",
    color: "#6b7280",
    warning: "NÃO USE EM PRODUÇÃO",
  },
  SANDBOX: {
    label: "Ambiente de Testes (Sandbox)",
    description: "Ambiente oficial de testes do fornecedor. Dados não são reais.",
    color: "#f59e0b",
  },
  OFFICIAL: {
    label: "Integração Oficial",
    description: "Conexão direta ao serviço oficial. Requer credenciais válidas e certificação.",
    color: "#059669",
  },
  UNAVAILABLE: {
    label: "Indisponível",
    description: "Integração ainda não implementada ou indisponível.",
    color: "#ef4444",
  },
};

/** Environment display information */
export const GOVERNMENT_ENVIRONMENT_DISPLAY: Record<GovernmentEnvironment, {
  label: string;
  description: string;
  color: string;
}> = {
  development: {
    label: "Desenvolvimento",
    description: "Ambiente local de desenvolvimento",
    color: "#6b7280",
  },
  sandbox: {
    label: "Sandbox (Testes)",
    description: "Ambiente oficial de testes",
    color: "#f59e0b",
  },
  production: {
    label: "Produção",
    description: "Ambiente de produção real",
    color: "#059669",
  },
};

/** Connection status display information */
export const GOVERNMENT_CONNECTION_STATUS_DISPLAY: Record<GovernmentProviderStatus, {
  label: string;
  description: string;
  color: string;
  icon: string;
}> = {
  DISCONNECTED: { label: "Desligado", description: "Não existe conexão ativa", color: "#6b7280", icon: "⭕" },
  CONNECTING: { label: "A ligar...", description: "A estabelecer conexão", color: "#f59e0b", icon: "🔄" },
  CONNECTED: { label: "Ligado", description: "Conexão ativa e funcional", color: "#059669", icon: "✅" },
  ERROR: { label: "Erro", description: "Erro na conexão - verificar detalhes", color: "#ef4444", icon: "❌" },
  EXPIRED: { label: "Expirado", description: "Credenciais ou token expirados", color: "#f59e0b", icon: "⏰" },
  REVOKED: { label: "Revogado", description: "Acesso revogado pelo utilizador ou administrador", color: "#ef4444", icon: "🚫" },
};

/** Validate connection request */
export function validateConnectionRequest(request: CreateGovernmentConnectionRequest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!request.provider_id) {
    errors.push("Provider ID is required");
  }

  if (!["AT", "EFATURA", "SEGURANCA_SOCIAL", "AUTENTICACAO_GOV", "CMD", "GOV_PT"].includes(request.provider_id)) {
    errors.push(`Invalid provider ID: ${request.provider_id}`);
  }

  if (!["development", "sandbox", "production"].includes(request.environment)) {
    errors.push(`Invalid environment: ${request.environment}`);
  }

  if (!Array.isArray(request.scopes) || request.scopes.length === 0) {
    errors.push("At least one scope is required");
  }

  const availableScopes = GOVERNMENT_PROVIDER_SCOPES[request.provider_id];
  if (availableScopes) {
    for (const scope of request.scopes) {
      const allScopes = [...availableScopes.required, ...availableScopes.optional];
      if (!allScopes.includes(scope)) {
        errors.push(`Invalid scope for ${request.provider_id}: ${scope}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validate consent request */
export function validateConsentRequest(request: GrantGovernmentConsentRequest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!request.provider_id) {
    errors.push("Provider ID is required");
  }

  if (!Array.isArray(request.scopes) || request.scopes.length === 0) {
    errors.push("At least one scope is required");
  }

  if (request.expires_at) {
    const expiry = new Date(request.expires_at);
    if (isNaN(expiry.getTime())) {
      errors.push("Invalid expires_at date format");
    } else if (expiry <= new Date()) {
      errors.push("Expires_at must be in the future");
    }
  }

  const availableScopes = GOVERNMENT_PROVIDER_SCOPES[request.provider_id];
  if (availableScopes) {
    for (const scope of request.scopes) {
      const allScopes = [...availableScopes.required, ...availableScopes.optional];
      if (!allScopes.includes(scope)) {
        errors.push(`Invalid scope for ${request.provider_id}: ${scope}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Check if connection has required scopes for an operation */
export function connectionHasScope(connection: GovernmentConnection, scope: string): boolean {
  return connection.scopes.includes(scope);
}

/** Check if consent grants required scopes */
export function consentGrantsScopes(consent: GovernmentConsentRecord, scopes: string[]): boolean {
  if (consent.revoked_at) return false;
  if (consent.expires_at && new Date(consent.expires_at) <= new Date()) return false;
  return scopes.every(scope => consent.scopes.includes(scope));
}