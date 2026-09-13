export type SystemRole =
  | "ADMIN"
  | "COMPANY_ADMIN"
  | "PROJECT_MANAGER"
  | "ENGINEER"
  | "FOREMAN"
  | "WORKER"
  | "CLIENT"
  | "ACCOUNTANT";

export interface RoleDefinition {
  id: SystemRole;
  label: string;
  description: string;
  permissions: string[];
}

export const SYSTEM_ROLES: Record<SystemRole, RoleDefinition> = {
  ADMIN: {
    id: "ADMIN",
    label: "Administrador do Sistema",
    description:
      "Acesso total a todas as funcionalidades, configurações e auditoria.",
    permissions: ["*"],
  },
  COMPANY_ADMIN: {
    id: "COMPANY_ADMIN",
    label: "Administrador da Empresa",
    description:
      "Gestão completa da empresa, equipa, clientes, obras e faturação.",
    permissions: [
      "company:manage",
      "employees:manage",
      "clients:manage",
      "projects:manage",
      "quotes:manage",
      "invoices:manage",
      "documents:manage",
      "audit:read",
      "reputation.view",
      "reputation.create",
      "reputation.respond",
      "reputation.manage",
      "reputation.moderate",
      "reputation.admin",
    ],
  },
  PROJECT_MANAGER: {
    id: "PROJECT_MANAGER",
    label: "Diretor de Obra / Gestor",
    description: "Gestão operacional de obras, equipas, tarefas e orçamentos.",
    permissions: [
      "clients:read",
      "projects:manage",
      "tasks:manage",
      "quotes:manage",
      "documents:manage",
      "reputation.view",
      "reputation.create",
      "reputation.respond",
      "reputation.manage",
    ],
  },
  ENGINEER: {
    id: "ENGINEER",
    label: "Engenheiro Técnico",
    description:
      "Planeamento técnico, medições, relatórios e acompanhamento de obras.",
    permissions: [
      "projects:read",
      "projects:update",
      "tasks:manage",
      "documents:create",
      "quotes:read",
      "reputation.view",
      "reputation.create",
    ],
  },
  FOREMAN: {
    id: "FOREMAN",
    label: "Encarregado de Obra",
    description:
      "Gestão diária no terreno, registo de tarefas, materiais e presenças.",
    permissions: [
      "projects:read",
      "tasks:update",
      "materials:request",
      "photos:upload",
      "reputation.view",
      "reputation.create",
    ],
  },
  WORKER: {
    id: "WORKER",
    label: "Trabalhador / Profissional",
    description:
      "Visualização das tarefas atribuídas e registo de horas/trabalho.",
    permissions: ["tasks:read", "tasks:update_status", "timesheet:create", "reputation.view"],
  },
  CLIENT: {
    id: "CLIENT",
    label: "Cliente",
    description:
      "Acompanhamento das suas obras, orçamentos, faturas e documentos.",
    permissions: [
      "client_portal:read",
      "quotes:accept_reject",
      "invoices:read",
      "projects:view_progress",
      "reputation.view",
      "reputation.create",
      "reputation.respond",
    ],
  },
  ACCOUNTANT: {
    id: "ACCOUNTANT",
    label: "Contabilista / Financeiro",
    description:
      "Acesso à faturação, recibos, SAF-T, relatórios de IVA e pagamentos.",
    permissions: [
      "invoices:manage",
      "payments:manage",
      "saft:export",
      "reports:financial",
      "reputation.view",
    ],
  },
};
