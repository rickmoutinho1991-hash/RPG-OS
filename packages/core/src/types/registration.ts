export type AccountType =
  | "CLIENTE"
  | "INDIVIDUAL"
  | "EMPRESA";

export type AccountStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "ACTIVE"
  | "REJECTED"
  | "SUSPENDED";

export type VerificationStatus =
  | "NOT_SUBMITTED"
  | "PENDING"
  | "VERIFIED"
  | "REJECTED";

export interface RegistrationDocument {
  id: string;
  accountId: string;
  type: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  verificationStatus: VerificationStatus;
  uploadedAt: string;
}

export interface RegistrationProfile {
  id: string;
  accountType: AccountType;
  status: AccountStatus;
  email: string;
  phone: string;
  nif: string;
  legalName: string;
  tradeName?: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  documents: RegistrationDocument[];
  createdAt: string;
  updatedAt: string;
}
