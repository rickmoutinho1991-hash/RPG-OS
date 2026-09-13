/**
 * RPG-OS — Memória de IA: tipos canónicos (CICLO M1).
 * O que a IA regista sobre um utilizador, taxonimizado: preferência, facto
 * ou contexto. Valor JSONB genérico; a semântica de cada key vive na UI/API.
 */

export const MEMORY_KINDS = ["preference", "fact", "context"] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

export function isMemoryKind(value: unknown): value is MemoryKind {
  return (
    typeof value === "string" &&
    (MEMORY_KINDS as readonly string[]).includes(value)
  );
}

export interface UserMemory {
  id: string;
  userId: string;
  key: string;
  value: Record<string, unknown>;
  kind: MemoryKind;
  source?: string;
  updatedAt: string;
}

export interface UpsertMemoryInput {
  userId: string;
  key: string;
  value: Record<string, unknown>;
  kind: MemoryKind;
}

/** Porta de persistência da memória — implementada no adapter (web/db). */
export interface MemoryStore {
  getUserMemories(actorId: string): Promise<UserMemory[]>;
  upsertMemory(input: UpsertMemoryInput): Promise<void>;
  deleteMemory(userId: string, key: string): Promise<void>;
}