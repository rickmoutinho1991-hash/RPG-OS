/**
 * RPG-OS — Redaction / Safe Logging.
 *
 * Serviço PURO: transforma apenas a representação usada em logs/auditoria.
 * Nunca altera os dados originais. Nunca devolve passwords, tokens ou
 * secrets — nem redigidos (são omitidos por completo).
 *
 * Regras:
 *  - email     → parcia­lmente mascarado (jo***@dominio.com)
 *  - telefone  → parcia­lmente mascarado (9** *** ***)
 *  - NIF       → mascarado (***123456 parcial → 1***45678)
 *  - IBAN      → mascarado (PT50************1234)
 *  - token/API key/password/secret → omitidos (não aparecem no output)
 */

import {
  classifyData,
  canAppearInAuditLog,
  type DataSensitivity,
} from "./dataClassification";

const REDACTED = "[REDACTED]";

/** Redige um valor escalar segundo a sua classificação. */
export function redactSensitiveValue(
  value: unknown,
  classification: DataSensitivity,
): unknown {
  if (value === null || value === undefined) return value;

  if (!canAppearInAuditLog(classification)) {
    // Passwords, tokens, secrets: nem sequer a sua existência é registada.
    return undefined;
  }

  if (classification === "PUBLIC" || classification === "INTERNAL") {
    return value;
  }

  if (typeof value !== "string") return REDACTED;

  const v = value.trim();
  if (!v) return value;

  // Email: preserva primeiro carácter + domínio.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    const [local, domain] = v.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  }

  // IBAN PT.
  const compact = v.replace(/\s/g, "").toUpperCase();
  if (/^PT50\d{21}$/.test(compact)) {
    return `${compact.slice(0, 4)}${"*".repeat(compact.length - 8)}${compact.slice(-4)}`;
  }

  // Telefone PT (+351 opcional).
  const digits = v.replace(/[\s.-]/g, "");
  if (/^\+?351?9\d{8}$/.test(digits)) {
    const last3 = digits.slice(-3);
    return `+351 *** *** ${last3}`;
  }

  // NIF/NIPC (9 dígitos).
  if (/^\d{9}$/.test(digits)) {
    return `***${digits.slice(-3)}`;
  }

  // String sensível genérica: mantém último 2 caracteres se for longa.
  if (v.length > 6) {
    return `***${v.slice(-2)}`;
  }
  return REDACTED;
}

/**
 * Sanitiza um objeto de metadados para escrita em audit_logs.
 * Percorre recursivamente, classificando cada chave:
 *  - HIGHLY_SENSITIVE → removido do output (não existe no log);
 *  - SENSITIVE        → redigido (mascarado);
 *  - restantes        → mantidos.
 *
 * Valores aninhados em arrays e objetos também são tratados.
 * Profundidade máxima 5; objetos demasiado profundos são redigidos.
 */
export function sanitizeAuditMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeObject(metadata, 0);
}

function sanitizeObject(
  obj: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const classification = classifyData(key, value);

    if (!canAppearInAuditLog(classification.level)) {
      continue; // omitido — password/token/secret nunca existem no log
    }

    out[key] = sanitizeValue(key, value, classification.level, depth);
  }

  return out;
}

function sanitizeValue(
  key: string,
  value: unknown,
  level: DataSensitivity,
  depth: number,
): unknown {
  if (value === null || value === undefined) return value;

  if (depth >= 5) return REDACTED;

  if (Array.isArray(value)) {
    if (level === "SENSITIVE") {
      return value.map((v) => redactSensitiveValue(v, level));
    }
    return value.map((v) =>
      typeof v === "object" && v !== null && !Array.isArray(v)
        ? sanitizeObject(v as Record<string, unknown>, depth + 1)
        : v,
    );
  }

  if (typeof value === "object") {
    return sanitizeObject(value as Record<string, unknown>, depth + 1);
  }

  if (level === "SENSITIVE") {
    return redactSensitiveValue(value, level);
  }

  // CONFIDENTIAL/PUBLIC/INTERNAL: mantido em logs.
  return value;
}
