# RPG-OS — Fiscal Inbox Producer (projeção first-party, sem eventos externos)

> Producer server-side que projeta invoices ISSUED com routing explícito em
> `fiscal_inbox_items`. Sem bus, sem jobs, sem AT/e-Fatura. Data: 2026-09-06.

## 1. Purpose
Transformar `invoice ISSUED + assignment ACTIVE` num item de work queue por
organização, de forma idempotente e tenant-safe.

## 2. Source of truth
A invoice (`invoices`) continua source of truth; o inbox é READ MODEL
(`entity_type=INVOICE`, `entity_id=invoice.id`, sem duplicar estado fiscal).

## 3. Routing dependency
Destino exclusivo do assignment ACTIVE (`invoice_routing_assignments` por
`invoice_id`; 0 = NO_ROUTE; >1 = invariante violada, fail closed). Bridge
só valida legitimidade; nunca determina destino.

## 4. Eligibility
ISSUED → elegível. DRAFT/CANCELLED/PAID/PARTIALLY_PAID/desconhecido →
NOT_ELIGIBLE (FR nasce PAID = já liquidada, sem ação; sem espelho de
pagamentos nesta fase).

## 5. NO_ROUTE semantics
NO_ASSIGNMENT | ASSIGNMENT_REVOKED | NO_COMPANY | INVALID_COMPANY_LINK |
ORGANIZATION_UNAVAILABLE. NO_ROUTE normal (sem routing) não é erro e nunca
bloqueia a emissão.

## 6. Idempotency
`UNIQUE(organization_id, entity_type, entity_id)` (migration
`20260910000000`) + ler-antes + catch 23505→reler→NOOP. Prova controlada no
DB local: duplicado bloqueado, 1 row, rollback sem resíduos.

## 7. Tenant isolation
Invoice→company (server) → assignment (company match) → bridge ACTIVE →
org existe → actor `fiscal.admin` + company==invoice + membership na org.
Service-role só após validação; projeções mínimas; browser nunca decide.

## 8. RLS
SELECT por membership; escrita só service-role; UNIQUE é database-level
(defesa em profundidade além do app).

## 9. Privacy
Copiados: id/número/tipo/valores/datas/url + provider `RPG_OS`. NUNCA:
counterparty_nif, nomes, moradas, payload, AT refs. Audit só IDs + reason.

## 10. Lifecycle / reassignment / revocation
Assignment novo afeta futuras projeções; histórico preservado; revogação
(assignment ou bridge) corta projeções sem apagar itens; pagamento posterior
não atualiza inbox (fora de scope V1, documentado).

## 11. Failure handling
NO_ROUTE/NOT_ELIGIBLE = retorno normal; integridade/DB = throw (chamador na
emissão captura e loga sem corromper a invoice); sem sucesso inventado.

## 12. Non-goals
Sem bus/jobs/cron, sem fan-out, sem Life changes, sem externos, sem NIF,
sem SIBS/SAF-T/Mobility/Health.

## 13. Classification
Infraestrutura inbox: **LIVE — FIRST-PARTY ROUTED INVOICE PROJECTION**
(criação real + routing explícito + leitura server-side verificados).
Integrações externas: PREPARED_ONLY/UNAVAILABLE. AT/e-Fatura: não integrados.
