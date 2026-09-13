# RPG-OS — Company ↔ Organization Implementation

> Bridge formal implementada. Sem producer fiscal. Inbox mantém PREPARED_ONLY.
> Ver design em `docs/COMPANY-ORGANIZATION-DESIGN.md`.

## Schema real

`supabase/migrations/20260908000000_company_organizations.sql` →
`public.company_organizations(id, company_id→companies RESTRICT,
organization_id→organizations RESTRICT, status ACTIVE|REVOKED CHECK,
created_by NOT NULL→users, confirmed/revoked_at/by SET NULL,
UNIQUE(company_id, organization_id), 2 indexes direcionais, RLS enabled +
policy SELECT por membership + GRANT service-role)`. Verificado no banco
local via `\d` (tabela, PK, UNIQUE, indexes, CHECK, 5 FKs, policy).

## Cardinalidade

N↔N suportada; UNIQUE só no par. Sem regra de organização primária.

## Authorization model

`fiscal.admin` para ler/criar/revogar (UI + actions). Sem permissions novas.

## RLS model

SELECT por membership ACTIVE; escrita só service-role via actions.

## Server actions

`app/administracao/empresas/actions.ts`: `getActorCompany` (só a do perfil),
`listCompanyLinks` (orgs da sessão), `linkCompanyOrganization`
(existência + `decideCompanyOrgLink` + create/reactivate + audit),
`revokeCompanyLink` (ACTIVE→REVOKED + audit). Client nunca é autoridade.

## Audit trail

`company.organization.linked` (com `reactivated:true` quando aplicável) e
`company.organization.revoked`, só IDs + resultado, via `recordAuditEvent`
(com hash encadeado existente).

## UI

`/administracao/empresas` (nav + permissão `fiscal.admin`): empresa do actor,
seletor só de orgs com membership, confirmação explícita antes de criar,
lista com estado/autor-data, revogar. Texto deixa claro que é declaração de
associação, não fusão de entidades.

## Limitations

Sem producer (propositado); sem backfill; N-org routing por decidir;
`getActorCompany` limitada ao perfil (sem admin-global de companies).

## Future producer

`invoice → company → company_organizations ACTIVE → org(s) → futuro producer`
com idempotência `(INVOICE, invoice_id, org)`; 0 orgs = sem item; N orgs =
política por decidir.

## Fiscal / Vida impact

Inbox: PREPARED_ONLY (sem produtor). Vida: NO CHANGES.
