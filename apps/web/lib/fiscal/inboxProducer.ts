/**
 * RPG-OS — Fiscal inbox producer (server-side, projeção de read model).
 *
 * Projeta invoices ISSUED com routing assignment ACTIVE em
 * fiscal_inbox_items. Cadeia: invoice -> assignment -> company consistency
 * -> bridge ACTIVE -> org -> autorização -> upsert idempotente.
 * Sem fan-out, sem primary, sem sessão como destino, sem externos.
 * Erros de projeção NUNCA derrubam a invoice (ver chamada em faturação).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/audit";
import {
  decideInboxEligibility,
  buildInboxPayload,
  type FiscalInboxProductionResult,
} from "@rpg/core";

export interface ProducerActor {
  userId: string;
  companyId: string | null;
  permissions: string[];
  memberOrgIds: string[];
}

function hasFiscalAdmin(permissions: string[]): boolean {
  return permissions.includes("fiscal.admin") || permissions.includes("*");
}

/**
 * Projeta uma invoice para o inbox. Idempotente: segunda execução devolve
 * NOOP com o id existente (UNIQUE org+entity). Nunca lança por NO_ROUTE /
 * NOT_ELIGIBLE; lança apenas em falha de integridade/DB (o chamador decide).
 */
export async function produceFiscalInboxForInvoice(
  invoiceId: string,
  actor: ProducerActor,
): Promise<FiscalInboxProductionResult> {
  if (!invoiceId) throw new Error("INVALID_ID");
  const supabase = createAdminClient();

  // 1. Invoice mínima (source of truth).
  const { data: inv, error: invError } = await supabase
    .from("invoices")
    .select("id,status,company_id,invoice_number,invoice_type,total,tax_amount,issue_date,due_date")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invError) throw invError;
  if (!inv) throw new Error("INVOICE_NOT_FOUND");

  // 2. Eligibility.
  const eligibility = decideInboxEligibility(String(inv.status));
  if (!eligibility.eligible) {
    return { status: "NOT_ELIGIBLE", reason: eligibility.reason };
  }
  const companyId = (inv.company_id as string | null) ?? null;
  if (!companyId) {
    return { status: "NO_ROUTE", reason: "NO_COMPANY" };
  }

  // 3. Assignment ACTIVE (0 => NO_ROUTE; >1 => invariante violada).
  const { data: assignments, error: asgError } = await supabase
    .from("invoice_routing_assignments")
    .select("id,company_id,organization_id,status")
    .eq("invoice_id", invoiceId)
    .eq("status", "ASSIGNED");
  if (asgError) throw asgError;
  const list = (assignments ?? []) as Array<Record<string, unknown>>;
  if (list.length === 0) {
    return { status: "NO_ROUTE", reason: "NO_ASSIGNMENT" };
  }
  if (list.length > 1) {
    throw new Error("INVARIANT_VIOLATED_MULTIPLE_ASSIGNMENTS");
  }
  const asg = list[0];
  if (String(asg.company_id) !== companyId) {
    throw new Error("INVARIANT_VIOLATED_COMPANY_MISMATCH");
  }
  const organizationId = String(asg.organization_id);

  // 4. Bridge ACTIVE (revogado depois do assignment => fail closed).
  const { data: link } = await supabase
    .from("company_organizations")
    .select("id")
    .eq("company_id", companyId)
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (!link) {
    return { status: "NO_ROUTE", reason: "INVALID_COMPANY_LINK" };
  }

  // 5. Org existe + autorização do actor (fluxo user-driven).
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) {
    return { status: "NO_ROUTE", reason: "ORGANIZATION_UNAVAILABLE" };
  }
  if (!hasFiscalAdmin(actor.permissions)) {
    throw new Error("FORBIDDEN");
  }
  if (actor.companyId !== companyId || !actor.memberOrgIds.includes(organizationId)) {
    throw new Error("FORBIDDEN");
  }

  // 6. Payload mínimo (sem NIF, sem nomes, sem externos).
  const toCents = (v: unknown): number => Math.round(Number(v ?? 0) * 100);
  const payload = buildInboxPayload(
    {
      id: String(inv.id),
      invoiceNumber: String(inv.invoice_number),
      invoiceType: String(inv.invoice_type),
      totalCents: toCents(inv.total),
      vatCents: toCents(inv.tax_amount),
      issueDate: String(inv.issue_date).slice(0, 10),
      dueDate: inv.due_date ? String(inv.due_date).slice(0, 10) : null,
    },
    organizationId,
  );

  // 7. Upsert idempotente: existente => NOOP; senão insert; race (23505)
  // => re-ler e NOOP. Nunca duplicar.
  const { data: existing } = await supabase
    .from("fiscal_inbox_items")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("entity_type", "INVOICE")
    .eq("entity_id", String(inv.id))
    .maybeSingle();
  if (existing) {
    return { status: "NOOP", inboxItemId: String((existing as Record<string, unknown>).id), organizationId };
  }
  const { data: inserted, error: insertError } = await supabase
    .from("fiscal_inbox_items")
    .insert(payload)
    .select("id")
    .single();
  if (insertError) {
    if (String((insertError as { code?: string }).code) === "23505") {
      const { data: raced } = await supabase
        .from("fiscal_inbox_items")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("entity_type", "INVOICE")
        .eq("entity_id", String(inv.id))
        .maybeSingle();
      if (raced) {
        return {
          status: "NOOP",
          inboxItemId: String((raced as Record<string, unknown>).id),
          organizationId,
        };
      }
    }
    throw insertError;
  }

  await recordAuditEvent({
    userId: actor.userId,
    companyId,
    organizationId,
    action: "fiscal.inbox.projected",
    module: "FISCAL",
    entityType: "FISCAL_INBOX_ITEM",
    entityId: String((inserted as Record<string, unknown>).id),
    metadata: { invoiceId: String(inv.id) },
  });
  return {
    status: "CREATED",
    inboxItemId: String((inserted as Record<string, unknown>).id),
    organizationId,
  };
}
