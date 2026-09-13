"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  ReputationEntryType,
  ReputationRelationType,
  ReputationTargetType,
} from "@rpg/core";
import {
  attachReviewFileAction,
  createReviewAction,
} from "@/app/reputacao/actions";
import { MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/reputation/constants";

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

const RELATION_TARGET_MAP: Record<ReputationRelationType, ReputationTargetType> = {
  CUSTOMER_TO_COMPANY: "COMPANY",
  CUSTOMER_TO_EMPLOYEE: "EMPLOYEE",
  CUSTOMER_TO_SERVICE: "SERVICE",
  COMPANY_TO_CUSTOMER: "CUSTOMER",
  COMPANY_TO_EMPLOYEE: "EMPLOYEE",
  COMPANY_TO_SUPPLIER: "SUPPLIER",
  EMPLOYEE_TO_COMPANY: "COMPANY",
  EMPLOYEE_TO_CUSTOMER: "CUSTOMER",
  EMPLOYEE_TO_SERVICE: "SERVICE",
};

const TARGET_LABELS: Record<ReputationTargetType, string> = {
  CUSTOMER: "Cliente",
  COMPANY: "Empresa",
  EMPLOYEE: "Colaborador",
  SERVICE: "Serviço",
  PROJECT: "Projeto",
  SUPPLIER: "Fornecedor",
};

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

interface SelectedFile {
  file: File;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function validateClientSide(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Tipo não permitido (JPG, PNG, WEBP, PDF, TXT, DOC, DOCX).";
  }
  if (file.size <= 0) return "Ficheiro vazio.";
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) return "Demasiado grande (máx. 15 MB).";
  return null;
}

function StarsPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: "flex", gap: "6px" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} estrela(s)`}
          onClick={() => onChange(n)}
          style={{
            background: "none",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "20px",
            padding: "4px 10px",
            color: n <= value ? "#f59e0b" : "#cbd5e1",
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function NovoClient({ canCreate }: { canCreate: boolean }) {
  const [entryType, setEntryType] = useState<ReputationEntryType>("REVIEW");
  const [relationType, setRelationType] = useState<ReputationRelationType>("CUSTOMER_TO_COMPANY");
  const [entryTitle, setEntryTitle] = useState("Avaliação");
  const [targetLabel, setTargetLabel] = useState("");
  const [rating, setRating] = useState(5);
  const [score10, setScore10] = useState<string>("");
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [asDraft, setAsDraft] = useState(false);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ reviewId: string; draft: boolean } | null>(null);

  const targetType = RELATION_TARGET_MAP[relationType];
  const isScored = entryType === "COMPLAINT" || entryType === "REVIEW";

  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles(
      Array.from(list).map((f) => {
        const err = validateClientSide(f);
        return { file: f, error: err ?? undefined };
      }),
    );
  };

  const submit = async () => {
    if (!canCreate) return;
    setBusy(true);
    setError("");
    setDone(null);

    const res = await createReviewAction({
      entryType,
      relationType,
      targetType,
      targetLabel: targetLabel || null,
      rating: isScored ? rating : null,
      score10: score10 && Number.isFinite(Number(score10)) ? Number(score10) : undefined,
      title,
      comment: comment || null,
      asDraft,
    });
    if (!res.ok || !res.reviewId) {
      setError(String(res.error ?? "Erro ao submeter."));
      setBusy(false);
      return;
    }
    const reviewId = res.reviewId;

    const validFiles = files.filter((f) => !f.error);
    const failure: string[] = [];
    for (const f of validFiles) {
      const up = await attachReviewFileAction(reviewId, f.file);
      if (!up.ok) failure.push(`${f.file.name}: ${String(up.error)}`);
    }
    setBusy(false);
    setDone({ reviewId, draft: asDraft });
    if (failure.length > 0) {
      setError(`A entrada foi guardada, mas ${failure.length} anexo(s) falhou(ram): ${failure.join(" · ")}`);
    }
  };

  const reset = () => {
    setTitle("");
    setComment("");
    setTargetLabel("");
    setFiles([]);
    setError("");
    setDone(null);
  };

  if (!canCreate) {
    return (
      <div className="card">
        <div className="empty-state">Inicia sessão para criares avaliações e reclamações.</div>
        <Link href="/login" className="button secondary">← Entrar</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card" style={{ maxWidth: "680px" }}>
        <div className="badge success">
          {done.draft
            ? "Rascunho guardado. Ainda não é visível no centro."
            : "Entrada submetida com sucesso. Obrigado pela partilha!"}
        </div>
        <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
          <Link href={`/reputacao/${done.reviewId}`} className="button">Ver detalhe</Link>
          <button type="button" className="button secondary" onClick={reset}>Criar outra entrada</button>
          <Link href="/reputacao" className="button secondary">Ir para o Centro</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: "720px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        {(Object.keys(ENTRY_LABELS) as ReputationEntryType[]).map((k) => (
          <button
            key={k}
            type="button"
            className={`button secondary ${entryType === k ? "active" : ""}`}
            style={{ fontSize: "12px", padding: "6px 12px" }}
            onClick={() => {
              setEntryType(k);
              setEntryTitle(ENTRY_LABELS[k]);
            }}
          >
            {ENTRY_LABELS[k]}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: "14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <label>
            <span className="list-subtitle">Relação</span>
            <select value={relationType} onChange={(e) => setRelationType(e.target.value as ReputationRelationType)} className="input">
              {Object.entries(RELATION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="list-subtitle">Alvo ({TARGET_LABELS[targetType]})</span>
            <input
              value={targetLabel}
              onChange={(e) => setTargetLabel(e.target.value)}
              className="input"
              placeholder={`Nome do ${TARGET_LABELS[targetType]?.toLowerCase() ?? "alvo"}`}
            />
          </label>
        </div>

        {isScored && (
          <div>
            <span className="list-subtitle">Nota ({rating} / 5)</span>
            <div style={{ marginTop: "6px" }}>
              <StarsPicker value={rating} onChange={setRating} />
            </div>
          </div>
        )}

        {entryType !== "PRAISE" && entryType !== "RECOMMENDATION" && (
          <label>
            <span className="list-subtitle">Nota /10 (opcional)</span>
            <input
              value={score10}
              onChange={(e) => setScore10(e.target.value)}
              className="input"
              type="number"
              min={0}
              max={10}
              placeholder="Ex.: 7"
            />
          </label>
        )}

        <label>
          <span className="list-subtitle">Título curto ({entryTitle}) *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Resumo em poucas palavras" />
        </label>

        <label>
          <span className="list-subtitle">Descrição</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={5}
            className="input"
            placeholder="Conta a tua experiência, com detalhe e factualidade…"
          />
        </label>

        <div>
          <span className="list-subtitle">Evidências / Anexos (máx. 15 MB · JPG, PNG, WEBP, PDF, TXT, DOC, DOCX)</span>
          <input
            type="file"
            multiple
            accept={ALLOWED_TYPES.join(",")}
            onChange={(e) => pickFiles(e.target.files)}
            className="input"
            style={{ marginTop: "6px" }}
          />
          {files.length > 0 && (
            <div style={{ marginTop: "10px", display: "grid", gap: "6px" }}>
              {files.map((f, i) => (
                <div key={`${f.file.name}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "13px" }}>
                  <span className="list-subtitle">{f.file.name} ({formatBytes(f.file.size)})</span>
                  {f.error ? (
                    <span className="badge danger">{f.error}</span>
                  ) : (
                    <span className="badge success">Pronto</span>
                  )}
                  <button
                    type="button"
                    className="button secondary"
                    style={{ fontSize: "11px", padding: "2px 8px" }}
                    onClick={() => setFiles(files.filter((_, x) => x !== i))}
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input type="checkbox" checked={asDraft} onChange={(e) => setAsDraft(e.target.checked)} />
          <span className="list-subtitle">Guardar como rascunho (não submete nem notifica)</span>
        </label>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button type="button" className="button" disabled={busy || title.trim().length === 0} onClick={submit}>
            {busy ? "A submeter…" : asDraft ? "Guardar rascunho" : "Submeter"}
          </button>
          {title.trim().length === 0 && <span className="tag-badge">Título obrigatório</span>}
        </div>
        {error && <div className="badge danger">{error}</div>}
      </div>
    </div>
  );
}