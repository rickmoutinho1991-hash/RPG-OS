"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createTaskAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx || !hasPermission(ctx.permissions, "tarefas.create")) {
    return { error: "Sem permissão para criar tarefas." };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "O título é obrigatório." };

  const priority = String(formData.get("priority") ?? "MEDIUM");
  const dueDate = String(formData.get("due_date") ?? "").trim();

  const supabase = createAdminClient();
  const { error } = await supabase.from("tasks").insert({
    title,
    priority,
    due_date: dueDate ? new Date(dueDate).toISOString() : null,
    assignee_id: ctx.user.id,
    created_by: ctx.user.id,
    organization_id: ctx.organization?.id ?? null,
  });

  if (error) return { error: "Não foi possível criar a tarefa." };

  // Notificação de atribuição (auto-atribuída → sem notificação)
  revalidatePath("/tarefas");
  revalidatePath("/");
  return { success: true };
}

export async function completeTaskAction(taskId: string) {
  const ctx = await getSessionContext();
  if (!ctx || !hasPermission(ctx.permissions, "tarefas.edit")) {
    return { error: "Sem permissão para concluir tarefas." };
  }

  const supabase = createAdminClient();
  let query = supabase
    .from("tasks")
    .update({ status: "DONE", completed_at: new Date().toISOString() })
    .eq("id", taskId)
    .select("id");
  if (ctx.organization?.id) query = query.eq("organization_id", ctx.organization.id);
  else query = query.eq("assignee_id", ctx.user.id).is("organization_id", null);
  const { data, error } = await query.maybeSingle();
  if (!data && !error) return { error: "Tarefa não encontrada ou sem acesso." };

  if (error) return { error: "Não foi possível concluir a tarefa." };

  revalidatePath("/tarefas");
  revalidatePath("/");
  return { success: true };
}
