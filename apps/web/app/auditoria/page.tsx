import { createAdminClient } from "@/lib/supabase/admin";
import { SectionHeader } from "@/components/ui/SectionHeader";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  module: string;
  entity_type: string;
  entity_id: string;
  timestamp: string;
  metadata?: Record<string, unknown> | null;
  actor_name?: string | null;
}

/** Infere a origem do evento a partir da metadata (via/source) — sem alterar a BD. */
function inferOrigin(meta?: Record<string, unknown> | null): "IA" | "Automação" | "Utilizador" {
  if (!meta) return "Utilizador";
  const via = String(meta.via ?? meta.source ?? "").toLowerCase();
  if (via.includes("ai") || via.includes("assistant") || via.includes("ia")) return "IA";
  if (via.includes("auto") || via.includes("system") || via.includes("scheduler")) return "Automação";
  return "Utilizador";
}

const ORIGIN_STYLE: Record<string, string> = {
  IA: "badge warning",
  Automação: "badge",
  Utilizador: "badge success",
};

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams?: Promise<{
    module?: string;
    search?: string;
    user?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const moduleFilter = resolvedParams.module;
  const search = resolvedParams.search || "";
  const userFilter = resolvedParams.user;
  const fromFilter = resolvedParams.from;
  const toFilter = resolvedParams.to;
  const supabase = createAdminClient();

  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(50);

  if (moduleFilter) {
    query = query.eq("module", moduleFilter);
  }

  if (search) {
    query = query.or(`action.ilike.%${search}%,module.ilike.%${search}%,entity_type.ilike.%${search}%`);
  }

  if (userFilter) {
    query = query.eq("user_id", userFilter);
  }

  if (fromFilter) {
    query = query.gte("timestamp", new Date(fromFilter).toISOString());
  }

  if (toFilter) {
    query = query.lte("timestamp", new Date(toFilter).toISOString());
  }

  // Users com permissão (resolver nomes para o filtro por utilizador)
  const [logsRes, consentsRes, countRes, usersRes] = await Promise.all([
    query,
    supabase.from("rgpd_consents").select("*, users(email)").order("accepted_at", { ascending: false }).limit(20),
    supabase
      .from("audit_logs")
      .select("count", { count: "exact", head: true }),
    supabase.from("users").select("id, email").order("email", { ascending: true }).limit(200),
  ]);

  const auditLogs = (logsRes.data ?? []) as AuditLogRow[];
  const consents = consentsRes.data ?? [];
  const totalCount = countRes.count ?? auditLogs.length;
  const users = usersRes.data ?? [];

  // Métricas reais
  const moduleCountRes = await supabase
    .from("audit_logs")
    .select("module");
  const perModule = new Map<string, number>();
  for (const m of moduleCountRes.data ?? []) {
    perModule.set(String(m.module), (perModule.get(String(m.module)) ?? 0) + 1);
  }
  const topModules = [...perModule.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  const actionCountRes = await supabase
    .from("audit_logs")
    .select("action, metadata");
  const originCounts = (actionCountRes.data ?? []).reduce(
    (acc, a) => {
      acc[inferOrigin(a.metadata as Record<string, unknown> | null)] += 1;
      return acc;
    },
    { IA: 0, Automação: 0, Utilizador: 0 },
  );

  const userById = new Map<string, string>();
  for (const u of users) userById.set(String(u.id), String(u.email ?? ""));

  return (
    <main>
      <SectionHeader
        title="Auditoria & Conformidade"
        description="Rastreabilidade integral de operações, criação de registos, emissão de faturas, origem (utilizador/IA/automação) e conformidade RGPD."
      />

      <div className="metrics" style={{ marginTop: "20px" }}>
        <div className="card">
          <span className="metric-label">Total de Registos de Auditoria</span>
          <strong className="metric-value">{totalCount}</strong>
          <span className="metric-change success">Rastreabilidade ativa</span>
        </div>

        <div className="card">
          <span className="metric-label">Funções em uso</span>
          <strong className="metric-value">{topModules.length}</strong>
          <span className="metric-change success">Módulos ativos</span>
        </div>

        <div className="card">
          <span className="metric-label">Origem: Utilizador</span>
          <strong className="metric-value">{originCounts.Utilizador}</strong>
          <span className="metric-change success">Ações manuais</span>
        </div>

        <div className="card">
          <span className="metric-label">Origem: IA / Automação</span>
          <strong className="metric-value">{originCounts.IA + originCounts.Automação}</strong>
          <span className="metric-change success">
            {originCounts.IA > 0 ? `${originCounts.IA} IA` : "Com IA"} · {originCounts.Automação > 0 ? `${originCounts.Automação} auto` : "sem auto"}
          </span>
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <div className="toolbar-row">
          <h3 style={{ margin: 0 }}>
            Eventos Registados no Sistema
            {moduleFilter ? ` · ${moduleFilter}` : ""}
            {userFilter ? ` · ${userById.get(userFilter) ?? userFilter}` : ""}
          </h3>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Link href="/auditoria" className={`button secondary ${!moduleFilter && !userFilter && !fromFilter ? "active" : ""}`} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Todos
            </Link>
            <Link href="/auditoria?module=REGISTRATION" className={`button secondary ${moduleFilter === "REGISTRATION" ? "active" : ""}`} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Registos
            </Link>
            <Link href="/auditoria?module=INVOICING" className={`button secondary ${moduleFilter === "INVOICING" ? "active" : ""}`} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Faturação
            </Link>
            <Link href="/auditoria?module=PROJECTS" className={`button secondary ${moduleFilter === "PROJECTS" ? "active" : ""}`} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Obras
            </Link>
            <Link href="/auditoria?module=OPERATIONS" className={`button secondary ${moduleFilter === "OPERATIONS" ? "active" : ""}`} style={{ fontSize: "12px", padding: "6px 12px" }}>
              Operações
            </Link>
          </div>
        </div>

        {/* Filtros: utilizador + período */}
        <form
          method="get"
          action="/auditoria"
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            alignItems: "flex-end",
            margin: "16px 0",
            padding: "14px 16px",
            background: "var(--bg-secondary, #f8fafc)",
            borderRadius: "8px",
          }}
        >
          {moduleFilter && <input type="hidden" name="module" value={moduleFilter} />}
          <label style={{ fontSize: "12px", color: "var(--muted)" }}>
            Utilizador
            <select
              name="user"
              defaultValue={userFilter ?? ""}
              style={{ fontSize: "13px", padding: "6px 8px", marginTop: "4px", display: "block", minWidth: "180px" }}
            >
              <option value="">Todos</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>{u.email}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: "12px", color: "var(--muted)" }}>
            Desde
            <input
              type="date"
              name="from"
              defaultValue={fromFilter ?? ""}
              style={{ fontSize: "13px", padding: "6px 8px", marginTop: "4px", display: "block" }}
            />
          </label>
          <label style={{ fontSize: "12px", color: "var(--muted)" }}>
            Até
            <input
              type="date"
              name="to"
              defaultValue={toFilter ?? ""}
              style={{ fontSize: "13px", padding: "6px 8px", marginTop: "4px", display: "block" }}
            />
          </label>
          <button type="submit" className="button secondary" style={{ fontSize: "12px", padding: "6px 12px" }}>
            Filtrar
          </button>
          {(userFilter || fromFilter || toFilter) && (
            <Link href="/auditoria" className="button" style={{ fontSize: "12px", padding: "6px 12px" }}>
              Limpar
            </Link>
          )}
        </form>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Data / Hora</th>
                <th>Ação Executada</th>
                <th>Módulo</th>
                <th>Tipo de Entidade</th>
                <th>Utilizador</th>
                <th>Origem</th>
                <th>Metadados</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted)" }}>
                    Nenhum registo de auditoria encontrado.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.timestamp).toLocaleString("pt-PT")}</td>
                    <td><strong>{log.action}</strong></td>
                    <td><span className="tag-badge">{log.module}</span></td>
                    <td>{log.entity_type}</td>
                    <td style={{ fontSize: "12px" }}>
                      {log.user_id ? userById.get(log.user_id) ?? log.user_id.slice(0, 8) : "—"}
                    </td>
                    <td>
                      <span className={ORIGIN_STYLE[inferOrigin(log.metadata)]}>
                        {inferOrigin(log.metadata)}
                      </span>
                    </td>
                    <td style={{ fontSize: "11px", color: "var(--muted)", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {JSON.stringify(log.metadata || {})}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {topModules.length > 0 && (
          <div style={{ marginTop: "16px", fontSize: "12px", color: "var(--muted)" }}>
            <strong>Módulos mais ativos:</strong>{" "}
            {topModules.map(([mod, n], i) => (
              <span key={mod}>
                {i > 0 ? " · " : ""}
                {mod} ({n})
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid-2" style={{ marginTop: "24px" }}>
        <div className="card">
          <h3>Consentimentos de Privacidade & RGPD ({consents.length})</h3>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Utilizador / Email</th>
                  <th>Termos</th>
                  <th>Privacidade</th>
                  <th>Data Aceitação</th>
                </tr>
              </thead>
              <tbody>
                {consents.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "20px", color: "var(--muted)" }}>
                      Nenhum registo de consentimento guardado.
                    </td>
                  </tr>
                ) : (
                  consents.map((cx: any) => (
                    <tr key={cx.id}>
                      <td><strong>{cx.users?.email || cx.user_id}</strong></td>
                      <td><span className="badge success">v{cx.terms_version}</span></td>
                      <td><span className="badge success">v{cx.privacy_version}</span></td>
                      <td>{new Date(cx.accepted_at).toLocaleString("pt-PT")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>Direito à Portabilidade de Dados (Art. 20.º RGPD)</h3>
          <p style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6" }}>
            Permite a exportação estruturada e legível por máquina de todos os dados pessoais, financeiros, obras e orçamentos vinculados ao titular.
          </p>
          <div style={{ marginTop: "16px" }}>
            <a
              href="/api/rgpd/export"
              download
              className="button secondary"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              📦 Exportar Arquivo Completo RGPD (JSON)
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
