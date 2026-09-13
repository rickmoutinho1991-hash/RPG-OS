import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getQuotesList } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrcamentosPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string; status?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const search = resolvedParams.search || "";
  const statusFilter = resolvedParams.status;
  const quotes = await getQuotesList({ search, status: statusFilter });

  const totalPropostas = quotes.length;
  const totalValor = quotes.reduce((acc, q) => acc + (q.total || 0), 0);
  const aceites = quotes.filter((q) => q.status === "ACCEPTED" || q.status === "CONVERTED_TO_PROJECT").length;

  return (
    <main>
      <SectionHeader
        title="Orçamentos & Propostas"
        description="Elaboração detalhada de propostas comerciais com cálculo de IVA e conversão direta em obras."
        action={
          <Link href="/orcamentos/novo" className="button">
            + Novo Orçamento
          </Link>
        }
      />

      <div className="metrics" style={{ marginTop: "20px" }}>
        <div className="card">
          <span className="metric-label">Total de Orçamentos</span>
          <strong className="metric-value">{totalPropostas}</strong>
          <span className="metric-change">Propostas emitidas</span>
        </div>

        <div className="card">
          <span className="metric-label">Valor Total Proposto</span>
          <strong className="metric-value">€{totalValor.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</strong>
          <span className="metric-change success">Volume orçamentado</span>
        </div>

        <div className="card">
          <span className="metric-label">Propostas Adjudicadas</span>
          <strong className="metric-value">{aceites}</strong>
          <span className="metric-change success">Convertidas / Aprovadas</span>
        </div>

        <div className="card">
          <span className="metric-label">Taxa de Conversão</span>
          <strong className="metric-value">{totalPropostas > 0 ? `${Math.round((aceites / totalPropostas) * 100)}%` : "100%"}</strong>
          <span className="metric-change success">Rácio de fecho</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <div className="toolbar-row">
          <form method="GET" style={{ display: "flex", gap: "10px", flex: 1, maxWidth: "500px" }}>
            <input
              name="search"
              defaultValue={search}
              placeholder="Pesquisar por número ou título do orçamento..."
              className="search-input"
              style={{ flex: 1 }}
            />
            <button type="submit" className="button secondary" style={{ padding: "8px 14px" }}>
              Pesquisar
            </button>
            {search && (
              <Link href="/orcamentos" className="button secondary" style={{ padding: "8px 14px" }}>
                Limpar
              </Link>
            )}
          </form>

          <div style={{ display: "flex", gap: "8px" }}>
            <Link href="/orcamentos" className={`button secondary ${!statusFilter ? "active" : ""}`} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Todos
            </Link>
            <Link href="/orcamentos?status=SENT" className={`button secondary ${statusFilter === "SENT" ? "active" : ""}`} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Enviados
            </Link>
            <Link href="/orcamentos?status=CONVERTED_TO_PROJECT" className={`button secondary ${statusFilter === "CONVERTED_TO_PROJECT" ? "active" : ""}`} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Em Obra
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Referência</th>
                <th>Designação da Proposta</th>
                <th>Cliente</th>
                <th>Data Emissão</th>
                <th>Validade</th>
                <th>Subtotal (s/ IVA)</th>
                <th>Total (c/ IVA)</th>
                <th>Estado</th>
                <th style={{ textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {quotes.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted)" }}>
                    {search ? `Nenhum orçamento encontrado para "${search}".` : "Ainda não existem orçamentos criados."}
                  </td>
                </tr>
              ) : (
                quotes.map((q) => (
                  <tr key={q.id}>
                    <td><strong>{q.quoteNumber}</strong></td>
                    <td>
                      <Link href={`/orcamentos/${q.id}`} style={{ fontWeight: 600, color: "#111827" }}>
                        {q.title}
                      </Link>
                    </td>
                    <td>{q.clientName}</td>
                    <td>{new Date(q.issueDate).toLocaleDateString("pt-PT")}</td>
                    <td>{new Date(q.validUntil).toLocaleDateString("pt-PT")}</td>
                    <td>€{q.subtotal.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
                    <td><strong>€{q.total.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</strong></td>
                    <td>
                      <span className={`badge ${q.status === "CONVERTED_TO_PROJECT" || q.status === "ACCEPTED" ? "success" : "warning"}`}>
                        {q.status === "CONVERTED_TO_PROJECT" ? "Convertido em Obra" : q.status === "SENT" ? "Enviado" : q.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/orcamentos/${q.id}`} className="button secondary" style={{ padding: "5px 10px", fontSize: "12px" }}>
                        Ver Proposta
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
