/**
 * RPG-OS — Políticas RLS owner-only (security/M-G, helper puro).
 *
 * Endurecimento determinístico de tabelas pessoais: quando existe ownership
 * direta (`user_id = auth.uid()`), o plano descrito aqui cobre select/insert/
 * update/delete com `using`/`check` corretos. O app lê/escreve `notifications`
 * apenas via cliente admin (bypass RLS), pelo que trancar owner-only não
 * quebra o app e fecha a fuga `notif_all`.
 */

/** Ações de política reconhecidas pelo helper, na ordem estável de criação. */
export const OWNER_POLICY_COMMANDS = [
  "select",
  "insert",
  "update",
  "delete",
] as const;
export type OwnerPolicyCommand = (typeof OWNER_POLICY_COMMANDS)[number];

/** Coluna de ownership direta reconhecida. */
export const OWNER_POLICY_COLUMN = "user_id" as const;

/** Nome estável e único de política por tabela+ação. */
export function ownerPolicyName(
  table: string,
  command: OwnerPolicyCommand,
): string {
  return `${table}_owner_${command}`;
}

/** True quando a tabela tem ownership direta viável (`user_id`). */
export function supportsOwnerPolicy(ownerColumns: readonly string[]): boolean {
  return ownerColumns.includes(OWNER_POLICY_COLUMN);
}

/** Coluna de ownership se viável, senão null. */
export function ownerColumnFor(
  ownerColumns: readonly string[],
): "user_id" | null {
  return supportsOwnerPolicy(ownerColumns) ? OWNER_POLICY_COLUMN : null;
}

interface OwnerPolicyEntry {
  command: OwnerPolicyCommand;
  kind: "using" | "check";
}

const OWNER_POLICY_ENTRIES: OwnerPolicyEntry[] = [
  { command: "select", kind: "using" },
  { command: "insert", kind: "check" },
  { command: "update", kind: "using" },
  { command: "delete", kind: "using" },
];

/**
 * Plano de políticas owner-only a criar para a tabela, quando viável.
 * Usado para validar/documentar o hardening sem depender de tipos de retorno
 * específicos do Postgres.
 */
export function ownerPolicyPlan(
  table: string,
  ownerColumns: readonly string[],
): {
  command: OwnerPolicyCommand;
  kind: "using" | "check";
  policy: string;
}[] {
  if (!supportsOwnerPolicy(ownerColumns)) return [];
  return OWNER_POLICY_ENTRIES.map(({ command, kind }) => ({
    command,
    kind,
    policy: `${ownerPolicyName(table, command)} (${OWNER_POLICY_COLUMN} = auth.uid())`,
  }));
}

/** Cobertura esperada: todas as ações owner para a tabela. */
export function ownerPolicyCoverage(): readonly OwnerPolicyCommand[] {
  return OWNER_POLICY_COMMANDS;
}

/** Nome determinístico do ficheiro de migração de hardening owner-only. */
export function ownerHardeningMigrationName(
  dayStamp: string,
  tables: readonly string[],
): string {
  return `${dayStamp}_rls_owner_${tables.join("_")}.sql`;
}
