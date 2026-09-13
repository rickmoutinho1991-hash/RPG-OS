import Link from "next/link";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const sections = [
  ["organizacao", "Organização", "Dados legais, contactos e preferências"],
  ["membros", "Membros", "Utilizadores e estado de acesso"],
  ["departamentos", "Departamentos", "Estrutura organizacional"],
  ["equipas", "Equipas", "Equipas e responsáveis"],
  ["cargos", "Cargos", "Roles built-in e personalizados"],
  ["permissoes", "Permissões", "Acesso granular por módulo e ação"],
  ["convites", "Convites", "Convide colaboradores com segurança"],
  ["auditoria", "Auditoria", "Histórico das ações críticas"],
  ["seguranca", "Segurança", "Sessões e controlos de acesso"],
  ["integracoes", "Integrações", "Serviços ligados à organização"],
  ["automacoes", "Automações", "Workflows e regras operacionais"],
  ["taxa-plataforma", "Taxa RPG-OS", "Percentagem cobrada sobre pagamentos"],
  ["configuracoes", "Configurações", "Preferências gerais"],
] as const;

export default async function AdministrationPage() {
  const ctx = await getSessionContext();
  if (!ctx)
    return (
      <main>
        <div className="card">Inicie sessão para aceder à administração.</div>
      </main>
    );
  if (
    !hasPermission(ctx.permissions, "admin.view") &&
    !hasPermission(ctx.permissions, "administracao.view")
  ) {
    return (
      <main>
        <div className="card">
          Não tem permissão para administrar esta organização.
        </div>
      </main>
    );
  }
  const supabase = createAdminClient();
  const orgId = ctx.organization?.id;
  const [
    { count: members },
    { count: departments },
    { count: teams },
    { count: roles },
  ] = await Promise.all([
    orgId
      ? supabase
          .from("org_memberships")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "ACTIVE")
      : Promise.resolve({ count: 0 }),
    orgId
      ? supabase
          .from("departments")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
      : Promise.resolve({ count: 0 }),
    orgId
      ? supabase
          .from("teams")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
      : Promise.resolve({ count: 0 }),
    orgId
      ? supabase
          .from("custom_roles")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
      : Promise.resolve({ count: 0 }),
  ]);
  return (
    <main>
      <span className="topbar-eyebrow">Governação e segurança</span>
      <h1>Administração</h1>
      <p style={{ color: "var(--muted)" }}>
        {ctx.organization?.name ?? "Espaço pessoal"}
      </p>
      <div className="grid-4" style={{ margin: "20px 0" }}>
        {[
          ["Membros", members],
          ["Departamentos", departments],
          ["Equipas", teams],
          ["Cargos personalizados", roles],
        ].map(([label, value]) => (
          <div className="card" key={String(label)}>
            <strong>{label}</strong>
            <div style={{ fontSize: 28, marginTop: 8 }}>{value ?? 0}</div>
          </div>
        ))}
      </div>
      <div className="grid-3">
        {sections.map(([slug, title, description]) => (
          <Link
            className="card"
            href={`/administracao/${slug}`}
            key={slug}
            style={{ textDecoration: "none" }}
          >
            <h3 style={{ marginTop: 0 }}>{title}</h3>
            <p style={{ color: "var(--muted)", fontSize: 13 }}>{description}</p>
            <span style={{ color: "var(--accent)" }}>Abrir →</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
