"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { formatEuro } from "@/lib/currency";

interface ContractMilestone {
  id: string;
  contract_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  amount_cents: number;
  status: string;
  require_evidence: boolean;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ContractEvidence {
  id: string;
  related_entity_id: string;
  title: string;
  category: string;
  status: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

interface ContractPayment {
  id: string;
  milestone_id: string;
  amount_cents: number;
  currency: string;
  fee_bps: number | null;
  fee_cents: number | null;
  net_cents: number | null;
  paid_at: string;
}

interface ContractWarranty {
  id: string;
  warranty_period_months: number;
  start_date: string;
  end_date: string;
  coverage: string;
  status: string;
}

interface Contract {
  id: string;
  request_id: string;
  provider_id: string;
  client_id: string;
  adjudicated_quote_id: string | null;
  status: string;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
  milestones: ContractMilestone[];
  evidence: ContractEvidence[];
  payments: ContractPayment[];
  warranties: ContractWarranty[];
  request?: {
    title: string;
    description: string;
    client_id: string;
    category_id: string;
  };
}

const MILESTONE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em progresso",
  SUBMITTED: "Submetido",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  PAID: "Pago",
};

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_SIGNATURE: "Aguardando assinatura",
  SIGNED: "Assinado",
  ACTIVE: "Ativo",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  DISPUTED: "Em litígio",
};

export default function ContratoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, File>>({});

  useEffect(() => {
    async function load() {
      const { id } = await params;
      try {
        const res = await fetch(`/api/mercado/contract/${id}`);
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setContract(data.contract);
          const sessionRes = await fetch("/api/session-context");
          const sessionData = await sessionRes.json();
          setCurrentUserId(sessionData.user?.id || "");
        }
      } catch {
        setError("Erro ao carregar contrato");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params]);

  const isProvider = contract?.provider_id === currentUserId;
  const isOwner = contract?.client_id === currentUserId;

  async function handleSubmitMilestone(milestoneId: string) {
    if (!contract) return;
    setActionLoading(milestoneId);
    try {
      const milestone = contract.milestones?.find((m) => m.id === milestoneId);
      const formData = new FormData();
      formData.append("contractId", contract.id);
      formData.append("milestoneId", milestoneId);
      if (milestone?.require_evidence && files[milestoneId]) {
        formData.append("file", files[milestoneId]);
      }
      const res = await fetch("/api/mercado/milestone/submit", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        window.location.reload();
      }
    } catch {
      alert("Erro de rede");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleApproveMilestone(milestoneId: string, approve: boolean) {
    if (!contract) return;
    if (!approve) {
      const note = prompt("Nota obrigatória para devolução:");
      if (!note?.trim()) {
        alert("Nota é obrigatória");
        return;
      }
      setActionLoading(milestoneId);
      try {
        const formData = new FormData();
        formData.append("contractId", contract.id);
        formData.append("milestoneId", milestoneId);
        formData.append("approve", "false");
        formData.append("note", note);
        const res = await fetch("/api/mercado/milestone/approve", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.error) {
          alert(data.error);
        } else {
          window.location.reload();
        }
      } catch {
        alert("Erro de rede");
      } finally {
        setActionLoading(null);
      }
    } else {
      setActionLoading(milestoneId);
      try {
        const formData = new FormData();
        formData.append("contractId", contract.id);
        formData.append("milestoneId", milestoneId);
        formData.append("approve", "true");
        const res = await fetch("/api/mercado/milestone/approve", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.error) {
          alert(data.error);
        } else {
          window.location.reload();
        }
      } catch {
        alert("Erro de rede");
      } finally {
        setActionLoading(null);
      }
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "48px", textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto" }} />
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "48px", textAlign: "center" }}>
        <h1 style={{ marginBottom: "16px" }}>Contrato não encontrado</h1>
        <p style={{ color: "var(--muted)" }}>{error || "Acesso negado"}</p>
        <Link href="/mercado" className="button" style={{ marginTop: "16px", display: "inline-block" }}>
          Voltar ao Mercado
        </Link>
      </div>
    );
  }

  const milestones = contract.milestones?.sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  ) ?? [];

  const milestoneEvidence = (milestoneId: string) =>
    (contract.evidence ?? []).filter((ev) => ev.related_entity_id === milestoneId);

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <Link href="/mercado" style={{ color: "#2563eb", textDecoration: "none", fontSize: "14px" }}>
            ← Voltar ao Mercado
          </Link>
          <h1 style={{ margin: "8px 0 0", fontSize: "28px" }}>
            {contract.request?.title || "Contrato"}
          </h1>
        </div>
        <span
          className={`badge ${contract.status === "ACTIVE" || contract.status === "SIGNED" ? "success" : contract.status === "COMPLETED" ? "info" : ""}`}
          style={{ fontSize: "12px", textTransform: "capitalize" }}
        >
          {CONTRACT_STATUS_LABELS[contract.status] || contract.status}
        </span>
      </div>

      <div className="card" style={{ padding: "24px", marginBottom: "24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          <DetailRow label="Cliente" value={isOwner ? "Você" : contract.request?.client_id?.slice(0, 8) + "..."} />
          <DetailRow label="Prestador" value={isProvider ? "Você" : contract.provider_id?.slice(0, 8) + "..."} />
          <DetailRow label="Valor total" value={milestones.reduce((sum, m) => sum + m.amount_cents, 0) > 0
            ? formatEuro(milestones.reduce((sum, m) => sum + m.amount_cents, 0))
            : "—"} />
          <DetailRow label="Status" value={CONTRACT_STATUS_LABELS[contract.status] || contract.status} />
        </div>
      </div>

      <section>
        <h2 style={{ margin: "0 0 16px", fontSize: "18px" }}>Milestones ({milestones.length})</h2>

        {milestones.length === 0 && (
          <div className="card" style={{ padding: "32px", textAlign: "center", color: "var(--muted)" }}>
            Nenhum milestone definido.
          </div>
        )}

        {milestones.map((milestone) => (
          <article key={milestone.id} className="card" style={{ marginBottom: "16px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: "16px" }}>{milestone.title}</h3>
                <span
                  className={`badge ${milestone.status === "APPROVED" || milestone.status === "PAID" ? "success" : milestone.status === "REJECTED" ? "warning" : milestone.status === "SUBMITTED" ? "info" : ""}`}
                  style={{ fontSize: "11px", textTransform: "capitalize" }}
                >
                  {MILESTONE_STATUS_LABELS[milestone.status] || milestone.status}
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "18px", fontWeight: 700 }}>
                  {formatEuro(milestone.amount_cents)}
                </div>
                {milestone.due_date && (
                  <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                    Prazo: {new Date(milestone.due_date).toLocaleDateString("pt-PT")}
                  </div>
                )}
              </div>
            </div>

            {milestone.description && (
              <div style={{ marginBottom: "12px", color: "var(--muted)", fontSize: "13px" }}>
                {milestone.description}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap", alignItems: "center" }}>
              {isProvider && (milestone.status === "PENDING" || milestone.status === "IN_PROGRESS") && (
                <>
                  {milestone.require_evidence && (
                    <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setFiles((prev) => ({ ...prev, [milestone.id]: f }));
                        }}
                      />
                      {files[milestone.id] ? `✓ ${files[milestone.id].name}` : "Evidência obrigatória (PDF/JPG/PNG/WEBP máx. 15 MB)"}
                    </label>
                  )}
                  <button
                    className="button"
                    style={{ fontSize: "13px" }}
                    disabled={actionLoading === milestone.id || (milestone.require_evidence && !files[milestone.id])}
                    onClick={() => handleSubmitMilestone(milestone.id)}
                  >
                    {actionLoading === milestone.id ? "A submeter..." : "Marcar concluído"}
                  </button>
                </>
              )}

              {milestoneEvidence(milestone.id).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {milestoneEvidence(milestone.id).map((ev) => (
                    <a
                      key={ev.id}
                      href={`/api/mercado/evidence/${ev.id}/download`}
                      className="button secondary"
                      style={{ fontSize: "12px" }}
                    >
                      ↓ Evidência
                    </a>
                  ))}
                </div>
              )}

              {isOwner && milestone.status === "SUBMITTED" && (
                <>
                  <button
                    className="button"
                    style={{ fontSize: "13px" }}
                    disabled={actionLoading === milestone.id}
                    onClick={() => handleApproveMilestone(milestone.id, true)}
                  >
                    {actionLoading === milestone.id ? "A aprovar..." : "Aprovar"}
                  </button>
                  <button
                    className="button secondary"
                    style={{ fontSize: "13px" }}
                    disabled={actionLoading === milestone.id}
                    onClick={() => handleApproveMilestone(milestone.id, false)}
                  >
                    {actionLoading === milestone.id ? "A devolver..." : "Devolver com nota"}
                  </button>
                </>
              )}

              {milestone.status === "APPROVED" && (
                <span className="badge success" style={{ fontSize: "11px", alignSelf: "center" }}>
                  Aprovado em {milestone.approved_at ? new Date(milestone.approved_at).toLocaleDateString("pt-PT") : "—"}
                </span>
              )}

              {milestone.status === "REJECTED" && (
                <span className="badge warning" style={{ fontSize: "11px", alignSelf: "center" }}>
                  Devolvido
                </span>
              )}
            </div>
          </article>
        ))}
      </section>

      {contract.payments && contract.payments.length > 0 && (
        <section>
          <h2 style={{ margin: "0 0 16px", fontSize: "18px" }}>
            Pagamentos ({contract.payments.length}){" "}
            <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 400 }}>
              — valor bruto; comissão RPG-OS de 3% (300 bps) retida em cada pagamento
            </span>
          </h2>
          <div className="card" style={{ padding: "20px" }}>
            {contract.payments.map((payment) => {
              const milestoneTitle =
                contract.milestones?.find((m) => m.id === payment.milestone_id)?.title || "Milestone";
              const hasFee = (payment.fee_cents ?? 0) > 0;
              return (
                <div
                  key={payment.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border, #eee)",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: "180px" }}>
                    <div style={{ fontWeight: 600 }}>{milestoneTitle}</div>
                    <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                      {isProvider && hasFee
                        ? `Recebe ${formatEuro(payment.net_cents ?? 0)} · comissão ${formatEuro(payment.fee_cents ?? 0)}`
                        : "Pago"}
                    </div>
                  </div>
                  <div style={{ fontWeight: 600 }}>
                    {hasFee && isProvider
                      ? formatEuro(payment.net_cents ?? 0)
                      : formatEuro(payment.amount_cents)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {contract.warranties && contract.warranties.length > 0 && (
        <section>
          <h2 style={{ margin: "0 0 16px", fontSize: "18px" }}>Garantia</h2>
          <div className="card" style={{ padding: "20px" }}>
            {contract.warranties.map((warranty) => (
              <div key={warranty.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border, #eee)" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{warranty.warranty_period_months} meses</div>
                  <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                    {warranty.start_date} → {warranty.end_date}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--muted)" }}>{warranty.coverage}</div>
                </div>
                <span className="badge success" style={{ fontSize: "11px", alignSelf: "center" }}>
                  {warranty.status === "ACTIVE" ? "Ativa" : warranty.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "12px", background: "var(--bg-secondary)", borderRadius: "8px" }}>
      <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ fontWeight: 500 }}>{value}</div>
    </div>
  );
}