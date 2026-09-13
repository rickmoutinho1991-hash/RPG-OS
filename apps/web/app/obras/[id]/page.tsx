import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProjectById,
  addTaskAction,
  updateProjectProgressAction,
  addProjectPhotoAction,
  addProjectMaterialAction,
} from "../actions";
import { loadReputationSummaryForSubject } from "@/lib/reputation/summary";
import { ReputationSummary } from "@/components/reputation/ReputationSummary";

export const dynamic = "force-dynamic";

export default async function ObraDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getProjectById(id);

  if (!data || !data.project) {
    notFound();
  }

  const { project, tasks, members, materials, photos } = data;
  const client = project.users?.profiles;
  const clientName = Array.isArray(client) ? client[0]?.name : client?.name;

  const reputationReviews = await loadReputationSummaryForSubject({
    key: "project",
    id: String(project.id ?? ""),
    label: String(project.title ?? ""),
  });

  async function handleAddTask(formData: FormData) {
    "use server";
    await addTaskAction(id, formData);
  }

  async function handleAddPhoto(formData: FormData) {
    "use server";
    await addProjectPhotoAction(id, formData);
  }

  async function handleAddMaterial(formData: FormData) {
    "use server";
    await addProjectMaterialAction(id, formData);
  }

  async function handleUpdateProgress(formData: FormData) {
    "use server";
    const progress = parseInt(String(formData.get("progress") ?? "0"), 10);
    const status = String(formData.get("status") ?? "IN_PROGRESS");
    await updateProjectProgressAction(id, progress, status);
  }

  return (
    <main>
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="tag-badge">{project.code}</span>
            <h2 style={{ margin: 0 }}>{project.title}</h2>
          </div>
          <p style={{ marginTop: "6px" }}>
            Cliente: <strong>{clientName || project.users?.email}</strong> •
            Estado: <span className="badge">{project.status}</span>
          </p>
        </div>
        <Link href="/obras" className="button secondary">
          ← Voltar às Obras
        </Link>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Progresso da Empreitada ({project.progress_percentage || 0}%)</h3>
          <div style={{ margin: "16px 0 24px" }}>
            <div className="progress-bar-bg" style={{ height: "14px" }}>
              <div
                className="progress-bar-fill"
                style={{
                  width: `${project.progress_percentage || 0}%`,
                  background: "#15803d",
                }}
              />
            </div>
          </div>

          <form action={handleUpdateProgress}>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="progress">Atualizar Percentagem (%)</label>
                <input
                  id="progress"
                  name="progress"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={project.progress_percentage || 0}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="status">Estado da Obra</label>
                <select id="status" name="status" defaultValue={project.status}>
                  <option value="PLANNED">Planeada</option>
                  <option value="IN_PROGRESS">Em Execução</option>
                  <option value="ON_HOLD">Suspensa</option>
                  <option value="COMPLETED">Concluída</option>
                  <option value="CANCELLED">Cancelada</option>
                </select>
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: "14px" }}>
              <button type="submit" className="button">
                Atualizar Estado & Progresso
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h3>Resumo Financeiro & Prazos</h3>
          <div
            style={{ lineHeight: "1.9", fontSize: "14px", color: "#374151" }}
          >
            <p>
              <strong>Orçamento Estimado:</strong> €
              {Number(project.budget_estimated).toLocaleString("pt-PT", {
                minimumFractionDigits: 2,
              })}
            </p>
            <p>
              <strong>Data Início:</strong>{" "}
              {project.start_date
                ? new Date(project.start_date).toLocaleDateString("pt-PT")
                : "Não iniciada"}
            </p>
            <p>
              <strong>Data Conclusão Prevista:</strong>{" "}
              {project.expected_end_date
                ? new Date(project.expected_end_date).toLocaleDateString(
                    "pt-PT",
                  )
                : "Sem prazo fixado"}
            </p>
            <p>
              <strong>Descrição:</strong>{" "}
              {project.description || "Sem notas adicionais."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: "24px" }}>
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h3 style={{ margin: 0 }}>Tarefas da Obra ({tasks.length})</h3>
          </div>

          <form
            action={handleAddTask}
            style={{
              marginBottom: "20px",
              paddingBottom: "16px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div className="form-grid">
              <div className="form-field full">
                <label htmlFor="task_title">Nova Tarefa *</label>
                <input
                  id="task_title"
                  name="title"
                  required
                  placeholder="Ex: Aplicação de impermeabilização no terraço"
                />
              </div>
              <div className="form-field">
                <label htmlFor="priority">Prioridade</label>
                <select id="priority" name="priority" defaultValue="MEDIUM">
                  <option value="LOW">Baixa</option>
                  <option value="MEDIUM">Média</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">Urgente</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="estimated_hours">Horas Estimadas</label>
                <input
                  id="estimated_hours"
                  name="estimated_hours"
                  type="number"
                  step="0.5"
                  placeholder="8.0"
                />
              </div>
            </div>
            <div className="form-actions" style={{ marginTop: "10px" }}>
              <button
                type="submit"
                className="button"
                style={{ padding: "8px 14px", fontSize: "12px" }}
              >
                + Adicionar Tarefa
              </button>
            </div>
          </form>

          {tasks.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "13px" }}>
              Nenhuma tarefa registada nesta obra.
            </p>
          ) : (
            <div className="list">
              {tasks.map((t: any) => (
                <div key={t.id} className="list-row">
                  <div>
                    <div className="list-title">{t.title}</div>
                    <div className="list-subtitle">
                      Prioridade: {t.priority} • Horas: {t.estimated_hours || 0}
                      h
                    </div>
                  </div>
                  <span
                    className={`badge ${t.status === "DONE" ? "success" : "warning"}`}
                  >
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Equipa & Materiais</h3>
          <h4
            style={{
              fontSize: "13px",
              color: "var(--muted)",
              margin: "14px 0 8px",
            }}
          >
            Equipa Afeta ({members.length})
          </h4>
          {members.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "13px" }}>
              Nenhum profissional associado a esta obra.
            </p>
          ) : (
            <ul style={{ paddingLeft: "20px", fontSize: "13px" }}>
              {members.map((m: any) => (
                <li key={m.id}>
                  <strong>{m.users?.profiles?.name || m.users?.email}</strong> —{" "}
                  {m.role}
                </li>
              ))}
            </ul>
          )}

          <h4
            style={{
              fontSize: "13px",
              color: "var(--muted)",
              margin: "20px 0 8px",
            }}
          >
            Materiais & Custos ({materials.length})
          </h4>

          <form action={handleAddMaterial} style={{ marginBottom: "14px" }}>
            <div className="form-grid">
              <div className="form-field">
                <input name="name" required placeholder="Nome do material..." style={{ padding: "6px", fontSize: "12px" }} />
              </div>
              <div className="form-field">
                <input name="quantity" type="number" step="0.5" defaultValue="1" placeholder="Qtd" style={{ padding: "6px", fontSize: "12px" }} />
              </div>
              <div className="form-field">
                <input name="unit_cost" type="number" step="0.01" placeholder="Custo Un. (€)" style={{ padding: "6px", fontSize: "12px" }} />
              </div>
              <div className="form-field">
                <button type="submit" className="button secondary" style={{ padding: "6px 10px", fontSize: "12px" }}>
                  + Adicionar Material
                </button>
              </div>
            </div>
          </form>

          {materials.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "13px" }}>
              Nenhum material registado até ao momento.
            </p>
          ) : (
            <ul style={{ paddingLeft: "20px", fontSize: "13px" }}>
              {materials.map((mat: any) => (
                <li key={mat.id}>
                  <strong>{mat.name}</strong>: {mat.quantity} {mat.unit} (€
                  {mat.total_cost})
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ margin: 0 }}>Evidências Fotográficas & Diário de Obra ({photos ? photos.length : 0})</h3>
        </div>

        <form action={handleAddPhoto} style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px dashed var(--border)", marginBottom: "20px" }}>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="file" style={{ fontSize: "12px" }}>Selecionar Fotografia *</label>
              <input id="file" name="file" type="file" accept="image/*" required />
            </div>

            <div className="form-field">
              <label htmlFor="caption" style={{ fontSize: "12px" }}>Legenda / Descrição</label>
              <input id="caption" name="caption" placeholder="Ex: Execução de assentamento de cerâmico" />
            </div>

            <div className="form-field">
              <label htmlFor="stage" style={{ fontSize: "12px" }}>Fase da Obra</label>
              <select id="stage" name="stage" defaultValue="DURING">
                <option value="BEFORE">Antes / Estado Inicial</option>
                <option value="DURING">Durante os Trabalhos</option>
                <option value="AFTER">Após Conclusão</option>
              </select>
            </div>

            <div className="form-field" style={{ alignSelf: "flex-end" }}>
              <button type="submit" className="button" style={{ padding: "9px 14px", fontSize: "12px" }}>
                📸 Carregar Fotografia
              </button>
            </div>
          </div>
        </form>

        {(!photos || photos.length === 0) ? (
          <p style={{ color: "var(--muted)", fontSize: "13px" }}>Ainda não foram carregadas fotografias desta obra.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>
            {photos.map((ph: any) => (
              <div key={ph.id} style={{ border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden", background: "white" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph.file_url} alt={ph.caption || "Foto da obra"} style={{ width: "100%", height: "140px", objectFit: "cover" }} />
                <div style={{ padding: "10px" }}>
                  <span className="tag-badge" style={{ fontSize: "10px", marginBottom: "4px" }}>{ph.stage}</span>
                  <p style={{ margin: "4px 0 0", fontSize: "12px", fontWeight: 600 }}>{ph.caption || "Fotografia"}</p>
                </div>
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
          <ReputationSummary title={`Reputação da obra ${project.code ?? ""}`} reviews={reputationReviews} />
        )}
      </div>
    </main>
  );
}
