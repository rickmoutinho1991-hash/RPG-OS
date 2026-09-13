import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/rbac";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json(
      { error: "Não autorizado. Inicie sessão para exportar a sua agenda." },
      { status: 401 },
    );
  }

  const supabase = createAdminClient();

  try {
    const { data: events } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", user.id)
      .order("start_time", { ascending: true });

    const eventList = events || [];

    const formatIcalDate = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };

    const icalEvents = eventList
      .map((ev) => {
        const dtStart = formatIcalDate(ev.start_time);
        const dtEnd = ev.end_time ? formatIcalDate(ev.end_time) : dtStart;
        const dtStamp = formatIcalDate(ev.created_at);

        return [
          "BEGIN:VEVENT",
          `UID:${ev.id}@rpg-os.pt`,
          `DTSTAMP:${dtStamp}`,
          `DTSTART:${dtStart}`,
          `DTEND:${dtEnd}`,
          `SUMMARY:${ev.title}`,
          `DESCRIPTION:${(ev.description || "").replace(/\n/g, "\\n")}`,
          ev.location ? `LOCATION:${ev.location}` : "",
          `STATUS:${ev.status === "COMPLETED" ? "CONFIRMED" : "TENTATIVE"}`,
          "END:VEVENT",
        ]
          .filter(Boolean)
          .join("\r\n");
      })
      .join("\r\n");

    const icalContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//RPG-OS//Intelligent Business OS Calendar 1.0//PT",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:RPG-OS Agenda & Rotinas",
      "X-WR-TIMEZONE:Europe/Lisbon",
      icalEvents,
      "END:VCALENDAR",
    ].join("\r\n");

    return new NextResponse(icalContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="rpg_os_agenda.ics"',
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erro ao exportar iCalendar.",
      },
      { status: 500 },
    );
  }
}
