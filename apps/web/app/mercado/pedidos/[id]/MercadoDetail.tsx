"use client";


interface MarketRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  category_id: string;
  client_id: string;
  provider_id?: string;
  urgency: string;
  desired_start_date?: string;
  desired_end_date?: string;
  budget_type: string;
  budget_amount_cents?: number;
  budget_min_cents?: number;
  budget_max_cents?: number;
  budget_currency: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
  quotes: MarketQuote[];
}

interface MarketQuote {
  id: string;
  request_id: string;
  provider_id: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  valid_until: string;
  terms?: string;
  warranty_months?: number;
  estimated_start_date?: string;
  estimated_duration_days?: number;
  response_to_questions?: string;
  status: string;
  sent_at?: string;
  viewed_at?: string;
  responded_at?: string;
  created_at: string;
  updated_at: string;
  items: MarketQuoteItem[];
}

interface MarketQuoteItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  tax_rate: number;
  total_cents: number;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  QUOTES_RECEIVED: "Propostas recebidas",
  ADJUDICATING: "Adjudicação",
  ADJUDICATED: "Adjudicado",
  CONTRACTING: "Contrato",
  CONTRACTED: "Contratado",
  EXECUTING: "Em execução",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  DISPUTED: "Em litígio",
};

const QUOTE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  SENT: "Enviada",
  VIEWED: "Visualizada",
  ACCEPTED: "Aceite",
  REJECTED: "Recusada",
  EXPIRED: "Expirada",
  WITHDRAWN: "Retirada",
  CONVERTED_TO_CONTRACT: "Convertida em contrato",
};

const CYCLE_STEPS = [
  { id: "pedido", label: "1. Pedido" },
  { id: "propostas", label: "2. Propostas" },
  { id: "comparacao", label: "3. Comparação" },
  { id: "contrato", label: "4. Contrato" },
  { id: "milestones", label: "5. Milestones" },
  { id: "evidencia", label: "6. Evidência" },
  { id: "pagamento", label: "7. Pagamento" },
  { id: "garantia", label: "8. Garantia" },
];

const STATUS_TO_STEP: Record<string, number> = {
  DRAFT: 0,
  PUBLISHED: 1,
  QUOTES_RECEIVED: 1,
  ADJUDICATING: 2,
  ADJUDICATED: 2,
  CONTRACTING: 3,
  CONTRACTED: 3,
  EXECUTING: 4,
  COMPLETED: 7,
  CANCELLED: -1,
  DISPUTED: -1,
};

export function MercadoDetail({
  request,
  isOwner,
  hasQuote,
  currentUserId,
}: {
  request: MarketRequest;
  isOwner: boolean;
  hasQuote: boolean;
  currentUserId: string;
}) {
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [items, setItems] = useState<QuoteFormItem[]>([{ description: "", quantity: 1, unit: "un", unitPriceCents: 0, taxRate: 23 }]);
  const [terms, setTerms] = useState("");
  const [warrantyMonths, setWarrantyMonths] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function addItem() {
    setItems([...items, { description: "", quantity: 1, unit: "un", unitPriceCents: 0, taxRate: 23 }]);
  }

  const stepIndex = STATUS_TO_STEP[request.status] ?? 0;
  const quotesCount = request.quotes?.length ?? 0;

  const isProvider = hasQuote && !isOwner;

  const subtotalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const taxCents = items.reduce((sum, item) => sum + Math.round((item.unitPriceCents * item.quantity * item.taxRate) / 100), 0);
  const totalCents = subtotalCents + taxCents;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const itemsForSubmit = items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: item.unitPriceCents,
      taxRate: item.taxRate,
    }));

    const formData = new FormData();
    formData.append("requestId", request.id);
    formData.append("items", JSON.stringify(itemsForSubmit));
    formData.append("subtotalCents", String(subtotalCents));
    formData.append("taxCents", String(taxCents));
    formData.append("totalCents", String(totalCents));
    formData.append("currency", "EUR");
    formData.append("validUntil", validUntil);
    if (terms) formData.append("terms", terms);
    if (warrantyMonths) formData.append("warrantyMonths", warrantyMonths);

    try {
      const res = await fetch("/api/mercado/quote", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setShowQuoteForm(false);
        window.location.reload();
      }
    } catch {
      setError("Erro de rede");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <Link href="/mercado" style={{ color: "#2563eb", textDecoration: "none", fontSize: "14px" }}>
            ← Voltar ao Mercado
          </Link>
          <h1 style={{ margin: "8px 0 0", fontSize: "28px" }}>{request.title}</h1>
        </div>
        <span
          className={`badge ${["PUBLISHED", "QUOTES_RECEIVED"].includes(request.status) ? "warning" : request.status === "ADJUDICATED" || request.status === "CONTRACTING" || request.status === "CONTRACTED" ? "info" : request.status === "EXECUTING" ? "success" : ""}`}
          style={{ fontSize: "12px", textTransform: "capitalize" }}
        >
          {STATUS_LABELS[request.status] || request.status}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "24px",
          overflowX: "auto",
        }}
        role="navigation"
        aria-label="Ciclo do pedido"
      >
        {CYCLE_STEPS.map((step, idx) => (
          <React.Fragment key={step.id}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "100px",
                height: "32px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                background: idx < stepIndex ? "#2563eb" : idx === stepIndex ? "#d97706" : "var(--border)",
                color: idx <= stepIndex ? "#fff" : "var(--muted)",
              }}
              aria-current={idx === stepIndex ? "step" : undefined}
            >
              {step.label}
            </span>
            {idx < CYCLE_STEPS.length - 1 && (
              <span
                style={{
                  flex: 1,
                  height: "2px",
                  background: idx < stepIndex ? "#2563eb" : "var(--border)",
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="card" style={{ padding: "24px", marginBottom: "24px" }}>
        <div style={{ marginBottom: "16px" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: "16px" }}>Descrição</h3>
          <p style={{ color: "var(--muted)", whiteSpace: "pre-wrap", margin: 0 }}>{request.description}</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          <DetailRow label="Urgência" value={request.urgency} />
          <DetailRow label="Início pretendido" value={request.desired_start_date ? new Date(request.desired_start_date).toLocaleDateString("pt-PT") : "—"} />
          <DetailRow label="Fim pretendido" value={request.desired_end_date ? new Date(request.desired_end_date).toLocaleDateString("pt-PT") : "—"} />
          <DetailRow
            label="Orçamento"
            value={request.budget_type === "FIXED" && request.budget_amount_cents
              ? `${formatEuro(request.budget_amount_cents)} (${request.budget_type})`
              : request.budget_type === "RANGE" && request.budget_min_cents && request.budget_max_cents
                ? `${formatEuro(request.budget_min_cents)} – ${formatEuro(request.budget_max_cents)} (${request.budget_type})`
                : `${request.budget_type}`}
          />
        </div>
      </div>

      <section style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ margin: 0, fontSize: "18px" }}>Propostas ({quotesCount})</h2>
          {isOwner && request.status === "PUBLISHED" && !showQuoteForm && (
            <button
              onClick={() => setShowQuoteForm(true)}
              className="button"
              style={{ fontSize: "13px" }}
            >
              Receber propostas
            </button>
          )}
          {!isOwner && !hasQuote && request.status === "PUBLISHED" && !showQuoteForm && (
            <button
              onClick={() => setShowQuoteForm(true)}
              className="button"
              style={{ fontSize: "13px" }}
            >
              Submeter proposta
            </button>
          )}
        </div>

        {showQuoteForm && (
          <QuoteForm
            requestId={request.id}
            onClose={() => setShowQuoteForm(false)}
            isOwner={isOwner}
          />
        )}

        {quotesCount === 0 && !showQuoteForm && (
          <div
            className="card"
            style={{ padding: "32px", textAlign: "center", color: "var(--muted)" }}
          >
            {isOwner ? "Nenhuma proposta recebida ainda." : "Ainda não submeteu proposta para este pedido."}
          </div>
        )}

        {request.quotes?.map((quote) => (
          <QuoteCard key={quote.id} quote={quote} isOwner={isOwner} currentUserId={currentUserId} request={request} />
        ))}
      </section>
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

function QuoteCard({ quote, isOwner, currentUserId, request }: { quote: MarketQuote; isOwner: boolean; currentUserId: string; request: MarketRequest }) {
  const isMyQuote = quote.provider_id === currentUserId;

  return (
    <article className="card" style={{ marginBottom: "16px", padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: "16px" }}>Proposta de {isMyQuote ? "você" : "prestador"}</h3>
          <span
            className={`badge ${QUOTE_STATUS_LABELS[quote.status] === "Aceite" ? "success" : QUOTE_STATUS_LABELS[quote.status] === "Recusada" ? "warning" : "info"}`}
            style={{ fontSize: "11px", textTransform: "capitalize" }}
          >
            {QUOTE_STATUS_LABELS[quote.status] || quote.status}
          </span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "20px", fontWeight: 700 }}>
            {quote.total_cents ? (quote.total_cents / 100).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €" : "—"}
          </div>
          <div style={{ fontSize: "12px", color: "var(--muted)" }}>
            Válida até {quote.valid_until ? new Date(quote.valid_until).toLocaleDateString("pt-PT") : "—"}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: "12px" }}>
        {quote.items?.map((item) => (
          <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span>{item.description} × {item.quantity} {item.unit}</span>
            <span>{(item.total_cents / 100).toLocaleString("pt-PT", { minimumFractionDigits: 2 })} €</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontWeight: 600 }}>
          <span>Total</span>
          <span>{quote.total_cents ? (quote.total_cents / 100).toLocaleString("pt-PT", { minimumFractionDigits: 2 }) + " €" : "—"}</span>
        </div>
      </div>

      {quote.terms && (
        <div style={{ marginBottom: "12px", padding: "12px", background: "var(--bg-secondary)", borderRadius: "8px", fontSize: "13px" }}>
          <strong>Termos: </strong>{quote.terms}
        </div>
      )}

      {quote.warranty_months && (
        <div style={{ marginBottom: "12px", fontSize: "13px", color: "var(--muted)" }}>
          Garantia: {quote.warranty_months} mês{quote.warranty_months !== 1 ? "es" : ""}
        </div>
      )}

      {quote.estimated_start_date && (
        <div style={{ marginBottom: "12px", fontSize: "13px", color: "var(--muted)" }}>
          Início estimado: {new Date(quote.estimated_start_date).toLocaleDateString("pt-PT")}
          {quote.estimated_duration_days ? ` • Duração: ${quote.estimated_duration_days} dia(s)` : ""}
        </div>
      )}

      {isOwner && ["SENT", "VIEWED"].includes(quote.status) && (
        <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
          <button
            className="button"
            style={{ fontSize: "13px" }}
            onClick={async () => {
              try {
                const formData = new FormData();
                formData.append("requestId", request.id);
                formData.append("quoteId", quote.id);
                const res = await fetch("/api/mercado/contract", {
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
              }
            }}
          >
            Aceitar
          </button>
          <button className="button secondary" style={{ fontSize: "13px" }}>
            Recusar
          </button>
        </div>
      )}
    </article>
  );
}


function QuoteForm({ requestId, onClose, isOwner }: { requestId: string; onClose: () => void; isOwner: boolean }) {
  const [items, setItems] = useState<QuoteFormItem[]>([{ description: "", quantity: 1, unit: "un", unitPriceCents: 0, taxRate: 23 }]);
  const [terms, setTerms] = useState("");
  const [warrantyMonths, setWarrantyMonths] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function addItem() {
    setItems([...items, { description: "", quantity: 1, unit: "un", unitPriceCents: 0, taxRate: 23 }]);
  }

  const subtotalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const taxCents = items.reduce((sum, item) => sum + Math.round((item.unitPriceCents * item.quantity * item.taxRate) / 100), 0);
  const totalCents = subtotalCents + taxCents;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const itemsForSubmit = items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: item.unitPriceCents,
      taxRate: item.taxRate,
    }));

    const formData = new FormData();
    formData.append("requestId", requestId);
    formData.append("items", JSON.stringify(itemsForSubmit));
    formData.append("subtotalCents", String(subtotalCents));
    formData.append("taxCents", String(taxCents));
    formData.append("totalCents", String(totalCents));
    formData.append("currency", "EUR");
    formData.append("validUntil", validUntil);
    if (terms) formData.append("terms", terms);
    if (warrantyMonths) formData.append("warrantyMonths", warrantyMonths);

    try {
      const res = await fetch("/api/mercado/quote", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        onClose();
        window.location.reload();
      }
    } catch {
      setError("Erro de rede");
    } finally {
      setSubmitting(false);
    }
  }

  const formatEuro = (cents: number) => (cents / 100).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: "24px", marginBottom: "24px" }}>
      <h3 style={{ margin: "0 0 16px" }}>Nova Proposta</h3>

      {error && <div className="alert alert-danger" style={{ marginBottom: "16px" }}>{error}</div>}

      <div style={{ marginBottom: "16px" }}>
        <label style={{ display: "block", fontSize: "13px", marginBottom: "8px", fontWeight: 500 }}>
          Itens
        </label>
        {items.map((item, idx) => (
          <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto", gap: "8px", marginBottom: "8px", alignItems: "end" }}>
            <input
              type="text"
              placeholder="Descrição"
              value={item.description}
              onChange={(e) => setItems(items.map((i, i2) => i2 === idx ? { ...i, description: e.target.value } : i))}
              required
              className="input"
            />
            <input
              type="number"
              min="1"
              step="1"
              placeholder="Qtd"
              value={item.quantity}
              onChange={(e) => setItems(items.map((i, i2) => i2 === idx ? { ...i, quantity: parseInt(e.target.value) || 1 } : i))}
              className="input"
            />
            <input
              type="text"
              placeholder="Unidade"
              value={item.unit}
              onChange={(e) => setItems(items.map((i, i2) => i2 === idx ? { ...i, unit: e.target.value } : i))}
              className="input"
            />
            <input
              type="number"
              min="0"
              step="1"
              placeholder="Preço (cêntimos)"
              value={item.unitPriceCents}
              onChange={(e) => setItems(items.map((i, i2) => i2 === idx ? { ...i, unitPriceCents: parseInt(e.target.value) || 0 } : i))}
              className="input"
            />
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="IVA %"
              value={item.taxRate}
              onChange={(e) => setItems(items.map((i, i2) => i2 === idx ? { ...i, taxRate: parseFloat(e.target.value) || 23 } : i))}
              className="input"
            />
            {items.length > 1 && (
              <button type="button" onClick={() => setItems(items.filter((_, i2) => i2 !== idx))} className="button secondary" style={{ fontSize: "12px" }}>
                Remover
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addItem} className="button secondary" style={{ fontSize: "13px" }}>
          {"+ Adicionar item"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "16px" }}>
        <div>
          <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Validade até</label>
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} required className="input" />
        </div>
        <div>
          <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Meses de garantia</label>
          <input type="number" min="1" max="120" value={warrantyMonths} onChange={(e) => setWarrantyMonths(e.target.value)} className="input" placeholder="12" />
        </div>
      </div>

      <div style={{ marginBottom: "16px" }}>
        <label style={{ display: "block", fontSize: "13px", marginBottom: "4px" }}>Termos e condições</label>
        <textarea
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          rows={3}
          className="input"
          placeholder="Termos opcionais..."
        />
      </div>

      <div style={{ background: "var(--bg-secondary)", padding: "16px", borderRadius: "8px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <span>Subtotal</span>
          <strong>{formatEuro(subtotalCents)} €</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <span>IVA</span>
          <strong>{formatEuro(taxCents)} €</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "16px" }}>
          <span>Total</span>
          <span>{formatEuro(totalCents)} €</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} className="button secondary" disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" className="button" disabled={submitting || items.length === 0 || items.some((i) => !i.description || i.unitPriceCents <= 0) || !validUntil}>
          {submitting ? "A submeter..." : isOwner ? "Publicar pedido" : "Submeter proposta"}
        </button>
      </div>
    </form>
  );
}

interface QuoteFormItem {
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  taxRate: number;
}

import React, { useState } from "react";
import { formatEuro } from "@/lib/currency";
import Link from "next/link";