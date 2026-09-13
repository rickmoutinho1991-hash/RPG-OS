/**
 * RPG-OS — MemoryService: porta de acesso estruturado à memória de IA.
 * Fail-closed (REGRA F): recusa actorId vazio, kind fora do enum e
 * valores null/array/indefinidos antes de tocar no store.
 */
import { isMemoryKind, type MemoryKind, type MemoryStore, type UserMemory } from "./types";

const MAX_KEY_LENGTH = 200;

export class MemoryService {
  public constructor(private readonly store: MemoryStore) {}

  /** Devolve todas as memórias do ator, mais recentes primeiro. */
  public async get(actorId: string): Promise<UserMemory[]> {
    const userId = assertActorId(actorId);
    return this.store.getUserMemories(userId);
  }

  /** Guarda/sobrescreve uma memória (key única por ator). */
  public async set(
    actorId: string,
    key: string,
    value: Record<string, unknown>,
    kind: MemoryKind,
  ): Promise<void> {
    const userId = assertActorId(actorId);
    if (!assertKey(key)) throw new Error("Key inválida.");
    if (!assertValue(value)) throw new Error("Valor inválido (não pode ser null ou array).");
    if (!isMemoryKind(kind)) throw new Error("Kind inválido.");

    await this.store.upsertMemory({ userId, key, value, kind });
  }

  /** Apaga uma memória do ator (sem erro se não existir). */
  public async delete(actorId: string, key: string): Promise<void> {
    const userId = assertActorId(actorId);
    if (!assertKey(key)) throw new Error("Key inválida.");

    await this.store.deleteMemory(userId, key);
  }
}

function assertActorId(actorId: string): string {
  if (typeof actorId !== "string" || actorId.trim().length === 0) {
    throw new Error("Ator em falta.");
  }
  return actorId;
}

function assertKey(key: string): boolean {
  if (typeof key !== "string" || key.trim().length === 0) return false;
  if (key.length > MAX_KEY_LENGTH) return false;
  return true;
}

function assertValue(value: Record<string, unknown>): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}