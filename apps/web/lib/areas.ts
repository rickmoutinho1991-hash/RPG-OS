import { NAV_GROUPS, filterNavGroups, type NavGroup } from "@/lib/navigation";

/**
 * RPG-OS — Áreas profissionais (vaga M-A).
 *
 * Cada área de atuação define os módulos essenciais do dia-a-dia e as
 * permissões base que o ator recebe ao registar-se nessa área. A navegação
 * é depois filtrada por permissões efetivas (RBAC) e restringida ao
 * subconjunto de módulos da área — nunca alargada além do RBAC.
 *
 * `modules` vazio (área "outra") = sem restrição: o ator vê tudo a que tem
 * direito, tal como antes desta vaga.
 */
export interface ProfessionalArea {
  id: string;
  label: string;
  description: string;
  /** Hrefs da navegação essenciais para a área (subconjunto de NAV_GROUPS). */
  modules: string[];
  /** Permissões base concedidas pela área (só módulos pessoais do próprio ator). */
  grants: string[];
  /** Especialidades/categorias oferecidas no formulário de registo da área. */
  specialities: string[];
}

/**
 * Módulos e permissões de mercado comuns a todas as áreas: o mercado de
 * oportunidades é transversal (pessoas, independentes, empresas e clientes
 * finais) e nunca deve ser escondido pela especialização do ator.
 */
const MARKET_MODULES = ["/mercado", "/mercado/contratos"];
const MARKET_GRANTS = [
  "marketplace.view",
  "marketplace.requests.create",
  "marketplace.requests.view",
  "marketplace.quotes.create",
  "marketplace.quotes.view",
  "marketplace.contracts.view",
];

export const PROFESSIONAL_AREAS: ProfessionalArea[] = [
  {
    id: "enfermagem",
    label: "Enfermagem / Saúde",
    description:
      "Cuidados, utentes, consultas, exames, vacinas e receitas — o essencial do dia-a-dia clínico.",
    modules: [
      "/saude",
      "/saude/receitas",
      "/agenda",
      "/tarefas",
      "/documentos",
      "/clientes",
      "/perfil",
      ...MARKET_MODULES,
    ],
    grants: [
      "saude.view",
      "agenda.view",
      "tarefas.view",
      "documentos.view",
      "clientes.view",
      "inicio.view",
      ...MARKET_GRANTS,
    ],
    specialities: [
      "Enfermeiro(a)",
      "Enfermeiro(a) Especialista",
      "Enfermeiro(a) de Saúde Pública",
      "Enfermeiro(a) Gestor(a)",
      "Auxiliar de Enfermagem",
    ],
  },
  {
    id: "construcao",
    label: "Construção & Obras",
    description: "Obras, orçamentos, equipa técnica e alocação no terreno.",
    modules: [
      "/obras",
      "/orcamentos",
      "/tarefas",
      "/agenda",
      "/clientes",
      "/documentos",
      "/guias",
      "/perfil",
      ...MARKET_MODULES,
    ],
    grants: [
      "obras.view",
      "orcamentos.view",
      "tarefas.view",
      "agenda.view",
      "clientes.view",
      "documentos.view",
      "guias.view",
      "inicio.view",
      ...MARKET_GRANTS,
    ],
    specialities: [
      "Diretor de Obra / Engenheiro",
      "Encarregado Geral",
      "Eletricista Certificado",
      "Canalizador / AVAC",
      "Pedreiro de 1ª",
      "Pintor / Estucador",
      "Carpinteiro / Marceneiro",
      "Operador de Máquinas",
    ],
  },
  {
    id: "gestao",
    label: "Gestão & Negócio",
    description: "Gestão comercial, financeira e fiscal da atividade.",
    modules: [
      "/clientes",
      "/empresas",
      "/orcamentos",
      "/faturacao",
      "/financas",
      "/contabilidade",
      "/fiscal",
      "/banco",
      "/documentos",
      "/tarefas",
      "/agenda",
      "/perfil",
      "/reputacao",
      ...MARKET_MODULES,
    ],
    grants: [
      "clientes.view",
      "empresas.view",
      "orcamentos.view",
      "faturacao.view",
      "financas.view",
      "contabilidade.view",
      "fiscal.view",
      "banco.view",
      "documentos.view",
      "tarefas.view",
      "agenda.view",
      "reputation.view",
      "inicio.view",
      ...MARKET_GRANTS,
    ],
    specialities: [
      "Gestor(a) / Administrador(a)",
      "Contabilista Certificado",
      "Técnico(a) de Contas",
      "Consultor(a)",
      "Administrativo(a)",
    ],
  },
  {
    id: "outra",
    label: "Outra área",
    description: "Acesso completo aos módulos do RPG-OS a que o ator tem direito.",
    modules: [],
    grants: [],
    specialities: [
      "Profissional Liberal",
      "Prestador(a) de Serviços",
      "Outro",
    ],
  },
];

export const DEFAULT_AREA_ID = "outra";

/** Especialidades oferecidas para uma área (para o formulário de registo). */
export function specialitiesForArea(areaId: string | null | undefined): string[] {
  return resolveArea(areaId).specialities;
}

const NAV_HREFS: { href: string; label: string }[] = NAV_GROUPS.flatMap((g) =>
  g.items.map((i) => ({ href: i.href, label: i.label })),
);

/** Resolve uma área por id, caindo no default ("outra") quando desconhecida/nula. */
export function resolveArea(areaId: string | null | undefined): ProfessionalArea {
  const found = PROFESSIONAL_AREAS.find((a) => a.id === areaId);
  return found ?? PROFESSIONAL_AREAS.find((a) => a.id === DEFAULT_AREA_ID)!;
}

/** Permissões efetivas = RBAC do ator ∪ permissões base da área (nunca subtrai). */
export function effectivePermissionsForArea(
  permissions: string[] | undefined,
  areaId: string | null | undefined,
): string[] {
  const base = permissions ?? [];
  const area = resolveArea(areaId);
  return Array.from(new Set([...base, ...area.grants]));
}

/**
 * Filtra a navegação por permissões efetivas e restringe-a aos módulos da área.
 * Área sem `modules` (ex.: "outra") devolve a navegação filtrada por RBAC como antes.
 */
export function filterNavGroupsByArea(
  permissions: string[] | undefined,
  areaId?: string | null,
): NavGroup[] {
  const groups = filterNavGroups(effectivePermissionsForArea(permissions, areaId));
  const area = resolveArea(areaId);
  if (area.modules.length === 0) return groups;
  const allowed = new Set(area.modules);
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed.has(i.href)) }))
    .filter((g) => g.items.length > 0);
}

/** Módulos da área já resolvidos (href+label) a partir da NAV_GROUPS — para o dashboard. */
export function areaModules(
  areaId: string | null | undefined,
): { href: string; label: string }[] {
  const area = resolveArea(areaId);
  if (area.modules.length === 0) return [];
  const byHref = new Map(NAV_HREFS.map((i) => [i.href, i] as const));
  return area.modules
    .map((href) => byHref.get(href))
    .filter((i): i is { href: string; label: string } => Boolean(i));
}
