import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/session";
import { hasPermission } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdministrationForm, departmentAction, teamAction, roleAction, inviteAction } from "../AdministrationForms";

const allowed = new Set(["organizacao", "membros", "departamentos", "equipas", "cargos", "permissoes", "convites", "auditoria", "seguranca", "integracoes", "automacoes", "configuracoes"]);
const titles: Record<string, string> = { organizacao: "Organização", membros: "Membros", departamentos: "Departamentos", equipas: "Equipas", cargos: "Cargos", permissoes: "Permissões", convites: "Convites", auditoria: "Auditoria", seguranca: "Segurança", integracoes: "Integrações", automacoes: "Automações", configuracoes: "Configurações" };

export const dynamic = "force-dynamic";

export default async function AdministrationSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!allowed.has(section)) notFound();
  const ctx = await getSessionContext();
  if (!ctx) return <main><div className="card">Inicie sessão para continuar.</div></main>;
  if (!hasPermission(ctx.permissions, "admin.view") && !hasPermission(ctx.permissions, "administracao.view")) return <main><div className="card">Não tem permissão para esta área.</div></main>;
  const supabase = createAdminClient();
  const orgId = ctx.organization?.id;
  const table = section === "membros" ? "org_memberships" : section === "departamentos" ? "departments" : section === "equipas" ? "teams" : section === "cargos" ? "custom_roles" : null;
  let rows: Array<Record<string, unknown>> = [];
  if (table && orgId) {
    const columns = table === "org_memberships" ? "id, user_id, status, role_key, department_id, created_at" : table === "custom_roles" ? "id, label, key, permissions, scope, created_at" : "id, name, description, created_at";
    const { data } = await supabase.from(table).select(columns).eq("organization_id", orgId).limit(100);
    rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  }
  const form = section === "departamentos" ? <AdministrationForm type="department" action={departmentAction} /> : section === "equipas" ? <AdministrationForm type="team" action={teamAction} /> : section === "cargos" ? <AdministrationForm type="role" action={roleAction} /> : section === "convites" ? <AdministrationForm type="invite" action={inviteAction} /> : null;
  return <main><Link href="/administracao" className="button secondary">← Administração</Link><span className="topbar-eyebrow" style={{ display: "block", marginTop: 20 }}>Controlo de acesso</span><h1>{titles[section]}</h1><div className="card"><p style={{ color: "var(--muted)" }}>Dados reais da organização ativa. As alterações são protegidas por sessão, RBAC e RLS.</p>{form}{table ? rows.length ? <div className="list">{rows.map((row) => <div className="list-row" key={String(row.id)}><div><div className="list-title">{String(row.name ?? row.label ?? row.key ?? row.role_key ?? row.user_id ?? "Registo")}</div><div className="list-subtitle">{String(row.status ?? row.description ?? "Ativo")}</div></div></div>)}</div> : <div className="empty-state">Ainda não existem registos.</div> : <div className="empty-state">Esta área está preparada para a configuração persistente do módulo.</div>}</div></main>;
}
