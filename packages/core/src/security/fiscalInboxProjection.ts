/**
 * RPG-OS — Fiscal inbox projection decisions (lógica pura, sem I/O).
 *
 * Separa decisão (testável) de orquestração DB (web). O producer projeta
 * invoices ISSUED com routing assignment ACTIVE em items do inbox;
 * tudo o resto é NO_ROUTE / NOT_ELIGIBLE explícito. Sem NIF, sem nomes,
 * sem payload fiscal — só referência + valores do documento.
 */

export type InboxEligibleStatus = "ISSUED";

export type FiscalInboxEligibility =
  | { eligible: true }
  | { eligible: false; reason: "DRAFT" | "CANCELLED" | "PAID" | "PARTIALLY_PAID" | "UNSUPPORTED_STATUS" };

/** Só ISSUED é projetável (FR nasce PAID = já liquidada, sem ação). */
export function decideInboxEligibility(status: string): FiscalInboxEligibility {
  if (status === "ISSUED") return { eligible: true };
  if (status === "DRAFT") return { eligible: false, reason: "DRAFT" };
  if (status === "CANCELLED") return { eligible: false, reason: "CANCELLED" };
  if (status === "PAID") return { eligible: false, reason: "PAID" };
  if (status === "PARTIALLY_PAID") return { eligible: false, reason: "PARTIALLY_PAID" };
  return { eligible: false, reason: "UNSUPPORTED_STATUS" };
}

export interface InboxInvoiceInput {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  totalCents: number;
  vatCents: number;
  issueDate: string;
  dueDate: string | null;
}

export interface FiscalInboxPayload {
  type: "INVOICE_ISSUED";
  priority: "MEDIUM";
  status: "UNREAD";
  title: string;
  description: string;
  entity_type: "INVOICE";
  entity_id: string;
  document_type: string;
  document_number: string;
  amount_cents: number;
  vat_cents: number;
  issue_date: string;
  due_date: string | null;
  provider: "RPG_OS";
  recommended_action: "view";
  action_url: string;
  tags: string[];
}

/**
 * Constrói payload mínimo do item. Referência + valores do documento;
 * nunca counterparty_nif, nomes, moradas ou payload fiscal.
 */
export function buildInboxPayload(
  invoice: InboxInvoiceInput,
  organizationId: string,
): { organization_id: string } & FiscalInboxPayload {
  return {
    organization_id: organizationId,
    type: "INVOICE_ISSUED",
    priority: "MEDIUM",
    status: "UNREAD",
    title: `Fatura ${invoice.invoiceNumber} emitida`,
    description: "Fatura de venda emitida no RPG-OS. Consultar o documento de origem.",
    entity_type: "INVOICE",
    entity_id: invoice.id,
    document_type: invoice.invoiceType,
    document_number: invoice.invoiceNumber,
    amount_cents: invoice.totalCents,
    vat_cents: invoice.vatCents,
    issue_date: invoice.issueDate,
    due_date: invoice.dueDate,
    provider: "RPG_OS",
    recommended_action: "view",
    action_url: `/faturacao/${invoice.id}`,
    tags: [],
  };
}

export type FiscalInboxProductionResult =
  | { status: "CREATED" | "NOOP"; inboxItemId: string; organizationId: string }
  | {
      status: "NO_ROUTE";
      reason:
        | "NO_ASSIGNMENT"
        | "ASSIGNMENT_REVOKED"
        | "NO_COMPANY"
        | "INVALID_COMPANY_LINK"
        | "ORGANIZATION_UNAVAILABLE";
    }
  | {
      status: "NOT_ELIGIBLE";
      reason: "DRAFT" | "CANCELLED" | "PAID" | "PARTIALLY_PAID" | "UNSUPPORTED_STATUS";
    };
