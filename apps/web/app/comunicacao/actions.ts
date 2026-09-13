"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";

export async function sendMessageAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx || !hasPermission(ctx.permissions, "comunicacao.view")) {
    return { error: "Sem permissão." };
  }

  const channelId = String(formData.get("channel_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const kind = String(formData.get("kind") ?? "MESSAGE");

  if (!channelId || !body) return { error: "Mensagem inválida." };

  // Anúncios oficiais exigem permissão de gestão
  if (
    kind !== "MESSAGE" &&
    !hasPermission(ctx.permissions, "comunicacao.manage")
  ) {
    return { error: "Apenas a direção pode publicar comunicados." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("comms_messages").insert({
    channel_id: channelId,
    author_id: ctx.user.id,
    body,
    kind,
  });

  if (error) return { error: "Não foi possível enviar a mensagem." };

  revalidatePath("/comunicacao");
  return { success: true };
}

export async function createChannelAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx || !hasPermission(ctx.permissions, "comunicacao.manage")) {
    return { error: "Sem permissão para criar canais." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Nome obrigatório." };

  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const supabase = createAdminClient();
  const { error } = await supabase.from("comms_channels").insert({
    organization_id: ctx.organization?.id ?? null,
    name,
    slug,
    type: "TEAM",
    created_by: ctx.user.id,
  });

  if (error) return { error: "Não foi possível criar o canal." };

  revalidatePath("/comunicacao");
  return { success: true };
}
