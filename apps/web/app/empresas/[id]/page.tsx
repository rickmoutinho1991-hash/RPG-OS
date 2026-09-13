import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanyById, addCompanyEmployee } from "../actions";
import { loadReputationSummaryForSubject } from "@/lib/reputation/summary";
import { ReputationSummary } from "@/components/reputation/ReputationSummary";

export const dynamic = "force-dynamic";

export default async function EmpresaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getCompanyById(id);

  if (!data || !data.company) {
    notFound();
  }

  const { company, employees, projects } = data;

  const reputationReviews = await loadReputationSummaryForSubject({
    key: "company",
    id: String(company.id),
    label: String(company.commercial_name || company.legal_name || ""),
  });

  async function handleAddEmployee(formData: FormData) {
    "use server";
    await addCompanyEmployee(id, formData);
  }

  return (
    <main>
      <div className="page-header">
        <div>
          <h2>{company.legal_name}</h2>
          <p>
            Ficha de identificação corporativa, representantes legais e quadro
            de colaboradores.
          </p>
        </div>
        <Link href="/empresas" className="button secondary">
          ← Voltar às Empresas
        </Link>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Dados Legais & Comerciais</h3>
          <div
            style={{ lineHeight: "1.8", fontSize: "14px", color: "#374151" }}
          >
            <p>
              <strong>Firma:</strong> {company.legal_name}
            </p>
            <p>
              <strong>Nome Comercial:</strong>{" "}
              {company.commercial_name || "Não especificado"}
            </p>
            <p>
              <strong>NIPC / NIF Coletivo:</strong>{" "}
              <span style={{ fontFamily: "monospace" }}>
                {company.formattedTaxNumber}
              </span>
            </p>
            <p>
              <strong>Forma Jurídica:</strong> {company.legal_form}
            </p>
            <p>
              <strong>Email:</strong> {company.email}
            </p>
            <p>
              <strong>Telefone:</strong> {company.phone}
            </p>
            {company.website && (
              <p>
                <strong>Website:</strong>{" "}
                <a
                  href={company.website}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#2563eb", textDecoration: "underline" }}
                >
                  {company.website}
                </a>
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <h3>Adicionar Colaborador à Empresa</h3>
          <form action={handleAddEmployee}>
            <div className="form-grid">
              <div className="form-field full">
                <label htmlFor="name">Nome do Colaborador *</label>
                <input
                  id="name"
                  name="name"
                  required
                  placeholder="Ex: Engenheiro Rui Santos"
                />
              </div>

              <div className="form-field">
                <label htmlFor="email">Email *</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="rui.santos@empresa.pt"
                />
              </div>

              <div className="form-field">
                <label htmlFor="job_title">Função / Cargo *</label>
                <input
                  id="job_title"
                  name="job_title"
                  required
                  placeholder="Ex: Diretor Técnico"
                />
              </div>

              <div className="form-field full">
                <label htmlFor="department">Departamento</label>
                <input
                  id="department"
                  name="department"
                  defaultValue="Engenharia e Obras"
                />
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: "16px" }}>
              <button type="submit" className="button">
                + Associar Colaborador
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <h3>Quadro de Colaboradores & Equipa ({employees.length})</h3>
        {employees.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "13px" }}>
            Ainda não foram associados colaboradores a esta empresa.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Cargo / Função</th>
                <th>Departamento</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp: any) => {
                const profile = emp.users?.profiles;
                const name = Array.isArray(profile)
                  ? profile[0]?.name
                  : profile?.name;
                return (
                  <tr key={emp.id}>
                    <td>
                      <strong>{name || emp.users?.email}</strong>
                    </td>
                    <td>{emp.users?.email}</td>
                    <td>
                      <span className="tag-badge">{emp.job_title}</span>
                    </td>
                    <td>{emp.department}</td>
                    <td>
                      <span className="badge success">{emp.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <h3>Obras e Empreitadas em Execução ({projects.length})</h3>
        {projects.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "13px" }}>
            Nenhuma obra registada para esta empresa.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Título</th>
                <th>Estado</th>
                <th>Orçamento</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p: any) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.code}</strong>
                  </td>
                  <td>{p.title}</td>
                  <td>
                    <span className="badge">{p.status}</span>
                  </td>
                  <td>
                    €
                    {Number(p.budget_estimated).toLocaleString("pt-PT", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: "24px" }}>
        {reputationReviews === null ? (
          <div className="card">
            <div className="list-subtitle">Inicia sessão com permissões de reputação para ver o resumo.</div>
          </div>
        ) : (
          <ReputationSummary title={`Reputação de ${company.commercial_name || company.legal_name}`} reviews={reputationReviews} />
        )}
      </div>
    </main>
  );
}
