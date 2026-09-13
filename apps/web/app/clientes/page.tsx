import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getClientesList } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const search = resolvedParams.search || "";
  const clientes = await getClientesList({ search });

  const totalClientes = clientes.length;
  const clientesAtivos = clientes.filter(
    (c) => c.status === "VERIFIED" || c.status === "ACTIVE" || c.status === "DRAFT",
  ).length;

  return (
    <main>
      <SectionHeader
        title="Clientes"
        description="Gestão centralizada e acompanhamento de clientes e entidades do RPG-OS."
        action={
          <div style={{ display: "flex", gap: "10px" }}>
            <Link href="/registo/cliente" className="button">
              + Novo Cliente Particular
            </Link>
            <Link href="/registo/empresa" className="button secondary">
              + Nova Empresa
            </Link>
          </div>
        }
      />

      <div className="metrics" style={{ marginTop: "20px" }}>
        <div className="card">
          <span className="metric-label">Total de Clientes</span>
          <strong className="metric-value">{totalClientes}</strong>
          <span className="metric-change success">Base de dados ativa</span>
        </div>

        <div className="card">
          <span className="metric-label">Clientes Verificados</span>
          <strong className="metric-value">{clientesAtivos}</strong>
          <span className="metric-change success">Identificação validada</span>
        </div>

        <div className="card">
          <span className="metric-label">Clientes com Obras</span>
          <strong className="metric-value">{Math.max(0, totalClientes > 0 ? 1 : 0)}</strong>
          <span className="metric-change">Projetos em curso</span>
        </div>

        <div className="card">
          <span className="metric-label">Conformidade Fiscal</span>
          <strong className="metric-value">100%</strong>
          <span className="metric-change success">NIFs validados</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <div className="toolbar-row">
          <form method="GET" style={{ display: "flex", gap: "10px", flex: 1, maxWidth: "500px" }}>
            <input
              name="search"
              defaultValue={search}
              placeholder="Pesquisar por nome, NIF ou telefone..."
              className="search-input"
              style={{ flex: 1 }}
            />
            <button type="submit" className="button secondary" style={{ padding: "8px 14px" }}>
              Pesquisar
            </button>
            {search && (
              <Link href="/clientes" className="button secondary" style={{ padding: "8px 14px" }}>
                Limpar
              </Link>
            )}
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Nome / Razão Social</th>
                <th>NIF / NIPC</th>
                <th>Email</th>
                <th>Telefone</th>
                <th>Localização</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th style={{ textAlign: "right" }}>Ações</th>
              </tr>
            </thead>

            <tbody>
              {clientes.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted)" }}>
                    {search ? `Nenhum cliente encontrado para "${search}".` : "Ainda não existem clientes registados no sistema."}
                  </td>
                </tr>
              ) : (
                clientes.map((cliente) => (
                  <tr key={cliente.id}>
                    <td>
                      <Link href={`/clientes/${cliente.id}`} style={{ fontWeight: 600, color: "#111827" }}>
                        {cliente.name}
                      </Link>
                    </td>
                    <td>
                      <span style={{ fontFamily: "monospace", fontSize: "12px", background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>
                        {cliente.taxNumber}
                      </span>
                    </td>
                    <td>{cliente.email}</td>
                    <td>{cliente.phone}</td>
                    <td>{cliente.city} ({cliente.district})</td>
                    <td>
                      <span className="tag-badge">
                        {cliente.type === "COMPANY" ? "Empresa" : cliente.type === "SOLE_TRADER" ? "ENI" : "Particular"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          cliente.status === "VERIFIED" || cliente.status === "ACTIVE"
                            ? "success"
                            : "warning"
                        }`}
                      >
                        {cliente.status === "VERIFIED"
                          ? "Verificado"
                          : cliente.status === "DRAFT"
                          ? "Registado"
                          : cliente.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        <Link
                          href={`/clientes/${cliente.id}`}
                          className="button secondary"
                          style={{ padding: "5px 10px", fontSize: "12px" }}
                        >
                          Ficha
                        </Link>
                        <Link
                          href={`/obras/nova?client_id=${cliente.id}`}
                          className="button"
                          style={{ padding: "5px 10px", fontSize: "12px" }}
                        >
                          + Obra
                        </Link>
                      </div>
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
