# RPG-OS — Fiscal Routing Implementation (assignment, sem producer)

> Routing Context implementado. Producer: NÃO implementado. Inbox: PREPARED_ONLY.
> Data: 2026-09-06.

## 1. Architecture
`invoice → assignment explícito → organization`, validado server-side contra
vínculo ACTIVE. Camada anterior ao inbox; Life não a conhece.

## 2. Data model
`invoice_routing_assignments(id, invoice_id→invoices RESTRICT,
company_id→companies RESTRICT, organization_id→organizations RESTRICT,
status ASSIGNED|REVOKED CHECK, created_by NOT NULL, revoked/confirmed audit
fields, updated_at; UNIQUE parcial (invoice_id) WHERE ASSIGNED; 3 indexes)`.
Sem assignment = UNASSIGNED = NO ROUTE.

## 3. Assignment lifecycle
create → (reassign: revoga anterior + cria nova) → revoke → histórico.
Duplicado impossível (UNIQUE + noop). Reassign para outra org permitido como
nova atribuição explícita auditada.

## 4. Authorization
`fiscal.admin` (existente) em todas as actions + UI; actor da sessão.

## 5. Tenant isolation
Company deriva da invoice; org pedida validada em memberships + vínculo;
company do actor == company da invoice; sem company => NO_ROUTE. Sem IDs do
browser como autoridade.

## 6. Audit
`routing.assigned` / `routing.reassigned` / `routing.revoked` via
`recordAuditEvent` (só IDs + invoiceId em metadata sanitizada).

## 7. Idempotency
UNIQUE parcial + noop-assigned + updates condicionais
(`.eq(status, ...)`); reassign nunca duplica.

## 8. Reassignment
Permitida e auditada; anterior REVOKED preservada.

## 9. Revocation
Assignment e vínculo: REVOKED corta futuro, preserva passado; inbox
inexistente nesta fase, nada a cascatear.

## 10. Security invariants
Browser pede `{invoiceId, organizationId}`; servidor deriva e valida tudo;
service-role só após autorização; sem fan-out/primary/sessão/heurística.

## 11. Testing
`core/security/__tests__/invoiceRouting.test.ts`: 14 testes (auth ×4,
tenant ×5, assignment ×4, determinismo/privacy ×2). Server actions sem
harness web: validadas por typecheck + inspeção de scope (limitação
documentada).

## 12. Producer boundary
Termina em assignment persistido + audit. Nenhum caminho cria
`fiscal_inbox_items` (grep verificável); Life/collector intocados.

## 13. Explicit non-goals
Sem producer/jobs/bus/fan-out/primary/session-routing/AT/E-Fatura/OAuth/
SIBS/Mobility/Health/SAF-T; sem alterações a Vida/collector/inbox.
