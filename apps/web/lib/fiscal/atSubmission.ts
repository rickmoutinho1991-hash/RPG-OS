/**
 * RPG-OS — AT submission dry-run orchestration (server-side, sem transporte).
 *
 * Prepara (valida + regista NOT_SUBMITTED + devolve modelo) sem nunca chamar
 * a AT. Sem credenciais, sem SOAP, sem envio. Idempotente por chave.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/audit";
import {
  canSubmitInvoiceToAT,
  buildSubmissionIdempotencyKey,
  validateSubmissionRequest,
  type AtSubmissionRequestInput,
} from "@rpg/core";

export interface SubmissionActor {
  userId: string;
  companyId: string | null;
  permissions: string[];
}

export interface SubmissionDryRun {
  ok: boolean;
  error?: string;
  missingFields?: string[];
  submissionId?: string;
  idempotencyKey?: string;
  state?: string;
  request?: AtSubmissionRequestInput;
}

function hasFiscalManage(permissions: string[]): boolean {
  return permissions.includes("fiscal.manage") || permissions.includes("fiscal.admin") || permissions.includes("*");
}

function taxCodeForRate(rate: number): string {
  if (rate === 23) return "NOR";
  if (rate === 13) return "INT";
  if (rate === 6) return "RED";
  return "ISE";
}

/**
 * Dry-run: valida, regista NOT_SUBMITTED (idempotente) e devolve o modelo.
 * Nunca transporta. Falhas retornam erro explícito, nunca exceção mascarada
 * (exceto falhas DB/integridade, lançadas).
 */
export async function prepareATSubmissionForInvoice(
  invoiceId: string,
  actor: SubmissionActor,
): Promise<SubmissionDryRun> {
  if (!invoiceId) throw new Error("INVALID_ID");
  if (!hasFiscalManage(actor.permissions)) {
    return { ok: false, error: "FORBIDDEN" };
  }
  const supabase = createAdminClient();

  const { data: inv, error: invError } = await supabase
    .from("invoices")
    .select("id,status,company_id,invoice_number,invoice_type,atcud,issue_date,subtotal,tax_amount,total,client_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invError) throw invError;
  if (!inv) throw new Error("INVOICE_NOT_FOUND");
  const invoice = inv as Record<string, unknown>;
  const companyId = (invoice.company_id as string | null) ?? null;
  if (!companyId || actor.companyId !== companyId) {
    return { ok: false, error: "FORBIDDEN" };
  }

  const eligibility = canSubmitInvoiceToAT(String(invoice.status));
  if (!eligibility.eligible) {
    return { ok: false, error: `NOT_ELIGIBLE_${eligibility.reason}` };
  }

  // Cliente (adquirente): NIF do perfil; país sem fonte => reportado.
  let customerNif = "";
  let customerCountry = "";
  const clientId = invoice.client_id as string | null;
  if (clientId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("tax_number")
      .eq("user_id", clientId)
      .maybeSingle();
    customerNif = String((profile as Record<string, unknown> | null)?.tax_number ?? "");
  }

  const { data: items } = await supabase
    .from("invoice_items")
    .select("description,quantity,unit_price,vat_rate,total_amount")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });
  const lines = ((items ?? []) as Array<Record<string, unknown>>).map((it) => ({
    taxPointDate: String(invoice.issue_date).slice(0, 10),
    debitCredit: "D" as const,
    netAmount: Number(it.unit_price ?? 0) * Number(it.quantity ?? 0),
    taxCode: taxCodeForRate(Number(it.vat_rate ?? 0)),
    taxPercentage: Number(it.vat_rate ?? 0),
  }));

  const request: AtSubmissionRequestInput = {
    invoiceNo: String(invoice.invoice_number),
    atcud: String(invoice.atcud ?? ""),
    invoiceDate: String(invoice.issue_date).slice(0, 10),
    invoiceType: String(invoice.invoice_type) as AtSubmissionRequestInput["invoiceType"],
    emitterNif: "",
    customerNif,
    customerCountry,
    lines,
    netTotal: Number(invoice.subtotal ?? 0),
    taxPayable: Number(invoice.tax_amount ?? 0),
    grossTotal: Number(invoice.total ?? 0),
  };
  // Emitente: NIF da company (server-side).
  const { data: company } = await supabase
    .from("companies")
    .select("tax_number")
    .eq("id", companyId)
    .maybeSingle();
  request.emitterNif = String((company as Record<string, unknown> | null)?.tax_number ?? "");

  const missing = validateSubmissionRequest(request);
  if (missing.length > 0) {
    return { ok: false, error: "MISSING_FIELDS", missingFields: missing };
  }

  const idempotencyKey = buildSubmissionIdempotencyKey(invoiceId, "TEST");
  const { data: existing } = await supabase
    .from("fiscal_submissions")
    .select("id,status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      submissionId: String((existing as Record<string, unknown>).id),
      idempotencyKey,
      state: String((existing as Record<string, unknown>).status),
      request,
    };
  }
  const { data: inserted, error } = await supabase
    .from("fiscal_submissions")
    .insert({
      invoice_id: invoiceId,
      company_id: companyId,
      organization_id: null,
      provider: "AT",
      environment: "TEST",
      operation: "RegisterInvoice",
      status: "NOT_SUBMITTED",
      idempotency_key: idempotencyKey,
      created_by: actor.userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  await recordAuditEvent({
    userId: actor.userId,
    companyId,
    organizationId: null,
    action: "fiscal.at.submission.prepared",
    module: "FISCAL",
    entityType: "FISCAL_SUBMISSION",
    entityId: String((inserted as Record<string, unknown>).id),
    metadata: { invoiceId },
  });
  return {
    ok: true,
    submissionId: String((inserted as Record<string, unknown>).id),
    idempotencyKey,
    state: "NOT_SUBMITTED",
    request,
  };
}
