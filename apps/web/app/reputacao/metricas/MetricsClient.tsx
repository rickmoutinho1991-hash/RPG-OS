"use client";

import Link from "next/link";
import type { ReputationMetrics } from "@rpg/core";

type MetricsData = {
  metrics: ReputationMetrics;
  byTarget: Array<{ label: string; avg: number; count: number; complaints: number }>;
  history: Array<{ period: string; avgRating: number | null; reviewCount: number; resolutionRate: number | null }>;
};

export function MetricsClient(props: { ok: boolean; error?: string; data?: MetricsData | null }) {
  const data = props.data;

  return (
    <div>
      <div style={{ marginBottom: "12px" }}>
        <Link href="/reputacao" className="button secondary">← Centro de Reputação</Link>
      </div>

      {!props.ok && <div className="empty-state">{props.error === "FORBIDDEN" ? "Sem permissão para ver métricas." : props.error}</div>}

      {props.ok && data?.metrics && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "20px" }}>
            <div className="card">
              <div className="list-subtitle">Reputação média</div>
              <div className="text-2xl font-bold text-slate-900">{data.metrics.globalRating ?? "—"} / 5</div>
            </div>
            <div className="card">
              <div className="list-subtitle">Avaliações 5★</div>
              <div className="text-2xl font-bold text-slate-900">{data.metrics.starDistribution?.["5"] ?? 0}</div>
              <div className="list-subtitle">de {data.metrics.reviewCount} visíveis</div>
            </div>
            <div className="card">
              <div className="list-subtitle">Reclamações</div>
              <div className="text-2xl font-bold text-slate-900">{data.metrics.complaints}</div>
              <div className="list-subtitle">{data.metrics.complaintsOpen} abertas · {data.metrics.complaintsResolved} resolvidas</div>
            </div>
            <div className="card">
              <div className="list-subtitle">Elogios</div>
              <div className="text-2xl font-bold text-slate-900">{data.metrics.praises}</div>
            </div>
            <div className="card">
              <div className="list-subtitle">Recomendações</div>
              <div className="text-2xl font-bold text-slate-900">{data.metrics.recommendations}</div>
            </div>
            <div className="card">
              <div className="list-subtitle">Taxa de resolução</div>
              <div className="text-2xl font-bold text-slate-900">{data.metrics.resolutionRate != null ? `${data.metrics.resolutionRate}%` : "—"}</div>
            </div>
            <div className="card">
              <div className="list-subtitle">Tempo médio de resposta</div>
              <div className="text-2xl font-bold text-slate-900">{data.metrics.avgResponseHours != null ? `${data.metrics.avgResponseHours}h` : "—"}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: "20px" }}>
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>Distribuição de notas</div>
            {[5, 4, 3, 2, 1].map((n) => {
              const count = data.metrics?.starDistribution[String(n)] ?? 0;
              const total = data.metrics?.reviewCount ?? 1;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span style={{ width: "40px" }}>{n}★</span>
                  <div style={{ flex: 1, height: "12px", background: "#f1f5f9", borderRadius: "6px", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "#0f766e" }} />
                  </div>
                  <span style={{ width: "50px", textAlign: "right" }} className="list-subtitle">{count}</span>
                </div>
              );
            })}
          </div>

          {data.history.length > 0 && (
            <div className="card" style={{ marginBottom: "20px" }}>
              <div style={{ fontWeight: 600, marginBottom: "8px" }}>Evolução por mês</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }} className="table">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Nota média</th>
                    <th>Avaliações</th>
                    <th>Resolução</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((h) => (
                    <tr key={h.period}>
                      <td>{h.period}</td>
                      <td>{h.avgRating ?? "—"}</td>
                      <td>{h.reviewCount}</td>
                      <td>{h.resolutionRate != null ? `${h.resolutionRate}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>Por alvo</div>
            {data.byTarget.length === 0 ? (
              <div className="empty-state">Sem dados por alvo.</div>
            ) : (
              data.byTarget.map((t) => (
                <div key={t.label} className="list-row">
                  <div>
                    <div className="list-title">{t.label}</div>
                    <div className="list-subtitle">{t.count} entradas · {t.complaints} reclamações</div>
                  </div>
                  <div className="tag-badge">{t.avg.toFixed(1)} / 5</div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}