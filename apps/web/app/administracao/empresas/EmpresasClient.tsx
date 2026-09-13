"use client";

import { useEffect, useState } from "react";
import {
  getActorCompany,
  listCompanyLinks,
  linkCompanyOrganization,
  revokeCompanyLink,
  type ActorCompany,
  type CompanyLinkRow,
} from "./actions";

export default function EmpresasClient({
  organizations,
}: {
  organizations: Array<{ id: string; name: string }>;
}) {
  const [company, setCompany] = useState<ActorCompany | null>(null);
  const [links, setLinks] = useState<CompanyLinkRow[]>([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getActorCompany(), listCompanyLinks()])
      .then(([c, l]) => {
        if (!cancelled) {
          setCompany(c);
          setLinks(l);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCompany(null);
          setLinks([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConfirmLink() {
    if (!company || !selectedOrg) return;
    const res = await linkCompanyOrganization(company.id, selectedOrg);
    if (res.ok) {
      setConfirming(false);
      setSelectedOrg("");
      setMessage(
        res.reactivated
          ? "Associação reativada e auditada."
          : "Associação criada e auditada.",
      );
      setLinks(await listCompanyLinks());
    } else {
      setMessage(`Não foi possível associar: ${res.error}`);
    }
  }

  async function handleRevoke(linkId: string) {
    const res = await revokeCompanyLink(linkId);
    if (res.ok) {
      setMessage("Associação revogada. O histórico é preservado.");
      setLinks(await listCompanyLinks());
    } else {
      setMessage(`Não foi possível revogar: ${res.error}`);
    }
  }

  return (
    <div>
      <p style={{ color: "var(--muted)", marginBottom: 16 }}>
        Associações formais entre a sua empresa e organizações. Company e
        Organization continuam a ser entidades distintas — isto apenas declara
        a associação, auditada, para funcionalidades futuras.
      </p>

      {message && (
        <div className="card" role="status" style={{ marginBottom: 16 }}>
          {message}
        </div>
      )}

      {!company ? (
        <div className="card">
          Sem empresa associada ao seu perfil. Não é possível criar associações.
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 8px" }}>Associar empresa a organização</h3>
          <p style={{ fontSize: "13px", color: "var(--muted)" }}>
            Empresa: <strong>{company.legal_name}</strong>
          </p>
          {!confirming ? (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <select
                value={selectedOrg}
                onChange={(e) => setSelectedOrg(e.target.value)}
                className="input"
                aria-label="Organização"
              >
                <option value="">Escolher organização…</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button"
                disabled={!selectedOrg}
                onClick={() => setConfirming(true)}
              >
                Rever
              </button>
            </div>
          ) : (
            <div
              style={{
                marginTop: 8,
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
            >
              <p style={{ fontSize: "13px", margin: "0 0 8px" }}>
                Empresa: <strong>{company.legal_name}</strong>
                <br />
                Organização:{" "}
                <strong>
                  {organizations.find((o) => o.id === selectedOrg)?.name}
                </strong>
              </p>
              <p style={{ fontSize: "13px", color: "var(--muted)" }}>
                Esta associação permitirá que funcionalidades futuras
                relacionem dados empresariais com esta organização.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setConfirming(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={handleConfirmLink}
                >
                  Confirmar associação
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3 style={{ margin: "0 0 8px" }}>Associações</h3>
        {links.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Sem associações registadas.
          </p>
        ) : (
          <div className="list">
            {links.map((l) => (
              <div key={l.id} className="list-row">
                <div>
                  <div className="list-title">
                    {l.company_name ?? l.company_id} ↔{" "}
                    {l.organization_name ?? l.organization_id}
                  </div>
                  <div className="list-subtitle">
                    {l.status} • desde{" "}
                    {new Date(l.created_at).toLocaleDateString("pt-PT")}
                    {l.revoked_at
                      ? ` • revogada a ${new Date(l.revoked_at).toLocaleDateString("pt-PT")}`
                      : ""}
                  </div>
                </div>
                {l.status === "ACTIVE" && (
                  <button
                    type="button"
                    className="button secondary"
                    style={{ fontSize: "12px", padding: "6px 10px" }}
                    onClick={() => handleRevoke(l.id)}
                  >
                    Revogar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
