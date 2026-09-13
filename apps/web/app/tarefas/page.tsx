
import { getSessionContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPermission } from "@rpg/core";
import { NewTaskForm, CompleteTaskButton } from "./TaskClient";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  TODO: "Por fazer",
  IN_PROGRESS: "Em curso",
  REVIEW: "Em revisão",
  DONE: "Concluída",
  CANCELLED: "Cancelada",
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return (
      <main>
        <div className="card">Inicie sessão para ver as suas tarefas.</div>
      </main>
    );
  }
  if (!hasPermission(ctx.permissions, "tarefas.view")) {
    return (
      <main>
        <div className="card">Não tem permissão para aceder às tarefas.</div>
      </main>
    );
  }

  const { filtro } = await searchParams;
  const supabase = createAdminClient();
  const userId = ctx.user.id;

  let query = supabase
    .from("tasks")
    .select("id, title, status, priority, due_date")
    .eq("assignee_id", userId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(100);

  if (filtro === "hoje") {
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    query = query.lte("due_date", endOfDay.toISOString());
  } else if (filtro === "atrasadas") {
    query = query
      .lt("due_date", new Date().toISOString())
      .not("status", "in", "(DONE,CANCELLED)");
  } else {
    query = query.not("status", "in", "(DONE,CANCELLED)");
  }

  const { data: tasks } = await query;
  const taskList = tasks ?? [];

  return (
    <main>
      <span className="topbar-eyebrow">Gestão Universal de Tarefas</span>
      <h1>Tarefas</h1>

      <div style={{ display: "flex", gap: "8px", margin: "12px 0" }}>
        {[
          ["", "Pendentes"],
          ["hoje", "Para hoje"],
          ["atrasadas", "Atrasadas"],
        ].map(([value, label]) => (
          <a
            key={label}
            href={value ? `/tarefas?filtro=${value}` : "/tarefas"}
            className={`button secondary ${(filtro ?? "") === value ? "active" : ""}`}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            {label}
          </a>
        ))}
      </div>

      <NewTaskForm />

      <div className="card" style={{ marginTop: "16px" }}>
        {taskList.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "13px" }}>
            Sem tarefas nesta vista. Crie uma acima para começar.
          </p>
        ) : (
          <div className="list">
            {taskList.map((t) => (
              <div key={t.id} className="list-row">
                <div>
                  <div className="list-title">{t.title}</div>
                  <div className="list-subtitle">
                    {STATUS_LABEL[t.status] ?? t.status}
                    {t.due_date
                      ? ` • Prazo: ${new Date(t.due_date).toLocaleDateString("pt-PT")}`
                      : ""}
                  </div>
                </div>
                <CompleteTaskButton taskId={t.id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
