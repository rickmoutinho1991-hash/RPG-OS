/**
 * RPG-OS — Seletor server-side do SecretStore.
 *
 * SECRET_BACKEND=vault → VaultSecretBackend (requer URL + service-role).
 * Qualquer outro caso → NotConfigured (fail-closed).
 * NUNCA FakeSecureSecretStore fora de testes. Só chamar server-side.
 */
import {
  NotConfiguredSecretStore,
  type SecureSecretStore,
} from "@rpg/core";
import { VaultSecretBackend } from "./vaultBackend";

export function getSecretStore(): SecureSecretStore {
  if (
    process.env.SECRET_BACKEND === "vault" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return new VaultSecretBackend({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
  }
  return new NotConfiguredSecretStore();
}

export { VaultSecretBackend, vaultSecretName } from "./vaultBackend";
