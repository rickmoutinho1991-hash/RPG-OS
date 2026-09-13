"use client";

import { useState, useEffect } from "react";

type FilterType = "all" | "active" | "expired";

interface Prescription {
  id: string;
  prescription_number: string;
  status: string;
  medication_name: string;
  medication_strength?: string;
  dosage: string;
  prescribed_date: string;
  valid_from: string;
  valid_until: string;
  prescribed_by: { name: string; healthcare_unit: string };
}

export function SaudeReceitasClient() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    async function loadPrescriptions() {
      try {
        const res = await fetch("/api/saude/prescriptions");
        if (res.ok) {
          const data = await res.json();
          setPrescriptions(data);
        }
      } catch (err) {
        console.error("[Saúde] Failed to load prescriptions:", err);
      } finally {
        setLoading(false);
      }
    }
    loadPrescriptions();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE": return "bg-green-100 text-green-800";
      case "EXPIRED": return "bg-gray-100 text-gray-800";
      case "CANCELLED": return "bg-red-100 text-red-800";
      case "SUSPENDED": return "bg-yellow-100 text-yellow-800";
      case "COMPLETED": return "bg-blue-100 text-blue-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const filterOptions = ["all", "active", "expired"];

  const filterOptionLabels: Record<FilterType, string> = {
    all: "Todas",
    active: "Ativas",
    expired: "Expiradas",
  };

  const getFilterClass = (f: FilterType, filter: FilterType) => {
    const active = f === filter;
    return `px-3 py-1 text-sm rounded ${active ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Receitas Médicas</h2>
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
        <div className="text-center text-muted py-8">A carregar receitas...</div>
      ) : prescriptions.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">💊</div>
          <h3 className="font-medium mb-1">Nenhuma receita encontrada</h3>
          <p className="text-sm text-muted">
            As receitas aparecerão aqui após configurar a ligação oficial SNS 24.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {prescriptions.map((rx) => (
            <div key={rx.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <h3 className="font-medium text-lg truncate">
                      {rx.medication_name}
                    </h3>
                    {rx.medication_strength && (
                      <span className="text-sm text-muted">{rx.medication_strength}</span>
                    )}
                    <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(rx.status)}`}>
                      {rx.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted mb-1">{rx.dosage}</p>
                  <div className="flex flex-wrap gap-4 text-sm text-muted">
                    <span>Receita: {rx.prescription_number}</span>
                    <span>Prescrita em: {new Date(rx.prescribed_date).toLocaleDateString("pt-PT")}</span>
                    <span>Válida até: {new Date(rx.valid_until).toLocaleDateString("pt-PT")}</span>
                    <span>Por: {rx.prescribed_by.name} ({rx.prescribed_by.healthcare_unit})</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="button secondary text-sm">Ver detalhes</button>
                  <button className="button primary text-sm">Renovar</button>
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
    case "ACTIVE": return "bg-green-100 text-green-800";
    case "EXPIRED": return "bg-gray-100 text-gray-800";
    case "CANCELLED": return "bg-red-100 text-red-800";
    case "SUSPENDED": return "bg-yellow-100 text-yellow-800";
    case "COMPLETED": return "bg-blue-100 text-blue-800";
    default: return "bg-gray-100 text-gray-800";
  }
}