export type QuoteStatus =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "CONVERTED_TO_PROJECT";

export type QuoteItemType =
  | "LABOR"
  | "MATERIAL"
  | "EQUIPMENT"
  | "SERVICE"
  | "OTHER";

export interface QuoteItem {
  id?: string;
  quoteId?: string;
  position: number;
  itemType: QuoteItemType;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountPercentage?: number;
  vatRate: number; // e.g. 23, 13, 6, 0
  vatExemptionReason?: string;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  notes?: string;
}

export interface QuoteVatSummary {
  vatRate: number;
  baseAmount: number;
  vatAmount: number;
  totalAmount: number;
}

export interface Quote {
  id: string;
  quoteNumber: string; // e.g. ORC-2025-001
  title: string;
  clientId: string;
  clientName?: string;
  clientTaxNumber?: string;
  clientEmail?: string;
  companyId?: string;
  projectId?: string;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  items: QuoteItem[];
  subtotal: number;
  discountPercentage: number;
  discountAmount: number;
  vatSummary: QuoteVatSummary[];
  totalVat: number;
  total: number;
  notes?: string;
  termsAndConditions?: string;
  convertedProjectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteFilters {
  search?: string;
  clientId?: string;
  status?: QuoteStatus;
  page?: number;
  limit?: number;
}
