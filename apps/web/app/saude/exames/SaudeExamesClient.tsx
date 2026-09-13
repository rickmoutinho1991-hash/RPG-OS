"use client";

import { useState, useEffect } from "react";

type FilterType = "all" | "pending" | "completed";

interface HealthExam {
  examId: string;
  personId: string;
  examType: string;
  status: string;
  name: string;
  requestedAt: string;
  scheduledAt?: string;
  performedAt?: string;
  healthcareUnit: { name: string; address: string };
  requestedBy?: { professionalId: string; name: string; specialty?: string };
  performedBy?: { professionalId: string; name: string; specialty?: string };
  resultSummary?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function SaudeExamesClient() {
  const [exams, setExams] = useState<HealthExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    async function loadExams() {
      try {
        const res = await fetch("/api/saude/exams");
        if (res.ok) {
          const data = await res.json();
          setExams(data);
        }
      } catch (err) {
        console.error("[Saúde] Failed to load exams:", err);
      } finally {
        setLoading(false);
      }
    }
    loadExams();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "SCHEDULED": return "bg-blue-100 text-blue-800";
      case "CONFIRMED": return "bg-green-100 text-green-800";
      case "IN_PROGRESS": return "bg-yellow-100 text-yellow-800";
      case "COMPLETED": return "bg-gray-100 text-gray-800";
      case "CANCELLED": return "bg-red-100 text-red-800";
      case "RESULTS_AVAILABLE": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const filterOptions = ["all", "pending", "completed"];

  const filterOptionLabels: Record<FilterType, string> = {
    all: "Todos",
    pending: "Pendentes",
    completed: "Concluídos",
  };

  const getFilterClass = (f: FilterType, filter: FilterType) => {
    const active = f === filter;
    return `px-3 py-1 text-sm rounded ${active ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Exames Complementares</h2>
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
        <div className="text-center text-muted py-8">A carregar exames...</div>
      ) : exams.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">🧪</div>
          <h3 className="font-medium mb-1">Nenhum exame encontrado</h3>
          <p className="text-sm text-muted">
            Os exames aparecerão aqui após configurar a ligação oficial SNS 24.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map((e) => (
            <div key={e.examId} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <h3 className="font-medium text-lg truncate">
                      {e.name}
                    </h3>
                    <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(e.status)}`}>
                      {e.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted mb-1">
                    {e.requestedAt}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="button secondary text-sm">Ver detalhes</button>
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
    case "IN_PROGRESS": return "bg-yellow-100 text-yellow-800";
    case "COMPLETED": return "bg-gray-100 text-gray-800";
    case "CANCELLED": return "bg-red-100 text-red-800";
    case "RESULTS_AVAILABLE": return "bg-green-100 text-green-800";
    default: return "bg-gray-100 text-gray-800";
  }
}