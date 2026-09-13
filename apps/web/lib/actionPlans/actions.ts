"use server";

/**
 * Assistente de Vida — server actions (camada fina).
 * A lógica segura vive em @/lib/actionPlans/service (tenant + RLS + auditoria).
 */
import {
  cancelActionForSession,
  confirmActionForSession,
  executeActionForSession,
  syncActionPlanForSession,
  type ActionPlanResult,
  type ExecuteActionResult,
} from "@/lib/actionPlans/service";

export async function getActionPlanAction(): Promise<ActionPlanResult> {
  return syncActionPlanForSession();
}

export async function confirmActionAction(actionId: string): Promise<{ ok: boolean; error?: string }> {
  return confirmActionForSession(actionId);
}

export async function cancelActionAction(actionId: string): Promise<{ ok: boolean; error?: string }> {
  return cancelActionForSession(actionId);
}

export async function executeActionAction(actionId: string): Promise<ExecuteActionResult> {
  return executeActionForSession(actionId);
}