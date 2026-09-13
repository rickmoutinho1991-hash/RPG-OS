export type InvoiceType =
  | "FT" // Fatura (normal)
  | "FS" // Fatura Simplificada
  | "FR" // Fatura-Recibo
  | "NC" // Nota de Crédito
  | "ND"; // Nota de Débito

export type InvoiceStatus =
  | "draft"
  | "open"
  | "paid"
  | "partially_paid"
  | "void"
  | "uncollectible";

export type VatRate =
  | "23" // Taxa normal (23%)
  | "13" // Taxa reduzida 13%
  | "6" // Taxa reduzida 6%
  | "0" // Isenta
  | "22" // Taxa intermédia (if applicable)
  | "Other";

export interface VatBreakdown {
  rate: VatRate;
  ratePercent: number;
  amountCents: number;
  baseCents: number;
}

export interface InvoicePaymentTerms {
  /** Dias até ao vencimento a partir da data de emissão */
  dueDays: number;
  /** Data de vencimento calculada */
  dueDate: string;
  /** Data de emissão */
  issueDate: string;
  /** Desconto por pronto pagamento (em centavos, se aplicável) */
  earlyDiscountCents?: number;
  /** Data limite para desconto por pronto pagamento */
  earlyDiscountDate?: string;
}

export interface InvoiceCustomer {
  /** ID do cliente na organização */
  id: string;
  /** Nome do cliente */
  name: string;
  /** Número de contribuinte (NIF) do cliente */
  taxNumber: string;
  /** Tipo de NIF (INDIVIDUAL, COMPANY, etc.) */
  nifType: "INDIVIDUAL" | "COMPANY" | "SOLE_TRADER" | "PUBLIC_ENTITY" | "HERITAGE" | "NON_PROFIT" | "OTHER";
  /** Endereço do cliente */
  address?: string;
  /** Código postal do cliente */
  postalCode?: string;
  /** Cidade do cliente */
  city?: string;
  /** País do cliente (padrão PT) */
  country?: string;
}

export interface InvoiceSupplier {
  /** ID do fornecedor da organização */
  id: string;
  /** Nome do fornecedor */
  name: string;
  /** Número de contribuinte (NIF) do fornecedor */
  taxNumber: string;
  /** Tipo de NIF */
  nifType: "INDIVIDUAL" | "COMPANY" | "SOLE_TRADER" | "PUBLIC_ENTITY" | "HERITAGE" | "NON_PROFIT" | "OTHER";
  /** Endereço do fornecedor */
  address?: string;
  /** Código postal do fornecedor */
  postalCode?: string;
  /** Cidade do fornecedor */
  city?: string;
  /** País do fornecedor (padrão PT) */
  country?: string;
}

export interface InvoiceLine {
  /** Line item identifier */
  lineId: string;
  /** Description of the line item */
  description: string;
  /** Quantity (if applicable) */
  quantity?: number;
  /** Unit amount in cents */
  unitAmountCents: number;
  /** Discount amount in cents (if any) */
  discountCents?: number;
  /** Tax amount in cents (if any) */
  taxCents?: number;
  /** VAT rate percentage */
  vatRate?: VatRate;
}

export interface Invoice {
  /** Unique invoice identifier */
  invoiceId: string;
  /** Associated organization */
  organizationId: string;
  /** Associated subscription (if any) */
  subscriptionId?: string;
  /** Billing period */
  billingPeriodStart: string;
  billingPeriodEnd: string;
  /** Issue date */
  issueDate: string;
  /** Due date */
  dueDate: string;
  /** Currency */
  currency: string;
  /** Invoice type (FT, FS, FR, NC, ND) */
  invoiceType: InvoiceType;
  /** Series/number prefix */
  series: string;
  /** Document number within series */
  documentNumber: string;
  /** Associated customer */
  customer: InvoiceCustomer;
  /** Associated supplier (if reverse charge) */
  supplier?: InvoiceSupplier;
  /** Subtotal in cents (sum of all line items before discounts/fees) */
  subtotalCents: number;
  /** Discount amount in cents */
  discountCents: number;
  /** Platform fee in cents */
  feeCents: number;
  /** Tax amount in cents - breakdown by rate */
  taxCents: number;
  /** VAT breakdown by rate */
  vatBreakdown: VatBreakdown[];
  /** Total amount in cents */
  totalCents: number;
  /** Amount paid in cents */
  paidCents: number;
  /** Amount due in cents */
  amountDueCents: number;
  /** Invoice status */
  status: InvoiceStatus;
  /** Identifier for idempotency */
  idempotencyKey?: string;
  /** Created at (ISO string) */
  createdAt: string;
  /** Last updated at (ISO string) */
  updatedAt: string;
  /** AT-relevant identifiers/status */
  atcud?: string;
  /** QR code for simplified invoice */
  qrCode?: string;
  /** Hash/CRC da fatura */
  hash?: string;
  /** Notes */
  notes?: string;
  /** Payment terms */
  paymentTerms?: InvoicePaymentTerms;
  /** Line items (optional, for drafts created from lines) */
  lines?: InvoiceLine[] | undefined;
}
