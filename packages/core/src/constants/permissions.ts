



/**
 * RPG-OS — Permissões granulares (RBAC)
 * Formato: "<modulo>.<acao>"  ex: faturacao.view, clientes.create
 * Ações padrão: view | create | edit | delete | approve | export | share | invite | manage | admin
 * O wildcard "*" concede acesso total (reservado ao OWNER / platform ADMIN).
 */

export const PERMISSION_ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "export",
  "share",
  "invite",
  "manage",
  "admin",
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export interface ModuleDefinition {
  id: string;
  label: string;
  /** Módulos pessoais ficam disponíveis mesmo sem organização */
  personal?: boolean;
}

export const MODULES: ModuleDefinition[] = [
  { id: "saude", label: "Saúde & Enfermagem", personal: true },
  { id: "inicio", label: "Início", personal: true },
  { id: "agenda", label: "Agenda", personal: true },
  { id: "tarefas", label: "Tarefas", personal: true },
  { id: "documentos", label: "Documentos", personal: true },
  { id: "diario", label: "Diário", personal: true },
  { id: "banco", label: "Banco & Carteira", personal: true },
  { id: "financas", label: "Centro Financeiro", personal: true },
  { id: "objetivos", label: "Objetivos", personal: true },
  { id: "clientes", label: "Clientes" },
  { id: "empresas", label: "Empresas" },
  { id: "obras", label: "Obras & Projetos" },
  { id: "orcamentos", label: "Orçamentos" },
  { id: "faturacao", label: "Faturação" },
  { id: "guias", label: "Guias de Transporte" },
  { id: "contabilidade", label: "Contabilidade" },
  { id: "fiscal", label: "Fiscal & Segurança Social" },
  { id: "comunicacao", label: "Comunicação" },
  { id: "conhecimento", label: "Conhecimento" },
  { id: "operations", label: "Centro de Operações" },
  { id: "pessoas", label: "Pessoas & Equipa" },
  { id: "relatorios", label: "Relatórios" },
  { id: "workflows", label: "Aprovações & Workflows" },
  { id: "ia", label: "Assistente IA", personal: true },
  { id: "auditoria", label: "Auditoria" },
  { id: "admin", label: "Administração" },
  { id: "platform_fees", label: "Platform Fee (taxa RPG-OS)" },
  { id: "revenue", label: "Receita (Revenue Center)" },
  { id: "marketing", label: "Marketing AI (Autopilot)" },
  { id: "reputacao", label: "Reputação" },
];

/** Verifica se um conjunto de permissões satisfaz a permissão pedida. */
export function hasPermission(
  permissions: string[] | undefined,
  required: string,
): boolean {
  if (!permissions || permissions.length === 0) return false;
  if (permissions.includes("*")) return true;
  if (permissions.includes(required)) return true;
  // Suporta explicitamente os níveis de wildcard documentados: modulo.*.
  const [mod] = required.split(".");
  if (permissions.includes(`${mod}.*`)) return true;
  // manage/admin implicam todas as ações do módulo.
  if (
    permissions.includes(`${mod}.manage`) ||
    permissions.includes(`${mod}.admin`)
  )
    return true;
  return false;
}

export function canView(
  permissions: string[] | undefined,
  moduleId: string,
): boolean {
  return hasPermission(permissions, `${moduleId}.view`);
}
