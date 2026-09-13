"use client";

import { useState, useEffect } from "react";

type FilterType = "all" | "upcoming" | "past";

interface Appointment {
  id: string;
  appointment_type: string;
  status: string;
  scheduled_at: string;
  healthcare_unit: { name: string; address: string };
  professional?: { name: string; specialty?: string };
  appointment_type_detail?: string;
}

export function SaudeConsultasClient() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    async function loadAppointments() {
      try {
        const res = await fetch("/api/saude/appointments");
        if (res.ok) {
          const data = await res.json();
          setAppointments(data);
        }
      } catch (err) {
        console.error("[Saúde] Failed to load appointments:", err);
      } finally {
        setLoading(false);
      }
    }
    loadAppointments();
  }, []);

  const filteredAppointments = appointments.filter((a) => {
    if (filter === "all") return true;
    const now = new Date();
    const scheduled = new Date(a.scheduled_at);
    if (filter === "upcoming") return scheduled >= now;
    if (filter === "past") return scheduled < now;
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "SCHEDULED": return "bg-blue-100 text-blue-800";
      case "CONFIRMED": return "bg-green-100 text-green-800";
      case "CANCELLED": return "bg-red-100 text-red-800";
      case "COMPLETED": return "bg-gray-100 text-gray-800";
      case "NO_SHOW": return "bg-red-100 text-red-800";
      case "RESCHEDULED": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const filterOptions = ["all", "upcoming", "past"];

  const filterOptionLabels: Record<FilterType, string> = {
    all: "Todas",
    upcoming: "Próximas",
    past: "Passadas",
  };

  const getFilterClass = (f: FilterType, filter: FilterType) => {
    const active = f === filter;
    return `px-3 py-1 text-sm rounded ${active ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Consultas e Agendamentos</h2>
        <div className="flex gap-2">
          {filterOptions.map((value: string) => (
            <button
              key={value}
              onClick={() => setFilter(value as FilterType)}
              className={getFilterClass(value as FilterType, filter)}
            >
              {filterOptionLabels[value as FilterType]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-muted py-8">A carregar consultas...</div>
      ) : appointments.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">🏥</div>
          <h3 className="font-medium mb-1">Nenhuma consulta agendada</h3>
          <p className="text-sm text-muted">
            As consultas aparecerão aqui após configurar a ligação oficial SNS 24.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAppointments.map((a) => (
            <div key={a.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <h3 className="font-medium text-lg truncate">
                      {a.appointment_type_detail || a.appointment_type}
                    </h3>
                    <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(a.status)}`}>
                      {a.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted mb-1">
                    {new Date(a.scheduled_at).toLocaleString("pt-PT")}
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm text-muted">
                    <span>{a.healthcare_unit.name}</span>
                    {a.healthcare_unit.address && <span>{a.healthcare_unit.address}</span>}
                    {a.professional && <span>Dr(a). {a.professional.name}</span>}
                    {a.professional?.specialty && <span>({a.professional.specialty})</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="button secondary text-sm">Ver detalhes</button>
                  {a.status === "SCHEDULED" && (
                    <button className="button secondary text-sm">Cancelar</button>
                  )}
                  {a.status === "SCHEDULED" && (
                    <button className="button secondary text-sm">Reagendar</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getStatusColor(status: string) {
  switch (status) {
    case "SCHEDULED": return "bg-blue-100 text-blue-800";
    case "CONFIRMED": return "bg-green-100 text-green-800";
    case "CANCELLED": return "bg-red-100 text-red-800";
    case "COMPLETED": return "bg-gray-100 text-gray-800";
    case "NO_SHOW": return "bg-red-100 text-red-800";
    case "RESCHEDULED": return "bg-yellow-100 text-yellow-800";
    default: return "bg-gray-100 text-gray-800";
  }
}