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
