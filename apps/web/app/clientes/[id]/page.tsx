import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientById, updateClientAction } from "../actions";
import { formatPortugueseNif } from "@rpg/core";
import { loadReputationSummaryForSubject } from "@/lib/reputation/summary";
import { ReputationSummary } from "@/components/reputation/ReputationSummary";

export const dynamic = "force-dynamic";

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getClientById(id);

  if (!data || !data.profile) {
    notFound();
  }

  const { profile, projects, quotes, auditLogs } = data;
  const address = profile.addresses;
  const user = profile.users;

  const reputationReviews = await loadReputationSummaryForSubject({
    key: "customer",
    id: String(profile.user_id ?? ""),
    label: String(profile.name ?? ""),
  });

  async function handleUpdate(formData: FormData) {
    "use server";
    await updateClientAction(id, formData);
  }

  return (
    <main>
      <div className="page-header">
        <div>
          <h2>Ficha de Cliente: {profile.name}</h2>
          <p>
            Visualização e edição dos dados fiscais, morada, projetos e
            histórico.
          </p>
        </div>
        <Link href="/clientes" className="button secondary">
          ← Voltar à Lista
        </Link>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Dados Principais & Fiscais</h3>
          <form action={handleUpdate}>
            <div className="form-grid">
              <div className="form-field full">
                <label htmlFor="name">Nome Completo / Razão Social</label>
                <input
                  id="name"
                  name="name"
                  defaultValue={profile.name}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="tax_number">NIF / NIPC</label>
                <input
                  id="tax_number"
                  name="tax_number"
                  defaultValue={
                    profile.tax_number
                      ? formatPortugueseNif(profile.tax_number)
                      : ""
                  }
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="phone">Telefone</label>
                <input
                  id="phone"
                  name="phone"
                  defaultValue={profile.phone || ""}
                  required
                />
              </div>

              <div className="form-field full">
                <label htmlFor="email">Email de Acesso (Não editável)</label>
                <input
                  id="email"
                  value={user?.email || ""}
                  disabled
                  style={{ background: "#f8fafc" }}
                />
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: "16px" }}>
              <button type="submit" className="button">
                Guardar Alterações
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h3>Morada Registada</h3>
          {address ? (
            <div
              style={{ lineHeight: "1.8", fontSize: "14px", color: "#374151" }}
            >
              <p>
                <strong>Rua / Morada:</strong> {address.street} {address.number}
              </p>
              <p>
                <strong>Código Postal:</strong> {address.postal_code}
              </p>
              <p>
                <strong>Localidade:</strong> {address.city}
              </p>
              <p>
                <strong>Distrito:</strong> {address.district}
              </p>
              <p>
                <strong>País:</strong> {address.country || "Portugal"}
              </p>
            </div>
          ) : (
            <p style={{ color: "var(--muted)", fontSize: "13px" }}>
              Nenhuma morada associada.
            </p>
          )}

          <div
            style={{
              marginTop: "24px",
              borderTop: "1px solid var(--border)",
              paddingTop: "14px",
            }}
          >
            <h4 style={{ margin: "0 0 10px", fontSize: "14px" }}>
              Ações Rápidas
            </h4>
            <div style={{ display: "flex", gap: "10px" }}>
              <Link
                href={`/orcamentos?client_id=${id}`}
                className="button secondary"
                style={{ fontSize: "13px" }}
              >
                + Novo Orçamento
              </Link>
              <Link
                href={`/obras?client_id=${id}`}
                className="button secondary"
                style={{ fontSize: "13px" }}
              >
                + Nova Obra
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <h3>Obras Associadas ({projects.length})</h3>
        {projects.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "13px" }}>
            Este cliente ainda não tem obras registadas.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Título da Obra</th>
                <th>Estado</th>
                <th>Orçamento Previsto</th>
                <th>Progresso</th>
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
                  <td>{p.progress_percentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <h3>Histórico de Auditoria & Atividade</h3>
        {auditLogs.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "13px" }}>
            Sem registos recentes de auditoria.
          </p>
        ) : (
          <div className="list">
            {auditLogs.map((log: any) => (
              <div key={log.id} className="list-row">
                <div>
                  <div className="list-title">{log.action}</div>
                  <div className="list-subtitle">
                    Módulo: {log.module} •{" "}
                    {new Date(log.timestamp).toLocaleString("pt-PT")}
                  </div>
                </div>
                <span className="tag-badge">Auditado</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: "24px" }}>
        {reputationReviews === null ? (
          <div className="card">
            <div className="list-subtitle">Inicia sessão com permissões de reputação para ver o resumo.</div>
          </div>
        ) : (
          <ReputationSummary title={`Reputação de ${profile.name}`} reviews={reputationReviews} />
        )}
      </div>
    </main>
  );
}
