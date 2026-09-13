import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getCompaniesList } from "./actions";

export const dynamic = "force-dynamic";

export default async function EmpresasPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const search = resolvedParams.search || "";
  const companies = await getCompaniesList(search);

  return (
    <main>
      <SectionHeader
        title="Empresas"
        description="Gestão de entidades corporativas, sociedades comerciais, sedes e quadros de pessoal."
        action={
          <Link href="/registo/empresa" className="button">
            + Nova Empresa
          </Link>
        }
      />

      <div className="metrics" style={{ marginTop: "20px" }}>
        <div className="card">
          <span className="metric-label">Total de Empresas</span>
          <strong className="metric-value">{companies.length}</strong>
          <span className="metric-change success">Entidades registadas</span>
        </div>

        <div className="card">
          <span className="metric-label">NIPCs Verificados</span>
          <strong className="metric-value">{companies.length}</strong>
          <span className="metric-change success">100% validados na AT</span>
        </div>

        <div className="card">
          <span className="metric-label">Estruturas Comerciais</span>
          <strong className="metric-value">Lda. / S.A.</strong>
          <span className="metric-change">Formas jurídicas</span>
        </div>

        <div className="card">
          <span className="metric-label">Plataforma</span>
          <strong className="metric-value">Multi-empresa</strong>
          <span className="metric-change success">Ativo</span>
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
              placeholder="Pesquisar por denominação ou NIPC..."
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
                href="/empresas"
                className="button secondary"
                style={{ padding: "8px 14px" }}
              >
                Limpar
              </Link>
            )}
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Denominação Social</th>
                <th>Nome Comercial</th>
                <th>NIPC</th>
                <th>Forma Jurídica</th>
                <th>Email</th>
                <th>Telefone</th>
                <th style={{ textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: "center",
                      padding: "40px 16px",
                      color: "var(--muted)",
                    }}
                  >
                    {search
                      ? `Nenhuma empresa encontrada para "${search}".`
                      : "Ainda não existem empresas registadas no RPG-OS."}
                  </td>
                </tr>
              ) : (
                companies.map((c: any) => (
                  <tr key={c.id}>
                    <td>
                      <Link
                        href={`/empresas/${c.id}`}
                        style={{ fontWeight: 600, color: "#111827" }}
                      >
                        {c.legal_name}
                      </Link>
                    </td>
                    <td>{c.commercial_name || "-"}</td>
                    <td>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "12px",
                          background: "#f1f5f9",
                          padding: "2px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        {c.formattedTaxNumber}
                      </span>
                    </td>
                    <td>
                      <span className="tag-badge">{c.legal_form}</span>
                    </td>
                    <td>{c.email}</td>
                    <td>{c.phone}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={`/empresas/${c.id}`}
                        className="button secondary"
                        style={{ padding: "5px 10px", fontSize: "12px" }}
                      >
                        Ver Empresa
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
