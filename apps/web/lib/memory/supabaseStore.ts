/**
 * RPG-OS — Adaptador Supabase do MemoryStore (CICLO M1).
 * Usa o admin client com filtro obrigatório por user_id: a rota já garantiu
 * autenticação, e o scoping por ator impede fuga entre utilizadores.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isMemoryKind,
  type MemoryStore,
  type UpsertMemoryInput,
  type UserMemory,
} from "@rpg/core";

interface UserMemoryRow {
  id: string;
  user_id: string;
  key: string;
  value: Record<string, unknown>;
  kind: string;
  source: string | null;
  updated_at: string;
}

export class SupabaseMemoryStore implements MemoryStore {
  private readonly db = createAdminClient();

  async getUserMemories(actorId: string): Promise<UserMemory[]> {
    const { data, error } = await this.db
      .from("user_memories")
      .select("id, user_id, key, value, kind, source, updated_at")
      .eq("user_id", actorId)
      .order("updated_at", { ascending: false });

    if (error) throw new Error("Falha ao ler memórias.");
    if (!data) return [];

    const rows = data as unknown as UserMemoryRow[];
    return rows.flatMap((row) => {
      if (!isMemoryKind(row.kind)) return [];
      const memory: UserMemory = {
        id: String(row.id),
        userId: String(row.user_id),
        key: String(row.key),
        value: row.value,
        kind: row.kind,
        updatedAt: String(row.updated_at),
      };
      if (row.source !== null) memory.source = String(row.source);
      return [memory];
    });
  }

  async upsertMemory(input: UpsertMemoryInput): Promise<void> {
    const payload: Record<string, unknown> = {
      user_id: input.userId,
      key: input.key,
      value: input.value,
      kind: input.kind,
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.db
      .from("user_memories")
      .upsert(payload, { onConflict: "user_id,key" });

    if (error) throw new Error("Falha ao guardar memória.");
  }

  async deleteMemory(userId: string, key: string): Promise<void> {
    const { error } = await this.db
      .from("user_memories")
      .delete()
      .eq("user_id", userId)
      .eq("key", key);

    if (error) throw new Error("Falha ao apagar memória.");
  }
}