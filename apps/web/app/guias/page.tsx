import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getTransportDocumentsList } from "./actions";

export const dynamic = "force-dynamic";

export default async function GuiasTransportePage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string; type?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const search = resolvedParams.search || "";
  const typeFilter = resolvedParams.type;
  const guias = await getTransportDocumentsList({ search, type: typeFilter });

  return (
    <main>
      <SectionHeader
        title="Guias de Transporte & Bens em Circulação"
        description="Emissão de Guias de Transporte (GT), Remessa (GR) e comunicação prévia obrigatória à Autoridade Tributária."
        action={
          <Link href="/guias/nova" className="button">
            + Nova Guia de Transporte
          </Link>
        }
      />

      <div className="metrics" style={{ marginTop: "20px" }}>
        <div className="card">
          <span className="metric-label">Total de Guias Emitidas</span>
          <strong className="metric-value">{guias.length}</strong>
          <span className="metric-change success">Comunicação AT ativa</span>
        </div>

        <div className="card">
          <span className="metric-label">Regime Legal</span>
          <strong className="metric-value">Dec.-Lei 147/2003</strong>
          <span className="metric-change success">Conforme</span>
        </div>

        <div className="card">
          <span className="metric-label">Código de Comunicação AT</span>
          <strong className="metric-value">Automático</strong>
          <span className="metric-change success">Webservice AT</span>
        </div>

        <div className="card">
          <span className="metric-label">Validação de Matrícula</span>
          <strong className="metric-value">Ativa</strong>
          <span className="metric-change">Frotas & Viaturas</span>
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
              placeholder="Pesquisar por número, destinatário ou matrícula..."
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
                href="/guias"
                className="button secondary"
                style={{ padding: "8px 14px" }}
              >
                Limpar
              </Link>
            )}
          </form>

          <div style={{ display: "flex", gap: "8px" }}>
            <Link
              href="/guias"
              className={`button secondary ${!typeFilter ? "active" : ""}`}
              style={{ fontSize: "12px", padding: "6px 12px" }}
            >
              Todas
            </Link>
            <Link
              href="/guias?type=GT"
              className={`button secondary ${typeFilter === "GT" ? "active" : ""}`}
              style={{ fontSize: "12px", padding: "6px 12px" }}
            >
              GT (Transporte)
            </Link>
            <Link
              href="/guias?type=GR"
              className={`button secondary ${typeFilter === "GR" ? "active" : ""}`}
              style={{ fontSize: "12px", padding: "6px 12px" }}
            >
              GR (Remessa)
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Código AT</th>
                <th>Destinatário</th>
                <th>Matrícula Viatura</th>
                <th>Local de Carga</th>
                <th>Local de Descarga</th>
                <th>Data / Hora Carga</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {guias.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      textAlign: "center",
                      padding: "40px 16px",
                      color: "var(--muted)",
                    }}
                  >
                    {search
                      ? `Nenhuma guia encontrada para "${search}".`
                      : "Ainda não existem guias de transporte emitidas."}
                  </td>
                </tr>
              ) : (
                guias.map((g: any) => (
                  <tr key={g.id}>
                    <td>
                      <strong>{g.document_number}</strong>
                    </td>
                    <td>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "11px",
                          background: "#f0fdf4",
                          color: "#166534",
                          padding: "3px 6px",
                          borderRadius: "4px",
                          border: "1px solid #bbf7d0",
                        }}
                      >
                        {g.at_doc_code}
                      </span>
                    </td>
                    <td>
                      <div>{g.client_name}</div>
                      <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                        NIF: {g.formattedClientTaxNumber}
                      </div>
                    </td>
                    <td>
                      <span className="tag-badge">{g.vehicle_plate}</span>
                    </td>
                    <td>{g.load_city}</td>
                    <td>{g.unload_city}</td>
                    <td>
                      {new Date(g.load_date_time).toLocaleString("pt-PT")}
                    </td>
                    <td>
                      <span className="badge success">{g.status}</span>
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
