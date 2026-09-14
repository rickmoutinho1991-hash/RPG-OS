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
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
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
  request?: {
    title: string;
    description: string;
    client_id: string;
    category_id: string;
  };
}

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_SIGNATURE: "Aguardando assinatura",
  SIGNED: "Assinado",
  ACTIVE: "Ativo",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  DISPUTED: "Em litígio",
};

export default function ContratosPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/mercado/contracts");
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setContracts(data.contracts || []);
          const sessionRes = await fetch("/api/session-context");
          const sessionData = await sessionRes.json();
          setCurrentUserId(sessionData.user?.id || "");
        }
      } catch {
        setError("Erro ao carregar contratos");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const isProvider = (c: Contract) => c.provider_id === currentUserId;
  const isOwner = (c: Contract) => c.client_id === currentUserId;
  const role = (c: Contract) => isProvider(c) ? "Prestador" : isOwner(c) ? "Cliente" : "—";

  const activeContracts = contracts.filter(c => c.status !== "DRAFT" && c.status !== "CANCELLED");
  const completedContracts = contracts.filter(c => c.status === "COMPLETED");

  if (loading) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "48px", textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "48px", textAlign: "center" }}>
        <h1 style={{ marginBottom: "16px" }}>Erro ao carregar contratos</h1>
        <p style={{ color: "var(--muted)" }}>{error}</p>
        <Link href="/mercado" className="button" style={{ marginTop: "16px", display: "inline-block" }}>
          Voltar ao Mercado
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <Link href="/mercado" style={{ color: "#2563eb", textDecoration: "none", fontSize: "14px" }}>
            ← Voltar ao Mercado
          </Link>
          <h1 style={{ margin: "8px 0 0", fontSize: "28px" }}>Os Meus Contratos</h1>
        </div>
      </div>

      {activeContracts.length === 0 && completedContracts.length === 0 && (
        <div className="card" style={{ padding: "48px", textAlign: "center" }}>
          <p style={{ color: "var(--muted)", margin: "0 0 16px" }}>
            Ainda não tens contratos ativos ou concluídos.
          </p>
          <Link href="/mercado" className="button">
            Ir ao Mercado
          </Link>
        </div>
      )}

      {activeContracts.length > 0 && (
        <section style={{ marginBottom: "32px" }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "18px" }}>
            Ativos ({activeContracts.length})
          </h2>
          <div style={{ display: "grid", gap: "12px" }}>
            {activeContracts.map((contract) => (
              <ContractListItem
                key={contract.id}
                contract={contract}
                role={role(contract)}
                isProvider={isProvider(contract)}
                isOwner={isOwner(contract)}
              />
            ))}
          </div>
        </section>
      )}

      {completedContracts.length > 0 && (
        <section>
          <h2 style={{ margin: "0 0 16px", fontSize: "18px" }}>
            Concluídos ({completedContracts.length})
          </h2>
          <div style={{ display: "grid", gap: "12px" }}>
            {completedContracts.map((contract) => (
              <ContractListItem
                key={contract.id}
                contract={contract}
                role={role(contract)}
                isProvider={isProvider(contract)}
                isOwner={isOwner(contract)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ContractListItem({
  contract,
  role,
  isProvider,
  isOwner,
}: {
  contract: Contract;
  role: string;
  isProvider: boolean;
  isOwner: boolean;
}) {
  const milestones = contract.milestones?.sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  ) ?? [];
  const pendingCount = milestones.filter(m => m.status === "PENDING" || m.status === "IN_PROGRESS").length;
  const submittedCount = milestones.filter(m => m.status === "SUBMITTED").length;
  const approvedCount = milestones.filter(m => m.status === "APPROVED" || m.status === "PAID").length;
  const totalAmount = milestones.reduce((sum, m) => sum + m.amount_cents, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
      case "SIGNED":
        return "success";
      case "PENDING_SIGNATURE":
        return "info";
      case "COMPLETED":
        return "info";
      case "CANCELLED":
      case "DISPUTED":
        return "warning";
      default:
        return "";
    }
  };

  return (
    <Link
      href={`/mercado/contratos/${contract.id}`}
      className="card"
      style={{
        padding: "20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "16px",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ flex: 1, minWidth: "250px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
            {contract.request?.title || "Contrato"}
          </h3>
          <span
            className={`badge ${getStatusBadge(contract.status)}`}
            style={{ fontSize: "10px", textTransform: "capitalize" }}
          >
            {CONTRACT_STATUS_LABELS[contract.status] || contract.status}
          </span>
          <span className="badge" style={{ fontSize: "10px", background: "var(--bg-tertiary)", color: "var(--muted)" }}>
            {role}
          </span>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "12px", margin: "0 0 8px" }}>
          {contract.request?.description?.slice(0, 100)}...
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            fontSize: "12px",
            color: "var(--muted)",
          }}
        >
          {totalAmount > 0 && (
            <span>
              <strong>Valor: </strong>{formatEuro(totalAmount)}
            </span>
          )}
          {milestones.length > 0 && (
            <span>
              <strong>Milestones: </strong>
              {milestones.length} total
              {pendingCount > 0 && <span style={{ color: "#d97706" }}> • {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}</span>}
              {submittedCount > 0 && <span style={{ color: "#2563eb" }}> • {submittedCount} submetido{submittedCount !== 1 ? "s" : ""}</span>}
              {approvedCount > 0 && <span style={{ color: "#059669" }}> • {approvedCount} aprovado{approvedCount !== 1 ? "s" : ""}</span>}
            </span>
          )}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: "12px", color: "var(--muted)" }}>
          Criado em {new Date(contract.created_at).toLocaleDateString("pt-PT", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
        </div>
        <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
          ID: {contract.id.slice(0, 8)}…
        </div>
      </div>
    </Link>
  );
}