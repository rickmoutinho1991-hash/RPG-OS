# RPG-OS — Fiscal Routing Context SPEC (definição, sem implementação)

> Contrato semântico para o futuro Routing Context. Nada implementado;
> nenhuma migration; nenhum producer. Data: 2026-09-06.

## 1. Purpose
Definir o que deve acompanhar uma invoice para determinar inequivocamente a
Organization do Fiscal Inbox — antes de qualquer código.

## 2. Current Gap
Invoice nasce com actor + `company_id` do perfil + `client_id`, sem qualquer
campo/entidade de destino organizacional. Verificação exaustiva (§5): nenhuma
origem atual satisfaz os 10 requisitos (§4).

## 3. Definition of Routing Context
Atribuição explícita, persistida e auditada que responde: WHO (org destino),
WHY (decisão legítima de actor autorizado), WHEN/WHO (timestamp + actor),
FROM WHICH SOURCE (criação/import/provider/assignment explícita), IS IT STILL
VALID (vínculo ACTIVE + assignment não revogada).

## 4. Required Properties
1 documento-specific; 2 actor-independent; 3 determinístico; 4 persistente;
5 auditável; 6 authoritative (decisão, não inferência); 7 tenant-safe
(validável contra `company_organizations`); 8 revogável; 9 non-heuristic;
10 server-authoritative.

## 5. Candidate Sources
- Criação (`createInvoiceAction`): tem actor+company, sem destino — insuficiente hoje.
- Project/quote/document: sem coluna org — insuficientes.
- Provider account (`government_connections` org+provider): sem vínculo a company/invoice — insuficiente hoje, válida como origem futura se ligar conta fiscal ↔ company.
- Transaction/request: efémero, actor-dependent — insuficiente.
- Bridge sozinha: associação, não destino — insuficiente.

## 6. Rejected Sources
Sessão/org ativa, `is_primary`, actor, primeira org, NIF/nome/email/UUID
matching, fan-out implícito, cookie, client-provided IDs. Cada um falha ≥1
requisito (provas em `FISCAL-ROUTING-CONTEXT-AUDIT.md` + testes
`fiscalRouting.test.ts`).

## 7. Recommended Source
**Explicit document-level routing assignment** (nova atribuição por fatura,
Futura): exatamente uma organização por assignment, criada por actor
`fiscal.admin` (ou papel a decidir, §20), validada contra vínculo ACTIVE,
persistida, auditada, revogável. Alternativa futura válida: provider-account
→ organization, quando existir conta fiscal real ligada à company.

## 8. Assignment Semantics
`ASSIGNED(org, actor, timestamp, source)`; estados UNASSIGNED/ASSIGNED/
REVOKED/INVALID distintos de invoice-status e inbox-status. Reassignment:
permitida só por actor autorizado, com confirmação, histórico preservado
(assignment anterior REVOKED, nunca apagada); duplicados proibidos pela
idempotência (§15).

## 9. Authorization
`fiscal.admin` (existente; sem permissions novas): actor ∈ sessão; company =
perfil do actor (ou company sob sua administração — a definir); org ∈
memberships ACTIVE; vínculo ACTIVE obrigatório.

## 10. Company Validation
`company_id` sempre do perfil/contexto server-side; nunca substituído pelo
client durante routing (regra herdada da criação).

## 11. Organization Validation
Existe + vínculo ACTIVE + actor autorizado (membership); sem estas três,
NO ROUTE.

## 12. Multi-Organization
ZERO destinos (padrão) | EXATAMENTE UM (assignment explícita) | MÚLTIPLOS
só por assignments explícitas múltiplas (nunca por fan-out da bridge).

## 13. Revocation
Vínculo REVOKED → futuras atribuições/routing falham; histórico e inbox
existente preservados (visibilidade segue scope vigente).

## 14. Reassignment
Permitida nos termos do §8; cada mudança é novo facto auditado; inbox
existente não é reescrito (reconciliação futura decide).

## 15. Idempotency
`UNIQUE(organization_id, entity_type, entity_id)` (futura) + upsert; chave
construída estilo `generateIdempotencyKey(org, invoice, evento)`.

## 16. Privacy
Assignment limita exposição: só a org destino recebe; associação da bridge
não autoriza leitura; NIF/payload fora de inbox desnecessário e de audit.

## 17. Audit
`routing.assigned` / `routing.revoked` / `routing.reassigned` (futuros):
actor, invoice, company, org, timestamp, resultado; sem NIF/payload; via
`recordAuditEvent`.

## 18. Future Producer Contract
`INVOICE → LOAD ASSIGNMENT (ausente→NO ROUTE) → VALIDATE COMPANY → VALIDATE
ACTIVE LINK → VERIFY AUTHORITY → IDEMPOTENT UPSERT → INBOX`. Nunca
`find-all-links → insert-all`.

## 19. Future Schema Requirements
Mecanismo de assignment (tabela dedicada ou campo com lifecycle — decisão de
implementação futura) + UNIQUE idempotência + RLS por membership. Nomes
exactos pendentes da fase de implementação.

## 20. Business Decisions Required
A) routing por invoice (recomendado) vs B) por documento/origem vs C) por
provider-account vs D) outro. Marcar: **BUSINESS DECISION REQUIRED** para A–D
(viabilidade técnica de A demonstrada; escolha de produto em aberto).

## 21. Non-Goals
Sem producer/migration/schema/bus/primary/sessão/heurísticas/Life changes/
integrações externas.
## 22. Security Invariants

Browser pede, servidor decide; actor/company/org sempre da sessão+vínculos;
revogação corta futuro, nunca apaga passado; sem item > item errado.

## 23. Implementation Status

Implementado (sem producer): tabela `invoice_routing_assignments`
(migration `20260909000000`, verificada no banco local); actions
`assignInvoiceRouting`/`revokeInvoiceRouting` +
`getInvoiceRouting`/`listRoutableOrganizations` em
`app/faturacao/[id]/actions.ts`; decisão pura `decideInvoiceRouting`
(`core/security/invoiceRouting.ts`, testada); UI mínima em
`faturacao/[id]` com confirmação explícita; audit `routing.assigned`/
`routing.reassigned`/`routing.revoked`; RLS member-read + service-role.
Detalhe em `docs/FISCAL-ROUTING-IMPLEMENTATION.md`.
