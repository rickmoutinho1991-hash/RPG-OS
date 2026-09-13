export type CalendarEventType =
  | "CONSULTA_MEDICA" // Consultas médicas, exames, psicologia, fisioterapia
  | "REUNIAO" // Reuniões de trabalho, clientes, parceiros
  | "OBRA_VISITA" // Visitas a obras, inspeções técnicas, orçamentação
  | "TREINO_FITNESS" // Treinos, sessões de PT, desporto
  | "ROTINA_MEDICACAO" // Horários de toma de medicação / suplementos
  | "LEMBRETE_PESSOAL" // Lembretes do dia a dia, família, compromissos pessoais
  | "PRAZO_FISCAL" // Entrega de IVA, retenções, pagamentos SS / AT
  | "OUTRO";

export type EventStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "POSTPONED";
export type EventPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type ReminderCategory =
  | "MEDICATION" // Medicação e prescrições
  | "HEALTH" // Saúde, hidratação, sono, bem-estar
  | "HABIT" // Hábitos diários, leitura, foco
  | "TASK" // Tarefas e afazeres
  | "FINANCIAL" // Pagamentos, contas e transferências
  | "PERSONAL"; // Pessoal e família

export interface CalendarEvent {
  id: string;
  userId: string;
  title: string;
  description?: string;
  eventType: CalendarEventType;
  startTime: string; // ISO String
  endTime?: string;
  location?: string; // Presencial ou Link Virtual (Zoom/Meet)
  status: EventStatus;
  priority: EventPriority;
  reminderMinutes?: number;
  isCompleted: boolean;
  createdAt: string;
}

export interface PersonalReminder {
  id: string;
  userId: string;
  title: string;
  category: ReminderCategory;
  frequency: "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY";
  scheduledTime?: string; // ex: "08:30"
  dosage?: string; // ex: "1 comprimido após o pequeno-almoço"
  notes?: string;
  isActive: boolean;
  isCompletedToday: boolean;
  createdAt: string;
}

export const EVENT_TYPE_LABELS: Record<
  CalendarEventType,
  { label: string; icon: string; color: string }
> = {
  CONSULTA_MEDICA: { label: "Consulta / Saúde", icon: "🩺", color: "#0284c7" },
  REUNIAO: { label: "Reunião de Trabalho", icon: "💼", color: "#4f46e5" },
  OBRA_VISITA: { label: "Visita / Obra", icon: "🏗️", color: "#d97706" },
  TREINO_FITNESS: { label: "Treino / Desporto", icon: "🏋️", color: "#16a34a" },
  ROTINA_MEDICACAO: { label: "Medicação", icon: "💊", color: "#dc2626" },
  LEMBRETE_PESSOAL: {
    label: "Pessoal / Lembrete",
    icon: "📌",
    color: "#9333ea",
  },
  PRAZO_FISCAL: { label: "Prazo Fiscal / AT", icon: "⚖️", color: "#ea580c" },
  OUTRO: { label: "Outro Evento", icon: "📅", color: "#64748b" },
};
