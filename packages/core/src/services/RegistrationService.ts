import type {
  AccountType,
  RegistrationProfile,
} from "../types/registration";
import { isValidPortugueseNif } from "../validation/nif";

export interface CreateRegistrationInput {
  accountType: AccountType;
  email: string;
  phone: string;
  nif: string;
  legalName: string;
  address: string;
  postalCode: string;
  city: string;
  country?: string;
}

export function createRegistrationProfile(
  input: CreateRegistrationInput,
): RegistrationProfile {
  if (!input.email.trim()) {
    throw new Error("Email é obrigatório.");
  }

  if (!input.phone.trim()) {
    throw new Error("Telefone é obrigatório.");
  }

  if (!isValidPortugueseNif(input.nif)) {
    throw new Error("NIF português inválido.");
  }

  if (!input.legalName.trim()) {
    throw new Error("Nome legal é obrigatório.");
  }

  if (!input.address.trim()) {
    throw new Error("Morada é obrigatória.");
  }

  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    accountType: input.accountType,
    status: "PENDING",
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    nif: input.nif.replace(/\s/g, ""),
    legalName: input.legalName.trim(),
    address: input.address.trim(),
    postalCode: input.postalCode.trim(),
    city: input.city.trim(),
    country: input.country?.trim() || "Portugal",
    documents: [],
    createdAt: now,
    updatedAt: now,
  };
}
