/**
 * RPG-OS — Hierarquia organizacional e cargos.
 * Cargos de sistema (built-in) + suporte a cargos personalizados por organização.
 */

import type { OrgRoleScope } from "../types/organization";

export interface BuiltinRoleDefinition {
  key: string;
  label: string;
  /** Nível hierárquico (0 = topo). Usado para ordenação e defaults. */
  level: number;
  permissions: string[];
}

/** Permissões por defeito dos cargos built-in. Podem ser sobrepostas por roles custom. */
export const BUILTIN_ORG_ROLES: BuiltinRoleDefinition[] = [
  {
    key: "OWNER",
    label: "Proprietário",
    level: 0,
    permissions: ["*"],
  },
  {
    key: "FOUNDER",
    label: "Fundador(a)",
    level: 0,
    permissions: ["*"],
  },
  {
    key: "PARTNER",
    label: "Sócio(a)",
    level: 1,
    permissions: [
      "inicio.view", "vida.view", "clientes.view", "clientes.manage", "empresas.view",
      "obras.view", "orcamentos.view", "faturacao.view", "faturacao.approve",
      "contabilidade.view", "relatorios.view", "pessoas.view", "comunicacao.view",
      "conhecimento.view", "documentos.view", "agenda.view", "tarefas.view",
      "workflows.view", "workflows.approve", "reputation.view", "reputation.create",
      "reputation.respond", "reputation.manage", "operations.view",
    ],
  },
  {
    key: "BOARD_MEMBER",
    label: "Membro do Conselho",
    level: 1,
    permissions: [
      "inicio.view", "vida.view", "empresas.view", "faturacao.view", "contabilidade.view",
      "relatorios.view", "comunicacao.view", "documentos.view", "reputation.view",
      "operations.view",
    ],
  },
  {
    key: "CEO",
    label: "CEO / Administrador",
    level: 2,
    permissions: [
      "inicio.view", "vida.view", "clientes.manage", "empresas.manage", "obras.manage",
      "orcamentos.manage", "faturacao.manage", "faturacao.approve",
      "guias.view", "contabilidade.view", "fiscal.view", "relatorios.view",
      "pessoas.manage", "roles.manage", "comunicacao.manage", "conhecimento.manage",
      "tarefas.manage", "agenda.view", "documentos.manage", "ia.view",
      "auditoria.view", "admin.view", "workflows.view", "workflows.approve",
      "reputation.view", "reputation.create", "reputation.respond", "reputation.manage",
      "reputation.moderate", "reputation.admin", "operations.manage",
    ],
  },
  {
    key: "COO",
    label: "Diretor de Operações",
    level: 3,
    permissions: [
      "inicio.view", "vida.view", "obras.manage", "orcamentos.manage", "tarefas.manage",
      "pessoas.view", "comunicacao.view", "conhecimento.view", "relatorios.view",
      "documentos.view", "agenda.view", "ia.view", "workflows.view", "workflows.approve",
      "reputation.view", "reputation.create", "reputation.respond", "reputation.manage",
      "operations.manage",
    ],
  },
  {
    key: "CFO",
    label: "Diretor Financeiro",
    level: 3,
    permissions: [
      "inicio.view", "vida.view", "faturacao.manage", "contabilidade.manage", "banco.view",
      "fiscal.manage", "relatorios.view", "orcamentos.approve", "documentos.view",
      "comunicacao.view", "ia.view", "workflows.view", "workflows.approve",
      "financas.manage", "revenue.view", "revenue.manage",
      "reputation.view", "operations.view",
    ],
  },
  {
    key: "CTO",
    label: "Diretor Tecnológico",
    level: 3,
    permissions: [
      "inicio.view", "vida.view", "obras.view", "tarefas.manage", "pessoas.view",
      "comunicacao.view", "conhecimento.manage", "documentos.view", "ia.view",
      "reputation.view",
    ],
  },
  {
    key: "CMO",
    label: "Diretor de Marketing",
    level: 3,
    permissions: [
      "inicio.view", "vida.view", "clientes.view", "relatorios.view", "comunicacao.manage",
      "conhecimento.view", "tarefas.view", "ia.view",
      "reputation.view", "reputation.create", "reputation.respond",
    ],
  },
  {
    key: "DIRECTOR",
    label: "Diretor(a)",
    level: 4,
    permissions: [
      "inicio.view", "vida.view", "obras.view", "orcamentos.view", "tarefas.manage",
      "pessoas.view", "comunicacao.view", "relatorios.view", "ia.view",
      "workflows.view", "workflows.approve",
      "reputation.view", "reputation.create", "reputation.respond",
      "operations.view",
    ],
  },
  {
    key: "GENERAL_MANAGER",
    label: "Gerente Geral",
    level: 4,
    permissions: [
      "inicio.view", "vida.view", "clientes.manage", "obras.manage", "orcamentos.manage",
      "faturacao.view", "tarefas.manage", "pessoas.view", "comunicacao.view",
      "agenda.view", "documentos.view", "ia.view", "workflows.view", "workflows.approve",
      "reputation.view", "reputation.create", "reputation.respond", "reputation.manage",
      "operations.manage",
    ],
  },
  {
    key: "DEPARTMENT_MANAGER",
    label: "Chefe de Departamento",
    level: 5,
    permissions: [
      "inicio.view", "vida.view", "tarefas.manage", "pessoas.view", "comunicacao.view",
      "conhecimento.create", "agenda.view", "ia.view", "workflows.view", "workflows.approve",
      "reputation.view", "reputation.create", "reputation.respond", "operations.view",
    ],
  },
  {
    key: "TEAM_LEADER",
    label: "Coordenador de Equipa",
    level: 6,
    permissions: [
      "inicio.view", "vida.view", "tarefas.manage", "comunicacao.view", "agenda.view", "ia.view",
      "reputation.view", "reputation.create", "reputation.respond",
    ],
  },
  {
    key: "SUPERVISOR",
    label: "Supervisor(a)",
    level: 6,
    permissions: ["inicio.view", "vida.view", "tarefas.manage", "comunicacao.view", "ia.view", "reputation.view", "reputation.create"],
  },
  {
    key: "PROJECT_MANAGER",
    label: "Gestor de Projeto",
    level: 6,
    permissions: [
      "inicio.view", "vida.view", "obras.manage", "orcamentos.view", "tarefas.manage",
      "clientes.view", "comunicacao.view", "documentos.create", "ia.view",
      "workflows.view", "workflows.approve",
      "reputation.view", "reputation.create", "reputation.respond", "reputation.manage",
      "operations.view",
    ],
  },
  {
    key: "ACCOUNT_MANAGER",
    label: "Gestor de Conta / Comercial",
    level: 7,
    permissions: [
      "inicio.view", "vida.view", "clientes.manage", "orcamentos.manage", "faturacao.view",
      "tarefas.view", "comunicacao.view", "ia.view", "workflows.view", "workflows.approve",
      "reputation.view", "reputation.create", "reputation.respond", "reputation.manage",
    ],
  },
  {
    key: "HR",
    label: "Recursos Humanos",
    level: 7,
    permissions: [
      "inicio.view", "vida.view", "pessoas.manage", "comunicacao.view", "conhecimento.manage",
      "documentos.view", "tarefas.view", "ia.view",
      "reputation.view", "reputation.manage", "reputation.moderate",
    ],
  },
  {
    key: "RECRUITER",
    label: "Recrutador(a)",
    level: 8,
    permissions: ["inicio.view", "vida.view", "pessoas.view", "comunicacao.view", "tarefas.view", "reputation.view"],
  },
  {
    key: "ACCOUNTANT",
    label: "Contabilista",
    level: 7,
    permissions: [
      "inicio.view", "vida.view", "faturacao.manage", "contabilidade.manage", "fiscal.manage",
      "banco.view", "documentos.view", "comunicacao.view", "ia.view",
      "financas.manage", "revenue.view", "reputation.view",
    ],
  },
  {
    key: "CERTIFIED_ACCOUNTANT",
    label: "Contabilista Certificado (OCC)",
    level: 7,
    permissions: [
      "inicio.view", "vida.view", "faturacao.manage", "contabilidade.admin", "fiscal.admin",
      "banco.view", "documentos.manage", "comunicacao.view", "ia.view",
      "financas.manage", "reputation.view",
    ],
  },
  {
    key: "FINANCIAL_CONTROLLER",
    label: "Controlador Financeiro",
    level: 7,
    permissions: [
      "inicio.view", "vida.view", "faturacao.view", "contabilidade.view", "banco.view",
      "relatorios.view", "documentos.view", "comunicacao.view",
      "financas.view", "revenue.view", "reputation.view",
    ],
  },
  {
    key: "LEGAL",
    label: "Jurista / Legal",
    level: 7,
    permissions: [
      "inicio.view", "vida.view", "documentos.manage",
      "comunicacao.view", "conhecimento.view",
      "reputation.view", "reputation.moderate",
    ],
  },
  {
    key: "IT_ADMIN",
    label: "Administrador de TI",
    level: 7,
    permissions: [
      "inicio.view", "vida.view", "admin.manage", "auditoria.view", "pessoas.view",
      "integracoes.manage", "comunicacao.view", "reputation.view",
    ],
  },
  {
    key: "SECURITY_ADMIN",
    label: "Administrador de Segurança",
    level: 7,
    permissions: [
      "inicio.view", "vida.view", "admin.manage", "auditoria.manage", "pessoas.view",
      "comunicacao.view", "reputation.view",
    ],
  },
  {
    key: "EMPLOYEE",
    label: "Colaborador(a)",
    level: 10,
    permissions: [
      "inicio.view", "vida.view", "tarefas.view", "tarefas.create", "agenda.view",
      "comunicacao.view", "conhecimento.view", "documentos.view", "ia.view",
      "reputation.view", "reputation.create", "reputation.respond",
    ],
  },
  {
    key: "CONTRACTOR",
    label: "Prestador de Serviços",
    level: 11,
    permissions: [
      "inicio.view", "vida.view", "tarefas.view", "agenda.view", "comunicacao.view", "ia.view",
      "reputation.view",
    ],
  },
  {
    key: "FREELANCER",
    label: "Freelancer",
    level: 11,
    permissions: [
      "inicio.view", "vida.view", "tarefas.view", "agenda.view", "comunicacao.view",
      "orcamentos.view", "ia.view", "reputation.view",
    ],
  },
  {
    key: "INTERN",
    label: "Estagiário(a)",
    level: 12,
    permissions: [
      "inicio.view", "vida.view", "tarefas.view", "comunicacao.view", "conhecimento.view",
      "reputation.view",
    ],
  },
  {
    key: "EXTERNAL_CONSULTANT",
    label: "Consultor Externo",
    level: 11,
    permissions: [
      "inicio.view", "vida.view", "tarefas.view", "documentos.view", "comunicacao.view", "ia.view",
      "reputation.view",
    ],
  },
  {
    key: "CLIENT",
    label: "Cliente",
    level: 20,
    permissions: ["inicio.view", "vida.view", "orcamentos.view", "faturacao.view", "obras.view", "reputation.view", "reputation.create", "reputation.respond"],
  },
  {
    key: "SUPPLIER",
    label: "Fornecedor",
    level: 20,
    permissions: ["inicio.view", "vida.view", "comunicacao.view", "reputation.view"],
  },
  {
    key: "GUEST",
    label: "Convidado(a)",
    level: 30,
    permissions: ["inicio.view", "vida.view", "reputation.view"],
  },
  {
    key: "VIEWER",
    label: "Observador (leitura)",
    level: 30,
    permissions: ["inicio.view", "vida.view", "tarefas.view", "comunicacao.view", "reputation.view"],
  },
];

export function getBuiltinRole(key: string): BuiltinRoleDefinition | undefined {
  return BUILTIN_ORG_ROLES.find((r) => r.key === key);
}