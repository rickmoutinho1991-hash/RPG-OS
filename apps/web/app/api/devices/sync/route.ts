import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/rbac";
import { DeviceSyncAdapter } from "@rpg/core";

export async function POST(request: Request) {
  try {
    let user;
    try {
      user = await requireAuth();
    } catch {
      return NextResponse.json(
        { error: "Não autorizado. Inicie sessão para sincronizar o dispositivo." },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { platform = "WEB_PWA" } = body;

    const supabase = createAdminClient();

    // Buscar dados consolidados da agenda, medicação e tarefas do utilizador autenticado
    const [eventsRes, remindersRes, tasksRes] = await Promise.all([
      supabase
        .from("calendar_events")
        .select(
          "id, title, start_time, end_time, location, event_type, priority",
        )
        .eq("user_id", user.id)
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(10),
      supabase
        .from("personal_reminders")
        .select(
          "id, title, scheduled_time, dosage, category, is_completed_today",
        )
        .eq("user_id", user.id)
        .eq("is_active", true),
      supabase
        .from("project_tasks")
        .select("id, title, priority, status")
        .eq("assignee_user_id", user.id)
        .neq("status", "DONE")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const syncResponse = {
      success: true,
      serverTimestamp: new Date().toISOString(),
      agendaEvents: (eventsRes.data || []).map((e: any) => ({
        id: e.id,
        title: e.title,
        startTime: e.start_time,
        endTime: e.end_time,
        location: e.location,
        type: e.event_type,
        priority: e.priority,
      })),
      medicationReminders: (remindersRes.data || []).map((r: any) => ({
        id: r.id,
        title: r.title,
        scheduledTime: r.scheduled_time,
        dosage: r.dosage,
        category: r.category,
        isCompletedToday: r.is_completed_today,
      })),
      urgentTasks: (tasksRes.data || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
      })),
      unreadNotificationsCount: 0,
    };

    // Se a plataforma for smartwatch, incluir layout otimizado
    if (platform === "APPLE_WATCH_OS" || platform === "WEAR_OS") {
      const adapter = new DeviceSyncAdapter();
      const watchView = adapter.formatForSmartwatch(syncResponse, platform);
      return NextResponse.json({ ...syncResponse, smartwatchView: watchView });
    }

    return NextResponse.json(syncResponse);
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erro na sincronização de dispositivo.",
      },
      { status: 500 },
    );
  }
}
