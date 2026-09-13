export type DocumentCategory =
  | "IDENTITY_CARD"
  | "PASSPORT"
  | "RESIDENCE_PERMIT"
  | "TAX_DOCUMENT"
  | "ADDRESS_PROOF"
  | "COMPANY_REGISTRATION"
  | "COMPANY_TAX_DOCUMENT"
  | "COMPANY_BANK_DOCUMENT"
  | "INSURANCE"
  | "LICENSE"
  | "CERTIFICATE"
  | "POWER_OF_ATTORNEY"
  | "CONTRACT"
  | "PHOTO"
  | "OTHER";

export type DocumentStatus = "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";

export interface DocumentVerification {
  id: string;
  documentId: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  verifiedBy?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  notes?: Record<string, unknown>;
}

export interface SystemDocument {
  id: string;
  ownerUserId: string;
  companyId?: string;
  projectId?: string;
  category: DocumentCategory;
  fileName: string;
  filePath: string;
  mimeType: string;
  size: number;
  issuedAt?: string;
  expiresAt?: string;
  uploadedAt: string;
  status: DocumentStatus;
  verification?: DocumentVerification;
}
