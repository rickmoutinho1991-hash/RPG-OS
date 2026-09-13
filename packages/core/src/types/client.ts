export type ClientType = "INDIVIDUAL" | "SOLE_TRADER" | "COMPANY";
export type ClientStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "PENDING_VERIFICATION"
  | "SUSPENDED";

export interface ClientAddress {
  id?: string;
  street: string;
  number: string;
  complement?: string;
  postalCode: string;
  city: string;
  district: string;
  country: string;
  latitude?: number;
  longitude?: number;
}

export interface ClientContact {
  id?: string;
  type: "EMAIL" | "PHONE" | "MOBILE" | "WHATSAPP" | "OTHER";
  value: string;
  isPrimary: boolean;
  label?: string;
}

export interface Client {
  id: string;
  userId?: string;
  companyId?: string;
  type: ClientType;
  status: ClientStatus;
  name: string;
  taxNumber: string; // NIF / NIPC
  email: string;
  phone: string;
  notes?: string;
  address?: ClientAddress;
  contacts?: ClientContact[];
  projectsCount?: number;
  quotesCount?: number;
  invoicesCount?: number;
  totalSpent?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClientFilters {
  search?: string;
  type?: ClientType;
  status?: ClientStatus;
  district?: string;
  page?: number;
  limit?: number;
}
