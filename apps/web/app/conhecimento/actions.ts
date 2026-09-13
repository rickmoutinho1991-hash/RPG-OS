"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createArticleAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx || !hasPermission(ctx.permissions, "conhecimento.view")) {
    return { error: "Sem permissão." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const category = String(formData.get("category") ?? "wiki");

  if (!title) return { error: "O título é obrigatório." };

  const slug =
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80) +
    "-" +
    Date.now().toString(36);

  const supabase = createAdminClient();
  const { error } = await supabase.from("knowledge_articles").insert({
    organization_id: ctx.organization?.id ?? null,
    title,
    slug,
    category,
    content,
    status: "PUBLISHED",
    owner_id: ctx.user.id,
    verified_at: new Date().toISOString(),
  });

  if (error) return { error: "Não foi possível publicar o artigo." };

  revalidatePath("/conhecimento");
  return { success: true };
}
