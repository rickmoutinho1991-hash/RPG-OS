import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getInvoiceById,
  registerPaymentAction,
  generateMbReferenceAction,
} from "../actions";
import {
  assignInvoiceRouting,
  getInvoiceRouting,
  listRoutableOrganizations,
  revokeInvoiceRouting,
} from "./actions";
import {
  getATSubmissionForInvoice,
  prepareATSubmissionAction,
} from "../submissionActions";
import { formatPortugueseNif } from "@rpg/core";

export const dynamic = "force-dynamic";

export default async function FaturaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getInvoiceById(id);

  if (!data || !data.invoice) {
    notFound();
  }

  const { invoice, items, payments } = data;
  const client = invoice.users?.profiles;
  const clientName = Array.isArray(client) ? client[0]?.name : client?.name;
  const clientTaxNumber = Array.isArray(client)
    ? client[0]?.tax_number
    : client?.tax_number;

  async function handleRegisterPayment(formData: FormData) {
    "use server";
    const amount = parseFloat(String(formData.get("amount") ?? "0"));
    const method = String(formData.get("method") ?? "BANK_TRANSFER") as any;
    await registerPaymentAction(id, amount, method);
  }

  async function handleAssignRouting(formData: FormData) {
    "use server";
    if (String(formData.get("confirm") ?? "") !== "on") return;
    await assignInvoiceRouting(id, String(formData.get("organization_id") ?? ""));
  }

  async function handleRevokeRouting() {
    "use server";
    await revokeInvoiceRouting(id);
  }

  async function handlePrepareSubmission() {
    "use server";
    await prepareATSubmissionAction(id);
  }

  const [routing, routableOrgs] = await Promise.all([
    getInvoiceRouting(id),
    listRoutableOrganizations(id),
  ]);
  const submission = await getATSubmissionForInvoice(id);

  // Hardening: sem integração SIBS, a ação lança erro explícito em vez de
  // devolver uma referência fabricada. A página mostra aviso honesto.
  let mbRef: {
    entity: string;
    reference: string;
    amount: number;
    expiresAt: string;
  } | null = null;
  try {
    mbRef = await generateMbReferenceAction(
      Number(invoice.balance_due || invoice.total),
      id,
    );
  } catch {
    mbRef = null;
  }

  return (
    <main>
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="tag-badge">{invoice.invoice_number}</span>
            <h2 style={{ margin: 0 }}>Documento de Faturação</h2>
          </div>
          <p style={{ marginTop: "6px" }}>
            ATCUD:{" "}
            <strong style={{ fontFamily: "monospace" }}>{invoice.atcud}</strong>{" "}
            • Emitido em:{" "}
            {new Date(invoice.issue_date).toLocaleDateString("pt-PT")}
          </p>
        </div>

        <Link href="/faturacao" className="button secondary">
          ← Voltar à Lista
        </Link>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Dados do Adquirente</h3>
          <div
            style={{ lineHeight: "1.8", fontSize: "14px", color: "#374151" }}
          >
            <p>
              <strong>Nome:</strong> {clientName || invoice.users?.email}
            </p>
            <p>
              <strong>NIF:</strong>{" "}
              {clientTaxNumber
                ? formatPortugueseNif(clientTaxNumber)
                : "Consumidor Final"}
            </p>
            <p>
              <strong>Email:</strong> {invoice.users?.email}
            </p>
          </div>
        </div>

        <div className="card">
          <h3>Resumo da Conta Corrente</h3>
          <div
            style={{ lineHeight: "1.8", fontSize: "14px", color: "#374151" }}
          >
            <p>
              <strong>Total Faturado:</strong> €
              {Number(invoice.total).toLocaleString("pt-PT", {
                minimumFractionDigits: 2,
              })}
            </p>
            <p>
              <strong>Total Liquidado:</strong> €
              {Number(invoice.amount_paid || 0).toLocaleString("pt-PT", {
                minimumFractionDigits: 2,
              })}
            </p>
            <p>
              <strong>Saldo em Dívida:</strong>{" "}
              <span
                style={{
                  color:
                    Number(invoice.balance_due || 0) > 0
                      ? "#b45309"
                      : "#15803d",
                  fontWeight: 700,
                }}
              >
                €
                {Number(invoice.balance_due || 0).toLocaleString("pt-PT", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </p>
            <p>
              <strong>Estado:</strong>{" "}
              <span className="badge success">{invoice.status}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <h3>Itens Faturados ({items.length})</h3>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Qtd.</th>
                <th>Unid.</th>
                <th>Preço Unit.</th>
                <th>IVA</th>
                <th style={{ textAlign: "right" }}>Total Líquido</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any) => (
                <tr key={it.id}>
                  <td>
                    <strong>{it.description}</strong>
                  </td>
                  <td>{it.quantity}</td>
                  <td>{it.unit}</td>
                  <td>€{Number(it.unit_price).toFixed(2)}</td>
                  <td>{it.vat_rate}%</td>
                  <td style={{ textAlign: "right" }}>
                    €{Number(it.total_amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: "24px" }}>
        <div className="card">
          <h3>Pagamento por Multibanco / MB WAY (SIBS)</h3>
          {mbRef ? (
          <div
            style={{
              background: "#f8fafc",
              padding: "16px",
              borderRadius: "8px",
              border: "1px dashed var(--border)",
            }}
          >
            <p style={{ margin: "0 0 8px", fontSize: "13px" }}>
              <strong>Entidade:</strong> {mbRef.entity}
            </p>
            <p style={{ margin: "0 0 8px", fontSize: "13px" }}>
              <strong>Referência:</strong>{" "}
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: "14px",
                  fontWeight: 700,
                }}
              >
                {mbRef.reference}
              </span>
            </p>
            <p style={{ margin: "0 0 8px", fontSize: "13px" }}>
              <strong>Montante:</strong> €
              {Number(invoice.balance_due || invoice.total).toFixed(2)}
            </p>
            <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)" }}>
              Válido até:{" "}
              {new Date(mbRef.expiresAt).toLocaleDateString("pt-PT")}
            </p>
          </div>
          ) : (
          <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
            Pagamento Multibanco / MB WAY ainda não disponível: sem integração
            oficial SIBS, nenhuma referência é gerada e nenhum pagamento foi
            iniciado. Use a liquidação manual ao lado.
          </p>
          )}
        </div>

        <div className="card">
          <h3>Registar Liquidação Manual</h3>
          <form action={handleRegisterPayment}>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="amount">Valor Pago (€)</label>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  defaultValue={invoice.balance_due || invoice.total}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="method">Método de Pagamento</label>
                <select id="method" name="method" defaultValue="BANK_TRANSFER">
                  <option value="BANK_TRANSFER">Transferência Bancária</option>
                  <option value="MULTIBANCO">Multibanco</option>
                  <option value="MBWAY">MB WAY</option>
                  <option value="CASH">Numerário</option>
                  <option value="CREDIT_CARD">Cartão de Crédito</option>
                </select>
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: "14px" }}>
              <button
                type="submit"
                className="button"
                style={{ background: "#15803d" }}
              >
                ✓ Registar Pagamento & Emitir Recibo
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <h3>Destino fiscal (Routing)</h3>
        <p style={{ fontSize: "13px", color: "var(--muted)" }}>
          Destino atual:{" "}
          <strong>{routing ? (routing.organization_name ?? routing.organization_id) : "Não atribuído"}</strong>
        </p>
        {!routing && routableOrgs.length > 0 && (
          <form action={handleAssignRouting}>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="organization_id">Organização destino</label>
                <select id="organization_id" name="organization_id" required>
                  {routableOrgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>
                  <input type="checkbox" name="confirm" required /> Confirmo a
                  atribuição deste destino fiscal
                </label>
              </div>
            </div>
            <div className="form-actions" style={{ marginTop: "14px" }}>
              <button type="submit" className="button">
                Atribuir destino fiscal
              </button>
            </div>
          </form>
        )}
        {routing && (
          <form action={handleRevokeRouting}>
            <div className="form-actions" style={{ marginTop: "14px" }}>
              <button type="submit" className="button secondary">
                Revogar routing
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <h3>Submissão AT (e-Fatura)</h3>
        <p style={{ fontSize: "13px", color: "var(--muted)" }}>
          Estado:{" "}
          <strong>{submission ? submission.status : "Não preparada"}</strong>
          {" • "}Integração AT em preparação — nenhuma submissão real é
          executada nesta fase.
        </p>
        {!submission && (
          <form action={handlePrepareSubmission}>
            <div className="form-actions" style={{ marginTop: "14px" }}>
              <button type="submit" className="button secondary">
                Preparar submissão (validação local)
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
