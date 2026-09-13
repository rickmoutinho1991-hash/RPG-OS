# Modelo Fiscal Pessoal — Pessoa Singular (RPG-OS)

> Formalização do suporte fiscal pessoal existente. Sem segredos reais.
> AT empresarial permanece company-only e intocado.

## 1. Pessoa singular usa user_id como tenant

`auth.user.id` (sessão server-side) é a única autoridade para dados fiscais
pessoais. Ex.: `fiscal_obligations` com `company_id = NULL` + `user_id` do
actor; módulos banco/documentos/diário com padrão `company_id OR user_id`.

## 2. NIF pessoal vem de profiles.tax_number

Escrito no registo (individual/ENI/empresa/cliente) com validação
`isValidPortugueseNif` + unicidade; lido server-side (`getCurrentUser`,
`credentialResolver` para NIF de cliente). RLS: próprio perfil.

## 3. Empresa usa company_id

`profiles.company_id → companies.id → companies.tax_number`. Fonte oficial
da identidade fiscal empresarial.

## 4. company_id não é requisito universal

Obrigatório só para: `at_connection`, `at_submission`, `fiscal_inbox`
(ver `requiresCompany()` em `packages/core/src/security/personalFiscal.ts`).

## 5. AT empresarial continua company-only

`at_connections.company_id NOT NULL`, NIF de `companies.tax_number`, Vault
com scope por company, WFA+mTLS. `NO_COMPANY` sem empresa é correto.

## 6. e-Fatura pessoal continua sem integração oficial

Portal-only; nenhuma API de terceiros. Cálculos locais nunca apresentados
como integração/submissão AT.

## 7. FiscalSubject não é persistido nesta fase

Conceito só em tipos (`GovernmentIdentityType`: INDIVIDUAL, COMPANY,
SOLE_TRADER…). Sem tabela, sem coluna nova.

## 8. "coleta individual" não é entidade

0 ocorrências no sistema; refere-se a tributação individual em IRS, não a
identidade.

## 9. Sole trader é pessoa singular com atividade

`profiles.sector = SOLE_TRADER` (registo individual), categoria de cálculo
`SOLE_TRADER_RECIBOS_VERDES`. Não é automaticamente company.

## 10. NIF nunca é tenant key

Tenant pessoal = user_id. NIF nunca substitui boundary, nunca sai em
LifeItems/auditoria genérica sem necessidade (ver `sanitizeAuditMetadata`).

## 11. Browser nunca é autoridade fiscal

Nem user_id, nem company_id, nem tax_number vindos do cliente decidem
scope fiscal. Sessão + profile server-side decidem.

## 12. Service-role apenas depois de autorização + scope

`createAdminClient()` sempre após sessão/permissão e com filtros
user_id/company_id do actor.
