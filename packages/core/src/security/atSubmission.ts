/**
 * RPG-OS — AT submission foundation (lógica pura, sem I/O, sem rede).
 *
 * Elegibilidade, idempotência determinística, máquina de estados e mapeador
 * de resposta/pedido para RegisterInvoice (WSDL Fatcorews). Nenhum estado
 * afirma submissão oficial sem resposta AT validada (camada web/orquestração).
 */

export type AtSubmissionEligibility =
  | { eligible: true }
  | { eligible: false; reason: "DRAFT" | "CANCELLED" | "PAID" | "PARTIALLY_PAID" | "UNSUPPORTED_STATUS" };

/** Só ISSUED é submetível (CANCELLED/PAID/novos nunca). */
export function canSubmitInvoiceToAT(status: string): AtSubmissionEligibility {
  if (status === "ISSUED") return { eligible: true };
  if (status === "DRAFT") return { eligible: false, reason: "DRAFT" };
  if (status === "CANCELLED") return { eligible: false, reason: "CANCELLED" };
  if (status === "PAID") return { eligible: false, reason: "PAID" };
  if (status === "PARTIALLY_PAID") return { eligible: false, reason: "PARTIALLY_PAID" };
  return { eligible: false, reason: "UNSUPPORTED_STATUS" };
}

/**
 * Chave determinística: at-sub|<env>|<invoiceId>|RegisterInvoice.
 * Estável entre retries; sem random/Date. Inclui env para isolar TEST/PROD.
 */
export function buildSubmissionIdempotencyKey(
  invoiceId: string,
  environment: "TEST" | "PRODUCTION",
): string {
  return `at-sub|${environment}|${invoiceId}|RegisterInvoice`;
}

export type AtSubmissionState =
  | "NOT_SUBMITTED"
  | "PENDING"
  | "SUBMITTED"
  | "CONFIRMED"
  | "REJECTED"
  | "UNKNOWN";

export type AtSubmissionEvent =
  | "PREPARE_OK"
  | "SEND_OK_CONFIRMED"
  | "SEND_OK_REJECTED"
  | "SEND_UNKNOWN";

/**
 * Máquina de estados local (nunca deduzida de HTTP isolado pelo chamador).
 * Transições inválidas devolvem null (chamador rejeita).
 */
export function resolveSubmissionState(
  current: AtSubmissionState,
  event: AtSubmissionEvent,
): AtSubmissionState | null {
  if (current === "NOT_SUBMITTED" && event === "PREPARE_OK") return "PENDING";
  if (current === "PENDING" && event === "SEND_OK_CONFIRMED") return "CONFIRMED";
  if (current === "PENDING" && event === "SEND_OK_REJECTED") return "REJECTED";
  if (current === "PENDING" && event === "SEND_UNKNOWN") return "UNKNOWN";
  if (current === event as unknown as AtSubmissionState) return current;
  return null;
}

/**
 * Reconciliação futura (interface preparada, sem implementação de consulta).
 * UNKNOWN é permanente até reconciliação explícita; nunca retry automático,
 * nunca promoção automática para SUBMITTED/CONFIRMED.
 */
export type AtReconciliationOutcome =
  | "CONFIRMED"
  | "REJECTED"
  | "STILL_UNKNOWN"
  | "NOT_FOUND";

export interface AtReconciliationQuery {
  submissionId: string;
  invoiceId: string;
  organizationId: string;
}

/** Só UNKNOWN requer reconciliação; restantes estados são terminais p/ este fim. */
export function requiresReconciliation(state: AtSubmissionState): boolean {
  return state === "UNKNOWN";
}

export interface AtSubmissionResponseInput {
  codigoResposta: number;
  mensagem: string;
  dataOperacao: string;
}

export interface AtSubmissionMapped {
  outcome: "CONFIRMED" | "REJECTED" | "UNVERIFIED";
  codigoResposta: number;
  mensagem: string;
  dataOperacao: string;
}

/**
 * Mapeia resposta oficial. Sem tabela de códigos verificada, nenhum código
 * é promovido a CONFIRMED/REJECTED aqui: resultado UNVERIFIED com campos
 * extraídos. A promoção futura exige a tabela oficial de códigos.
 */
export function mapATSubmissionResponse(
  input: AtSubmissionResponseInput,
): AtSubmissionMapped {
  return {
    outcome: "UNVERIFIED",
    codigoResposta: input.codigoResposta,
    mensagem: input.mensagem.slice(0, 500),
    dataOperacao: input.dataOperacao,
  };
}

export interface AtSubmissionRequestInput {
  invoiceNo: string;
  atcud: string;
  invoiceDate: string;
  invoiceType: "FT" | "NC" | "ND" | "FS" | "FR";
  emitterNif: string;
  customerNif: string;
  customerCountry: string;
  lines: Array<{
    taxPointDate: string;
    debitCredit: "D" | "C";
    netAmount: number;
    taxCode: string;
    taxPercentage: number;
  }>;
  netTotal: number;
  taxPayable: number;
  grossTotal: number;
}

/** Valida campos exigidos pelo WSDL (sem inventar regras AT). */
export function validateSubmissionRequest(input: AtSubmissionRequestInput): string[] {
  const errors: string[] = [];
  if (!/^[^ ]+ [^/^ ]+\/[0-9]+$/.test(input.invoiceNo)) errors.push("invoiceNo");
  if (!input.atcud || input.atcud.length > 100) errors.push("atcud");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate)) errors.push("invoiceDate");
  if (!["FT", "NC", "ND", "FS", "FR"].includes(input.invoiceType)) errors.push("invoiceType");
  if (!/^\d{9}$/.test(input.emitterNif)) errors.push("emitterNif");
  if (input.customerNif.length === 0 || input.customerNif.length > 30) errors.push("customerNif");
  if (!/^[A-Z]{2}$/.test(input.customerCountry)) errors.push("customerCountry");
  if (input.lines.length === 0) errors.push("lines");
  for (const [i, l] of input.lines.entries()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(l.taxPointDate)) errors.push(`lines[${i}].taxPointDate`);
    if (l.debitCredit !== "D" && l.debitCredit !== "C") errors.push(`lines[${i}].debitCredit`);
    if (!(l.netAmount >= 0)) errors.push(`lines[${i}].netAmount`);
    if (!(l.taxPercentage >= 0 && l.taxPercentage <= 100)) errors.push(`lines[${i}].taxPercentage`);
  }
  const round2 = (n: number): number => Math.round(n * 100) / 100;
  if (round2(input.netTotal + input.taxPayable) !== round2(input.grossTotal)) {
    errors.push("totals");
  }
  return errors;
}
