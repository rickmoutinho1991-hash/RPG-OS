import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getProjectsList } from "./actions";

export const dynamic = "force-dynamic";

export default async function ObrasPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string; status?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const search = resolvedParams.search || "";
  const statusFilter = resolvedParams.status;
  const projects = await getProjectsList({ search, status: statusFilter });

  const activeProjects = projects.filter((p) => p.status === "IN_PROGRESS").length;
  const totalBudget = projects.reduce((acc, p) => acc + (p.budgetEstimated || 0), 0);

  return (
    <main>
      <SectionHeader
        title="Obras & Projetos"
        description="Acompanhamento operacional, medições, tarefas, equipas e prazos de execução."
        action={
          <Link href="/obras/nova" className="button">
            + Nova Obra
          </Link>
        }
      />

      <div className="metrics" style={{ marginTop: "20px" }}>
        <div className="card">
          <span className="metric-label">Total de Obras</span>
          <strong className="metric-value">{projects.length}</strong>
          <span className="metric-change">Projetos registados</span>
        </div>

        <div className="card">
          <span className="metric-label">Obras em Execução</span>
          <strong className="metric-value">{activeProjects}</strong>
          <span className="metric-change success">No terreno</span>
        </div>

        <div className="card">
          <span className="metric-label">Orçamento Global Estimado</span>
          <strong className="metric-value">€{totalBudget.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</strong>
          <span className="metric-change success">Volume de negócios</span>
        </div>

        <div className="card">
          <span className="metric-label">Conformidade e Prazos</span>
          <strong className="metric-value">100%</strong>
          <span className="metric-change success">Em dia</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <div className="toolbar-row">
          <form method="GET" style={{ display: "flex", gap: "10px", flex: 1, maxWidth: "500px" }}>
            <input
              name="search"
              defaultValue={search}
              placeholder="Pesquisar por código ou título da obra..."
              className="search-input"
              style={{ flex: 1 }}
            />
            <button type="submit" className="button secondary" style={{ padding: "8px 14px" }}>
              Pesquisar
            </button>
            {search && (
              <Link href="/obras" className="button secondary" style={{ padding: "8px 14px" }}>
                Limpar
              </Link>
            )}
          </form>

          <div style={{ display: "flex", gap: "8px" }}>
            <Link href="/obras" className={`button secondary ${!statusFilter ? "active" : ""}`} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Todas
            </Link>
            <Link href="/obras?status=IN_PROGRESS" className={`button secondary ${statusFilter === "IN_PROGRESS" ? "active" : ""}`} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Em Curso
            </Link>
            <Link href="/obras?status=PLANNED" className={`button secondary ${statusFilter === "PLANNED" ? "active" : ""}`} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Planeadas
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Obra / Empreitada</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Progresso</th>
                <th>Orçamento Previsto</th>
                <th>Prazo Previsto</th>
                <th style={{ textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted)" }}>
                    {search ? `Nenhuma obra encontrada para "${search}".` : "Ainda não existem obras registadas."}
                  </td>
                </tr>
              ) : (
                projects.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.code}</strong></td>
                    <td>
                      <Link href={`/obras/${p.id}`} style={{ fontWeight: 600, color: "#111827" }}>
                        {p.title}
                      </Link>
                    </td>
                    <td>{p.clientName}</td>
                    <td>
                      <span className={`badge ${p.status === "COMPLETED" ? "success" : p.status === "IN_PROGRESS" ? "warning" : ""}`}>
                        {p.status === "IN_PROGRESS" ? "Em Execução" : p.status === "PLANNED" ? "Planeada" : p.status === "COMPLETED" ? "Concluída" : p.status}
                      </span>
                    </td>
                    <td style={{ minWidth: "120px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div className="progress-bar-bg" style={{ flex: 1 }}>
                          <div className="progress-bar-fill" style={{ width: `${p.progressPercentage}%` }} />
                        </div>
                        <span style={{ fontSize: "11px", fontWeight: 700 }}>{p.progressPercentage}%</span>
                      </div>
                    </td>
                    <td>€{p.budgetEstimated.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td>
                    <td>{p.expectedEndDate ? new Date(p.expectedEndDate).toLocaleDateString("pt-PT") : "Não definido"}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/obras/${p.id}`} className="button secondary" style={{ padding: "5px 10px", fontSize: "12px" }}>
                        Acompanhar
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
