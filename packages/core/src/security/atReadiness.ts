/**
 * RPG-OS — AT TEST readiness gate (lógica pura, sem I/O, sem rede, sem segredos).
 *
 * READINESS = "a configuração parece pronta" (metadata booleana apenas).
 * READINESS nunca é HANDSHAKE: READY nunca promove para CERTIFIED, nunca
 * dispara rede, nunca ativa TEST gate, nunca toca em produção.
 * Produção nunca é READY — por construção, independentemente de tudo o resto.
 */

/** Razões sanitizadas — nunca contêm valores, refs, segredos ou URLs. */
export type AtReadinessReason =
  | "MISSING_CONNECTION"
  | "MISSING_CREDENTIAL_REFERENCE"
  | "MISSING_CERTIFICATE_REFERENCE"
  | "MISSING_PRIVATE_KEY_REFERENCE"
  | "INVALID_ENVIRONMENT"
  | "ENDPOINT_NOT_ALLOWED"
  | "CONSENT_REQUIRED"
  | "AUTHORIZATION_REQUIRED"
  | "TEST_GATE_DISABLED";

export interface AtTestReadinessInput {
  /** Ambiente pretendido. Só a string exata "TEST" é admissível. */
  environment: unknown;
  /** Existe registo at_connections (metadata) para a company autorizada. */
  connectionConfigured: boolean;
  /** Ref de credencial WFA configurada (existência apenas, nunca o valor). */
  credentialRefConfigured: boolean;
  /** Ref de certificado configurada (existência apenas). */
  certificateRefConfigured: boolean;
  /** Ref de chave privada configurada (existência apenas). */
  privateKeyRefConfigured: boolean;
  /** Endpoint configurado está na allowlist oficial TEST (:723/:725). */
  endpointAllowed: boolean;
  /** Consentimento AT ACTIVE para a company. */
  consentActive: boolean;
  /** Actor autenticado, com membership e fiscal.manage sobre a company. */
  authorized: boolean;
  /** AT_TEST_ENABLED. */
  testGateEnabled: boolean;
}

export interface AtTestReadiness {
  status: "READY" | "BLOCKED";
  reasons: AtReadinessReason[];
}

/**
 * Avalia readiness de forma determinística. READY só quando TODOS os
 * requisitos estão satisfeitos; caso contrário BLOCKED com razões sanitizadas.
 */
export function evaluateAtTestReadiness(input: AtTestReadinessInput): AtTestReadiness {
  const reasons: AtReadinessReason[] = [];
  if (input.environment !== "TEST") reasons.push("INVALID_ENVIRONMENT");
  if (!input.connectionConfigured) reasons.push("MISSING_CONNECTION");
  if (!input.credentialRefConfigured) reasons.push("MISSING_CREDENTIAL_REFERENCE");
  if (!input.certificateRefConfigured) reasons.push("MISSING_CERTIFICATE_REFERENCE");
  if (!input.privateKeyRefConfigured) reasons.push("MISSING_PRIVATE_KEY_REFERENCE");
  if (!input.endpointAllowed) reasons.push("ENDPOINT_NOT_ALLOWED");
  if (!input.consentActive) reasons.push("CONSENT_REQUIRED");
  if (!input.authorized) reasons.push("AUTHORIZATION_REQUIRED");
  if (!input.testGateEnabled) reasons.push("TEST_GATE_DISABLED");
  return reasons.length === 0 ? { status: "READY", reasons: [] } : { status: "BLOCKED", reasons };
}
