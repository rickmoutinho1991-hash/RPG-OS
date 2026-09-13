# RPG-OS — Fiscal Routing + Inbox Certification (auditoria independente)

> Verificação direta de código, migrations, DB local e testes. Zero alterações.
> Data: 2026-09-06.

## Scope / baseline
Caminho `createInvoiceAction → produceFiscalInboxForInvoice →
fiscal_inbox_items → FiscalLifeCollector → /vida`. Baseline 75/75, 1243/1243.

## Architecture / end-to-end chain
Verificada transição a transição: emissão persiste invoice (ISSUED/PAID);
producer lê invoice mínima → eligibility → assignment ACTIVE única →
company match → bridge ACTIVE → org existe → fiscal.admin + company +
membership → payload mínimo → select-then-insert com catch 23505 → audit só
em CREATED. Chamada na emissão em try/catch isolado (invoice nunca falha por
projeção).

## Routing authority / eligibility / validations
Destino só de `invoice_routing_assignments`; bridge só valida; sem sessão,
primary, fan-out, NIF/nome/email/UUID (grep negativo limpo no código novo).
Só ISSUED; resto NOT_ELIGIBLE; sem company → NO_ROUTE.

## Tenant isolation
Matriz provada por `decideInvoiceRouting` + `decideCompanyOrgLink` + RLS:
A→A/ACTIVE/ACTIVE = único CREATE; restantes 6 casos REJECT/NO_ROUTE. Browser
só envia `{invoiceId, organizationId}` como intenção.

## Service-role review
Producer: 8 selects + 1 insert, todos com `.eq(id/company/org)` explícitos
após validações. Assignment actions: idem. Nenhuma query global.

## RLS
As 3 tabelas com RLS enabled; SELECT por membership; escrita só service-role;
anon sem INSERT. Verificado em `pg_class`/`pg_policies`.

## Idempotency / concurrency
`uq_fiscal_inbox_entity_org` existe no DB; prova transacional: 2 projeções →
1 row; rollback sem resíduos. Races: UNIQUE resolve; reassignment concorrente
limitada a updates condicionais por estado (janela teórica sem cross-tenant).

## Transaction boundaries
Invoice e projeção em transações separadas (projeção idempotente, sem
"exactly once" afirmado).

## Reassignment / revocation
Reassign revoga anterior + cria nova (UNIQUE impede duplicado); revoke corta
futuro; histórico preservado em ambos.

## Payload / PII / audit
Copiados: id, número, tipo, valores, datas, url, provider RPG_OS. Sem NIF,
nomes, moradas, AT refs (grep). Audit `fiscal.inbox.projected` só IDs; sem
spam de NO_ROUTE.

## Life integration
Collector lê inbox UNREAD+dueDate → `tax_deadline`/`document_received`,
`sourceEntityId` = inbox id, `view`, sem NIF. Zero alterações Life.

## Externals / DB verification
Zero chamadas externas. Tabelas, PKs, FKs (RESTRICT entidades), CHECKs,
UNIQUE (par bridge + parcial assignments + inbox entity/org), indexes, RLS,
policies e grants confirmados no DB. `invoice_status` = 5 valores reais.

## Tests / gates
75/75 suites, 1243/1243 tests; core+web typecheck PASS; lint PASS (só
pre-existing mobilidade); build PASS com rotas fiscais e `/vida`.

## Limitations
Orquestração TS sem E2E automatizado (sem harness de sessão); prova DB por
transação + unit tests. RLS por impersonation não testada (policies lidas).

## Findings
HIGH: nenhum. MEDIUM: nenhum. LOW: nenhum novo. INFO: history mismatch
(pré-existente); FRs nunca projetam (decisão); `select-then-insert` tem
janela coberta pela UNIQUE.
