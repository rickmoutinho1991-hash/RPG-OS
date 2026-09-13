/**
 * RPG-OS — Retenção de dados / Minimização (fundação apenas).
 *
 * Nesta fase NADA é apagado automaticamente. Isto define apenas os tipos
 * e as regras puras que determinarão, no futuro, a elegibilidade para
 * eliminação/anonimização (RGPD Art. 5.º(1)(e) e 17.º).
 *
 * PII real não deve aparecer nestas definições — apenas categorias.
 */

import type { DataSensitivity } from "./dataClassification";

/** Finalidades de tratamento declaradas (RGPD Art. 5.º(1)(b)). */
export type RetentionPurpose =
  | "CONTRACT_EXECUTION" // execução de contrato/faturação — Art. 6.º(1)(b)
  | "LEGAL_OBLIGATION" // obrigações fiscais/SAF-T — Art. 6.º(1)(c)
  | "LEGITIMATE_INTEREST" // auditoria e segurança — Art. 6.º(1)(f)
  | "CONSENT" // consentimento explícito — Art. 6.º(1)(a)
  | "SECURITY_AUDIT"; // integridade e prevenção de fraude

export interface RetentionPolicy {
  /** Categoria de dados a que se aplica (nunca PII individual). */
  dataCategory: string;
  classification: DataSensitivity;
  purpose: RetentionPurpose;
  /** Prazo máximo de retenção em meses desde o evento/última atividade. */
  retentionMonths: number;
  /** Ação quando o prazo expira. */
  onExpiry: "DELETE" | "ANONYMIZE" | "REVIEW";
  /** Referência legal ou interna. */
  legalBasis: string;
}

/**
 * Políticas iniciais (fundação — ainda não aplicadas automaticamente).
 * Valores alinhados com práticas PT: faturação 10 anos (Art. 53.º CIVA),
 * logs de auditoria 12 meses, etc.
 */
export const DEFAULT_RETENTION_POLICIES: readonly RetentionPolicy[] = [
  {
    dataCategory: "fiscal_documents", // faturas, guias, SAF-T
    classification: "CONFIDENTIAL",
    purpose: "LEGAL_OBLIGATION",
    retentionMonths: 120, // 10 anos
    onExpiry: "REVIEW",
    legalBasis: "Art. 53.º CIVA / Art. 58.º CIVA",
  },
  {
    dataCategory: "client_contact_data",
    classification: "SENSITIVE",
    purpose: "CONTRACT_EXECUTION",
    retentionMonths: 120,
    onExpiry: "ANONYMIZE",
    legalBasis: "RGPD Art. 6.º(1)(b) — duração da relação comercial",
  },
  {
    dataCategory: "audit_logs",
    classification: "CONFIDENTIAL",
    purpose: "SECURITY_AUDIT",
    retentionMonths: 12,
    onExpiry: "DELETE",
    legalBasis: "RGPD Art. 6.º(1)(f) — segurança da informação",
  },
  {
    dataCategory: "identity_documents",
    classification: "HIGHLY_SENSITIVE",
    purpose: "LEGAL_OBLIGATION",
    retentionMonths: 12,
    onExpiry: "DELETE",
    legalBasis: "Minimização RGPD Art. 5.º(1)(c)",
  },
  {
    dataCategory: "integrity_ledger",
    classification: "CONFIDENTIAL",
    purpose: "SECURITY_AUDIT",
    retentionMonths: 120,
    onExpiry: "REVIEW",
    legalBasis: "RGPD Art. 6.º(1)(f) — integridade (não contém PII)",
  },
];

export interface RetentionEvaluation {
  dataCategory: string;
  /** Data de referência (server-side, ISO-8601). */
  referenceDate: string;
  /** Verdadeiro se a data de referência excede o prazo da política. */
  eligibleForAction: boolean;
  /** Ação recomendada, se elegível. */
  recommendedAction: RetentionPolicy["onExpiry"] | null;
}

/**
 * Avalia (puramente) se um registo é elegível para ação de retenção.
 * NÃO apaga, NÃO altera dados — apenas calcula.
 */
export function evaluateRetention(
  policy: RetentionPolicy,
  referenceDate: string,
  now: Date = new Date(),
): RetentionEvaluation {
  const ref = new Date(referenceDate);
  const expiry = new Date(ref);
  expiry.setMonth(expiry.getMonth() + policy.retentionMonths);

  const eligible = now.getTime() >= expiry.getTime();
  return {
    dataCategory: policy.dataCategory,
    referenceDate,
    eligibleForAction: eligible,
    recommendedAction: eligible ? policy.onExpiry : null,
  };
}

/** Devolve a política aplicável a uma categoria, ou null. */
export function findRetentionPolicy(
  dataCategory: string,
): RetentionPolicy | null {
  return (
    DEFAULT_RETENTION_POLICIES.find((p) => p.dataCategory === dataCategory) ??
    null
  );
}
