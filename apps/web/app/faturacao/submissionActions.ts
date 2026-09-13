"use server";

import { getSessionContext } from "@/lib/session";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPermission } from "@rpg/core";
import {
  prepareATSubmissionForInvoice,
  type SubmissionDryRun,
} from "@/lib/fiscal/atSubmission";

export interface SubmissionStateView {
  id: string;
  status: string;
  environment: string;
  idempotencyKey: string;
  attemptCount: number;
  lastErrorCode: string | null;
  createdAt: string;
}

/**
 * Dry-run de submissão AT (PREPARED_ONLY): valida + regista NOT_SUBMITTED.
 * Nunca transporta, nunca liga à AT. Company/actor da sessão.
 */
export async function prepareATSubmissionAction(
  invoiceId: string,
): Promise<SubmissionDryRun> {
  const session = await getSessionContext();
  if (!session || !hasPermission(session.permissions, "fiscal.manage")) {
    return { ok: false, error: "FORBIDDEN" };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };
  return prepareATSubmissionForInvoice(invoiceId, {
    userId: user.id,
    companyId: user.companyId ?? null,
    permissions: session.permissions,
  });
}

/** Estado atual da submissão (leitura scoped à company do actor). */
export async function getATSubmissionForInvoice(
  invoiceId: string,
): Promise<SubmissionStateView | null> {
  const session = await getSessionContext();
  if (!session || !hasPermission(session.permissions, "fiscal.manage")) {
    return null;
  }
  const user = await getCurrentUser();
  if (!user?.companyId) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("fiscal_submissions")
    .select("id,status,environment,idempotency_key,attempt_count,last_error_code,created_at")
    .eq("invoice_id", invoiceId)
    .eq("company_id", user.companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    status: String(r.status),
    environment: String(r.environment),
    idempotencyKey: String(r.idempotency_key),
    attemptCount: Number(r.attempt_count ?? 0),
    lastErrorCode: r.last_error_code ? String(r.last_error_code) : null,
    createdAt: String(r.created_at),
  };
}
