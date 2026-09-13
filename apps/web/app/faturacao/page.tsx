import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getInvoicesList, exportSaftXmlAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function FaturacaoPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string; status?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const search = resolvedParams.search || "";
  const statusFilter = resolvedParams.status;
  const invoices = await getInvoicesList({ search, status: statusFilter });

  const totalEmitido = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalRecebido = invoices.reduce(
    (sum, inv) => sum + (inv.amountPaid || 0),
    0,
  );
  const saldoPendente = invoices.reduce(
    (sum, inv) => sum + (inv.balanceDue || 0),
    0,
  );
  const totalIva = invoices.reduce((sum, inv) => sum + (inv.taxAmount || 0), 0);

  return (
    <main>
      <SectionHeader
        title="Faturação & Gestão Financeira"
        description="Emissão de faturas certificadas, recibos, conciliação e ficheiro SAF-T PT para a Autoridade Tributária."
        action={
          <div style={{ display: "flex", gap: "10px" }}>
            <Link href="/faturacao/ganhos" className="button secondary">
              💰 Ganhos via RPG-OS
            </Link>
            <Link href="/faturacao/relatorios" className="button secondary">
              📊 Mapa de IVA & SAF-T
            </Link>
            <Link href="/faturacao/nova" className="button">
              + Emitir Fatura (FT / FS)
            </Link>
          </div>
        }
      />

      <div className="metrics" style={{ marginTop: "20px" }}>
        <div className="card">
          <span className="metric-label">Faturação Total Emitida</span>
          <strong className="metric-value">
            €
            {totalEmitido.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
          </strong>
          <span className="metric-change success">
            {invoices.length} documentos emitidos
          </span>
        </div>

        <div className="card">
          <span className="metric-label">Total Cobrado / Recebido</span>
          <strong className="metric-value">
            €
            {totalRecebido.toLocaleString("pt-PT", {
              minimumFractionDigits: 2,
            })}
          </strong>
          <span className="metric-change success">Liquidez confirmada</span>
        </div>

        <div className="card">
          <span className="metric-label">Saldo Pendente de Cobrança</span>
          <strong className="metric-value">
            €
            {saldoPendente.toLocaleString("pt-PT", {
              minimumFractionDigits: 2,
            })}
          </strong>
          <span className="metric-change warning">Contas correntes</span>
        </div>

        <div className="card">
          <span className="metric-label">IVA Liquidado (a entregar à AT)</span>
          <strong className="metric-value">
            €{totalIva.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
          </strong>
          <span className="metric-change">Declaração periódica</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <div className="toolbar-row">
          <form
            method="GET"
            style={{ display: "flex", gap: "10px", flex: 1, maxWidth: "500px" }}
          >
            <input
              name="search"
              defaultValue={search}
              placeholder="Pesquisar por número de fatura..."
              className="search-input"
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              className="button secondary"
              style={{ padding: "8px 14px" }}
            >
              Pesquisar
            </button>
            {search && (
              <Link
                href="/faturacao"
                className="button secondary"
                style={{ padding: "8px 14px" }}
              >
                Limpar
              </Link>
            )}
          </form>

          <div style={{ display: "flex", gap: "8px" }}>
            <Link
              href="/faturacao"
              className={`button secondary ${!statusFilter ? "active" : ""}`}
              style={{ fontSize: "12px", padding: "6px 12px" }}
            >
              Todas
            </Link>
            <Link
              href="/faturacao?status=ISSUED"
              className={`button secondary ${statusFilter === "ISSUED" ? "active" : ""}`}
              style={{ fontSize: "12px", padding: "6px 12px" }}
            >
              Por Cobrar
            </Link>
            <Link
              href="/faturacao?status=PAID"
              className={`button secondary ${statusFilter === "PAID" ? "active" : ""}`}
              style={{ fontSize: "12px", padding: "6px 12px" }}
            >
              Pagas
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Documento</th>
                <th>ATCUD</th>
                <th>Cliente</th>
                <th>NIF</th>
                <th>Data Emissão</th>
                <th>Vencimento</th>
                <th>Total c/ IVA</th>
                <th>Saldo Pendente</th>
                <th>Estado</th>
                <th style={{ textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    style={{
                      textAlign: "center",
                      padding: "40px 16px",
                      color: "var(--muted)",
                    }}
                  >
                    {search
                      ? `Nenhuma fatura encontrada para "${search}".`
                      : "Ainda não existem faturas emitidas."}
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <Link
                        href={`/faturacao/${inv.id}`}
                        style={{ fontWeight: 600, color: "#111827" }}
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "11px",
                          color: "var(--muted)",
                        }}
                      >
                        {inv.atcud}
                      </span>
                    </td>
                    <td>{inv.clientName}</td>
                    <td>{inv.clientTaxNumber}</td>
                    <td>
                      {new Date(inv.issueDate).toLocaleDateString("pt-PT")}
                    </td>
                    <td>{new Date(inv.dueDate).toLocaleDateString("pt-PT")}</td>
                    <td>
                      <strong>
                        €
                        {inv.total.toLocaleString("pt-PT", {
                          minimumFractionDigits: 2,
                        })}
                      </strong>
                    </td>
                    <td
                      style={{
                        color: inv.balanceDue > 0 ? "#b45309" : "#15803d",
                        fontWeight: 600,
                      }}
                    >
                      €
                      {inv.balanceDue.toLocaleString("pt-PT", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td>
                      <span
                        className={`badge ${inv.status === "PAID" ? "success" : inv.status === "PARTIALLY_PAID" ? "warning" : ""}`}
                      >
                        {inv.status === "PAID"
                          ? "Liquidada"
                          : inv.status === "PARTIALLY_PAID"
                            ? "Parcial"
                            : "Emitida"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={`/faturacao/${inv.id}`}
                        className="button secondary"
                        style={{ padding: "5px 10px", fontSize: "12px" }}
                      >
                        Ver Documento
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
