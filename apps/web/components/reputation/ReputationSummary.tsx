// RPG-OS — Resumo de reputação reutilizável (componente servidor).
// Recebe apenas dados já escopados ao tenant (nunca faz leituras diretas).
import Link from "next/link";
import { buildReputationMetrics, type ReputationReviewInput } from "@rpg/core";

function Stars({ rating }: { rating: number | null | undefined }) {
  if (rating == null) return <span className="tag-badge">Sem nota</span>;
  const full = Math.round(rating);
  return (
    <span className="tag-badge" aria-label={`${rating} de 5`}>
      {"★".repeat(full)}
      {"☆".repeat(5 - full)}
    </span>
  );
}

const ENTRY_PT: Record<string, string> = {
  COMPLAINT: "Reclamações",
  REVIEW: "Avaliações",
  PRAISE: "Elogios",
  RECOMMENDATION: "Recomendações",
};

export function ReputationSummary({
  title,
  reviews,
  emptyMessage = "Ainda não há avaliações registadas para este alvo.",
}: {
  title: string;
  reviews: ReputationReviewInput[];
  emptyMessage?: string;
}) {
  const metrics = buildReputationMetrics(reviews);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        <div>
          <div style={{ fontWeight: 600 }}>{title}</div>
          <div className="list-subtitle">
            {metrics.reviewCount} avaliações visíveis · {metrics.complaints} reclamações · {metrics.praises} elogios · {metrics.recommendations} recomendações
          </div>
        </div>
        <Stars rating={metrics.globalRating} />
      </div>

      {metrics.globalRating != null && (
        <div style={{ marginTop: "12px", display: "flex", gap: "6px" }}>
          {[5, 4, 3, 2, 1].map((n) => {
            const count = metrics.starDistribution[String(n)] ?? 0;
            const total = metrics.reviewCount > 0 ? metrics.reviewCount : 1;
            const pct = Math.round((count / total) * 100);
            return (
              <div key={n} title={`${n}★: ${count}`} style={{ flex: 1, height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: n >= 4 ? "#16a34a" : n === 3 ? "#d97706" : "#dc2626" }} />
              </div>
            );
          })}
        </div>
      )}

      {reviews.length > 0 ? (
        <div style={{ marginTop: "12px", display: "grid", gap: "6px" }}>
          {reviews.slice(0, 3).map((r) => (
            <Link key={r.id} href={`/reputacao/${r.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="list-row" style={{ cursor: "pointer" }}>
                <div>
                  <div className="list-title">
                    <span className="tag-badge">{ENTRY_PT[r.entryType] ?? r.entryType}</span> {r.title}
                  </div>
                  <div className="list-subtitle">
                    {r.rating != null ? `${r.rating}/5 · ` : ""}
                    {new Date(r.createdAt).toLocaleDateString("pt-PT")}
                  </div>
                </div>
                <span className="tag-badge">Ver</span>
              </div>
            </Link>
          ))}
          {reviews.length > 3 && (
            <div className="list-subtitle" style={{ marginTop: "4px" }}>E mais {reviews.length - 3}…</div>
          )}
        </div>
      ) : (
        <p style={{ color: "var(--muted)", fontSize: "13px", marginTop: "8px" }}>{emptyMessage}</p>
      )}
    </div>
  );
}