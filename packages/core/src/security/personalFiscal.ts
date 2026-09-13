/**
 * RPG-OS — Personal fiscal context (pessoa singular).
 *
 * Formaliza o suporte fiscal pessoal já existente (user_id como tenant,
 * profiles.tax_number como identificador) sem criar entidade nova e sem
 * tocar no caminho AT empresarial (company-only).
 *
 * Regras:
 * - userId vem sempre da sessão server-side, nunca do browser.
 * - taxNumber nunca é tenant key nem sai daqui (só presença booleana).
 * - company_id é obrigatório SÓ para capabilities empresariais.
 */
export type PersonalTaxpayerKind = "INDIVIDUAL" | "SOLE_TRADER" | "UNKNOWN";

export interface PersonalFiscalContext {
  /** auth.user.id (sessão). Único tenant pessoal. */
  userId: string;
  /** Existe NIF no profile (sem expor o valor). */
  taxNumberPresent: boolean;
  taxpayerKind: PersonalTaxpayerKind;
}

/** Capabilities fiscais conhecidas (extensível sem migração). */
export type FiscalCapability =
  | "personal_obligations"
  | "personal_invoices"
  | "personal_calculations"
  | "at_connection"
  | "at_submission"
  | "fiscal_inbox";

const COMPANY_REQUIRED: ReadonlySet<FiscalCapability> = new Set([
  "at_connection",
  "at_submission",
  "fiscal_inbox",
]);

/**
 * Resolve contexto fiscal pessoal a partir de dados server-side.
 * Devolve null sem userId (fail-closed). Nunca recebe NIF do browser.
 */
export function resolvePersonalFiscalContext(input: {
  userId: string | null | undefined;
  taxNumber: string | null | undefined;
  sector?: string | null | undefined;
}): PersonalFiscalContext | null {
  if (!input.userId) return null;
  const sector = (input.sector ?? "").toUpperCase();
  return {
    userId: input.userId,
    taxNumberPresent: !!input.taxNumber && input.taxNumber.trim().length > 0,
    taxpayerKind: sector === "SOLE_TRADER" ? "SOLE_TRADER" : "INDIVIDUAL",
  };
}

/** company_id obrigatório só para operações fiscais empresariais. */
export function requiresCompany(capability: FiscalCapability): boolean {
  return COMPANY_REQUIRED.has(capability);
}
