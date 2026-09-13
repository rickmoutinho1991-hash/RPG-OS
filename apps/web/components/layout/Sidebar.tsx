"use client";

/**
 * RPG-OS — Navegação agrupada, adaptada às permissões do utilizador.
 * As permissões são injetadas pelo servidor (AppShell) — nunca calculadas no cliente.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasPermission } from "@rpg/core";

export interface NavItem {
  href: string;
  label: string;
  badge?: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Vida",
    items: [{ href: "/vida", label: "A Minha Vida" }],
  },
  {
    label: "Início",
    items: [{ href: "/", label: "Command Center" }],
  },
  {
    label: "Operações",
    items: [{ href: "/operacoes", label: "Centro de Operações" }],
  },
  {
    label: "Trabalho",
    items: [
      { href: "/tarefas", label: "Tarefas" },
      { href: "/agenda", label: "Agenda" },
      { href: "/aprovacoes", label: "Aprovações" },
      { href: "/comunicacao", label: "Comunicação" },
      { href: "/diario", label: "Diário" },
    ],
  },
  {
    label: "Negócio",
    items: [
      { href: "/clientes", label: "Clientes" },
      { href: "/empresas", label: "Empresas" },
      { href: "/orcamentos", label: "Orçamentos" },
      { href: "/faturacao", label: "Faturação", badge: "SAF-T" },
      { href: "/obras", label: "Obras & Projetos" },
      { href: "/guias", label: "Guias Transporte", badge: "AT" },
      { href: "/banco", label: "Banco & Carteira" },
    ],
  },
  {
    label: "Finanças",
    items: [
      { href: "/financas", label: "Centro Financeiro" },
      { href: "/contabilidade", label: "Contabilidade" },
      { href: "/fiscal", label: "Fiscal & Seg. Social" },
      { href: "/administracao/fiscal", label: "Administração Fiscal", badge: "IVA/SAF-T" },
    ],
  },
  {
    label: "Reputação",
    items: [
      { href: "/reputacao", label: "Centro de Reputação" },
      { href: "/reputacao/reclamacoes", label: "Reclamações" },
      { href: "/reputacao/recomendacoes", label: "Recomendações" },
      { href: "/reputacao/elogios", label: "Elogios" },
      { href: "/reputacao/avaliacoes", label: "Avaliações" },
      { href: "/reputacao/metricas", label: "Métricas" },
    ],
  },
  {
    label: "Conhecimento",
    items: [
      { href: "/documentos", label: "Documentos" },
      { href: "/conhecimento", label: "Wiki & Procedimentos" },
    ],
  },
  {
    label: "Pessoas",
    items: [{ href: "/perfil", label: "O meu perfil" }],
  },
  {
    label: "IA",
    items: [{ href: "/ia", label: "RPG-OS AI" }],
  },
  {
    label: "Administração",
    items: [
      { href: "/auditoria", label: "Auditoria" },
      { href: "/integracoes", label: "Integrações" },
      { href: "/rgpd", label: "Privacidade & RGPD" },
      { href: "/planos", label: "Planos & Subscrição" },
      { href: "/dispositivos", label: "Dispositivos" },
      { href: "/administracao", label: "Administração" },
      { href: "/administracao/receita", label: "Revenue Center" },
      { href: "/administracao/governo", label: "Ligações Governamentais", badge: "AT/SS" },
      { href: "/administracao/at", label: "Ligações AT" },
      { href: "/administracao/fiscal", label: "Administração Fiscal", badge: "IVA/SAF-T" },
      { href: "/administracao/empresas", label: "Empresas e Organizações" },
    ],
  },
];

/** Permissão exigida para ver cada página na navegação. */
export const PAGE_PERMISSIONS: Record<string, string> = {
  "/vida": "vida.view",
  "/": "inicio.view",
  "/operacoes": "operations.view",
  "/tarefas": "tarefas.view",
  "/agenda": "agenda.view",
  "/aprovacoes": "workflows.view",
  "/comunicacao": "comunicacao.view",
  "/diario": "diario.view",
  "/clientes": "clientes.view",
  "/empresas": "empresas.view",
  "/orcamentos": "orcamentos.view",
  "/faturacao": "faturacao.view",
  "/obras": "obras.view",
  "/guias": "guias.view",
  "/banco": "banco.view",
  "/financas": "financas.view",
  "/contabilidade": "contabilidade.view",
  "/fiscal": "fiscal.view",
  "/reputacao": "reputation.view",
  "/reputacao/reclamacoes": "reputation.view",
  "/reputacao/recomendacoes": "reputation.view",
  "/reputacao/elogios": "reputation.view",
  "/reputacao/avaliacoes": "reputation.view",
  "/reputacao/metricas": "reputation.view",
  "/integracoes/portal-da-queixa": "reputation.view",
  "/documentos": "documentos.view",
  "/conhecimento": "conhecimento.view",
  "/perfil": "inicio.view",
  "/ia": "ia.view",
  "/auditoria": "auditoria.view",
  "/integracoes": "admin.view",
  "/rgpd": "inicio.view",
  "/planos": "inicio.view",
  "/dispositivos": "inicio.view",
  "/administracao": "admin.view",
  "/administracao/receita": "revenue.view",
  "/administracao/governo": "government.view",
  "/administracao/at": "fiscal.manage",
  "/administracao/fiscal": "fiscal.admin",
  "/administracao/empresas": "fiscal.admin",
};

/** Filtra grupos por permissões efetivas. "*" concede tudo. */
export function filterNavGroups(permissions: string[]): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      const perm = PAGE_PERMISSIONS[i.href];
      return !perm || hasPermission(permissions, perm);
    }),
  })).filter((g) => g.items.length > 0);
}

export default function Sidebar({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const groups = filterNavGroups(permissions);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">R</div>
        <div>
          <strong>RPG-OS</strong>
          <span>Life & Business OS</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Navegação principal">
        {groups.map((group) => (
          <div key={group.label}>
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "1px",
                color: "#64748b",
                padding: "10px 12px 4px",
              }}
            >
              {group.label}
            </div>
            {group.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "sidebar-link active" : "sidebar-link"}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  aria-current={active ? "page" : undefined}
                >
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: "#2563eb",
                        color: "white",
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div>
          <strong>RPG-OS</strong>
        </div>
        <small>v2.0</small>
      </div>
    </aside>
  );
}
