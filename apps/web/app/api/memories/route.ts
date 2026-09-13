import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  MemoryService,
  type MemoryKind,
  type MemoryAuditAction,
  MEMORY_ENTRY_SET,
  MEMORY_ENTRY_DELETED,
} from "@rpg/core";
import { getSessionContext } from "@/lib/session";
import { SupabaseMemoryStore } from "@/lib/memory/supabaseStore";
import { recordAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

function service(): MemoryService {
  return new MemoryService(new SupabaseMemoryStore());
}

function failMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** UUID determinístico (v5-like) a partir de ator+key, para audit_logs.entity_id (coluna UUID). */
function memoryAuditUuid(actorId: string, key: string): string {
  const hash = createHash("sha256").update(`rpg-os:memory:${actorId}:${key}`).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * POLÍTICA M3: o rasto de audit regista SEMPRE {action, key, kind, actorId}
 * (timestamps server-side por audit_logs) e NUNCA o value — dado pessoal.
 * Falha de audit NÃO bloqueia a mutação (o dado é do próprio utilizador,
 * protegido por RLS): apenas erra e continua, com erro logado server-side.
 */
async function auditMemoryMutation(
  input: { action: MemoryAuditAction; key: string; kind?: MemoryKind },
  actorId: string,
  route: "POST /api/memories" | "DELETE /api/memories",
): Promise<void> {
  try {
    await recordAuditEvent({
      userId: actorId,
      companyId: null,
      action: input.action,
      module: "memory",
      entityType: "memory_entry",
      entityId: memoryAuditUuid(actorId, input.key),
      metadata: input.kind ? { key: input.key, kind: input.kind } : { key: input.key },
    });
  } catch (error) {
    console.error("[memories] audit falhou (mutacao mantida)", {
      route,
      key: input.key,
      actorId,
      error: failMessage(error, "audit error"),
    });
  }
}

/** Lista as memórias do utilizador autenticado. */
export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  try {
    const memories = await service().get(ctx.user.id);
    return NextResponse.json({ memories });
  } catch (error) {
    return NextResponse.json(
      { error: failMessage(error, "internal") },
      { status: 500 },
    );
  }
}

/** Guarda/sobrescreve uma memória (key + value + kind válidos). */
export async function POST(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const key = typeof body?.key === "string" ? body.key : "";
  const kind = body?.kind;
  const rawValue = body?.value;
  const value: Record<string, unknown> | null =
    typeof rawValue === "object" && rawValue !== null && !Array.isArray(rawValue)
      ? (rawValue as Record<string, unknown>)
      : null;

  try {
    await service().set(
      ctx.user.id,
      key,
      value as unknown as Record<string, unknown>,
      kind as MemoryKind,
    );
    await auditMemoryMutation(
      { action: MEMORY_ENTRY_SET, key, kind: kind as MemoryKind },
      ctx.user.id,
      "POST /api/memories",
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: failMessage(error, "invalid") },
      { status: 400 },
    );
  }
}

/** Apaga uma memória do utilizador autenticado. */
export async function DELETE(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const key = typeof body?.key === "string" ? body.key : "";

  try {
    await service().delete(ctx.user.id, key);
    await auditMemoryMutation(
      { action: MEMORY_ENTRY_DELETED, key },
      ctx.user.id,
      "DELETE /api/memories",
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: failMessage(error, "invalid") },
      { status: 400 },
    );
  }
}