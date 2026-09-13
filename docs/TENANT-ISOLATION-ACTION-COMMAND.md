# RPG-OS — Tenant Isolation: Action Center + Command Center (HIGH fix)

## Problema original

`lib/actionCenter.ts` (3 queries) e `lib/commandCenter.ts` (3 queries)
filtravam `company_id` (eixo company/Fiscal-Finance) com `organization.id`
(eixo RBAC) — UUIDs de tabelas diferentes. Efeito: linhas da empresa
invisíveis na home (fail-closed acidental); risco teórico cross-tenant só por
colisão UUID. Causa raiz: `SessionContext` não tem `companyId`; o código usou
o único UUID disponível.

## Tenant correto por entidade (schema real)

| Tabela | Coluna tenant | Contexto |
|---|---|---|
| tasks | `assignee_id` (user) | `ctx.user.id` |
| workflow_instances (fila pessoal) | `approver_id` (user); tem `organization_id` mas a atribuição é pessoal | `ctx.user.id` |
| notifications, calendar_events | `user_id` | `ctx.user.id` |
| finance_bills, bank_accounts | `company_id` + `user_id` | company do perfil + sessão |
| documents | `company_id` + `owner_user_id` | company do perfil + sessão |
| reputation_reviews, workflow_instances (KPIs org) | `organization_id` | org ativa (inalterado) |

## Correção

- Novo helper puro `companyUserOrFilter` (`core/security/tenantScope.ts`,
  testado): constrói o `.or()` com as colunas certas; `null` sem companyId.
- Ambas as funções aceitam `companyId?: string | null` (de `getCurrentUser()`,
  nunca do browser); sem ele, só dados do próprio utilizador.
- `app/page.tsx` resolve `companyId` e passa às duas funções.
- Sem bridge Company↔Organization, sem migration, sem heurística.

## Fail-closed

Sem `companyId` → `.eq(user_id/owner_user_id)`; sem sessão → página de
apresentação (inalterado). Nenhuma query global.

## Testes

`core/security/__tests__/tenantScope.test.ts`: isolamento A/B, sem mistura
company/org, `null` sem company, colisão UUID (colunas mandam), coluna
alternativa `owner_user_id`.

## Relação futura

Bridge Company ↔ Organization continua NÃO implementada (ver
`docs/COMPANY-ORGANIZATION-ARCHITECTURE.md`).
