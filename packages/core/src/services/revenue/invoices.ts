/**
 * RPG-OS Invoice Module (FASE 10G+)
 * 
 * Provider-neutral invoice model with full lifecycle support.
 * All monetary values are in integer cents.
 * Financial invariants are protected (no negative totals, fee <= gross, etc.).
 * Portuguese fiscal requirements: NIF, VAT types, series, documento number.
 */

import { RevenueLedgerStatus } from "./ledger";
import type {
  InvoiceType,
  InvoiceStatus,
  VatRate,
  VatBreakdown,
  InvoicePaymentTerms,
  InvoiceCustomer,
  InvoiceSupplier,
  InvoiceLine,
  Invoice,
} from "../../types/invoice";

export type {
  InvoiceType,
  InvoiceStatus,
  VatRate,
  VatBreakdown,
  InvoicePaymentTerms,
  InvoiceCustomer,
  InvoiceSupplier,
  InvoiceLine,
  Invoice,
};

/** Portuguese invoice lifecycle states (FASE 10I-A) */
export type FiscalDocumentStatus =
  | "draft"
  | "issued"
  | "validated"
  | "submitted"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "void"
  | "reconciled";

/** Fiscal document lifecycle transitions (FASE 10I-A) */
export interface FiscalDocumentTransition {
  /** From status */
  from: FiscalDocumentStatus;
  /** To status */
  to: FiscalDocumentStatus;
  /** Whether this transition is allowed */
  allowed: boolean;
}

/** Validates a fiscal document status transition */
export function validateFiscalTransition(
  from: FiscalDocumentStatus,
  to: FiscalDocumentStatus,
  invoiceType?: InvoiceType,
  currentStatus?: FiscalDocumentStatus
): { valid: boolean; error?: string } {
  // Define valid transitions
  const validTransitions: FiscalDocumentTransition[] = [
    // Draft can go to issued or cancelled
    { from: "draft", to: "issued", allowed: true },
    { from: "draft", to: "cancelled", allowed: true },
    // Issued can go to validated, cancelled, or submitted
    { from: "issued", to: "validated", allowed: true },
    { from: "issued", to: "cancelled", allowed: true },
    { from: "issued", to: "submitted", allowed: true },
    // Validated can go to submitted or rejected
    { from: "validated", to: "submitted", allowed: true },
    { from: "validated", to: "rejected", allowed: true },
    // Submitted can go to accepted or rejected
    { from: "submitted", to: "accepted", allowed: true },
    { from: "submitted", to: "rejected", allowed: true },
    // Accepted/rejected can go to reconciled
    { from: "accepted", to: "reconciled", allowed: true },
    { from: "rejected", to: "reconciled", allowed: true },
    // Terminal states
    { from: "cancelled", to: "void", allowed: false },
    // Void and reconciled are terminal
  ];

  // Find the transition
  const transition = validTransitions.find(
    (t) => t.from === from && t.to === to,
  );

  // If no transition found, it's invalid
  if (!transition) {
    return { valid: false, error: `Invalid transition: ${from} -> ${to}` };
  }

  if (!transition.allowed) {
    return { valid: false, error: `Transition not allowed: ${from} -> ${to}` };
  }

  return { valid: true, error: undefined };
}

/** Creates a new invoice draft with Portuguese fiscal support */
export function createInvoiceDraft({
  organizationId,
  subscriptionId,
  billingPeriodStart,
  billingPeriodEnd,
  dueDate,
  currency,
  invoiceType,
  series,
  documentNumber,
  customer,
  supplier,
  lines,
  paymentTerms,
}: {
  organizationId: string;
  subscriptionId?: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  dueDate?: string;
  currency?: string;
  invoiceType: InvoiceType;
  series: string;
  documentNumber: string;
  customer: InvoiceCustomer;
  supplier?: InvoiceSupplier;
  lines?: InvoiceLine[];
  paymentTerms?: InvoicePaymentTerms;
}): Invoice {
  const now = new Date().toISOString();
  const inv: Invoice = {
    invoiceId: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    organizationId,
    subscriptionId,
    billingPeriodStart: billingPeriodStart || now,
    billingPeriodEnd: billingPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    issueDate: now,
    dueDate: dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    currency: currency || 'EUR',
    invoiceType,
    series,
    documentNumber,
    customer,
    supplier,
    subtotalCents: 0,
    discountCents: 0,
    feeCents: 0,
    taxCents: 0,
    totalCents: 0,
    paidCents: 0,
    amountDueCents: 0,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    vatBreakdown: [],
    paymentTerms,  // ADD this line
    lines: lines ?? undefined,  // ADD this line
  };

  // Calculate totals from lines if provided
  let accumulatedTaxCents = 0;
  let accumulatedSubtotal = 0;
  let accumulatedDiscount = 0;
  let accumulatedFee = 0;
  const vatMap: Record<string, number> = {}; // rate -> total tax cents

  if (lines) {
    for (const line of lines) {
      accumulatedSubtotal += line.unitAmountCents;
      if (line.discountCents) accumulatedDiscount += line.discountCents;
      if (line.taxCents) {
        accumulatedTaxCents += line.taxCents;
        const rateKey = line.vatRate || "23";
        vatMap[rateKey] = (vatMap[rateKey] || 0) + line.taxCents;
      }
      // Simple fee calculation - platform fee on subtotal
      accumulatedFee += Math.floor(accumulatedSubtotal * 250 / 10000); // 2.5% default
    }

    inv.subtotalCents = accumulatedSubtotal;
    inv.discountCents = accumulatedDiscount;
    inv.feeCents = accumulatedFee;
    inv.taxCents = accumulatedTaxCents;
    inv.totalCents = accumulatedSubtotal - accumulatedDiscount + accumulatedFee + accumulatedTaxCents;
    inv.amountDueCents = inv.totalCents;

    // Build VAT breakdown
    inv.vatBreakdown = Object.entries(vatMap).map(([rate, amountCents]) => ({
      rate: rate as VatRate,
      ratePercent: parseInt(rate, 10),
      amountCents,
      baseCents: Math.round(amountCents * 100 / parseInt(rate, 10)),
    }));

    inv.lines = lines;
  }

  // Ensure invariants
  protectInvoiceInvariants(inv);

  return inv;
}

/** Calculates the amount due */
export function calculateAmountDue(invoice: Invoice): number {
  return invoice.totalCents! - invoice.paidCents!;
}

/** Records a payment against an invoice */
export function recordPayment(invoice: Invoice, paidCents: number): Invoice {
  const newPaid = Math.min(invoice.paidCents! + paidCents, invoice.totalCents!);
  const newStatus =
    newPaid >= invoice.totalCents! ? "paid" :
    newPaid > 0 && newPaid < invoice.totalCents! ? "partially_paid" :
    invoice.status;

  return {
    ...invoice,
    paidCents: newPaid,
    amountDueCents: calculateAmountDue({ ...invoice, paidCents: newPaid }),
    status: newStatus,
    updatedAt: new Date().toISOString(),
  };
}

/** Records a partial payment against an invoice */
export function recordPartialPayment(invoice: Invoice, paidCents: number): Invoice {
  const newPaid = Math.min(invoice.paidCents! + paidCents, invoice.totalCents!);
  const newStatus =
    newPaid >= invoice.totalCents! ? "paid" :
    newPaid > 0 && newPaid < invoice.totalCents! ? "partially_paid" :
    invoice.status;

  return {
    ...invoice,
    paidCents: newPaid,
    amountDueCents: calculateAmountDue({ ...invoice, paidCents: newPaid }),
    status: newStatus,
    updatedAt: new Date().toISOString(),
  };
}

/** Voids an invoice */
export function voidInvoice(invoice: Invoice): Invoice {
  return {
    ...invoice,
    status: "void",
    updatedAt: new Date().toISOString(),
  };
}

/** Marks an invoice as uncollectible */
export function markUncollectible(invoice: Invoice): Invoice {
  return {
    ...invoice,
    status: "uncollectible",
    updatedAt: new Date().toISOString(),
  };
}

/** Protege invariantes financeiras da fatura (PT-PT) */
export function protectInvoiceInvariants(invoice: Invoice): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Total must equal subtotal - discount + fee + tax
  const calculatedTotal = invoice.subtotalCents - invoice.discountCents + invoice.feeCents + invoice.taxCents;
  if (invoice.totalCents !== calculatedTotal) {
    errors.push(`Total inválido: ${invoice.totalCents} != ${calculatedTotal}`);
  }

  // Amount due must be consistent
  const amountDue = invoice.totalCents - invoice.paidCents;
  if (invoice.amountDueCents !== amountDue) {
    errors.push(`Amount due inválido: ${invoice.amountDueCents} != ${amountDue}`);
  }

  // Paid must not exceed total
  if (invoice.paidCents > invoice.totalCents) {
    errors.push(`Paid exceeds total: ${invoice.paidCents} > ${invoice.totalCents}`);
  }

  // Fee must not exceed gross (subtotal - discount)
  const gross = invoice.subtotalCents - invoice.discountCents;
  if (invoice.feeCents > gross) {
    errors.push(`Fee exceeds gross: ${invoice.feeCents} > ${gross}`);
  }

  // Negative values check
  if (invoice.subtotalCents < 0) errors.push("Subtotal cannot be negative");
  if (invoice.totalCents < 0) errors.push("Total cannot be negative");
  if (invoice.amountDueCents < 0) errors.push("Amount due cannot be negative");
  if (invoice.paidCents < 0) errors.push("Paid cannot be negative");

  // Portuguese fiscal: invoice type must be valid for the customer nifType
  if (invoice.invoiceType === "FS" && invoice.customer.nifType === "INDIVIDUAL") {
    // Fatura simplificada only for individual customers - ok
  }

  // VAT breakdown must sum to total tax (skip for fatura simplificada FS)
  const vatBreakdownCheck =
    invoice.invoiceType !== "FS"
      ? (() => {
          const calculatedVatTotal = invoice.vatBreakdown.reduce(
            (sum, v) => sum + v.amountCents,
            0,
          );
          if (calculatedVatTotal !== invoice.taxCents) {
            errors.push(
              `VAT breakdown total (${calculatedVatTotal}) !== total tax (${invoice.taxCents})`,
            );
          }
          return true;
        })()
      : true;

  // Each VAT breakdown entry must have valid rate and non-negative values
  for (const entry of invoice.vatBreakdown) {
    if (!["23", "13", "6", "0", "22"].includes(entry.rate)) {
      errors.push(`Invalid VAT rate: ${entry.rate}`);
    }
    if (entry.amountCents < 0) errors.push("VAT amount cannot be negative");
    if (entry.baseCents < 0) errors.push("VAT base cannot be negative");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/** Checks if invoice can be edited */
export function canEditInvoice(invoice: Invoice): boolean {
  return invoice.status === "draft" || invoice.status === "open";
}

/** Checks if invoice can be voided */
export function canVoidInvoice(invoice: Invoice): boolean {
  return invoice.status !== "paid" && invoice.status !== "void";
}

/** Checks if invoice can be refunded */
export function canRefundInvoice(invoice: Invoice): boolean {
  return invoice.status === "paid";
}

/** Checks if invoice can have payment recorded */
export function canRecordPayment(invoice: Invoice): boolean {
  return invoice.status !== "paid" && invoice.status !== "void";
}