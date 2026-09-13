# Workflows

O motor usa `workflow_definitions`, `workflow_steps`, `workflow_transitions` e `workflow_instances`. Definições são versionadas por organização e entidade; passos guardam configuração JSON e transições podem exigir permissões.

A execução de ações deve ser implementada por workers/server actions idempotentes, sempre passando pelo mesmo RBAC da operação direta. As tabelas e RLS já estão preparadas para triggers `created`, `updated`, `approved`, `rejected`, `due`, `overdue` e `status_changed`.

## Centro de Aprovações (`/aprovacoes`)

- Registo de pedidos em `workflow_instances` com `title`, `summary`, `metadata`, `requested_by` e `approver_id`.
- `lib/workflows.ts` expõe `startApproval` (idempotente, cria o `workflow_instances`, notifica o aprovador e audita) e `getWorkflowOverview`/`resolveCompanyReviewer`.
- As regras de autorização de decisão/cancelamento vivem em `@rpg/core` (workflowService): apenas o aprovador designado decide; o requerente cancela enquanto PENDING.
- RLS permite decisão apenas pelo aprovador (`wf_approver_decide`) e cancelamento pelo requerente (`wf_requester_cancel`).
- Fluxos reais ligados hoje: verificação documental (`documentos`) e despesas (`banco`, despesas submetidas para aprovação).

## Definições de Workflow (`/administracao/automacoes`)

- UI de criação/listagem de definições em `workflow_definitions` com passos (`workflow_steps`) e transições (`workflow_transitions`), por tipo de entidade.
- Validação pura em `@rpg/core` (`workflowConfig.ts`): keys únicas não vazias, `entity_type` conhecido, ≥1 passo, transições a referenciar passos existentes e distintos.
- Autorização server-side com `workflows.manage` (Server Actions e Route Handler `/api/admin/workflow-definitions`); RLS restringe escrita a `has_org_permission(..., 'workflows.manage')`.
- Cada criação é registada em `audit_logs` (`WORKFLOW_DEFINITION_CREATED`).
