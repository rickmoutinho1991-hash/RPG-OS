import { NextResponse } from "next/server";
import { DeviceSyncAdapter } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/rbac";
import { sanitizeAuditMetadata } from '@rpg/core';

export async function POST(request: Request) {
  try {
    let user;
    try {
      user = await requireAuth();
    } catch {
      return NextResponse.json(
        { error: "Não autorizado. Inicie sessão para prosseguir." },
        { status: 401 },
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
      user_id: user.id,
      action: "PUSH_NOTIFICATION_DISPATCHED",
      module: "DEVICES",
      entity_type: "NOTIFICATION",
      entity_id: user.id,
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

