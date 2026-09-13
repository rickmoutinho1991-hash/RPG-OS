"use server";

/**
 * RPG-OS — provisioning seguro de credenciais AT TEST (D21.5, server-side only).
 *
 * Fluxo: sessão → fiscal.manage → company server-side → conexão TEST da
 * própria company → validação de material → Vault (putRef, valores só em
 * memória) → refs opacas na conexão. Rotação segura: sempre segredos NOVOS;
 * refs antigas nunca apagadas aqui. Falha de attach → cleanup dos segredos
 * recém-criados (quarentena via deleteRef quando suportado).
 *
 * Nunca devolve valores secretos; erros sanitizados; sem rede AT.
 */
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { getCurrentUser } from "@/lib/supabase/auth";
import { recordAuditEvent } from "@/lib/audit";
import { getSecretStore, VaultSecretBackend } from "@/lib/secrets";
import {
  PROVISION_REF_COLUMNS,
  resolveProvisionGate,
  validateProvisionMaterial,
  hasPermission,
  type AtProvisionKind,
  type AtProvisionMaterial,
} from "@rpg/core";

export interface AtProvisionResult {
  ok: boolean;
  error?: string;
  /** Kinds provisionados (metadata). Nunca valores. */
  provisioned?: AtProvisionKind[];
}

const KINDS: AtProvisionKind[] = [
  "wfaUsername",
  "wfaPassword",
  "certificate",
  "privateKey",
  "chain",
];

function materialValue(kind: AtProvisionKind, material: AtProvisionMaterial): string | null {
  switch (kind) {
    case "wfaUsername":
      return material.wfaUsername.trim();
    case "wfaPassword":
      return material.wfaPassword;
    case "certificate":
      return material.certificatePem;
    case "privateKey":
      return material.privateKeyPem;
    case "chain":
      return material.chainPem && material.chainPem.trim().length > 0
        ? material.chainPem
        : null;
  }
}

interface ConnectionRow {
  id: string;
  company_id: string;
  environment: string;
  status: string;
}

/** Apaga segredos recém-criados após falha de attach (best-effort, sem throw). */
async function cleanupCreated(
  store: ReturnType<typeof getSecretStore>,
  companyId: string,
  created: Array<{ id: string }>,
): Promise<void> {
  if (!(store instanceof VaultSecretBackend)) return;
  for (const c of created) {
    try {
      await store.deleteRef(c.id, companyId);
    } catch {
      // Quarentena manual pelo operador se necessário; nunca bloquear com throw.
    }
  }
}

export async function provisionAtConnectionCredentials(
  connectionId: string,
  material: AtProvisionMaterial,
): Promise<AtProvisionResult> {
  const session = await getSessionContext();
  if (!session || !hasPermission(session.permissions, "fiscal.manage")) {
    return { ok: false, error: "FORBIDDEN" };
  }
  const user = await getCurrentUser();
  if (!user?.companyId) return { ok: false, error: "FORBIDDEN" };
  const companyId = user.companyId;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("at_connections")
    .select("id,company_id,environment,status")
    .eq("id", connectionId)
    .maybeSingle();
  const conn = data as unknown as ConnectionRow | null;
  if (!conn) return { ok: false, error: "NOT_FOUND" };

  const gate = resolveProvisionGate({
    authorized: true,
    actorCompanyId: companyId,
    connectionCompanyId: conn.company_id,
    environment: conn.environment,
    revoked: conn.status === "REVOKED",
  });
  if (!gate.allowed) return { ok: false, error: gate.reason ?? "FORBIDDEN" };

  const validation = validateProvisionMaterial(material);
  if (!validation.ok) return { ok: false, error: "INVALID_MATERIAL" };

  const store = getSecretStore();
  // Provisioning exige o backend Vault real; qualquer outro (ex.:
  // NotConfigured) falha closed sem tocar em nada.
  if (!(store instanceof VaultSecretBackend)) {
    return { ok: false, error: "PROVISION_FAILED" };
  }
  const created: Array<{ kind: AtProvisionKind; id: string }> = [];
  try {
    for (const kind of KINDS) {
      const value = materialValue(kind, material);
      if (value === null) continue; // chain opcional ausente
      const meta = await store.putRef(
        {
          secretId: randomUUID(),
          provider: "AT",
          companyId,
          environment: "TEST",
          credentialType: PROVISION_REF_COLUMNS[kind].credentialType,
        },
        value,
      );
      created.push({ kind, id: meta.id });
    }
  } catch {
    await cleanupCreated(store, companyId, created);
    return { ok: false, error: "PROVISION_FAILED" };
  }

  const refs: Record<string, string> = {};
  for (const c of created) {
    refs[PROVISION_REF_COLUMNS[c.kind].column] = c.id;
  }
  const { error: updateError } = await supabase
    .from("at_connections")
    .update({
      ...refs,
      status: "CREDENTIALS_PENDING",
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);
  if (updateError) {
    await cleanupCreated(store, companyId, created);
    return { ok: false, error: "ATTACH_FAILED" };
  }

  try {
    await recordAuditEvent({
      userId: user.id,
      companyId,
      organizationId: null,
      action: "at.credentials.provisioned",
      module: "FISCAL",
      entityType: "AT_CONNECTION",
      entityId: connectionId,
      metadata: {
        environment: "TEST",
        credentialTypes: created.map(
          (c) => PROVISION_REF_COLUMNS[c.kind].credentialType,
        ),
      },
    });
  } catch {
    // Auditoria nunca desfaz o provisioning nem expõe valores.
  }
  return { ok: true, provisioned: created.map((c) => c.kind) };
}
