import { NextResponse } from "next/server";
import { MemoryService, type MemoryKind } from "@rpg/core";
import { getSessionContext } from "@/lib/session";
import { SupabaseMemoryStore } from "@/lib/memory/supabaseStore";

export const dynamic = "force-dynamic";

function service(): MemoryService {
  return new MemoryService(new SupabaseMemoryStore());
}

function failMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
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
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: failMessage(error, "invalid") },
      { status: 400 },
    );
  }
}