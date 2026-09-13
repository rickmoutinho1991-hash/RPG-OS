import Link from "next/link";
import type { LifeEvent } from "@rpg/core";
import type { VidaToday } from "@/lib/vida/lifeAggregation";

/**
 * HOJE: compromissos e tarefas reais do dia + eventos Life de hoje.
 * TIMELINE: eventos reais dos domínios (nunca inventados).
 */

function timeLabel(iso: string | null): string | null {
  if (!iso || iso.length < 16) return null;
  return iso.slice(11, 16);
}

function dateLabel(iso: string): string {
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso.slice(0, 10);
}

export function VidaTodaySection({
  today,
  todayError,
  lifeEvents,
}: {
  today: VidaToday;
  todayError: boolean;
  lifeEvents: LifeEvent[];
}) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const todaysEvents = today.events.filter(
    (e) => e.startTime && e.startTime.slice(0, 10) === todayKey,
  );
  const upcomingEvents = today.events.filter(
    (e) => !e.startTime || e.startTime.slice(0, 10) !== todayKey,
  );
  const dueTasks = today.tasks.filter(
    (t) => t.dueDate && t.dueDate.slice(0, 10) <= todayKey,
  );
  const todaysLife = lifeEvents.filter((e) => e.status === "today" || e.status === "overdue");
  const empty =
    todaysEvents.length === 0 && dueTasks.length === 0 && todaysLife.length === 0;

  return (
    <section aria-labelledby="vida-today-heading">
      <h2 id="vida-today-heading" style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", margin: "0 0 12px" }}>
        Hoje
      </h2>
      {todayError ? (
        <div className="card">
          <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
            A agenda não está disponível neste momento. Os restantes serviços
            continuam funcionais.
          </p>
        </div>
      ) : empty ? (
        <div className="card">
          <p style={{ margin: 0, fontSize: "14px", color: "var(--muted)" }}>
            Nada agendado para hoje.{" "}
            <Link href="/agenda" style={{ textDecoration: "underline" }}>
              Agendar algo
            </Link>
          </p>
        </div>
      ) : (
        <div className="list">
          {todaysEvents.map((e) => (
            <div key={`ag-${e.id}`} className="list-row">
              <div>
                <div className="list-title">
                  <strong>{e.title}</strong>
                </div>
                <div className="list-subtitle">
                  Agenda
                  {timeLabel(e.startTime) ? ` • ${timeLabel(e.startTime)}` : ""}
                  {e.location ? ` • ${e.location}` : ""}
                </div>
              </div>
              <Link href="/agenda" className="button secondary" style={{ fontSize: "12px", padding: "6px 10px" }} aria-label={`Abrir na agenda: ${e.title}`}>
                Agenda →
              </Link>
            </div>
          ))}
          {dueTasks.map((t) => (
            <div key={`task-${t.id}`} className="list-row">
              <div>
                <div className="list-title">
                  <strong>{t.title}</strong>
                </div>
                <div className="list-subtitle">
                  Tarefa{t.dueDate && t.dueDate.slice(0, 10) < todayKey ? " • em atraso" : " • vence hoje"}
                </div>
              </div>
              <Link href="/tarefas" className="button secondary" style={{ fontSize: "12px", padding: "6px 10px" }} aria-label={`Abrir nas tarefas: ${t.title}`}>
                Tarefas →
              </Link>
            </div>
          ))}
          {todaysLife.map((e) => (
            <div key={e.id} className="list-row">
              <div>
                <div className="list-title">
                  <strong>{e.title}</strong>
                </div>
                <div className="list-subtitle">{e.domainTitle}</div>
              </div>
            </div>
          ))}
          {upcomingEvents.slice(0, 2).map((e) => (
            <div key={`up-${e.id}`} className="list-row">
              <div>
                <div className="list-title">{e.title}</div>
                <div className="list-subtitle">
                  Próximo{e.startTime ? ` • ${dateLabel(e.startTime)}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function LifeTimeline({ events }: { events: LifeEvent[] }) {
  if (events.length === 0) {
    return (
      <section aria-labelledby="vida-timeline-heading">
        <h2 id="vida-timeline-heading" style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", margin: "0 0 12px" }}>
          Atividade recente
        </h2>
        <div className="card">
          <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
            Quando acontecer algo relevante, vais encontrá-lo aqui.
          </p>
        </div>
      </section>
    );
  }

  const groups: Array<{ key: string; label: string }> = [
    { key: "overdue", label: "Em atraso" },
    { key: "today", label: "Hoje" },
    { key: "upcoming", label: "Próximo" },
    { key: "past", label: "Anterior" },
  ];

  return (
    <section aria-labelledby="vida-timeline-heading">
      <h2 id="vida-timeline-heading" style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted)", margin: "0 0 12px" }}>
        Atividade recente
      </h2>
      <div className="list">
        {groups.map((g) => {
          const list = events.filter((e) => e.status === g.key).slice(0, 5);
          if (list.length === 0) return null;
          return (
            <div key={g.key}>
              <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)", margin: "12px 0 4px" }}>
                {g.label}
              </p>
              {list.map((e) => (
                <div key={e.id} className="list-row">
                  <div>
                    <div className="list-title">{e.title}</div>
                    <div className="list-subtitle">
                      {e.domainTitle} • {dateLabel(e.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
