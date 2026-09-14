import React from "react";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

interface MarketRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  categoryId: string;
  clientId: string;
  providerId?: string;
  urgency: string;
  desiredStartDate?: string;
  createdAt: string;
  updatedAt: string;
  quotes: MarketQuote[];
}

interface MarketQuote {
  id: string;
  requestId: string;
  providerId: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
}

interface MarketContract {
  id: string;
  requestId: string;
  providerId: string;
  clientId: string;
  status: string;
  milestones: MarketMilestone[];
}

interface MarketMilestone {
  id: string;
  contractId: string;
  title: string;
  status: string;
  dueDate?: string;
}

interface MarketWarranty {
  id: string;
  orderId: string;
  contractId?: string;
  providerId: string;
  clientId: string;
  startDate: string;
  endDate: string;
  coverage: string;
  status: string;
}

interface MercadoPanelData {
  requests: MarketRequest[];
  contracts: MarketContract[];
  warranties: MarketWarranty[];
  error?: string;
}

interface DbServiceRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  category_id: string;
  client_id: string;
  provider_id?: string;
  urgency: string;
  desired_start_date?: string;
  created_at: string;
  updated_at: string;
  quotes?: DbServiceQuote[];
}

interface DbServiceQuote {
  id: string;
  request_id: string;
  provider_id: string;
  status: string;
  total_cents: number;
  currency: string;
  created_at: string;
}

interface DbContract {
  id: string;
  request_id: string;
  provider_id: string;
  client_id: string;
  status: string;
  milestones?: DbMilestone[];
}

interface DbMilestone {
  id: string;
  contract_id: string;
  title: string;
  status: string;
  due_date?: string;
}

interface DbWarranty {
  id: string;
  order_id: string;
  contract_id?: string;
  provider_id: string;
  client_id: string;
  start_date: string;
  end_date: string;
  coverage: string;
  status: string;
}

const CYCLE_STEPS = [
  { id: "pedido", label: "Pedido" },
  { id: "propostas", label: "Propostas" },
  { id: "comparacao", label: "Comparação" },
  { id: "contrato", label: "Contrato" },
  { id: "milestones", label: "Milestones" },
  { id: "evidencia", label: "Evidência" },
  { id: "pagamento", label: "Pagamento" },
  { id: "garantia", label: "Garantia" },
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

function toMarketRequest(r: DbServiceRequest): MarketRequest {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    categoryId: r.category_id,
    clientId: r.client_id,
    providerId: r.provider_id,
    urgency: r.urgency,
    desiredStartDate: r.desired_start_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    quotes: (r.quotes || []).map(toMarketQuote),
  };
}

function toMarketQuote(q: DbServiceQuote): MarketQuote {
  return {
    id: q.id,
    requestId: q.request_id,
    providerId: q.provider_id,
    status: q.status,
    totalCents: q.total_cents,
    currency: q.currency,
    createdAt: q.created_at,
  };
}

function toMarketContract(c: DbContract): MarketContract {
  return {
    id: c.id,
    requestId: c.request_id,
    providerId: c.provider_id,
    clientId: c.client_id,
    status: c.status,
    milestones: (c.milestones || []).map(toMarketMilestone),
  };
}

function toMarketMilestone(m: DbMilestone): MarketMilestone {
  return {
    id: m.id,
    contractId: m.contract_id,
    title: m.title,
    status: m.status,
    dueDate: m.due_date,
  };
}

function toMarketWarranty(w: DbWarranty): MarketWarranty {
  return {
    id: w.id,
    orderId: w.order_id,
    contractId: w.contract_id,
    providerId: w.provider_id,
    clientId: w.client_id,
    startDate: w.start_date,
    endDate: w.end_date,
    coverage: w.coverage,
    status: w.status,
  };
}

async function fetchMercadoData(
  userId: string,
  companyId: string | null
): Promise<MercadoPanelData> {
  const supabase = createAdminClient();

  try {
    let requestsQuery = supabase
      .from("service_requests")
      .select(
        `
        id,
        title,
        description,
        status,
        category_id,
        client_id,
        provider_id,
        urgency,
        desired_start_date,
        created_at,
        updated_at,
        quotes:service_quotes(
          id,
          request_id,
          provider_id,
          status,
          total_cents,
          currency,
          created_at
        )
      `
      )
      .or(`client_id.eq.${userId},provider_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(10);

    if (companyId) {
      requestsQuery = requestsQuery.eq("company_id", companyId);
    }

    const { data: requests, error: requestsError } = await requestsQuery;

    if (requestsError) throw requestsError;

    const dbRequests = (requests || []) as DbServiceRequest[];
    const activeDbRequests = dbRequests.filter((r) =>
      ["PUBLISHED", "QUOTES_RECEIVED", "ADJUDICATING", "ADJUDICATED", "CONTRACTING", "CONTRACTED", "EXECUTING"].includes(r.status)
    );

    let contracts: MarketContract[] = [];
    let warranties: MarketWarranty[] = [];

    if (activeDbRequests.length > 0) {
      const requestIds = activeDbRequests.map((r) => r.id);

      const { data: contractsData } = await supabase
        .from("contracts")
        .select(
          `
          id,
          request_id,
          provider_id,
          client_id,
          status,
          milestones:contract_milestones(
            id,
            contract_id,
            title,
            status,
            due_date
          )
        `
        )
        .in("request_id", requestIds);

      const dbContracts = (contractsData || []) as DbContract[];
      contracts = dbContracts.map(toMarketContract);

      const { data: warrantiesData } = await supabase
        .from("warranties")
        .select("*")
        .in(
          "order_id",
          contracts.map((c) => c.id)
        )
        .eq("status", "ACTIVE");

      const dbWarranties = (warrantiesData || []) as DbWarranty[];
      warranties = dbWarranties.map(toMarketWarranty);
    }

    return {
      requests: activeDbRequests.map(toMarketRequest),
      contracts,
      warranties,
    };
  } catch (error) {
    console.error("[MercadoPanel] Erro ao buscar dados:", error);
    return { requests: [], contracts: [], warranties: [], error: "Mercado indisponível" };
  }
}

function getCurrentStepIndex(status: string): number {
  return STATUS_TO_STEP[status] ?? 0;
}

function getNextAction(status: string, quotesCount: number): string {
  switch (status) {
    case "DRAFT":
      return "Publicar pedido";
    case "PUBLISHED":
      return quotesCount > 0 ? "Comparar propostas" : "Aguardar propostas";
    case "QUOTES_RECEIVED":
      return "Adjudicar proposta";
    case "ADJUDICATING":
      return "Finalizar adjudicação";
    case "ADJUDICATED":
      return "Gerar contrato";
    case "CONTRACTING":
      return "Assinar contrato";
    case "CONTRACTED":
      return "Iniciar execução";
    case "EXECUTING":
      return "Entregar milestone";
    case "COMPLETED":
      return "Avaliar serviço";
    default:
      return "Ver detalhes";
  }
}

export async function MercadoPanel({
  userId,
  companyId,
}: {
  userId: string;
  companyId: string | null;
}) {
  const data = await fetchMercadoData(userId, companyId);

  if (data.error) {
    return (
      <section aria-label="O Mercado" style={{ marginTop: "24px" }}>
        <div className="card" style={{ padding: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#d97706",
              fontSize: "13px",
            }}
          >
            <span>⚠</span>
            <span>{data.error}</span>
          </div>
        </div>
      </section>
    );
  }

  const { requests, contracts = [], warranties = [] } = data;

  const allContracts = contracts.filter(c => c.status !== "DRAFT");

  if (requests.length === 0) {
    return (
      <section aria-label="O Mercado" style={{ marginTop: "24px" }}>
        <div className="card" style={{ padding: "24px", textAlign: "center" }}>
          <p style={{ color: "var(--muted)", margin: "0 0 16px" }}>
            Ainda não há pedidos no mercado.
          </p>
          <Link href="/mercado/pedidos/novo" className="button">
            Novo pedido
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="O Mercado" style={{ marginTop: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "18px" }}>O Mercado</h2>
        {allContracts.length > 0 && (
          <Link href="/mercado/contratos" className="button secondary" style={{ fontSize: "13px" }}>
            Ver Contratos ({allContracts.length})
          </Link>
        )}
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        {requests.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            contracts={contracts.filter((c) => c.requestId === request.id)}
            warranties={warranties}
          />
        ))}
      </div>

      {warranties.length > 0 && (
        <div className="card" style={{ marginTop: "16px", padding: "16px" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: "14px" }}>Garantias Ativas</h3>
          <div style={{ display: "grid", gap: "8px" }}>
            {warranties.map((w) => (
              <div
                key={w.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              >
                <span>{w.coverage}</span>
                <span style={{ color: "var(--muted)" }}>
                  até{" "}
                  {new Date(w.endDate).toLocaleDateString("pt-PT", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function RequestCard({
  request,
  contracts,
  warranties,
}: {
  request: MarketRequest;
  contracts: MarketContract[];
  warranties: MarketWarranty[];
}) {
  const stepIndex = getCurrentStepIndex(request.status);
  const quotesCount = request.quotes?.length ?? 0;
  const nextAction = getNextAction(request.status, quotesCount);
  const contract = contracts[0];
  const activeMilestones = contract?.milestones?.filter((m) => m.status !== "COMPLETED") ?? [];

  return (
    <article className="card" style={{ padding: "16px" }}>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>
              {request.title}
            </h3>
            <span
              className={`badge ${request.status === "PUBLISHED" || request.status === "QUOTES_RECEIVED" ? "warning" : request.status === "ADJUDICATED" || request.status === "CONTRACTING" || request.status === "CONTRACTED" ? "info" : request.status === "EXECUTING" ? "success" : ""}`}
              style={{ fontSize: "10px", textTransform: "lowercase" }}
            >
              {request.status}
            </span>
          </div>
          <p style={{ color: "var(--muted)", fontSize: "12px", margin: "0 0 12px" }}>
            {request.description.slice(0, 120)}{request.description.length > 120 ? "…" : ""}
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              marginBottom: "12px",
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
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    fontSize: "11px",
                    fontWeight: 600,
                    background: idx < stepIndex ? "#2563eb" : idx === stepIndex ? "#d97706" : "var(--border)",
                    color: idx <= stepIndex ? "#fff" : "var(--muted)",
                  }}
                  aria-current={idx === stepIndex ? "step" : undefined}
                >
                  {idx + 1}
                </span>
                {idx < CYCLE_STEPS.length - 1 && (
                  <span
                    style={{
                      width: "24px",
                      height: "2px",
                      background: idx < stepIndex ? "#2563eb" : "var(--border)",
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              fontSize: "12px",
              color: "var(--muted)",
            }}
          >
            <span>
              💬 {quotesCount} proposta{quotesCount !== 1 ? "s" : ""}
            </span>
            {contract && (
              <span>
                📋 {activeMilestones.length} milestone{activeMilestones.length !== 1 ? "s" : ""} ativo{activeMilestones.length !== 1 ? "s" : ""}
              </span>
            )}
            <span style={{ color: "#2563eb", fontWeight: 500 }}>
              → {nextAction}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}