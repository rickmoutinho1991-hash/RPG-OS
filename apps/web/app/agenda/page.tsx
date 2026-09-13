import Link from "next/link";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  getCalendarEventsList,
  getPersonalRemindersList,
  createCalendarEventAction,
  createPersonalReminderAction,
  toggleEventCompletedAction,
  toggleReminderTodayAction,
} from "./actions";
import {
  EVENT_TYPE_LABELS,
  CalendarEventType,
  ReminderCategory,
} from "@rpg/core";

export const dynamic = "force-dynamic";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; type?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const currentTab = resolvedParams.tab || "agenda";
  const typeFilter = resolvedParams.type;

  const [events, reminders] = await Promise.all([
    getCalendarEventsList({ type: typeFilter }),
    getPersonalRemindersList(),
  ]);

  const upcomingEvents = events.filter((e) => !e.is_completed);
  const completedEvents = events.filter((e) => e.is_completed);
  const completedRemindersToday = reminders.filter(
    (r) => r.is_completed_today,
  ).length;

  async function handleCreateEvent(formData: FormData) {
    "use server";
    const title = String(formData.get("title") ?? "").trim();
    const eventType = String(
      formData.get("event_type") ?? "REUNIAO",
    ) as CalendarEventType;
    const startTime = String(formData.get("start_time") ?? "").trim();
    const location = String(formData.get("location") ?? "").trim();
    const priority = String(formData.get("priority") ?? "MEDIUM") as any;
    const description = String(formData.get("description") ?? "").trim();

    await createCalendarEventAction({
      title,
      eventType,
      startTime,
      location,
      priority,
      description,
    });
  }

  async function handleCreateReminder(formData: FormData) {
    "use server";
    const title = String(formData.get("title") ?? "").trim();
    const category = String(
      formData.get("category") ?? "MEDICATION",
    ) as ReminderCategory;
    const scheduledTime = String(formData.get("scheduled_time") ?? "").trim();
    const dosage = String(formData.get("dosage") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    await createPersonalReminderAction({
      title,
      category,
      scheduledTime,
      dosage,
      notes,
    });
  }

  async function handleToggleEvent(id: string, isCompleted: boolean) {
    "use server";
    await toggleEventCompletedAction(id, isCompleted);
  }

  async function handleToggleReminder(id: string, isCompleted: boolean) {
    "use server";
    await toggleReminderTodayAction(id, isCompleted);
  }

  return (
    <main>
      <SectionHeader
        title="Agenda & Lembretes Pessoais"
        description="Gestão universal de compromissos, consultas, reuniões, treinos e rotinas diárias de medicação e saúde."
        action={
          <div style={{ display: "flex", gap: "8px" }}>
            <a
              href="/api/agenda/export/ical"
              download
              className="button secondary"
              style={{ fontSize: "12px", padding: "6px 12px" }}
            >
              📅 Sincronizar iCal / Outlook / Apple
            </a>
          </div>
        }
      />


      <div className="metrics" style={{ marginTop: "20px" }}>
        <div className="card">
          <span className="metric-label">Compromissos Agendados</span>
          <strong className="metric-value">{upcomingEvents.length}</strong>
          <span className="metric-change success">Próximas marcações</span>
        </div>

        <div className="card">
          <span className="metric-label">Rotinas & Medicação Ativas</span>
          <strong className="metric-value">{reminders.length}</strong>
          <span className="metric-change success">
            Hoje: {completedRemindersToday}/{reminders.length} cumpridas
          </span>
        </div>

        <div className="card">
          <span className="metric-label">Concluídos este Mês</span>
          <strong className="metric-value">{completedEvents.length}</strong>
          <span className="metric-change">Atividades realizadas</span>
        </div>

        <div className="card">
          <span className="metric-label">Assistência Pessoal</span>
          <strong className="metric-value">24/7</strong>
          <span className="metric-change success">Alertas inteligentes</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px", margin: "24px 0 20px" }}>
        <Link
          href="/agenda?tab=agenda"
          className={`button secondary ${currentTab === "agenda" ? "active" : ""}`}
        >
          📅 Compromissos & Agenda Geral
        </Link>
        <Link
          href="/agenda?tab=saude"
          className={`button secondary ${currentTab === "saude" ? "active" : ""}`}
        >
          💊 Medicação & Rotinas Diárias ({completedRemindersToday}/
          {reminders.length})
        </Link>
      </div>

      {currentTab === "agenda" && (
        <div className="grid-2">
          <div className="card">
            <h3>Novo Compromisso / Marcação</h3>
            <form action={handleCreateEvent}>
              <div className="form-grid">
                <div className="form-field full">
                  <label htmlFor="title">Título do Compromisso *</label>
                  <input
                    id="title"
                    name="title"
                    required
                    placeholder="Ex: Consulta Médica / Reunião com Cliente / Visita a Obra"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="event_type">Tipo de Evento *</label>
                  <select
                    id="event_type"
                    name="event_type"
                    defaultValue="CONSULTA_MEDICA"
                  >
                    {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.icon} {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="priority">Prioridade</label>
                  <select id="priority" name="priority" defaultValue="MEDIUM">
                    <option value="LOW">Baixa</option>
                    <option value="MEDIUM">Média</option>
                    <option value="HIGH">Alta</option>
                    <option value="URGENT">Urgente ⚠️</option>
                  </select>
                </div>

                <div className="form-field full">
                  <label htmlFor="start_time">Data & Hora de Início *</label>
                  <input
                    id="start_time"
                    name="start_time"
                    type="datetime-local"
                    required
                    defaultValue={new Date().toISOString().slice(0, 16)}
                  />
                </div>

                <div className="form-field full">
                  <label htmlFor="location">
                    Localização / Link de Reunião
                  </label>
                  <input
                    id="location"
                    name="location"
                    placeholder="Ex: Hospital da Luz / Av. Liberdade / Google Meet"
                  />
                </div>

                <div className="form-field full">
                  <label htmlFor="description">Notas Adicionais</label>
                  <textarea
                    id="description"
                    name="description"
                    placeholder="Instruções, sintomas, pauta ou detalhes importantes..."
                  />
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: "16px" }}>
                <button type="submit" className="button">
                  + Adicionar à Agenda
                </button>
              </div>
            </form>
          </div>

          <div className="card">
            <div className="toolbar-row" style={{ marginBottom: "12px" }}>
              <h3 style={{ margin: 0 }}>Compromissos ({events.length})</h3>
            </div>

            {events.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: "13px" }}>
                Nenhum compromisso marcado para os próximos dias.
              </p>
            ) : (
              <div className="list">
                {events.map((ev: any) => {
                  const typeInfo = EVENT_TYPE_LABELS[
                    ev.event_type as CalendarEventType
                  ] || { label: ev.event_type, icon: "📅", color: "#64748b" };
                  return (
                    <div
                      key={ev.id}
                      className="list-row"
                      style={{ opacity: ev.is_completed ? 0.6 : 1 }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span style={{ fontSize: "16px" }}>
                            {typeInfo.icon}
                          </span>
                          <strong
                            style={{
                              textDecoration: ev.is_completed
                                ? "line-through"
                                : "none",
                            }}
                          >
                            {ev.title}
                          </strong>
                          <span
                            className="tag-badge"
                            style={{ fontSize: "10px" }}
                          >
                            {typeInfo.label}
                          </span>
                        </div>
                        <div
                          className="list-subtitle"
                          style={{ marginTop: "4px" }}
                        >
                          🕒 {new Date(ev.start_time).toLocaleString("pt-PT")}
                          {ev.location && ` • 📍 ${ev.location}`}
                        </div>
                        {ev.description && (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "var(--muted)",
                              marginTop: "3px",
                            }}
                          >
                            {ev.description}
                          </div>
                        )}
                      </div>

                      <form
                        action={handleToggleEvent.bind(
                          null,
                          ev.id,
                          ev.is_completed,
                        )}
                      >
                        <button
                          type="submit"
                          className="button secondary"
                          style={{
                            padding: "4px 8px",
                            fontSize: "11px",
                            background: ev.is_completed ? "#dcfce7" : "white",
                            color: ev.is_completed ? "#166534" : "#111827",
                          }}
                        >
                          {ev.is_completed ? "✓ Concluído" : "Marcar Feito"}
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {currentTab === "saude" && (
        <div className="grid-2">
          <div className="card">
            <h3>Nova Rotina, Medicação ou Hábito</h3>
            <form action={handleCreateReminder}>
              <div className="form-grid">
                <div className="form-field full">
                  <label htmlFor="title">Nome do Medicamento / Hábito *</label>
                  <input
                    id="title"
                    name="title"
                    required
                    placeholder="Ex: Omeprazol 20mg / Beber 2L de Água / Treino Matinal"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="category">Categoria</label>
                  <select
                    id="category"
                    name="category"
                    defaultValue="MEDICATION"
                  >
                    <option value="MEDICATION">💊 Medicação Prescrita</option>
                    <option value="HEALTH">❤️ Saúde & Bem-Estar</option>
                    <option value="HABIT">🎯 Hábito Diário / Rotina</option>
                    <option value="TASK">📝 Tarefa Pessoal</option>
                    <option value="FINANCIAL">💶 Finanças & Pagamentos</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="scheduled_time">Horário Habitual</label>
                  <input
                    id="scheduled_time"
                    name="scheduled_time"
                    type="time"
                    defaultValue="08:00"
                  />
                </div>

                <div className="form-field full">
                  <label htmlFor="dosage">Dosagem / Instruções de Toma</label>
                  <input
                    id="dosage"
                    name="dosage"
                    placeholder="Ex: 1 cápsula em jejum com água"
                  />
                </div>

                <div className="form-field full">
                  <label htmlFor="notes">Notas / Observações Médicas</label>
                  <input
                    id="notes"
                    name="notes"
                    placeholder="Ex: Tomar durante 30 dias contínuos."
                  />
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: "16px" }}>
                <button type="submit" className="button">
                  + Guardar Rotina Diária
                </button>
              </div>
            </form>
          </div>

          <div className="card">
            <h3>Cumprimento Diário de Rotinas ({reminders.length})</h3>
            <p
              style={{
                fontSize: "13px",
                color: "var(--muted)",
                margin: "0 0 16px",
              }}
            >
              Assinale as tomas e hábitos concluídos hoje para manter o seu
              registo de saúde e produtividade sempre em dia.
            </p>

            {reminders.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: "13px" }}>
                Ainda não tem rotinas de medicação ou hábitos configurados.
              </p>
            ) : (
              <div className="list">
                {reminders.map((r: any) => (
                  <div
                    key={r.id}
                    className="list-row"
                    style={{
                      background: r.is_completed_today ? "#f0fdf4" : "white",
                      padding: "12px",
                      borderRadius: "8px",
                      marginBottom: "8px",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <span style={{ fontSize: "16px" }}>
                          {r.category === "MEDICATION"
                            ? "💊"
                            : r.category === "HEALTH"
                              ? "❤️"
                              : "🎯"}
                        </span>
                        <strong>{r.title}</strong>
                        {r.scheduled_time && (
                          <span
                            className="tag-badge"
                            style={{ fontSize: "11px" }}
                          >
                            ⏰ {r.scheduled_time.slice(0, 5)}
                          </span>
                        )}
                      </div>
                      {r.dosage && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#475569",
                            marginTop: "3px",
                          }}
                        >
                          <strong>Dose:</strong> {r.dosage}
                        </div>
                      )}
                      {r.notes && (
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--muted)",
                            marginTop: "2px",
                          }}
                        >
                          {r.notes}
                        </div>
                      )}
                    </div>

                    <form
                      action={handleToggleReminder.bind(
                        null,
                        r.id,
                        r.is_completed_today,
                      )}
                    >
                      <button
                        type="submit"
                        className="button"
                        style={{
                          padding: "6px 12px",
                          fontSize: "12px",
                          background: r.is_completed_today
                            ? "#15803d"
                            : "#0f172a",
                        }}
                      >
                        {r.is_completed_today
                          ? "✓ Tomado / Feito"
                          : "Registar Toma"}
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
