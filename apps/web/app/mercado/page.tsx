import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPermission } from "@rpg/core";
import { getSessionContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatEuro } from "@/lib/currency";
import {
  OPEN_REQUEST_STATUSES,
  buildLocationLabel,
  buildRequestFilters,
  formatOfferPrice,
} from "@/lib/mercado/feed";

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
  location_city: string | null;
  location_district: string | null;
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

interface DbOffering {
  id: string;
  provider_id: string;
  category_id: string | null;
  title: string;
  description: string;
  price_type: string;
  price_cents: number | null;
  currency: string | null;
  location_service_mode: string;
  location_city: string | null;
  location_district: string | null;
  created_at: string;
}

function serviceModeLabel(mode: string): string {
  switch (mode) {
    case "ON_SITE":
      return "Presencial";
    case "REMOTE":
      return "Remoto";
    default:
      return "Remoto + Presencial";
  }
}

function buildTabsHref(tab: string, q: string, cat: string): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (cat) params.set("cat", cat);
  if (tab === "prestadores") params.set("tab", "prestadores");
  const qs = params.toString();
  return qs ? `/mercado?${qs}` : "/mercado";
}

export default async function MercadoPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; cat?: string; tab?: string }>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const qRaw = resolved.q ?? "";
  const catRaw = resolved.cat ?? "";
  const activeTab = resolved.tab === "prestadores" ? "prestadores" : "oportunidades";

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
  const canOffer = hasPermission(ctx.permissions, "marketplace.quotes.create");
  const supabase = createAdminClient();

  const { data: categoriesData } = await supabase
    .from("categories")
    .select("id, name")
    .eq("active", true);
  const categoryNames = new Map(
    ((categoriesData ?? []) as { id: string; name: string }[]).map((c) => [
      c.id,
      c.name,
    ]),
  );

  const filters = buildRequestFilters(qRaw || undefined, catRaw || undefined);
  const searchQuery = filters.ilikeTitle ?? undefined;
  const searchCat = filters.categoryId ?? undefined;

  let requests: DbRequest[] = [];
  let offerings: DbOffering[] = [];
  const providerNames = new Map<string, string>();

  if (activeTab === "prestadores") {
    const { data: offeringsData } = await supabase
      .from("provider_offerings")
      .select(
        "id, provider_id, category_id, title, description, price_type, price_cents, currency, location_service_mode, location_city, location_district, created_at",
      )
      .eq("status", "PUBLISHED")
      .eq("moderation_status", "APPROVED")
      .order("created_at", { ascending: false })
      .limit(30);
    offerings = (offeringsData ?? []) as DbOffering[];

    const providerIds = Array.from(
      new Set(offerings.map((o) => o.provider_id)),
    );
    if (providerIds.length > 0) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, name")
        .in("user_id", providerIds);
      for (const p of (profilesData ?? []) as {
        user_id: string;
        name: string | null;
      }[]) {
        if (p.name) providerNames.set(p.user_id, p.name);
      }
    }
  } else {
    let requestsQuery = supabase
      .from("service_requests")
      .select(
        "id, title, description, status, urgency, category_id, client_id, budget_type, budget_amount_cents, budget_min_cents, budget_max_cents, budget_currency, location_city, location_district, created_at",
      );
    if (searchQuery) requestsQuery = requestsQuery.ilike("title", searchQuery);
    if (searchCat) requestsQuery = requestsQuery.eq("category_id", searchCat);
    requestsQuery = requestsQuery
      .in("status", OPEN_REQUEST_STATUSES)
      .order("created_at", { ascending: false })
      .limit(30);

    const { data: requestsData } = await requestsQuery;
    requests = (requestsData ?? []) as DbRequest[];
  }

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
          marginBottom: "16px",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "28px" }}>Mercado</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: "14px" }}>
            Oportunidades abertas e profissionais a oferecer serviços.
          </p>
        </div>
        {activeTab === "oportunidades"
          ? canCreate && (
              <Link href="/mercado/pedidos/novo" className="button">
                Novo pedido
              </Link>
            )
          : canOffer && (
              <Link href="/mercado/oferta/nova" className="button">
                Nova oferta
              </Link>
            )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <Link
          href={buildTabsHref("oportunidades", qRaw, catRaw)}
          className={activeTab === "oportunidades" ? "badge" : "badge"}
          style={{
            padding: "6px 14px",
            fontSize: "13px",
            textDecoration: "none",
            background:
              activeTab === "oportunidades" ? "var(--brand, #2563eb)" : "var(--bg-tertiary, #f1f5f9)",
            color: activeTab === "oportunidades" ? "#fff" : "var(--muted, #64748b)",
          }}
        >
          Oportunidades
        </Link>
        <Link
          href={buildTabsHref("prestadores", qRaw, catRaw)}
          className="badge"
          style={{
            padding: "6px 14px",
            fontSize: "13px",
            textDecoration: "none",
            background:
              activeTab === "prestadores" ? "var(--brand, #2563eb)" : "var(--bg-tertiary, #f1f5f9)",
            color: activeTab === "prestadores" ? "#fff" : "var(--muted, #64748b)",
          }}
        >
          Prestadores
        </Link>
      </div>

      {/* Search */}
      <form
        action="/mercado"
        method="GET"
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        <input type="hidden" name="tab" value={activeTab} />
        <input
          type="search"
          name="q"
          defaultValue={qRaw}
          placeholder="Pesquisar por palavra-chave..."
          className="input"
          style={{ flex: 1, minWidth: "200px" }}
        />
        <select name="cat" className="input" style={{ maxWidth: "220px" }} defaultValue={catRaw}>
          <option value="">Todas as categorias</option>
          {Array.from(categoryNames.entries()).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <button type="submit" className="button secondary" style={{ padding: "6px 14px" }}>
          Filtrar
        </button>
      </form>

      {activeTab === "oportunidades" ? (
        requests.length === 0 ? (
          <div className="card" style={{ padding: "48px", textAlign: "center" }}>
            <p style={{ color: "var(--muted)", margin: "0 0 16px" }}>
              Não há oportunidades abertas com estes filtros.
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
                    <strong>Local: </strong>
                    {buildLocationLabel(r.location_city, r.location_district)}
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
        )
      ) : offerings.length === 0 ? (
        <div className="card" style={{ padding: "48px", textAlign: "center" }}>
          <p style={{ color: "var(--muted)", margin: "0 0 16px" }}>
            Ainda não há profissionais a oferecer serviços.
          </p>
          {canOffer && (
            <Link href="/mercado/oferta/nova" className="button">
              Publicar a primeira oferta
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {offerings.map((o) => (
            <div key={o.id} className="card" style={{ padding: "20px" }}>
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
                  {o.title}
                </h3>
                <span className="badge" style={{ fontSize: "10px" }}>
                  Oferta
                </span>
              </div>
              <p style={{ color: "var(--muted)", fontSize: "13px", margin: "0 0 12px" }}>
                {o.description.length > 160
                  ? `${o.description.slice(0, 160)}…`
                  : o.description}
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
                  <strong>Preço: </strong>
                  {formatOfferPrice(o.price_cents, o.price_type)}
                </span>
                <span>
                  <strong>Categoria: </strong>
                  {(o.category_id && categoryNames.get(o.category_id)) || "—"}
                </span>
                <span>
                  <strong>Modalidade: </strong>
                  {serviceModeLabel(o.location_service_mode)}
                </span>
                <span>
                  <strong>Local: </strong>
                  {buildLocationLabel(o.location_city, o.location_district)}
                </span>
                <span>
                  <strong>Por: </strong>
                  {providerNames.get(o.provider_id) || "Profissional"}
                </span>
              </div>
            </div>
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