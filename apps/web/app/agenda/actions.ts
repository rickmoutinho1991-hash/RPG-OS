"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import { CalendarEventType, EventPriority, ReminderCategory } from "@rpg/core";
import { revalidatePath } from "next/cache";

export async function getCalendarEventsList(params?: {
  type?: string;
  startDate?: string;
}): Promise<any[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  try {
    let query = supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", user.id)
      .order("start_time", { ascending: true });

    if (params?.type) {
      query = query.eq("event_type", params.type);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export async function createCalendarEventAction(data: {
  title: string;
  description?: string;
  eventType: CalendarEventType;
  startTime: string;
  endTime?: string;
  location?: string;
  priority?: EventPriority;
  reminderMinutes?: number;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sessão não iniciada. Inicie sessão para agendar." };
  }

  const supabase = createAdminClient();

  if (!data.title || !data.startTime) {
    return {
      success: false,
      error: "O título e a data/hora de início são obrigatórios.",
    };
  }

  try {
    const { data: newEvent, error } = await supabase
      .from("calendar_events")
      .insert({
        user_id: user.id,
        title: data.title.trim(),
        description: data.description || null,
        event_type: data.eventType,
        start_time: new Date(data.startTime).toISOString(),
        end_time: data.endTime ? new Date(data.endTime).toISOString() : null,
        location: data.location || null,
        priority: data.priority || "MEDIUM",
        reminder_minutes: data.reminderMinutes || 30,
        status: "SCHEDULED",
        is_completed: false,
      })
      .select("id")
      .single();

    if (error || !newEvent) {
      return {
        success: false,
        error: error?.message || "Erro ao criar compromisso.",
      };
    }

    revalidatePath("/agenda");
    revalidatePath("/dashboard");
    return { success: true, id: newEvent.id };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro inesperado.",
    };
  }
}

export async function toggleEventCompletedAction(
  eventId: string,
  isCompleted: boolean,
): Promise<{ success: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { success: false };

  const supabase = createAdminClient();
  await supabase
    .from("calendar_events")
    .update({
      is_completed: !isCompleted,
      status: !isCompleted ? "COMPLETED" : "SCHEDULED",
    })
    .eq("id", eventId)
    .eq("user_id", user.id);

  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function getPersonalRemindersList(): Promise<any[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from("personal_reminders")
      .select("*")
      .eq("user_id", user.id)
      .order("scheduled_time", { ascending: true });

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export async function createPersonalReminderAction(data: {
  title: string;
  category: ReminderCategory;
  scheduledTime?: string;
  dosage?: string;
  notes?: string;
  frequency?: "DAILY" | "WEEKLY" | "ONCE";
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sessão não iniciada. Inicie sessão para guardar rotinas." };
  }

  const supabase = createAdminClient();

  if (!data.title) {
    return {
      success: false,
      error: "O título ou nome do medicamento/hábito é obrigatório.",
    };
  }

  try {
    const { data: newReminder, error } = await supabase
      .from("personal_reminders")
      .insert({
        user_id: user.id,
        title: data.title.trim(),
        category: data.category,
        scheduled_time: data.scheduledTime || null,
        dosage: data.dosage || null,
        notes: data.notes || null,
        frequency: data.frequency || "DAILY",
        is_active: true,
        is_completed_today: false,
      })
      .select("id")
      .single();

    if (error || !newReminder) {
      return {
        success: false,
        error: error?.message || "Erro ao guardar lembrete.",
      };
    }

    revalidatePath("/agenda");
    revalidatePath("/dashboard");
    return { success: true, id: newReminder.id };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro inesperado.",
    };
  }
}

export async function toggleReminderTodayAction(
  reminderId: string,
  currentStatus: boolean,
): Promise<{ success: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { success: false };

  const supabase = createAdminClient();
  await supabase
    .from("personal_reminders")
    .update({ is_completed_today: !currentStatus })
    .eq("id", reminderId)
    .eq("user_id", user.id);

  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return { success: true };
}
