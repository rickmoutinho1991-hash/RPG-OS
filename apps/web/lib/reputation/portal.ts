import { createAdminClient } from "@/lib/supabase/admin";
import type { ReputationTenantContext } from "@/lib/reputation/tenant";

// ---------------------------------------------------------------------------
// Portal da Queixa — integração honesta e desacoplada.
//
// NÃO existe API pública oficial do Portal da Queixa nem é feito scraping.
// O provider é uma interface desacoplada (5 métodos) com estado:
//   NOT_CONFIGURED → sem perfil/URL guardado neste tenant
//   CONFIGURED     → perfil/URL guardado manualmente; a sincronização automática
//                    ficará disponível quando existir fonte oficial.
// Implementação atual: todos os métodos devolvem envelopes com payload vazio e
// nota explicativa — nunca dados inventados nem pedidos a terceiros.
// As referências externas reais são registadas manualmente pelo utilizador em
// reputation_external_references (RGPD: sem recolha automática de terceiros).
// ---------------------------------------------------------------------------

export type PortalDaQueixaStatus = "NOT_CONFIGURED" | "CONFIGURED";

export interface PortalDaQueixaEnvelope<T = unknown> {
  status: PortalDaQueixaStatus;
  payload: T | null;
  note: string;
  /** URL do perfil guardado manualmente (se configurado). */
  profileUrl: string | null;
  brandName: string | null;
  lastSyncedAt: string | null;
}

export interface PortalDaQueixaProvider {
  searchBrand(query: string): Promise<PortalDaQueixaEnvelope>;
  getBrandProfile(brandId: string): Promise<PortalDaQueixaEnvelope>;
  getComplaints(cursor?: string): Promise<PortalDaQueixaEnvelope>;
  getComplaint(id: string): Promise<PortalDaQueixaEnvelope>;
  getBrandMetrics(): Promise<PortalDaQueixaEnvelope>;
}

const NOT_CONFIGURED_NOTE =
  "Sem integração oficial: o Portal da Queixa não disponibiliza API pública e a plataforma não faz scraping. Regista referências externas manualmente no separador abaixo.";

export const PortalDaQueixa: PortalDaQueixaProvider = {
  async searchBrand(): Promise<PortalDaQueixaEnvelope> {
    return { status: "NOT_CONFIGURED", payload: null, note: NOT_CONFIGURED_NOTE, profileUrl: null, brandName: null, lastSyncedAt: null };
  },
  async getBrandProfile(): Promise<PortalDaQueixaEnvelope> {
    return { status: "NOT_CONFIGURED", payload: null, note: NOT_CONFIGURED_NOTE, profileUrl: null, brandName: null, lastSyncedAt: null };
  },
  async getComplaints(): Promise<PortalDaQueixaEnvelope> {
    return { status: "NOT_CONFIGURED", payload: null, note: NOT_CONFIGURED_NOTE, profileUrl: null, brandName: null, lastSyncedAt: null };
  },
  async getComplaint(): Promise<PortalDaQueixaEnvelope> {
    return { status: "NOT_CONFIGURED", payload: null, note: NOT_CONFIGURED_NOTE, profileUrl: null, brandName: null, lastSyncedAt: null };
  },
  async getBrandMetrics(): Promise<PortalDaQueixaEnvelope> {
    return { status: "NOT_CONFIGURED", payload: null, note: NOT_CONFIGURED_NOTE, profileUrl: null, brandName: null, lastSyncedAt: null };
  },
};

export interface PortalConfigRow {
  id: string;
  organizationId: string;
  status: PortalDaQueixaStatus;
  brandName: string | null;
  profileUrl: string | null;
  apiProvider: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalReferenceRow {
  id: string;
  organizationId: string;
  referenceType: "COMPLAINT" | "REVIEW" | "METRIC" | "OTHER";
  externalId: string | null;
  referenceUrl: string | null;
  summary: string | null;
  createdAt: string;
}

function toPortalConfig(row: Record<string, unknown> | null): PortalConfigRow | null {
  if (!row) return null;
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    status: (row.status as PortalDaQueixaStatus) ?? "NOT_CONFIGURED",
    brandName: row.brand_name ? String(row.brand_name) : null,
    profileUrl: row.profile_url ? String(row.profile_url) : null,
    apiProvider: row.api_provider ? String(row.api_provider) : null,
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toPortalReference(row: Record<string, unknown>): PortalReferenceRow {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    referenceType: (row.reference_type as PortalReferenceRow["referenceType"]) ?? "OTHER",
    externalId: row.external_id ? String(row.external_id) : null,
    referenceUrl: row.reference_url ? String(row.reference_url) : null,
    summary: row.summary ? String(row.summary) : null,
    createdAt: String(row.created_at),
  };
}

export interface PortalDaQueixaTenantData {
  config: PortalConfigRow | null;
  references: PortalReferenceRow[];
  providerStatus: PortalDaQueixaStatus;
}

/** Carrega configuração + referências externas do tenant (só se tiver vista). */
export async function loadPortalDaQueixaData(
  ctx: ReputationTenantContext,
): Promise<PortalDaQueixaTenantData | null> {
  if (!ctx.organizationId) {
    return {
      config: null,
      references: [],
      providerStatus: "NOT_CONFIGURED",
    };
  }
  const supabase = createAdminClient();
  const [configRes, refsRes] = await Promise.all([
    supabase
      .from("reputation_portal_config")
      .select("*")
      .eq("organization_id", ctx.organizationId)
      .maybeSingle(),
    supabase
      .from("reputation_external_references")
      .select("*")
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false }),
  ]);

  const config = toPortalConfig((configRes.data as Record<string, unknown> | null) ?? null);
  return {
    config,
    references: ((refsRes.data as Record<string, unknown>[] | null) ?? []).map(toPortalReference),
    providerStatus: config?.status ?? "NOT_CONFIGURED",
  };
}