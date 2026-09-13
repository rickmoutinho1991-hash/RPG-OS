"use server";

import { revalidatePath } from "next/cache";
import { createFollowUpForSession } from "@/lib/operations/service";
import type { OperationAlertKind } from "@rpg/core";

export interface FollowUpInput {
  alertKind: OperationAlertKind;
  targetLabel?: string | null;
  title?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  note?: string | null;
}

/** Cria uma tarefa de follow-up org-scoped, auditada e com notificação. */
export async function createOperationsFollowUpAction(
  input: FollowUpInput,
): Promise<{ success: boolean; error?: string; taskId?: string }> {
  const result = await createFollowUpForSession(input);
  if (result.success) {
    revalidatePath("/operacoes");
    revalidatePath("/tarefas");
    revalidatePath("/");
  }
  return result;
}