/**
 * RPG-OS — Classificação formal de dados (Privacy by Design).
 *
 * Determinística e pura: nenhuma função aqui depende de I/O, estado global
 * ou dados reais de clientes.
 *
 * Níveis (do menos para o mais restritivo):
 *  - PUBLIC            — pode ser publicado sem risco.
 *  - INTERNAL          — uso interno da organização; não é PII.
 *  - CONFIDENTIAL      — dados de negócio (clientes, projetos, faturas).
 *  - SENSITIVE         — PII direta (email, telefone, NIF, IBAN, morada).
 *  - HIGHLY_SENSITIVE  — credenciais, tokens, segredos, documentos de
 *                        identificação. NUNCA podem aparecer em logs.
 */

export type DataSensitivity =
  | "PUBLIC"
  | "INTERNAL"
  | "CONFIDENTIAL"
  | "SENSITIVE"
  | "HIGHLY_SENSITIVE";

export interface DataClassification {
  /** Nível de sensibilidade atribuído. */
  level: DataSensitivity;
  /** Finalidade declarada do tratamento (RGPD Art. 5.º/9.º). */
  purpose: string;
  /** Verdadeiro se o valor deve ser encriptado em repouso. */
  encryptedAtRest: boolean;
  /** Verdadeiro se o valor pode ser escrito num audit log. */
  auditLogAllowed: boolean;
}

/** Ordem dos níveis — índice maior = mais restritivo. */
export const SENSITIVITY_ORDER: readonly DataSensitivity[] = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "SENSITIVE",
  "HIGHLY_SENSITIVE",
] as const;

/** Metadados de classificação por nível. */
export const DATA_CLASSIFICATIONS: Record<DataSensitivity, DataClassification> =
  {
    PUBLIC: {
      level: "PUBLIC",
      purpose: "Informação pública partilhável",
      encryptedAtRest: false,
      auditLogAllowed: true,
    },
    INTERNAL: {
      level: "INTERNAL",
      purpose: "Operação interna da organização",
      encryptedAtRest: false,
      auditLogAllowed: true,
    },
    CONFIDENTIAL: {
      level: "CONFIDENTIAL",
      purpose: "Dados de negócio confidenciais (clientes, projetos, faturação)",
      encryptedAtRest: true,
      auditLogAllowed: true,
    },
    SENSITIVE: {
      level: "SENSITIVE",
      purpose:
        "Dados pessoais diretos (RGPD) — email, telefone, NIF, IBAN, morada",
      encryptedAtRest: true,
      auditLogAllowed: true, // apenas em forma redigida — ver redaction.ts
    },
    HIGHLY_SENSITIVE: {
      level: "HIGHLY_SENSITIVE",
      purpose:
        "Credenciais, tokens, segredos e documentos de identificação — nunca registados",
      encryptedAtRest: true,
      auditLogAllowed: false,
    },
  };

/** Padrões de deteção de campos sensíveis (por nome de chave). */
const SENSITIVE_KEY_PATTERNS: readonly RegExp[] = [
  /pass(word|phrase)?/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /auth(orization)?[-_]?(key|header|code)?/i,
  /credential/i,
  /private[-_]?key/i,
  /session[-_]?id/i,
  /cookie/i,
  /^iban$/i,
  /nif|nipc/i,
  /tax[-_]?number/i,
  /^email$|[-_]?email$/i,
  /phone|telefone|telem[oó]vel/i,
  /ssn|cart[aã]o[-_]?cidadao|cc[-_]?number/i,
  /access[-_]?code/i,
  /otp/i,
];

/** Chaves que são sempre consideradas segredos — nunca em logs, nem redigidas. */
const SECRET_KEY_PATTERNS: readonly RegExp[] = [
  /pass(word|phrase)?/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /credential/i,
  /private[-_]?key/i,
  /certificate|cert(\.|_|-|$)|pem\b|\.pem/i,
  /\bwfa\b/i,
  /access[-_]?code/i,
  /otp/i,
  /cookie/i,
  /session[-_]?id/i,
];

/** Compara dois níveis: devolve positivo se a > b. */
export function sensitivityRank(level: DataSensitivity): number {
  return SENSITIVITY_ORDER.indexOf(level);
}

/**
 * Classifica um valor por chave e conteúdo de forma determinística.
 * Não executa I/O nem usa heurísticas não testáveis.
 */
export function classifyData(key: string, value: unknown): DataClassification {
  const k = String(key);

  if (SECRET_KEY_PATTERNS.some((re) => re.test(k))) {
    return DATA_CLASSIFICATIONS.HIGHLY_SENSITIVE;
  }

  if (SENSITIVE_KEY_PATTERNS.some((re) => re.test(k))) {
    return DATA_CLASSIFICATIONS.SENSITIVE;
  }

  // Detecção por conteúdo — apenas strings com formato reconhecível.
  if (typeof value === "string") {
    if (/^\d{9}$/.test(value.trim())) {
      return DATA_CLASSIFICATIONS.SENSITIVE; // possível NIF
    }
    if (/^PT50\d{21}$/.test(value.replace(/\s/g, "").toUpperCase())) {
      return DATA_CLASSIFICATIONS.SENSITIVE; // IBAN PT
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      return DATA_CLASSIFICATIONS.SENSITIVE; // email
    }
    if (/^\+?351?\d{9}$/.test(value.replace(/[\s.-]/g, ""))) {
      return DATA_CLASSIFICATIONS.SENSITIVE; // telefone PT
    }
  }

  return DATA_CLASSIFICATIONS.CONFIDENTIAL;
}

/** Verdadeiro se o nível implica dados pessoais ou credenciais. */
export function isSensitiveData(level: DataSensitivity): boolean {
  return sensitivityRank(level) >= sensitivityRank("SENSITIVE");
}

/** Verdadeiro se o valor classificado deve ser encriptado em repouso. */
export function requiresEncryption(level: DataSensitivity): boolean {
  return DATA_CLASSIFICATIONS[level].encryptedAtRest;
}

/**
 * Verdadeiro se um valor com esta classificação pode aparecer num audit log.
 * HIGHLY_SENSITIVE (passwords, tokens, secrets) nunca pode — nem redigido.
 */
export function canAppearInAuditLog(level: DataSensitivity): boolean {
  return DATA_CLASSIFICATIONS[level].auditLogAllowed;
}
