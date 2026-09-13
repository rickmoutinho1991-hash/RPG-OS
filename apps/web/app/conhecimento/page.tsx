import { getSessionContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPermission } from "@rpg/core";
import { NewArticleForm } from "./ArticleClient";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  manual: "Manual",
  procedimento: "Procedimento",
  politica: "Política",
  faq: "FAQ",
  sop: "SOP",
  formacao: "Formação",
  wiki: "Wiki",
  legislacao: "Legislação",
};

export default async function KnowledgePage() {
  const ctx = await getSessionContext();
  if (!ctx) {
    return (
      <main>
        <div className="card">Inicie sessão para aceder ao conhecimento.</div>
      </main>
    );
  }
  if (!hasPermission(ctx.permissions, "conhecimento.view")) {
    return (
      <main>
        <div className="card">
          Não tem permissão para aceder ao Knowledge Hub.
        </div>
      </main>
    );
  }

  const supabase = createAdminClient();
  const orgId = ctx.organization?.id;

  let query = supabase
    .from("knowledge_articles")
    .select("id, title, category, status, version, verified_at, updated_at")
    .eq("status", "PUBLISHED")
    .order("updated_at", { ascending: false })
    .limit(50);
  query = orgId
    ? query.eq("organization_id", orgId)
    : query.is("organization_id", null);

  const { data: articles } = await query;
  const articleList = articles ?? [];

  return (
    <main>
      <span className="topbar-eyebrow">RPG-OS Knowledge</span>
      <h1>Centro de Conhecimento</h1>
      <p style={{ color: "var(--muted)" }}>
        Manuais, procedimentos, políticas e formação — sempre atualizados e
        verificados.
      </p>

      <NewArticleForm />

      <div className="card" style={{ marginTop: "16px" }}>
        {articleList.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "13px" }}>
            Ainda não há artigos publicados. Publique o primeiro acima.
          </p>
        ) : (
          <div className="list">
            {articleList.map((a) => (
              <details key={a.id}>
                <summary
                  className="list-row"
                  style={{ cursor: "pointer", listStyle: "none" }}
                >
                  <div>
                    <div className="list-title">
                      <strong>{a.title}</strong>
                    </div>
                    <div className="list-subtitle">
                      {CATEGORY_LABEL[a.category] ?? a.category} • v{a.version}
                      {a.verified_at
                        ? ` • Verificado em ${new Date(a.verified_at).toLocaleDateString("pt-PT")}`
                        : " • Não verificado"}
                    </div>
                  </div>
                  <span className="tag-badge">
                    {CATEGORY_LABEL[a.category] ?? a.category}
                  </span>
                </summary>
              </details>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
