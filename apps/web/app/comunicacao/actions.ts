"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildDmSlug,
  extractMentionTokens,
  resolveMentionIds,
} from "@/lib/comunicacao/helpers";

const VALID_KINDS = ["MESSAGE", "ANNOUNCEMENT", "URGENT"];

async function channelMembersForMentions(
  channelId: string,
): Promise<{ user_id: string; name: string | null }[]> {
  const supabase = createAdminClient();
  const { data: memberships } = await supabase
    .from("comms_channel_members")
    .select("user_id")
    .eq("channel_id", channelId);
  const ids = (memberships ?? []).map((m) => m.user_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, name")
    .in("user_id", ids);
  return (profiles ?? []) as { user_id: string; name: string | null }[];
}

export async function sendMessageAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx || !hasPermission(ctx.permissions, "comunicacao.view")) {
    return { error: "Sem permissão." };
  }

  const channelId = String(formData.get("channel_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const kind = String(formData.get("kind") ?? "MESSAGE");
  const threadRootId = String(formData.get("thread_root_id") ?? "").trim();

  if (!channelId || !body) return { error: "Mensagem inválida." };
  if (!VALID_KINDS.includes(kind)) return { error: "Tipo de mensagem inválido." };

  if (
    kind !== "MESSAGE" &&
    !hasPermission(ctx.permissions, "comunicacao.manage")
  ) {
    return { error: "Apenas a direção pode publicar comunicados." };
  }

  const mentions = resolveMentionIds(
    extractMentionTokens(body),
    await channelMembersForMentions(channelId),
  );

  const supabase = createAdminClient();
  const { error } = await supabase.from("comms_messages").insert({
    channel_id: channelId,
    author_id: ctx.user.id,
    body,
    kind,
    mentions,
    ...(threadRootId ? { thread_root_id: threadRootId } : {}),
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

export async function startDmAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx || !hasPermission(ctx.permissions, "comunicacao.view")) {
    return { error: "Sem permissão." };
  }

  const otherId = String(formData.get("user_id") ?? "").trim();
  if (!otherId) return { error: "Destinatário obrigatório." };
  if (otherId === ctx.user.id) return { error: "Não pode mandar DM a si mesmo." };

  const slug = buildDmSlug(ctx.user.id, otherId);

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("comms_channels")
    .select("id, slug")
    .is("organization_id", null)
    .eq("type", "DIRECT")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) return { success: true, channelSlug: existing.slug };

  const { data: channel, error: channelError } = await supabase
    .from("comms_channels")
    .insert({
      organization_id: null,
      name: "Mensagem direta",
      slug,
      type: "DIRECT",
      description: null,
      created_by: ctx.user.id,
    })
    .select("id, slug")
    .single();

  if (channelError || !channel) {
    return { error: "Não foi possível iniciar a conversa." };
  }

  const { error: membersError } = await supabase
    .from("comms_channel_members")
    .insert([
      { channel_id: channel.id, user_id: ctx.user.id },
      { channel_id: channel.id, user_id: otherId },
    ]);

  if (membersError) {
    return { error: "Não foi possível adicionar os participantes." };
  }

  revalidatePath("/comunicacao");
  return { success: true, channelSlug: channel.slug };
}

export async function markChannelReadAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx || !hasPermission(ctx.permissions, "comunicacao.view")) {
    return { error: "Sem permissão." };
  }

  const channelId = String(formData.get("channel_id") ?? "");
  if (!channelId) return { error: "Canal inválido." };

  const supabase = createAdminClient();
  const { error } = await supabase.from("comms_channel_members").upsert(
    { channel_id: channelId, user_id: ctx.user.id, last_read_at: new Date().toISOString() },
    { onConflict: "channel_id,user_id" },
  );

  if (error) return { error: "Não foi possível atualizar o estado de leitura." };
  return { success: true };
}