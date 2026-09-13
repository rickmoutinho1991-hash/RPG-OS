import { createAdminClient } from "@/lib/supabase/admin";
import {
  askLifeAssistant,
  buildLifeOverview,
  type LifeContextInput,
  type LifeDocumentInput,
  type LifeEventInput,
  type LifeOverview,
  type LifePersonalReminderInput,
  type LifeTaskInput,
} from "@rpg/core";
import { resolveFinanceTenant, loadFinanceTenantData, type FinanceTenantContext } from "@/lib/finance/tenant";
import { resolveReputationTenant, loadReputationReviews } from "@/lib/reputation/tenant";

// ---------------------------------------------------------------------------
// Camada segura do Centro de Vida.
// O tenant (utilizador/empresa) é SEMPRE resolvido no servidor a partir da
// sessão; finance reutiliza loadFinanceTenantData e as restantes áreas são
// escopadas por user_id/company_id — nunca confiar em valores do cliente.
// ---------------------------------------------------------------------------

function toEvent(row: Record<string, unknown>): LifeEventInput {
  return {
    id: String(row.id),
    title: String(row.title),
    startTime: row.start_time ? String(row.start_time) : null,
    eventType: row.event_type ? String(row.event_type) : "REUNIAO",
    isCompleted: row.is_completed === true || row.status === "COMPLETED",
    priority: row.priority ? String(row.priority) : "MEDIUM",
  };
}

function toTask(row: Record<string, unknown>): LifeTaskInput {
  return {
    id: String(row.id),
    title: String(row.title),
    dueDate: row.due_date ? new Date(String(row.due_date)).toISOString() : null,
    status: row.status ? String(row.status) : "TODO",
    priority: row.priority ? String(row.priority) : "MEDIUM",
  };
}

function toDocument(row: Record<string, unknown>): LifeDocumentInput {
  return {
    id: String(row.id),
    fileName: String(row.file_name),
    category: row.type ? String(row.type) : "Documento",
    status: row.status ? String(row.status) : "PENDING",
    expiresAt: row.expires_at ? String(row.expires_at) : null,
  };
}

function toReminder(row: Record<string, unknown>): LifePersonalReminderInput {
  return {
    id: String(row.id),
    title: String(row.title),
    category: row.category ? String(row.category) : "TASK",
    scheduledTime: row.scheduled_time ? String(row.scheduled_time) : null,
    isCompletedToday: row.is_completed_today === true,
  };
}

/** Carrega os dados do dia (finanças + agenda + tarefas + documentos) escopados ao tenant. */
export async function loadLifeData(ctx: FinanceTenantContext): Promise<LifeContextInput> {
  const supabase = createAdminClient();
  const finance = await loadFinanceTenantData(ctx);

  const [eventsRes, tasksRes, docsRes, remindersRes] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("id,title,start_time,end_time,event_type,status,priority,is_completed")
      .eq("user_id", ctx.userId),
    supabase
      .from("tasks")
      .select("id,title,status,priority,due_date,assignee_id")
      .eq("assignee_id", ctx.userId),
    supabase
      .from("documents")
      .select("id,type,file_name,status,expires_at,company_id,owner_user_id")
      .order("expires_at", { ascending: true }),
    supabase
      .from("personal_reminders")
      .select("*")
      .eq("user_id", ctx.userId),
  ]);

  let docsResolved = docsRes;
  if (ctx.companyId) {
    docsResolved = await supabase
      .from("documents")
      .select("id,type,file_name,status,expires_at,company_id,owner_user_id")
      .or(`company_id.eq.${ctx.companyId},owner_user_id.eq.${ctx.userId}`)
      .order("expires_at", { ascending: true });
  }

  // Reputação (reclamações, recomendações, elogios e avaliações) — para o
  // assistente responder às perguntas de reputação com dados reais do tenant.
  const reputationCtx = await resolveReputationTenant();
  const reviews = reputationCtx ? await loadReputationReviews(reputationCtx) : [];

  return {
    finance,
    events: (eventsRes.data ?? []).map((r) => toEvent(r as Record<string, unknown>)),
    tasks: (tasksRes.data ?? []).map((r) => toTask(r as Record<string, unknown>)),
    documents: (docsResolved.data ?? []).map((r) => toDocument(r as Record<string, unknown>)),
    reminders: (remindersRes.data ?? []).map((r) => toReminder(r as Record<string, unknown>)),
    reviews,
  };
}

export interface LifeOverviewResult {
  overview: LifeOverview | null;
}

/** Visão geral do Centro de Vida (server-side, escopada ao tenant da sessão). */
export async function getLifeOverviewForTenant(): Promise<LifeOverviewResult> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) return { overview: null };
  try {
    const data = await loadLifeData(ctx);
    return { overview: buildLifeOverview(data) };
  } catch (err) {
    console.error("[Vida] Erro ao carregar a visão geral:", err);
    return { overview: null };
  }
}

/** Entrada segura do assistente de vida: sessão → tenant → dados escopados → resposta. */
export async function provideLifeAssistantAnswer(
  question: string,
): Promise<{ answer: string; intent: string }> {
  const ctx = await resolveFinanceTenant();
  if (!ctx) {
    return {
      answer: "Inicia sessão para consultar o teu centro de vida.",
      intent: "UNAUTHENTICATED",
    };
  }

  try {
    const data = await loadLifeData(ctx);
    const res = askLifeAssistant(question, data);
    return { answer: res.answer, intent: res.intent };
  } catch (err) {
    console.error("[Vida] Erro no assistente:", err);
    return {
      answer: "Ocorreu um erro ao consultar os teus dados. Tenta novamente.",
      intent: "ERROR",
    };
  }
}