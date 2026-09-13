import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getQuoteById, convertQuoteToProjectAction, respondToQuoteAction } from "../actions";
import { formatPortugueseNif } from "@rpg/core";

export const dynamic = "force-dynamic";

export default async function OrcamentoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getQuoteById(id);

  if (!data || !data.quote) {
    notFound();
  }

  const { quote, items } = data;
  const client = quote.users?.profiles;
  const clientName = Array.isArray(client) ? client[0]?.name : client?.name;
  const clientTaxNumber = Array.isArray(client)
    ? client[0]?.tax_number
    : client?.tax_number;
  const address = Array.isArray(client)
    ? client[0]?.addresses
    : client?.addresses;

  async function handleConvertToProject() {
    "use server";
    const res = await convertQuoteToProjectAction(id);
    if (res.success && res.projectId) {
      redirect(`/obras/${res.projectId}`);
    }
  }

  async function handleAccept(formData: FormData) {
    "use server";
    const signer = String(formData.get("signer_name") ?? "").trim();
    await respondToQuoteAction(id, "ACCEPTED", signer, "Aprovado eletronicamente pelo cliente");
  }

  async function handleReject(formData: FormData) {
    "use server";
    const signer = String(formData.get("signer_name") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    await respondToQuoteAction(id, "REJECTED", signer, reason);
  }

  return (
    <main>
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="tag-badge">{quote.quote_number}</span>
            <h2 style={{ margin: 0 }}>{quote.title}</h2>
          </div>
          <p style={{ marginTop: "6px" }}>
            Emitido em: {new Date(quote.issue_date).toLocaleDateString("pt-PT")}{" "}
            • Validade:{" "}
            {new Date(quote.valid_until).toLocaleDateString("pt-PT")}
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <Link href="/orcamentos" className="button secondary">
            ← Voltar
          </Link>
          {quote.status !== "CONVERTED_TO_PROJECT" && (
            <form action={handleConvertToProject}>
              <button
                type="submit"
                className="button"
                style={{ background: "#15803d" }}
              >
                ✓ Adjudicar & Converter em Obra
              </button>
            </form>
          )}
          {quote.converted_project_id && (
            <Link
              href={`/obras/${quote.converted_project_id}`}
              className="button"
            >
              Ver Obra Vinculada →
            </Link>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Entidade Adjudicante / Cliente</h3>
          <div
            style={{ lineHeight: "1.8", fontSize: "14px", color: "#374151" }}
          >
            <p>
              <strong>Nome:</strong> {clientName || quote.users?.email}
            </p>
            <p>
              <strong>NIF / NIPC:</strong>{" "}
              {clientTaxNumber
                ? formatPortugueseNif(clientTaxNumber)
                : "Não indicado"}
            </p>
            <p>
              <strong>Email:</strong> {quote.users?.email}
            </p>
            {address && (
              <p>
                <strong>Localização:</strong> {address.street},{" "}
                {address.postal_code} {address.city}
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <h3>Estado da Proposta</h3>
          <div
            style={{ lineHeight: "1.8", fontSize: "14px", color: "#374151" }}
          >
            <p>
              <strong>Estado:</strong>{" "}
              <span
                className={`badge ${quote.status === "CONVERTED_TO_PROJECT" ? "success" : "warning"}`}
              >
                {quote.status}
              </span>
            </p>
            <p>
              <strong>Condições de Pagamento:</strong>{" "}
              {quote.terms_and_conditions || "30 dias após faturação."}
            </p>
            <p>
              <strong>Notas:</strong> {quote.notes || "Sem notas adicionais."}
            </p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <h3>Discriminação dos Trabalhos ({items.length} itens)</h3>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Descrição do Trabalho / Material</th>
                <th>Tipo</th>
                <th>Qtd.</th>
                <th>Unid.</th>
                <th>Preço Unit.</th>
                <th>IVA</th>
                <th style={{ textAlign: "right" }}>Total s/ IVA</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any, idx: number) => (
                <tr key={it.id || idx}>
                  <td>{idx + 1}</td>
                  <td>
                    <strong>{it.description}</strong>
                  </td>
                  <td>
                    <span className="tag-badge">{it.item_type}</span>
                  </td>
                  <td>{it.quantity}</td>
                  <td>{it.unit}</td>
                  <td>€{Number(it.unit_price).toFixed(2)}</td>
                  <td>{it.vat_rate}%</td>
                  <td style={{ textAlign: "right" }}>
                    €{Number(it.net_amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: "24px",
          }}
        >
          <div
            style={{
              width: "320px",
              background: "#f8fafc",
              padding: "18px",
              borderRadius: "10px",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "8px",
                fontSize: "13px",
              }}
            >
              <span>Subtotal Líquido:</span>
              <strong>
                €
                {Number(quote.subtotal).toLocaleString("pt-PT", {
                  minimumFractionDigits: 2,
                })}
              </strong>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "12px",
                fontSize: "13px",
              }}
            >
              <span>Total IVA:</span>
              <strong>
                €
                {Number(quote.total_vat).toLocaleString("pt-PT", {
                  minimumFractionDigits: 2,
                })}
              </strong>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "18px",
                borderTop: "2px solid #cbd5e1",
                paddingTop: "10px",
              }}
            >
              <span>Total Final:</span>
              <strong style={{ color: "#0f172a" }}>
                €
                {Number(quote.total).toLocaleString("pt-PT", {
                  minimumFractionDigits: 2,
                })}
              </strong>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: "24px" }}>
        <div className="card">
          <h3>Decisão & Assinatura da Proposta</h3>
          {quote.status === "SENT" || quote.status === "DRAFT" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <p style={{ fontSize: "13px", color: "#475569", margin: 0 }}>
                Registe a aceitação formal do cliente com confirmação do titular ou recusa com justificação.
              </p>

              <form action={handleAccept} style={{ background: "#f0fdf4", padding: "16px", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
                <h4 style={{ margin: "0 0 10px", fontSize: "14px", color: "#166534" }}>✓ Aceitar Proposta</h4>
                <div className="form-field full" style={{ marginBottom: "10px" }}>
                  <label htmlFor="signer_name" style={{ fontSize: "12px" }}>Nome do Titular / Assinante *</label>
                  <input id="signer_name" name="signer_name" defaultValue={clientName || ""} required placeholder="Nome completo do signatário" />
                </div>
                <button type="submit" className="button" style={{ background: "#15803d", width: "100%" }}>
                  Confirmar Aceitação da Proposta
                </button>
              </form>

              <form action={handleReject} style={{ background: "#fef2f2", padding: "16px", borderRadius: "8px", border: "1px solid #fecaca" }}>
                <h4 style={{ margin: "0 0 10px", fontSize: "14px", color: "#991b1b" }}>✕ Rejeitar Proposta</h4>
                <div className="form-field full" style={{ marginBottom: "10px" }}>
                  <label htmlFor="reason" style={{ fontSize: "12px" }}>Motivo da Recusa (opcional)</label>
                  <input id="reason" name="reason" placeholder="Ex: Preço acima do orçamento previsto" />
                  <input type="hidden" name="signer_name" value={clientName || "Cliente"} />
                </div>
                <button type="submit" className="button secondary" style={{ color: "#991b1b", width: "100%" }}>
                  Registar Recusa
                </button>
              </form>
            </div>
          ) : (
            <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--border)" }}>
              <p style={{ margin: 0, fontSize: "13px" }}>
                Estado da proposta: <strong className="badge success">{quote.status}</strong>
              </p>
              {quote.notes && (
                <p style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--muted)" }}>{quote.notes}</p>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Condições Gerais de Empreitada</h3>
          <div style={{ fontSize: "13px", lineHeight: "1.7", color: "#475569" }}>
            <p><strong>1. Validade:</strong> Os preços apresentados são válidos pelo período estipulado na proposta comercial.</p>
            <p><strong>2. Autos de Medição:</strong> Os pagamentos parciais são efetuados com base no progresso real verificado em obra.</p>
            <p><strong>3. IVA:</strong> A taxa de IVA aplicada cumpre as disposições do Código do IVA para obras e remodelações.</p>
            <p><strong>4. Garantia:</strong> Os trabalhos executados gozam do período de garantia legal de 5 anos para defeitos de construção.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
