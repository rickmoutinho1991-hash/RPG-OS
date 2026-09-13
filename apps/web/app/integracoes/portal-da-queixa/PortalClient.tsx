"use client";

import Link from "next/link";
import { useState } from "react";
import {
  addExternalReferenceAction,
  removeExternalReferenceAction,
  savePortalConfigAction,
} from "./actions";

type PortalData = {
  config: {
    id: string;
    organizationId: string;
    status: "NOT_CONFIGURED" | "CONFIGURED";
    brandName: string | null;
    profileUrl: string | null;
    apiProvider: string | null;
    lastSyncedAt: string | null;
  } | null;
  references: Array<{
    id: string;
    organizationId: string;
    referenceType: "COMPLAINT" | "REVIEW" | "METRIC" | "OTHER";
    externalId: string | null;
    referenceUrl: string | null;
    summary: string | null;
    createdAt: string;
  }>;
  providerStatus: string;
};

export function PortalClient({
  result,
}: {
  result: { ok: boolean; error?: string; data?: PortalData | null; providerStatus?: any };
}) {
  const [brandName, setBrandName] = useState(result.data?.config?.brandName ?? "");
  const [profileUrl, setProfileUrl] = useState(result.data?.config?.profileUrl ?? "");
  const [refType, setRefType] = useState<"COMPLAINT" | "REVIEW" | "METRIC" | "OTHER">("COMPLAINT");
  const [refUrl, setRefUrl] = useState("");
  const [refExternalId, setRefExternalId] = useState("");
  const [refSummary, setRefSummary] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const references = result.data?.references ?? [];

  const saveConfig = async () => {
    setBusy(true);
    setMessage("");
    const res = await savePortalConfigAction({ brandName, profileUrl });
    setBusy(false);
    if (res.ok) {
      setMessage("Configuração guardada.");
      window.location.reload();
    } else {
      setMessage(`Erro: ${res.error}`);
    }
  };

  const addRef = async () => {
    setBusy(true);
    setMessage("");
    const res = await addExternalReferenceAction({
      referenceType: refType,
      referenceUrl: refUrl || null,
      externalId: refExternalId || null,
      summary: refSummary || null,
    });
    setBusy(false);
    if (res.ok) {
      setMessage("Referência registada.");
      setRefUrl("");
      setRefExternalId("");
      setRefSummary("");
      window.location.reload();
    } else {
      setMessage(`Erro: ${res.error}`);
    }
  };

  const removeRef = async (id: string) => {
    const res = await removeExternalReferenceAction(id);
    if (res.ok) window.location.reload();
  };

  return (
    <div>
      <div style={{ marginBottom: "12px" }}>
        <Link href="/reputacao" className="button secondary">← Centro de Reputação</Link>
      </div>

      {message && <div className="badge" style={{ marginBottom: "12px" }}>{message}</div>}

      <div className="card" style={{ marginBottom: "20px" }}>
        <div className="topbar-eyebrow">Integração (honesta, sem scraping)</div>
        <p className="list-subtitle">
          O Portal da Queixa não disponibiliza API pública oficial. A plataforma não faz scraping nem inventa dados.
         {" "}
          <strong>Estado: {result.data?.providerStatus ?? "NOT_CONFIGURED"}</strong>.
          Consegues registar manualmente o teu perfil e as referências externas (URLs de reclamações) abaixo.
        </p>
        <div style={{ display: "grid", gap: "12px", marginTop: "12px", maxWidth: "520px" }}>
          <label>
            <span className="list-subtitle">Nome da marca</span>
            <input value={brandName} onChange={(e) => setBrandName(e.target.value)} className="input" placeholder="Ex.: Obras & Renovação, Lda" />
          </label>
          <label>
            <span className="list-subtitle">URL do perfil no Portal da Queixa</span>
            <input value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} className="input" placeholder="https://portaldaqueixa.pt/…" />
          </label>
          <button type="button" className="button" disabled={busy} onClick={saveConfig} style={{ justifySelf: "start" }}>
            Guardar perfil
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "20px" }}>
        <div style={{ fontWeight: 600, marginBottom: "8px" }}>Registar referência externa (manual, RGPD)</div>
        <div style={{ display: "grid", gap: "12px", maxWidth: "520px" }}>
          <label>
            <span className="list-subtitle">Tipo</span>
            <select value={refType} onChange={(e) => setRefType(e.target.value as any)} className="input">
              <option value="COMPLAINT">Reclamação</option>
              <option value="REVIEW">Avaliação</option>
              <option value="METRIC">Métrica</option>
              <option value="OTHER">Outro</option>
            </select>
          </label>
          <label>
            <span className="list-subtitle">URL da referência</span>
            <input value={refUrl} onChange={(e) => setRefUrl(e.target.value)} className="input" placeholder="https://…" />
          </label>
          <label>
            <span className="list-subtitle">ID externo</span>
            <input value={refExternalId} onChange={(e) => setRefExternalId(e.target.value)} className="input" placeholder="Identificador no Portal (se conhecido)" />
          </label>
          <label>
            <span className="list-subtitle">Resumo</span>
            <textarea value={refSummary} onChange={(e) => setRefSummary(e.target.value)} rows={3} className="input" />
          </label>
          <button type="button" className="button" disabled={busy} onClick={addRef} style={{ justifySelf: "start" }}>
            Registar
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: "8px" }}>Referências externas registadas</div>
        {references.length === 0 ? (
          <div className="empty-state">Ainda não registaste referências externas.</div>
        ) : (
          references.map((ref) => (
            <div key={ref.id} className="list-row">
              <div>
                <div className="list-title">
                  {ref.referenceType} {ref.externalId ? `· ${ref.externalId}` : ""}
                </div>
                <div className="list-subtitle">{ref.referenceUrl ?? "sem URL"} {ref.summary ? `· ${ref.summary}` : ""}</div>
              </div>
              <button type="button" className="button secondary" style={{ fontSize: "12px", padding: "4px 10px" }} onClick={() => removeRef(ref.id)}>
                Remover
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}