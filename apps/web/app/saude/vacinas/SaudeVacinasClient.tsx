"use client";

import { useState, useEffect } from "react";

interface Vaccination {
  id: string;
  vaccine_name: string;
  target_diseases: string[];
  dose_number: number;
  administration_date: string;
  status: string;
  batch_number?: string;
  manufacturer?: string;
}

export function SaudeVacinasClient() {
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadVaccinations() {
      try {
        const res = await fetch("/api/saude/vaccinations");
        if (res.ok) {
          const data = await res.json();
          setVaccinations(data);
        }
      } catch (err) {
        console.error("[Saúde] Failed to load vaccinations:", err);
      } finally {
        setLoading(false);
      }
    }
    loadVaccinations();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ADMINISTERED": return "bg-green-100 text-green-800";
      case "SCHEDULED": return "bg-blue-100 text-blue-800";
      case "CANCELLED": return "bg-red-100 text-red-800";
      case "EXPIRED": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Histórico de Vacinação</h2>

      {loading ? (
        <div className="text-center text-muted py-8">A carregar vacinas...</div>
      ) : vaccinations.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">💉</div>
          <h3 className="font-medium mb-1">Nenhuma vacina registada</h3>
          <p className="text-sm text-muted">
            O histórico de vacinação aparecerá aqui após configurar a ligação oficial SNS 24.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {vaccinations.map((v) => (
            <div key={v.id} className="card p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <h3 className="font-medium text-lg truncate">{v.vaccine_name}</h3>
                    <span className="text-sm text-muted">
                      Dose {v.dose_number} · {v.target_diseases.join(", ")}
                    </span>
                    <span className={`px-2 py-0.5 text-xs rounded ${v.status === "ADMINISTERED" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                      {v.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-muted">
                    <span>Administrada em: {new Date(v.administration_date).toLocaleDateString("pt-PT")}</span>
                    {v.batch_number && <span>Lote: {v.batch_number}</span>}
                    {v.manufacturer && <span>Fabricante: {v.manufacturer}</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}