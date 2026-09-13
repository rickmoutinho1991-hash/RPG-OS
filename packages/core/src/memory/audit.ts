/**
 * RPG-OS — Memória de IA: ações de auditoria (M3).
 *
 * Convenção de nomes: DOMINIO_SUJEITO_PASSADO, em linha com os registos
 * canónicos de audit (ex.: FINANCE_INCOME_CREATED, PAYMENT_SUCCEEDED).
 * O rasto de audit regista SEMPRE {action, key, kind, actorId} e NUNCA o
 * value (dado pessoal). Falha do audit → mutação prossegue (dado protegido
 * por RLS), com erro logado server-side.
 */
export const MEMORY_ENTRY_SET = "MEMORY_ENTRY_SET";
export const MEMORY_ENTRY_DELETED = "MEMORY_ENTRY_DELETED";

export const MEMORY_AUDIT_ACTIONS = [
  MEMORY_ENTRY_SET,
  MEMORY_ENTRY_DELETED,
] as const;

export type MemoryAuditAction = (typeof MEMORY_AUDIT_ACTIONS)[number];

export function isMemoryAuditAction(
  value: unknown,
): value is MemoryAuditAction {
  return (
    typeof value === "string" &&
    (MEMORY_AUDIT_ACTIONS as readonly string[]).includes(value)
  );
}
