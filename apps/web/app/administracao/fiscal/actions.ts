"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { getCurrentUser } from "@/lib/supabase/auth";
import { recordAuditEvent } from "@/lib/audit";
import {
  resolveFiscalInboxTransition,
  type FiscalInboxStatus,
  type FiscalInboxUserAction,
} from "@rpg/core";
import { hasPermission } from "@rpg/core";

// ---------------------------------------------------------------------------
// Caixa Fiscal — loader e writer server-side.
// - Auth + fiscal.admin server-side (mesmo padrão das restantes páginas).
// - Organization resolvida server-side a partir da sessão; organization_id
//   vindo do client NUNCA é fonte de autoridade.
// - Apenas transições de estado sobre linhas reais (sem INSERT de novos
//   itens: não existe origem first-party com mapeamento company↔org seguro).
// - Sem chamadas externas (AT/e-Fatura/SIBS), sem fake providers.
// ---------------------------------------------------------------------------

/** Colunas mínimas para listagem (sem metadata JSONB).
 * counterparty_nif incluído: necessário à reconciliação/pesquisa pelos
 * membros fiscal.admin da org (mesmo acesso que o RLS permite); NUNCA
 * propagado para LifeItem, logs ou audit (ver docs/FISCAL-INBOX.md). */
const INBOX_LIST_COLUMNS =
  "id,organization_id,type,priority,status,title,description,entity_type,entity_id,document_type,series,document_number,counterparty_nif,counterparty_name,due_date,provider,recommended_action,action_url,created_at,read_at,resolved_at";

export interface FiscalInboxRow {
  id: string;
  organization_id: string;
  type: string;
  priority: string;
  status: string;
  title: string;
  description: string;
  entity_type: string;
  entity_id: string;
  document_type: string | null;
  series: string | null;
  document_number: string | null;
  counterparty_nif: string | null;
  counterparty_name: string | null;
  due_date: string | null;
  provider: string | null;
  recommended_action: string | null;
  action_url: string | null;
  created_at: string;
  read_at: string | null;
  resolved_at: string | null;
}

/** NIF da contraparte: incluído na linha (reconciliação por membros da org),
 * nunca propagado para LifeItem/logs/audit. */
export interface FiscalInboxDetail extends FiscalInboxRow {
  counterparty_nif: string | null;
}

function sessionOrgIds(
  session: NonNullable<Awaited<ReturnType<typeof getSessionContext>>>,
): string[] {
  const ids = new Set<string>();
  if (session.organization?.id) ids.add(session.organization.id);
  for (const o of session.availableOrganizations ?? []) {
    if (o?.id) ids.add(o.id);
  }
  return [...ids];
}

/**
 * Loader server-side da Caixa Fiscal (lista da organização ativa).
 * Exige fiscal.admin; sem organização ativa devolve [].
 */
export async function getFiscalInboxItems(): Promise<FiscalInboxRow[]> {
  const session = await getSessionContext();
  if (!session || !hasPermission(session.permissions, "fiscal.admin")) return [];
  const orgId = session.organization?.id ?? null;
  if (!orgId) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fiscal_inbox_items")
    .select(INBOX_LIST_COLUMNS)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as FiscalInboxRow[];
}

export type FiscalInboxWriteAction = FiscalInboxUserAction;

export interface FiscalInboxWriteResult {
  ok: boolean;
  error?: string;
  item?: Pick<FiscalInboxRow, "id" | "status" | "read_at" | "resolved_at">;
}

/**
 * Writer de transições de estado (única mutação suportada).
 * - Autenticação + fiscal.admin server-side.
 * - Linha carregada por id; a organization_id DA LINHA é verificada contra
 *   as organizações da sessão (org do client é ignorada).
 * - Transição validada por resolveFiscalInboxTransition (pura, testada).
 * - Mesmo estado = no-op idempotente (sem escrita).
 * - Nunca altera entity_type/entity_id/provider (sem reescrita de origem).
 */
export async function updateFiscalInboxItemStatus(
  itemId: string,
  action: FiscalInboxWriteAction,
): Promise<FiscalInboxWriteResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };
  if (!hasPermission(session.permissions, "fiscal.admin")) {
    return { ok: false, error: "FORBIDDEN" };
  }
  if (!itemId || typeof itemId !== "string") {
    return { ok: false, error: "INVALID_ID" };
  }
  const allowed: FiscalInboxWriteAction[] = ["mark_read", "start_progress", "resolve", "dismiss"];
  if (!allowed.includes(action)) return { ok: false, error: "INVALID_ACTION" };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };

  const supabase = createAdminClient();
  const { data: row, error: loadError } = await supabase
    .from("fiscal_inbox_items")
    .select("id,organization_id,status,read_at,resolved_at")
    .eq("id", itemId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!row) return { ok: false, error: "NOT_FOUND" };
  if (!sessionOrgIds(session).includes(String(row.organization_id))) {
    return { ok: false, error: "FORBIDDEN" };
  }

  const current = String(row.status) as FiscalInboxStatus;
  const next = resolveFiscalInboxTransition(current, action);
  // No-op idempotente: pedir o estado em que já está não escreve nada.
  const noopTarget: Record<FiscalInboxWriteAction, FiscalInboxStatus> = {
    mark_read: "READ",
    start_progress: "IN_PROGRESS",
    resolve: "RESOLVED",
    dismiss: "DISMISSED",
  };
  if (current === noopTarget[action]) {
    return {
      ok: true,
      item: { id: String(row.id), status: current, read_at: row.read_at, resolved_at: row.resolved_at },
    };
  }
  if (!next) return { ok: false, error: "INVALID_TRANSITION" };

  const now = new Date().toISOString();
  const patch: Record<string, string | null> = { status: next };
  if (next === "READ" && !row.read_at) patch.read_at = now;
  if ((next === "RESOLVED" || next === "DISMISSED") && !row.resolved_at) {
    patch.resolved_at = now;
  }

  const { data: updated, error: updateError } = await supabase
    .from("fiscal_inbox_items")
    .update(patch)
    .eq("id", itemId)
    .eq("organization_id", String(row.organization_id))
    .select("id,status,read_at,resolved_at")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) return { ok: false, error: "NOT_FOUND" };

  await recordAuditEvent({
    userId: user.id,
    companyId: user.companyId ?? null,
    organizationId: String(row.organization_id),
    action: "FISCAL_INBOX_ITEM_UPDATED",
    module: "FISCAL",
    entityType: "FISCAL_INBOX_ITEM",
    entityId: String(row.id),
    metadata: { from: current, to: next, byAction: action },
  });

  return {
    ok: true,
    item: {
      id: String(updated.id),
      status: String(updated.status),
      read_at: updated.read_at,
      resolved_at: updated.resolved_at,
    },
  };
}
