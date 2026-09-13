"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  askReputationAssistant,
  type ReputationEntryType,
  type ReputationRelationType,
  type ReputationReviewInput,
  type ReputationTargetType,
} from "@rpg/core";
import { createReviewAction } from "./actions";
import type { ReputacaoHomeData } from "./home-data";

type Tab = "OVERVIEW" | "NEW" | "ASSISTANT";

const TAB_LABELS: Record<Tab, string> = {
  OVERVIEW: "Visão Geral",
  NEW: "Nova Avaliação",
  ASSISTANT: "Assistente",
};

const ENTRY_LABELS: Record<ReputationEntryType, string> = {
  COMPLAINT: "Reclamação",
  RECOMMENDATION: "Recomendação",
  PRAISE: "Elogio",
  REVIEW: "Avaliação",
};

const RELATION_LABELS: Record<ReputationRelationType, string> = {
  CUSTOMER_TO_COMPANY: "Cliente → Empresa",
  CUSTOMER_TO_EMPLOYEE: "Cliente → Colaborador",
  CUSTOMER_TO_SERVICE: "Cliente → Serviço",
  COMPANY_TO_CUSTOMER: "Empresa → Cliente",
  COMPANY_TO_EMPLOYEE: "Empresa → Colaborador",
  COMPANY_TO_SUPPLIER: "Empresa → Fornecedor",
  EMPLOYEE_TO_COMPANY: "Colaborador → Empresa",
  EMPLOYEE_TO_CUSTOMER: "Colaborador → Cliente",
  EMPLOYEE_TO_SERVICE: "Colaborador → Serviço",
};

const TARGET_LABELS: Record<ReputationTargetType, string> = {
  CUSTOMER: "Cliente",
  COMPANY: "Empresa",
  EMPLOYEE: "Colaborador",
  SERVICE: "Serviço",
  PROJECT: "Projeto",
  SUPPLIER: "Fornecedor",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Submetida",
  UNDER_REVIEW: "Em análise",
  RESPONDED: "Respondida",
  IN_PROGRESS: "Em curso",
  RESOLVED: "Resolvida",
  REJECTED: "Rejeitada",
  CLOSED: "Fechada",
};

const ACTIVE_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "RESPONDED", "IN_PROGRESS"];

function entryColor(entry: ReputationEntryType): string {
  if (entry === "COMPLAINT") return "danger";
  if (entry === "PRAISE") return "success";
  if (entry === "RECOMMENDATION") return "warning";
  return "";
}

function Stars({ rating }: { rating?: number | null }) {
  if (!rating) return <span className="tag-badge">Sem nota</span>;
  const full = Math.round(rating);
  return (
    <span className="tag-badge" aria-label={`${rating} de 5`}>
      {"★".repeat(full)}
      {"☆".repeat(5 - full)}
    </span>
  );
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function daysAgo(value: string, days: number): boolean {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = Date.now() - days * 86_400_000;
  return d.getTime() >= cutoff;
}

function ReviewCard({ review }: { review: ReputationReviewInput }) {
  return (
    <div className="card" style={{ marginBottom: "12px", padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
        <div>
          <span className={`badge ${entryColor(review.entryType)}`}>{ENTRY_LABELS[review.entryType]}</span>{" "}
          <span className="tag-badge">{RELATION_LABELS[review.relationType]}</span>{" "}
          <span className="tag-badge">{TARGET_LABELS[review.targetType]}</span>
          <strong style={{ display: "block", marginTop: "6px" }}>{review.title}</strong>
          <div className="list-subtitle">
            {review.authorName ?? "Colaborador"} · {formatDate(review.createdAt)}
            {review.targetLabel ? ` · Alvo: ${review.targetLabel}` : ""}
          </div>
        </div>
        <Stars rating={review.rating} />
      </div>

      {review.comment && <p style={{ marginTop: "10px", whiteSpace: "pre-wrap" }}>{review.comment}</p>}

      <div style={{ display: "flex", gap: "8px", marginTop: "8px", alignItems: "center" }}>
        <span className="badge">{STATUS_LABELS[review.status] ?? review.status}</span>
        <span className="tag-badge">Moderação: {review.moderation.replace("_", " ")}</span>
        <Link href={`/reputacao/${review.id}`} className="button secondary" style={{ fontSize: "12px", padding: "4px 10px", marginLeft: "auto" }}>
          Detalhe
        </Link>
      </div>
    </div>
  );
}

interface Alert {
  severity: "URGENT" | "WARNING" | "SUCCESS";
  label: string;
  filter: () => void;
}

export function ReputacaoClient(props: { data: ReputacaoHomeData }) {
  const router = useRouter();
  const { data: home } = props;

  const [tab, setTab] = useState<Tab>("OVERVIEW");

  const [entryType, setEntryType] = useState<ReputationEntryType>("REVIEW");
  const [relationType, setRelationType] = useState<ReputationRelationType>("CUSTOMER_TO_COMPANY");
  const [targetLabel, setTargetLabel] = useState("");
  const [rating, setRating] = useState<number>(5);
  const [score10, setScore10] = useState<number | undefined>(8);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [asDraft, setAsDraft] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");

  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);

  // Filtros do centro (pesquisa + filtros + alertas) — FASE 3.1
  const [search, setSearch] = useState("");
  const [fEntry, setFEntry] = useState<string>("ALL");
  const [fStatus, setFStatus] = useState<string>("ALL");
  const [fRating, setFRating] = useState<string>("ALL");
  const [fPeriod, setFPeriod] = useState<string>("ALL");
  const [fTarget, setFTarget] = useState<string>("ALL");

  const overview = home.overview;
  const metrics = overview?.metrics;
  const all = overview?.all ?? [];
  const canCreate = home.canCreate;

  const freeformFilters: Record<string, () => void> = {
    critical: () => { setFRating("LE2"); setFEntry("COMPLAINT"); setFStatus("ACTIVE"); setTab("OVERVIEW"); },
    unanswered: () => { setFStatus("ACTIVE"); setFEntry("COMPLAINT"); setTab("OVERVIEW"); },
    low: () => { setFRating("LE2"); setTab("OVERVIEW"); },
    praise: () => { setFEntry("PRAISE"); setFPeriod("7"); setTab("OVERVIEW"); },
    recommendations: () => { setFEntry("RECOMMENDATION"); setTab("OVERVIEW"); },
  };

  const alerts: Alert[] = [];
  if (overview) {
    const critical = all.filter(
      (r) => r.entryType === "COMPLAINT" && ACTIVE_STATUSES.includes(r.status) && (r.rating !== null && r.rating !== undefined && r.rating <= 2),
    );
    if (critical.length > 0) {
      alerts.push({ severity: "URGENT", label: `${critical.length} reclamação(ões) crítica(s) por resolver`, filter: freeformFilters.critical });
    }
    const unanswered = all.filter(
      (r) => r.entryType === "COMPLAINT" && ACTIVE_STATUSES.includes(r.status) && !r.respondedAt,
    );
    if (unanswered.length > 0) {
      alerts.push({ severity: "WARNING", label: `${unanswered.length} reclamação(ões) sem resposta`, filter: freeformFilters.unanswered });
    }
    const low = all.filter(
      (r) => r.rating !== null && r.rating !== undefined && r.rating <= 2 && r.status !== "DRAFT" && r.status !== "REJECTED",
    );
    if (low.length > 0) {
      alerts.push({ severity: "WARNING", label: `${low.length} avaliação(ões) com nota ≤ 2`, filter: freeformFilters.low });
    }
    const recentPraise = all.filter((r) => r.entryType === "PRAISE" && daysAgo(r.createdAt, 7));
    if (recentPraise.length > 0) {
      alerts.push({ severity: "SUCCESS", label: `${recentPraise.length} elogio(s) recente(s) — obrigado!`, filter: freeformFilters.praise });
    }
    const recs = all.filter((r) => r.entryType === "RECOMMENDATION");
    if (recs.length > 0) {
      alerts.push({ severity: "SUCCESS", label: `${recs.length} recomendação(ões) recebida(s)`, filter: freeformFilters.recommendations });
    }
  }

  // Aplicar pesquisa + filtros sobre o dataset completo (server-escopado ao tenant).
  const filtered = all.filter((r) => {
    if (fEntry !== "ALL" && r.entryType !== fEntry) return false;
    if (fStatus === "ACTIVE" && !ACTIVE_STATUSES.includes(r.status)) return false;
    if (fStatus !== "ALL" && fStatus !== "ACTIVE" && r.status !== fStatus) return false;
    if (fRating === "LE2" && !(r.rating !== null && r.rating !== undefined && r.rating <= 2)) return false;
    if (fRating === "STARS5" && r.rating !== 5) return false;
    if (fTarget !== "ALL" && r.targetType !== fTarget) return false;
    if (fPeriod === "7" && !daysAgo(r.createdAt, 7)) return false;
    if (fPeriod === "30" && !daysAgo(r.createdAt, 30)) return false;
    if (fPeriod === "90" && !daysAgo(r.createdAt, 90)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${r.title} ${r.comment ?? ""} ${r.targetLabel ?? ""} ${r.authorName ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const submit = async () => {
    setFormBusy(true);
    setFormError("");
    setFormMessage("");
    const res = await createReviewAction({
      entryType,
      relationType,
      targetType: relationType.split("_").pop() as ReputationTargetType,
      targetLabel: targetLabel || null,
      rating: entryType === "COMPLAINT" || entryType === "REVIEW" ? rating : null,
      score10,
      title,
      comment: comment || null,
      asDraft,
    });
    setFormBusy(false);
    if (!res.ok) {
      setFormError(String(res.error ?? "Erro ao submeter."));
      return;
    }
    setFormMessage(asDraft ? "Rascunho guardado." : "Avaliação submetida. Obrigado!");
    setTitle("");
    setComment("");
    if (res.reviewId) router.push(`/reputacao/${res.reviewId}`);
  };

  const ask = async () => {
    if (!assistantQuestion.trim()) return;
    setAssistantBusy(true);
    const res = await askReputationAssistant(assistantQuestion, {
      reviews: overview?.recent ?? [],
    });
    setAssistantAnswer(res.answer);
    setAssistantBusy(false);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
        {(["OVERVIEW", "NEW", "ASSISTANT"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`button secondary ${tab === t ? "active" : ""}`}
            style={{ fontSize: "12px", padding: "6px 12px" }}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
        <Link href="/reputacao/novo" className="button" style={{ fontSize: "12px", padding: "6px 12px" }}>
          + Nova entrada
        </Link>
        <Link href="/reputacao/metricas" className="button secondary" style={{ fontSize: "12px", padding: "6px 12px" }}>
          Métricas
        </Link>
        <Link href="/integracoes/portal-da-queixa" className="button secondary" style={{ fontSize: "12px", padding: "6px 12px" }}>
          Portal da Queixa
        </Link>
      </div>

      {tab === "OVERVIEW" && (
        <>
          {alerts.length > 0 && (
            <div style={{ display: "grid", gap: "8px", marginBottom: "20px" }}>
              {alerts.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={a.filter}
                  className="card"
                  style={{
                    cursor: "pointer",
                    textAlign: "left",
                    padding: "12px 16px",
                    borderLeft: `4px solid ${a.severity === "URGENT" ? "#dc2626" : a.severity === "WARNING" ? "#d97706" : "#16a34a"}`,
                  }}
                >
                  <span className={`badge ${a.severity === "URGENT" ? "danger" : a.severity === "WARNING" ? "warning" : "success"}`}>
                    {a.severity === "URGENT" ? "CRÍTICO" : a.severity === "WARNING" ? "ATENÇÃO" : "POSITIVO"}
                  </span>{" "}
                  {a.label}
                </button>
              ))}
            </div>
          )}

          <div className="card" style={{ marginBottom: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: "8px" }} className="form-grid-filter">
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="input" placeholder="Pesquisar título, texto, alvo, autor…" />
              <select value={fEntry} onChange={(e) => setFEntry(e.target.value)} className="input">
                <option value="ALL">Tipo: Todos</option>
                {Object.entries(ENTRY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="input">
                <option value="ALL">Estado: Todos</option>
                <option value="ACTIVE">Em aberto</option>
                <option value="RESOLVED">Resolvidas</option>
                <option value="CLOSED">Fechadas</option>
                <option value="REJECTED">Rejeitadas</option>
              </select>
              <select value={fRating} onChange={(e) => setFRating(e.target.value)} className="input">
                <option value="ALL">Nota: Todas</option>
                <option value="LE2">≤ 2 estrelas</option>
                <option value="STARS5">5 estrelas</option>
              </select>
              <select value={fTarget} onChange={(e) => setFTarget(e.target.value)} className="input">
                <option value="ALL">Alvo: Todos</option>
                {Object.entries(TARGET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={fPeriod} onChange={(e) => setFPeriod(e.target.value)} className="input">
                <option value="ALL">Período: Sempre</option>
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="90">Últimos 90 dias</option>
              </select>
            </div>
            <div className="list-subtitle" style={{ marginTop: "8px" }}>
              {filtered.length} registo(s) · gravidade: {alerts.filter((a) => a.severity === "URGENT").length} crítica(s)
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px", marginBottom: "20px" }}>
            <div className="card">
              <div className="list-subtitle">Reputação média</div>
              <div className="text-2xl font-bold text-slate-900">{metrics?.globalRating ?? "—"} / 5</div>
              <div className="list-subtitle">{metrics?.reviewCount ?? 0} avaliações contam</div>
            </div>
            <div className="card">
              <div className="list-subtitle">Reclamações</div>
              <div className="text-2xl font-bold text-slate-900">{metrics?.complaints ?? 0}</div>
              <div className="list-subtitle">{metrics?.complaintsResolved ?? 0} resolvidas</div>
            </div>
            <div className="card">
              <div className="list-subtitle">Taxa de resolução</div>
              <div className="text-2xl font-bold text-slate-900">{metrics?.resolutionRate != null ? `${metrics.resolutionRate}%` : "—"}</div>
              <div className="list-subtitle">Reclamações resolvidas</div>
            </div>
            <div className="card">
              <div className="list-subtitle">Elogios / Recomendações</div>
              <div className="text-2xl font-bold text-slate-900">{metrics?.praises ?? 0} / {metrics?.recommendations ?? 0}</div>
              <div className="list-subtitle">5★: {metrics?.starDistribution?.["5"] ?? 0}</div>
            </div>
          </div>

          <div>
            {filtered.length === 0 ? (
              <div className="empty-state">Sem registos que correspondam aos filtros.</div>
            ) : (
              filtered.map((r) => <ReviewCard key={r.id} review={r} />)
            )}
          </div>
        </>
      )}

      {tab === "NEW" && (
        <div className="card" style={{ maxWidth: "680px" }}>
          <div className="topbar-eyebrow">Nova avaliação / reclamação</div>
          <Link href="/reputacao/novo" className="button" style={{ marginTop: "12px" }}>
            Abrir compositor completo (+ anexos)
          </Link>
          <div style={{ marginTop: "20px", display: "grid", gap: "12px" }}>
            <label>
              <span className="list-subtitle">Tipo de entrada</span>
              <select value={entryType} onChange={(e) => setEntryType(e.target.value as ReputationEntryType)} className="input">
                {Object.entries(ENTRY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="list-subtitle">Relação</span>
              <select value={relationType} onChange={(e) => setRelationType(e.target.value as ReputationRelationType)} className="input">
                {Object.entries(RELATION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="list-subtitle">Destinatário / Alvo (nome)</span>
              <input value={targetLabel} onChange={(e) => setTargetLabel(e.target.value)} className="input" placeholder="Ex.: João, Empresa XYZ, Serviço A" />
            </label>
            {(entryType === "COMPLAINT" || entryType === "REVIEW") && (
              <label>
                <span className="list-subtitle">Nota (1–5)</span>
                <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="input">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n} {n === 5 ? "★" : "☆"}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span className="list-subtitle">Título curto *</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Resumo da avaliação" />
            </label>
            <label>
              <span className="list-subtitle">Descrição</span>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={5} className="input" placeholder="Partilha a tua experiência…" />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input type="checkbox" checked={asDraft} onChange={(e) => setAsDraft(e.target.checked)} />
              <span className="list-subtitle">Guardar como rascunho</span>
            </label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button type="button" className="button" disabled={formBusy || !canCreate || title.trim().length === 0} onClick={submit}>
                {formBusy ? "A submeter…" : asDraft ? "Guardar rascunho" : "Submeter"}
              </button>
              {!canCreate && <span className="tag-badge">Sem permissão para criar</span>}
            </div>
            {formError && <div className="badge danger">{formError}</div>}
            {formMessage && <div className="badge success">{formMessage}</div>}
          </div>
        </div>
      )}

      {tab === "ASSISTANT" && (
        <div className="card" style={{ maxWidth: "680px" }}>
          <div className="topbar-eyebrow">Assistente de Reputação</div>
          <p className="list-subtitle">Faz perguntas sobre a tua reputação, avaliações e reclamações.</p>
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <input
              value={assistantQuestion}
              onChange={(e) => setAssistantQuestion(e.target.value)}
              className="input"
              placeholder="Ex.: Qual é a minha reputação média?"
            />
            <button type="button" className="button" disabled={assistantBusy} onClick={ask}>
              {assistantBusy ? "…" : "Perguntar"}
            </button>
          </div>
          {assistantAnswer && (
            <div style={{ marginTop: "12px", padding: "12px", background: "#f8fafc", borderRadius: "8px", whiteSpace: "pre-wrap" }}>
              {assistantAnswer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}