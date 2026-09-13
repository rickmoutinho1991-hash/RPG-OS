# RPG-OS — Fiscal Routing Context Audit (AUDIT, sem implementação)

> Pergunta: existe informação suficiente numa invoice para determinar
> inequivocamente a Organization do Fiscal Inbox? Resposta: **NÃO**.
> Veredicto: `BLOCKED BY TECHNICAL GAP`. Data: 2026-09-06.

## 1. Executive Summary
Nenhum campo, relação ou contexto atual identifica a organização destino de
forma explícita, determinística, persistente e actor-independent. Falta um
**routing context por documento**. Nada foi implementado; nada foi alterado
exceto este documento + 1 teste de regra pura.

## 2. Current Invoice Context
Único caminho de criação: `createInvoiceAction` (`faturacao/actions.ts:287`),
server-side, `company_id = user.companyId || null`, `client_id` (=users.id),
status ISSUED (FR nasce PAID); pagamentos → PAID/PARTIALLY_PAID; sem delete,
sem import, sem API externa. Campos na emissão: number, type, status,
client, company, items, ATCUD/QR/hash, totais, notes. **Nenhum campo de
organização, destino, provider-account ou routing.** Nota: existe ainda
`company_employees(company_id,user_id)` (eixo company alternativo), mas
também sem qualquer vínculo a organizations — não altera a conclusão.

## 3. Organization Context
Sessão (`session.organization`, cookie/primária/primeira) e `is_primary`
por `(user, org)` — ambos **do actor, não do documento**. Rejeitados como
routing (§6): fariam a mesma invoice routear diferente por utilizador.

## 4. Candidate Routing Sources
- `company_organizations`: associação administrativa, sem semântica de
  destino por documento — rejeitada como authority.
- `client_id` → `users.id`: sem tabela clients; sem vínculo org/company —
  rejeitado.
- `project`/`quote` (`client_id`/`company_id`, sem org) — rejeitados.
- `documents` (`owner_user_id`/`company_id`, sem org) — ownership ≠ routing.
- `government_connections` (org+provider): sem vínculo a invoices/companies
  — sem cadeia até ao documento.
- `metadata`/import/provider: inexistentes na invoice.
- Bridge com campo extra de routing: não existe (e criá-lo seria schema novo,
  fora de scope).

## 5. Primary Organization Rejection
`is_primary` ∈ `org_memberships(user, org)`, usado só em `session.ts:55` e
lido em `workflows.ts`. Cenário: X primary A, Y primary B, mesma invoice →
destinos distintos. Indeterminístico + sem base fiscal. **Proibido.**

## 6. Company↔Organization Rejection as Routing Authority
Confirmado contra código + DB local: bridge = "X associada a Y". Vincular não
é autorizar cada documento. Multi-org com fan-out exigiria prova por fatura.

## 7. Multi-Organization Analysis
A (1 org): sem prova por fatura → NO ROUTE. B (sessão diz A): actor-dependent
→ NO ROUTE. C (Y processa): mudaria destino → prova de invalidez. D (A ACTIVE,
B REVOKED): destino "óbvio" continua sem base formal → NO ROUTE. E (0 orgs):
NO ROUTE. F (integração futura): a origem (conta fiscal/provider) teria de
trazer o destino — hoje inexistente.

## 8. Security
Cadeia exigida (sessão→company→vínculos→regra→membership→upsert) interrompida
na "regra": sem contexto, parar. Browser nunca decide (guarda
`resolveFiscalRoutingTargets` nem aceita input de actor/org).

## 9. Privacy
Qualquer routing hoje vazaria existência/contraparte/NIF/montantes/datas a
orgs sem direito provado. NO ROUTE = zero leakage por construção.

## 10. Determinism
Só inputs persistentes do documento + vínculos formais. Sessão/primary/
processador excluídos (teste 11: dois actores, mesmo resultado).

## 11. Actor Independence
Demonstrado em teste: a decisão não recebe actor, sessão ou primary.

## 12. Idempotency
Recomendação mantida: `UNIQUE(organization_id, entity_type, entity_id)` em
futura migration. Sem constraint atual conflituante (só PK + indexes por org
na tabela — que aliás **não existe neste DB local**: `fiscal_inbox_items`
ausente; loader degrada por partial failure, consistente com PREPARED_ONLY).

## 13. Routing Context Definition
Para existir, um campo/relação teria de: (1) pertencer ao documento/origem;
(2) ser actor-independent; (3) determinístico; (4) persistente; (5) auditável;
(6) autorizado server-side; (7) não-arbitrário ao browser; (8) validar tenant;
(9) suportar revogação; (10) sem heurística. **Nada atual cumpre os 10.**

## 14. Current Gap
Falta: **routing context por documento** — ex. destino explícito atribuído na
origem (criação/import/provider-account) validado contra vínculos ACTIVE.
Sem escolher campo/migration (decisão de negócio + schema pendentes).

## 15. Future Conceptual Contract
`INVOICE → EXPLICIT ROUTING CONTEXT → VALIDATE COMPANY → VALIDATE ACTIVE LINK
→ VERIFY MEMBERSHIP → IDEMPOTENT UPSERT → INBOX` (detalhe em
`FISCAL-INBOX-ROUTING-DECISION.md` §16).

## 16. Explicit Non-Goals
Sem producer/inserts/bus/primary/NIF-matching/sessão-destino/Life changes/
AT/E-Fatura/Mobility/Health/SIBS/SAF-T.

## 17. Recommendation
**`BLOCKED BY TECHNICAL GAP`** — gap: routing context por documento
(§14). Não é decisão de negócio em falta (o critério é técnico e claro);
é peça de modelo inexistente.
