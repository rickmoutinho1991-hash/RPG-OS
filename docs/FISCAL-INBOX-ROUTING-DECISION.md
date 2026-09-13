# RPG-OS — Fiscal Inbox Routing Decision (AUDIT, sem implementação)

> Decisão: **NO ROUTE** até existir contexto explícito de routing por
> documento. Nada foi implementado além de um helper puro de guarda.
> Data: 2026-09-06.

## 1. Context
Bridge `company_organizations` existe (N↔N, auditada) mas é associação
administrativa, não autorização de routing. Invoice nasce com `company_id`
do perfil do criador, sem contexto de organização.

## 2. Current Data Model
`invoices(client_id, company_id NULL, status DRAFT/ISSUED/PAID/PARTIALLY_PAID/
CANCELLED, sem delete path, sem import)`; `fiscal_inbox_items(organization_id
NOT NULL, entity_type/entity_id sem FK, provider livre, status 6 valores)`;
bridge com `status ACTIVE|REVOKED` + UNIQUE(par).

## 3. Current Company↔Organization semantics
Vínculo = "empresa X associada à org Y" (acto administrativo auditado).
NÃO significa "invoices de X pertencem a Y".

## 4. Current Invoice semantics
Evento real: `createInvoiceAction` (ISSUED; FR nasce PAID) + pagamentos →
PAID/PARTIALLY_PAID. Sem evento de domínio, sem fila, sem bus (confirmado:
só Maps in-memory em providers; `generateIdempotencyKey(org,inv,action,
attempt)` existe em `revenue/taxAuthority` como padrão reutilizável).

## 5. Current Fiscal Inbox semantics
READ MODEL / WORK QUEUE; entidade original é source of truth; sem duplicação.

## 6. Primary organization analysis
`is_primary` é **por (user, org)**, usado só como fallback de seleção de
sessão (`session.ts:55`) e lido em `workflows.ts`. Varia por utilizador: usar
para routing faria a mesma invoice routear diferente conforme quem processa.
**PROIBIDO para routing fiscal.**

## 7. Multi-organization analysis
Cenários 1–7: 0 orgs → sem item; 1 org → sem item (associação ≠ prova);
N orgs → sem fan-out (privacidade: existência/contraparte/montantes/NIF
vazariam para orgs sem direito); REVOKED ignorado; membership perdida =
linha se torna invisível por RLS/scope (mantém-se, histórico); actor em
org A não autoriza org B; contexto do processador nunca autoriza destino.

## 8. Privacy analysis
Fan-out ALL exporia a orgs meramente associadas: existência da invoice,
contraparte + NIF, montantes, datas, documentos. Rejeitado sem decisão de
negócio explícita + base legal.

## 9. Security model
Futuro producer deriva tudo da source: sessão do actor do evento →
company da source → vínculos ACTIVE → regra explícita → membership →
upsert idempotente. Nunca IDs do browser.

## 10. Idempotency model
Chave natural: `(organization_id, entity_type, entity_id)` (+ tipo de evento
se um par gerar vários itens). Exige UNIQUE nova (futura migration) +
upsert transacional; `generateIdempotencyKey` como padrão de construção.

## 11. Lifecycle analysis
Invoice criada → (futuro) item UNREAD; update → sem auto-update (decisão
futura); anulada → item permanece com estado (histórico; reconciliação
futura); link/membership revogado → item existente mantém-se visível só a
quem ainda tem acesso (scope), nunca apagado.

## 12. Options
A (ALL): simples, mas vaza privacidade e duplica filas. B (PRIMARY):
indeterminístico e semanticamente errado. C (EXPLICIT): correto, mas exige
schema (campo routing na invoice ou vínculo com flag) + UX ainda inexistentes.
D (NO ROUTE): seguro hoje. E: nenhuma alternativa superior encontrada.

## 13. Comparison matrix

| Critério | ALL | PRIMARY | EXPLICIT | NO ROUTE |
|---|---|---|---|---|
| Segurança | FAIL (leak) | FAIL (indet.) | PASS c/ schema | PASS |
| Privacidade | FAIL | FAIL | PASS c/ regra | PASS |
| Multi-org | duplica | arbitrário | definido | sem efeito |
| Determinismo | sim | **não** | sim | sim |
| Auditabilidade | parcial | não | total | total |
| Idempotência | exige UNIQUE | exige UNIQUE | exige UNIQUE | N/A |
| UX | ruído | surpresa | clara | sem itens |
| Complexidade | baixa | baixa | média | nula |
| Compatibilidade | imediata | imediata | exige schema | imediata |
| Risco futuro | alto | alto | baixo | nulo |

## 14. Decision

**FINAL RECOMMENDATION: NO ROUTE (opção D)** — com EXPLICIT (C) como único
caminho futuro aceitável, dependente de contexto de routing por documento
(pendente de decisão de negócio + schema). Codificado em
`security/fiscalRouting.ts` (guarda pura, testada) para reutilização futura.

## 15. Rationale
Associação ≠ autorização; primary é preferência de sessão; fan-out vaza PII;
segurança absoluta (sem item > item no tenant errado) manda não routear.

## 16. Future producer contract
`SOURCE INVOICE → DERIVE COMPANY → LOAD ACTIVE LINKS → APPLY EXPLICIT RULE
(ausente → stop) → VERIFY MEMBERSHIP → IDEMPOTENT UPSERT → INBOX`. 0 orgs →
nada; 1 org → nada (até regra); N orgs → nada (até regra).

## 17. Explicit non-goals
Sem producer, inserts, bus, primary fiscal, NIF-matching, cookie-routing,
Life changes, integrações.

## 18. Risks
Pressão futura para "ligar" com ALL (mitigação: este documento + guarda em
código); vínculo interpretado como ownership (mitigação: texto UI + docs).

## 19. Preconditions for LIVE
Regra explícita de routing + UNIQUE(entity,org) + producer + testes +
`is_primary` intocado.

## 20. Rollback considerations
Nada para reverter (sem comportamento alterado); remover o helper não afeta
produção.
