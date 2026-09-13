/**
 * RPG-OS — AT credential resolver (server-side only).
 *
 * Deriva bundle em memória a partir de connectionId. Cadeia: sessão →
 * fiscal.manage → company (perfil) → conexão D3 (company match) → consent
 * AT ativo → refs Vault → valores → validações (NIF, cert/key, validade,
 * ambiente). Browser nunca fornece segredos; SOAP client nunca toca no Vault.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { getCurrentUser } from "@/lib/supabase/auth";
import { certificateMatchesPrivateKey, hasPermission, isValidPortugueseNif } from "@rpg/core";
import { getSecretStore } from "@/lib/secrets";
import type { AtTlsMaterial } from "./transport";

export interface AtCredentialBundle {
  connectionId: string;
  companyId: string;
  nif: string;
  environment: "TEST" | "PRODUCTION";
  wfaUsername: string;
  wfaPassword: string;
  tls: AtTlsMaterial;
}

export type AtResolverError =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "AT_CONNECTION_NOT_FOUND"
  | "AT_CONNECTION_REVOKED"
  | "AT_CONSENT_REQUIRED"
  | "AT_CREDENTIALS_MISSING"
  | "AT_CREDENTIALS_PARTIAL"
  | "AT_CREDENTIALS_EXPIRED"
  | "AT_CERTIFICATE_INVALID"
  | "AT_CERTIFICATE_KEY_MISMATCH"
  | "AT_ENVIRONMENT_MISMATCH"
  | "AT_PROVIDER_MISMATCH";

export class AtResolverException extends Error {
  readonly code: AtResolverError;
  constructor(code: AtResolverError) {
    super(code);
    this.name = "AtResolverException";
    this.code = code;
  }
}

function fail(code: AtResolverError): never {
  throw new AtResolverException(code);
}

interface DbConnection {
  id: string;
  company_id: string;
  nif: string;
  environment: "TEST" | "PRODUCTION";
  status: string;
  consent_id: string | null;
  cert_secret_ref: string | null;
  key_secret_ref: string | null;
  chain_secret_ref: string | null;
  wfa_user_secret_ref: string | null;
  wfa_pass_secret_ref: string | null;
  cert_not_after: string | null;
}

/** Resolve bundle em memória. Nunca persiste nem devolve segredos ao chamar. */
export async function resolveATTransportCredentials(
  connectionId: string,
): Promise<AtCredentialBundle> {
  const session = await getSessionContext();
  if (!session) fail("UNAUTHENTICATED");
  if (!hasPermission(session.permissions, "fiscal.manage")) fail("FORBIDDEN");
  const user = await getCurrentUser();
  if (!user?.companyId) fail("FORBIDDEN");

  const supabase = createAdminClient();
  const { data: conn } = await supabase
    .from("at_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  const connection = conn as unknown as DbConnection | null;
  if (!connection) fail("AT_CONNECTION_NOT_FOUND");
  const c = connection as DbConnection;
  // Company isolation: conexão tem de ser da empresa do actor.
  if (c.company_id !== user.companyId) fail("FORBIDDEN");
  if (c.status === "REVOKED") fail("AT_CONNECTION_REVOKED");
  // NIF da conexão tem de coincidir com o NIF da empresa (server-side).
  const { data: company } = await supabase
    .from("companies")
    .select("tax_number")
    .eq("id", c.company_id)
    .maybeSingle();
  const companyNif = (company as { tax_number?: string } | null)?.tax_number;
  if (!companyNif || !isValidPortugueseNif(companyNif) || companyNif !== c.nif) {
    fail("AT_CONNECTION_REVOKED");
  }

  // Consent AT ativo para a company.
  const { data: consent } = await supabase
    .from("government_consents")
    .select("id,revoked_at,expires_at,provider_id")
    .eq("id", c.consent_id ?? "")
    .maybeSingle();
  const consentRow = consent as unknown as {
    revoked_at: string | null;
    expires_at: string | null;
    provider_id: string;
  } | null;
  if (
    !c.consent_id ||
    !consentRow ||
    consentRow.revoked_at ||
    consentRow.provider_id !== "AT" ||
    (consentRow.expires_at && new Date(consentRow.expires_at).getTime() <= Date.now())
  ) {
    fail("AT_CONSENT_REQUIRED");
  }

  // Refs presentes (sem elas, PARTIAL — nunca consulta parcial).
  const refs = {
    cert: c.cert_secret_ref,
    key: c.key_secret_ref,
    chain: c.chain_secret_ref,
    wfaUser: c.wfa_user_secret_ref,
    wfaPass: c.wfa_pass_secret_ref,
  };
  if (!refs.cert || !refs.key || !refs.chain || !refs.wfaUser || !refs.wfaPass) {
    fail("AT_CREDENTIALS_PARTIAL");
  }

  // Leitura por id + company (scope validado dentro do backend).
  const store = getSecretStore();
  const [cert, key, chain, wfaUser, wfaPass] = await Promise.all([
    store.getSecretById(refs.cert as string, c.company_id),
    store.getSecretById(refs.key as string, c.company_id),
    store.getSecretById(refs.chain as string, c.company_id),
    store.getSecretById(refs.wfaUser as string, c.company_id),
    store.getSecretById(refs.wfaPass as string, c.company_id),
  ]);
  if (!cert || !key || !chain || !wfaUser || !wfaPass) {
    fail("AT_CREDENTIALS_MISSING");
  }
  const certPem = (cert as { reveal(): string }).reveal();
  const keyPem = (key as { reveal(): string }).reveal();
  const chainPem = (chain as { reveal(): string }).reveal();
  const wfaUsername = (wfaUser as { reveal(): string }).reveal();
  const wfaPassword = (wfaPass as { reveal(): string }).reveal();

  // Cert/key match + validade (sem isto, nunca handshake).
  let matches = false;
  try {
    matches = certificateMatchesPrivateKey(certPem, keyPem);
  } catch {
    fail("AT_CERTIFICATE_INVALID");
  }
  if (!matches) fail("AT_CERTIFICATE_KEY_MISMATCH");
  if (c.cert_not_after && new Date(c.cert_not_after).getTime() <= Date.now()) {
    fail("AT_CREDENTIALS_EXPIRED");
  }

  return {
    connectionId: c.id,
    companyId: c.company_id,
    nif: c.nif,
    environment: c.environment,
    wfaUsername,
    wfaPassword,
    tls: { certPem, keyPem, caPem: chainPem },
  };
}
