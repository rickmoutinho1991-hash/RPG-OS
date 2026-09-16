import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPermission } from "@rpg/core";
import { getSessionContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatEuro } from "@/lib/currency";

const OPEN_STATUSES = ["PUBLISHED", "QUOTES_RECEIVED", "ADJUDICATING"];

const STATUS_LABELS: Record<string, string> = {
  PUBLISHED: "Aberto",
  QUOTES_RECEIVED: "A receber propostas",
  ADJUDICATING: "Em adjudicação",
};

const URGENCY_LABELS: Record<string, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
};

interface DbRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  urgency: string | null;
  category_id: string | null;
  client_id: string;
  budget_type: string;
  budget_amount_cents: number | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  budget_currency: string | null;
  desired_start_date: string | null;
  created_at: string;
}

function budgetLabel(r: DbRequest): string {
  if (r.budget_type === "FIXED" && r.budget_amount_cents) {
    return `${formatEuro(r.budget_amount_cents)} €`;
  }
  if (r.budget_type === "RANGE" && r.budget_min_cents && r.budget_max_cents) {
    return `${formatEuro(r.budget_min_cents)} € – ${formatEuro(r.budget_max_cents)} €`;
  }
  return "A negociar";
}

function urgencyClass(urgency: string | null): string {
  if (urgency === "URGENT" || urgency === "HIGH") return "warning";
  return "";
}

export default async function MercadoPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  if (!hasPermission(ctx.permissions, "marketplace.view")) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "48px", textAlign: "center" }}>
        <h1 style={{ marginBottom: "16px" }}>Mercado</h1>
        <p style={{ color: "var(--muted)" }}>
          Não tens acesso ao mercado de oportunidades.
        </p>
      </div>
    );
  }

  const canCreate = hasPermission(ctx.permissions, "marketplace.requests.create");
  const supabase = createAdminClient();

  const [{ data: requestsData }, { data: categoriesData }] = await Promise.all([
    supabase
      .from("service_requests")
      .select(
        "id, title, description, status, urgency, category_id, client_id, budget_type, budget_amount_cents, budget_min_cents, budget_max_cents, budget_currency, desired_start_date, created_at",
      )
      .in("status", OPEN_STATUSES)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("categories").select("id, name").eq("active", true),
  ]);

  const requests = (requestsData ?? []) as DbRequest[];
  const categoryNames = new Map(
    ((categoriesData ?? []) as { id: string; name: string }[]).map((c) => [
      c.id,
      c.name,
    ]),
  );
  const mine = (r: DbRequest) => r.client_id === ctx.user.id;

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "24px",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "28px" }}>Mercado</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: "14px" }}>
            Oportunidades abertas: encontra trabalho ou quem o faça.
          </p>
        </div>
        {canCreate && (
          <Link href="/mercado/pedidos/novo" className="button">
            Novo pedido
          </Link>
        )}
      </div>

      {requests.length === 0 ? (
        <div className="card" style={{ padding: "48px", textAlign: "center" }}>
          <p style={{ color: "var(--muted)", margin: "0 0 16px" }}>
            Ainda não há oportunidades abertas no mercado.
          </p>
          {canCreate && (
            <Link href="/mercado/pedidos/novo" className="button">
              Publicar o primeiro pedido
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {requests.map((r) => (
            <Link
              key={r.id}
              href={`/mercado/pedidos/${r.id}`}
              className="card"
              style={{
                padding: "20px",
                display: "block",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  flexWrap: "wrap",
                  marginBottom: "8px",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
                  {r.title}
                </h3>
                <span className="badge" style={{ fontSize: "10px" }}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
                {r.urgency && (
                  <span
                    className={`badge ${urgencyClass(r.urgency)}`}
                    style={{ fontSize: "10px" }}
                  >
                    {URGENCY_LABELS[r.urgency] ?? r.urgency}
                  </span>
                )}
                {mine(r) && (
                  <span className="badge" style={{ fontSize: "10px" }}>
                    Meu pedido
                  </span>
                )}
              </div>
              <p
                style={{
                  color: "var(--muted)",
                  fontSize: "13px",
                  margin: "0 0 12px",
                }}
              >
                {r.description.length > 160
                  ? `${r.description.slice(0, 160)}…`
                  : r.description}
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "16px",
                  fontSize: "12px",
                  color: "var(--muted)",
                }}
              >
                <span>
                  <strong>Valor: </strong>
                  {budgetLabel(r)}
                </span>
                <span>
                  <strong>Categoria: </strong>
                  {(r.category_id && categoryNames.get(r.category_id)) || "—"}
                </span>
                <span>
                  <strong>Publicado: </strong>
                  {new Date(r.created_at).toLocaleDateString("pt-PT", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div style={{ marginTop: "24px" }}>
        <Link
          href="/mercado/contratos"
          style={{ color: "var(--brand, #2563eb)", textDecoration: "none", fontSize: "14px" }}
        >
          Ver os meus contratos →
        </Link>
      </div>
    </div>
  );
}
