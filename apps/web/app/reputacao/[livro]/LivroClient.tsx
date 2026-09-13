"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addCommentAction,
  respondToReviewAction,
  setReviewStatusAction,
  moderateReviewAction,
  deleteDraftAction,
  requestDeleteReviewAction,
  getAttachmentSignedUrlAction,
  type ActorFlags,
} from "@/app/reputacao/actions";
import type { ReputationEntryType } from "@rpg/core";

const ENTRY_LABELS: Record<ReputationEntryType, string> = {
  COMPLAINT: "Reclamação",
  RECOMMENDATION: "Recomendação",
  PRAISE: "Elogio",
  REVIEW: "Avaliação",
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

type BookRow = { review: any; responses: any[]; commentCount: number; flags: ActorFlags };

function Stars({ rating }: { rating?: number | null }) {
  if (!rating) return null;
  return (
    <span className="tag-badge">
      {"★".repeat(Math.round(rating))}
      {"☆".repeat(5 - Math.round(rating))}
    </span>
  );
}

export function LivroClient({
  entries,
  entryType,
  detail,
}: {
  entries?: BookRow[];
  entryType?: ReputationEntryType;
  detail?: any;
}) {
  if (detail) {
    const review = detail.review;
    if (!detail.ok && !review) {
      return (
        <div className="card">
          <div className="empty-state">{detail.error === "FORBIDDEN" ? "Sem permissão para ver este registo." : "Registo não encontrado."}</div>
          <Link href="/reputacao" className="button secondary">← Voltar</Link>
        </div>
      );
    }
    return <DetailView detail={detail} />;
  }

  const rows = entries ?? [];
  return (
    <div>
      <div style={{ marginBottom: "12px" }}>
        <Link href="/reputacao" className="button secondary">← Centro de Reputação</Link>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">Ainda não existem {ENRTY(entryType)} registadas.</div>
      ) : (
        rows.map((row) => {
          const r = row.review;
          return (
            <div key={r.id} className="card" style={{ marginBottom: "12px", padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                <div>
                  <span className="tag-badge">{r.relationType?.replaceAll("_", " → ")}</span>{" "}
                  <strong>{r.title}</strong>
                  <div className="list-subtitle">{r.authorName ?? "Colaborador"} · {new Date(r.createdAt).toLocaleDateString("pt-PT")}</div>
                </div>
                <Stars rating={r.rating} />
              </div>
              {r.comment && <p style={{ marginTop: "8px", whiteSpace: "pre-wrap" }}>{r.comment}</p>}
              <div style={{ display: "flex", gap: "8px", marginTop: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <span className="badge">{STATUS_LABELS[r.status] ?? r.status}</span>
                <span className="tag-badge">Moderação: {r.moderation?.replaceAll("_", " ")}</span>
                <span className="tag-badge">{row.commentCount} comentário(s)</span>
                <Link href={`/reputacao/${r.id}`} className="button secondary" style={{ fontSize: "12px", padding: "4px 10px", marginLeft: "auto" }}>
                  Detalhe
                </Link>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function ENRTY(entryType?: ReputationEntryType): string {
  return entryType ? (ENTRY_LABELS[entryType] ?? "entradas") : "entradas";
}

function DetailView({ detail }: { detail: any }) {
  const router = useRouter();
  const review = detail.review;
  const flags: ActorFlags = detail.flags ?? {};
  const responses = detail.responses ?? [];
  const comments = detail.comments ?? [];
  const events = detail.events ?? [];
  const attachments = detail.attachments ?? [];
  const cases = detail.cases ?? [];

  return (
    <div>
      <div style={{ marginBottom: "12px" }}>
        <Link href="/reputacao" className="button secondary">← Centro de Reputação</Link>
      </div>
      <div className="card" style={{ padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
          <div>
            <span className={`tag-badge`}>
              {(ENTRY_LABELS as Record<string, string>)[String(review.entryType)] ?? String(review.entryType)}</span>{" "}
            <span className="badge">{STATUS_LABELS[String(review.status)] ?? String(review.status)}</span>
            <h2 style={{ marginTop: "10px" }}>{review.title}</h2>
            <div className="list-subtitle">{review.authorName ?? "Colaborador"} · {new Date(review.createdAt).toLocaleString("pt-PT")}</div>
            {review.targetLabel && <div className="list-subtitle">Alvo: {review.targetLabel}</div>}
          </div>
          <Stars rating={review.rating} />
        </div>

        {review.comment && (
          <p style={{ marginTop: "14px", whiteSpace: "pre-wrap", borderLeft: "3px solid #e2e8f0", paddingLeft: "12px" }}>{review.comment}</p>
        )}

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "16px" }}>
          {flags.canModerate && (
            <>
              <button
                type="button"
                className="button secondary"
                style={{ fontSize: "12px", padding: "4px 10px" }}
                onClick={async () => {
                  await moderateReviewAction(review.id, "APPROVED");
                  window.location.reload();
                }}
              >
                Aprovar moderação
              </button>
              <button
                type="button"
                className="button secondary"
                style={{ fontSize: "12px", padding: "4px 10px" }}
                onClick={async () => {
                  await moderateReviewAction(review.id, "REJECTED");
                  window.location.reload();
                }}
              >
                Rejeitar moderação
              </button>
            </>
          )}
          {flags.canRequestDelete && (
            <button
              type="button"
              className="button secondary"
              style={{ fontSize: "12px", padding: "4px 10px" }}
              onClick={async () => {
                await requestDeleteReviewAction(review.id);
                window.location.reload();
              }}
            >
              Pedir eliminação
            </button>
          )}
          {flags.canEditDraft && review.status === "DRAFT" && (
            <button
              type="button"
              className="button secondary"
              style={{ fontSize: "12px", padding: "4px 10px" }}
              onClick={async () => {
                await deleteDraftAction(review.id);
                router.push("/reputacao");
              }}
            >
              Apagar rascunho
            </button>
          )}
          {(flags.canManage || flags.canModerate) && (
            <>
              <button
                type="button"
                className="button secondary"
                style={{ fontSize: "12px", padding: "4px 10px" }}
                onClick={async () => { await setReviewStatusAction(review.id, "IN_PROGRESS"); window.location.reload(); }}
              >
                Em curso
              </button>
              <button
                type="button"
                className="button secondary"
                style={{ fontSize: "12px", padding: "4px 10px" }}
                onClick={async () => { await setReviewStatusAction(review.id, "RESOLVED"); window.location.reload(); }}
              >
                Marcar resolvida
              </button>
            </>
          )}
        </div>
      </div>

      {cases.length > 0 && (
        <div className="card" style={{ marginTop: "20px" }}>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>Casos associados</div>
          {cases.map((c: { id: string; case_type: string; status: string; notes: string | null; opened_at: string }) => (
            <div key={c.id} className="list-row">
              <div>
                <div className="list-title">{c.case_type} · {c.status}</div>
                <div className="list-subtitle">{c.notes ?? ""} · {new Date(c.opened_at).toLocaleString("pt-PT")}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="card" style={{ marginTop: "20px" }}>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>Anexos / Evidências ({attachments.length})</div>
          {attachments.map((a: { id: string; upload_name: string; mime_type: string | null; size_bytes: number | null; is_suspicious: boolean | null }) => (
            <AttachmentRow key={a.id} att={a} />
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "20px" }}>
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>Respostas</div>
          {responses.length === 0 ? (
            <div className="empty-state">Sem respostas ainda.</div>
          ) : (
            responses.map((resp: { id: string; review_id: string; official: boolean; content: string; created_at: string }) => (
              <div key={resp.id} style={{ padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                <div className="list-subtitle">{resp.official ? "Resposta oficial" : "Resposta"}</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{resp.content}</div>
              </div>
            ))
          )}
          {flags.canRespond && <RespondBox reviewId={review.id} />}
        </div>
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>{comments.length} comentário(s)</div>
          {comments.map((c: { id: string; content: string; created_at: string }) => (
            <div key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ whiteSpace: "pre-wrap" }}>{c.content}</div>
              <div className="list-subtitle">{new Date(c.created_at).toLocaleString("pt-PT")}</div>
            </div>
          ))}
          <CommentBox reviewId={review.id} />
        </div>
      </div>

      <div className="card" style={{ marginTop: "20px" }}>
        <div style={{ fontWeight: 600, marginBottom: "8px" }}>Timeline</div>
        {events.length === 0 ? (
          <div className="empty-state">Sem atividade.</div>
        ) : (
          events.map((ev: { id: string; action: string; created_at: string }) => (
            <div key={ev.id} className="list-row">
              <div>
                <div className="list-title">{ev.action}</div>
                <div className="list-subtitle">{new Date(ev.created_at).toLocaleString("pt-PT")}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AttachmentRow({ att }: { att: { id: string; upload_name: string; mime_type: string | null; size_bytes: number | null; is_suspicious: boolean | null } }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const download = async () => {
    setBusy(true);
    setError("");
    const res = await getAttachmentSignedUrlAction(att.id);
    setBusy(false);
    if (!res.ok || !res.url) {
      setError(String(res.error ?? "Erro ao gerar ligação."));
      return;
    }
    window.open(res.url, "_blank");
  };

  return (
    <div className="list-row">
      <div>
        <div className="list-title">📎 {att.upload_name} {att.is_suspicious ? <span className="badge danger">suspeito</span> : null}</div>
        <div className="list-subtitle">
          {att.mime_type ?? "desconhecido"} · {att.size_bytes != null ? `${Math.round(att.size_bytes / 1024)} KB` : "—"}
        </div>
        {error && <div className="badge danger">{error}</div>}
      </div>
      <button type="button" className="button secondary" style={{ fontSize: "12px", padding: "4px 10px" }} disabled={busy} onClick={download}>
        {busy ? "…" : "Descarregar"}
      </button>
    </div>
  );
}

function RespondBox({ reviewId }: { reviewId: string }) {
  return (
    <form
      style={{ marginTop: "12px", display: "grid", gap: "8px" }}
      action={async (formData) => {
        const content = String(formData.get("content") ?? "");
        if (!content.trim()) return;
        await respondToReviewAction(reviewId, content);
        window.location.reload();
      }}
    >
      <textarea name="content" rows={3} placeholder="Resposta oficial…" className="input" />
      <button type="submit" className="button" style={{ justifySelf: "start" }}>Responder</button>
    </form>
  );
}

function CommentBox({ reviewId }: { reviewId: string }) {
  return (
    <div style={{ marginTop: "12px" }}>
      <form
        style={{ display: "grid", gap: "8px", marginTop: "8px" }}
        action={async (formData) => {
          const content = String(formData.get("content") ?? "");
          if (!content.trim()) return;
          await addCommentAction(reviewId, content);
          window.location.reload();
        }}
      >
        <textarea name="content" rows={2} placeholder="Comentar…" className="input" />
        <button type="submit" className="button secondary" style={{ justifySelf: "start" }}>Comentar</button>
      </form>
    </div>
  );
}