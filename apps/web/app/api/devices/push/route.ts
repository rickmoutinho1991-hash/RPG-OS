import { NextResponse } from "next/server";
import { DeviceSyncAdapter } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { sanitizeAuditMetadata } from '@rpg/core';

export async function POST(request: Request) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) {
      return NextResponse.json(
        { error: "Não autorizado. Inicie sessão para prosseguir." },
        { status: 401 },
      );
    }

    // Hardening: o broadcast atinge a FLEET inteira do utilizador —
    // exige gestão de comunicação (comunicacao.manage), não basta estar
    // autenticado.
    if (!hasPermission(ctx.permissions, "comunicacao.manage")) {
      return NextResponse.json(
        { error: "Sem permissão para enviar notificações push." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { title, message, url, targetPlatform } = body;

    if (!title || !message) {
      return NextResponse.json(
        { error: "Título e mensagem são obrigatórios." },
        { status: 400 },
      );
    }

    const adapter = new DeviceSyncAdapter();
    const payload = adapter.createPushPayload({
      title,
      body: message,
      url: url || "/dashboard",
    });

    const supabase = createAdminClient();
    await supabase.from("audit_logs").insert({
      user_id: ctx.user.id,
      action: "PUSH_NOTIFICATION_DISPATCHED",
      module: "DEVICES",
      entity_type: "NOTIFICATION",
      entity_id: ctx.user.id,
      metadata: sanitizeAuditMetadata({ title, targetPlatform: targetPlatform || "ALL_DEVICES" }),
    });

    return NextResponse.json({
      success: true,
      dispatchedAt: new Date().toISOString(),
      payload,
      status: "DISPATCHED_TO_GATEWAY",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erro ao enviar notificação.",
      },
      { status: 500 },
    );
  }
}

