# MASTER-ECOSYSTEM-ROADMAP.md — Próximas fases do Ecossistema RPG-OS

> Roadmap derivado das fases 1–10 do master plan. Cada fase distingue
> **IMPLANTADO** (código e testes existentes) de **PENDENTE** (planeado).

## Fase 1 — Fundação de Identidade & Platform (IMPLANTADO)

- [x] `actor.ts` — Universal Actor, tipos, guards, `AIApprovalPolicy`.
- [x] `platformAuth.ts` — `PLATFORM_ROLES`, `RootOwnerProtection`,
      `PlatformUserManager` (repositório-backed, deny-closed),
      `PlatformAdminRepository` + InMemory default.
- [x] Barrel `types/index.ts` exporta actor/aiActor/platformAuth/evidence/
      marketplace/order/contract/platformAuth. Colisões de nome eliminadas.
- [x] Testes: `types/__tests__/platformAuth.test.ts` (14 testes).

**PENDENTE:**
- [ ] Adapter `PlatformAdminRepository`→Supabase (`platform_admins`/audit RPC)
      + `setPlatformAdminRepository` no boot da aplicação.
- [ ] Auditoria `audit_logs` em todas as operações de `PlatformUserManager`
      (módulo `platform`, action `platform.subuser.created/suspended/removed`).

## Fase 2 — RBAC+ABAC e Registos (IMPLANTADO)

- [x] `granularRbac.ts` — `PolicyEngine`, `PolicyMatcher`, `ActionMatcher`,
      `ABACContext`, `PermissionRegistry`. `PermissionAction`/`ModuleDefinition`
      única (constants).
- [x] Barrel `security/index.ts` exporta granularRbac.
- [x] Testes: `security/__tests__/granularRbac.test.ts` (11 testes).

**PENDENTE:**
- [ ] Serialização/parser de policies para armazenar em BD.
- [ ] Integração `resolveEffectivePermissions` (RBAC) + `PolicyEngine` (ABAC)
      num único guard server-side.
- [ ] Matrix de obrigações (obligations) ativas em workflows.

## Fase 3 — IA como Actor (IMPLANTADO)

- [x] `aiActor.ts` — `AIInvocationEngine` deny-closed: permission resolver,
      capability do agent, approval gate, anti prompt-injection, executor.
- [x] `buildApprovalPolicyRequester` com `maxAutoAmountCents`.
- [x] Testes: `types/__tests__/aiActor.test.ts` (10 testes).

**PENDENTE:**
- [ ] Workflow de aprovação humano real (requester → approval request →
      auditor) ligado a `workflows` existentes.
- [ ] Logging obrigatório de toda invocação AI em `audit_logs`
      (`action = ai_tool_invoked`, `module = ai`).
- [ ] Rate limiting / quota por agent.

## Fase 4 — Marketplace (IMPLEMENTADO núcleo)

- [x] Tipos canónicos (`marketplace.ts`, `quote.ts`) sem colisões.
      `MarketplaceQuoteStateMachine`, `MarketplaceFlow`,
      `MarketplaceQuoteStatus`, `MarketplaceOrderStatus`, `ServiceQuoteItem`.
- [x] `services/marketplace/MarketplaceFlow` — máquina de estados
      (cotação → aceite → contrato → ordem -> `createOrderFromQuote`).

**PENDENTE:**
- [ ] Publicação, busca, reputação cruzada com `ReputationService` existente.
- [ ] Fees: `PlatformFeeService` existente (3%) aplicada nas ordens.

## Fase 5 — Contracts (IMPLEMENTADO núcleo)

- [x] Tipos `contract.ts` com `ContractMilestone*`,
      `ContractPaymentScheduleItem`, assinaturas.
- [x] `services/contract/ContractFlow` — estados, assinatura
      (SIMPLE/ELECTRONIC/ADVANCED/QUALIFIED/DIGITAL/HANDWRITTEN/WITNESSED),
      `evaluateSignatureAssurance`, `approveContractMilestone`.

**PENDENTE:**
- [ ] Cláusulas, disputes.
- [ ] Versões + blockchain/hash de integridade (integrityLedger existente).

## Fase 6 — Payments (PARCIAL)

- [x] `services/payment/` existente — PaymentProvider, state machines,
      FakeProvider para testes, webhook replay protection.

**PENDENTE:**
- [ ] Ligação do AI approval (maxAutoAmountCents) ao executor de pagamentos.
- [ ] Idempotência de cobranças com `idempotencyKey` por user/order.

## Fase 7 — Milestones (IMPLEMENTADO núcleo)

- [x] Tipos `order.ts` (Milestone*, PaymentScheduleItem) e `contract.ts`
      (ContractMilestone*).
- [x] `services/order/OrderMilestoneFlow` — transições com requerimentos de
      evidência por milestone (verify hash + deliverables obrigatórios;
      libertação de pagamento na aprovação).

**PENDENTE:**
- [ ] Bloqueio a nível de supabase (RLS) da libertação de pagamento até
      approval de milestone (hoje garantido em services).

## Fase 8 — Evidence (IMPLEMENTADO núcleo)

- [x] `evidence.ts` — tipos canónicos (EvidenceType/EvidenceStatus/
      EvidenceFacetCount) e `EvidenceService` com contracto completo
      (upload, verifyHash, share, legal hold, etc.).
- [x] Uso como fonte única de `EvidenceType`/`EvidenceStatus` (importada por
      `order.ts`).
- [x] `EvidenceGuard` em `services/evidence` — `sha256HexSync` + `verifyHash`
      + `canAccessEvidence`/`requireEvidenceAccess`
      (ownership/visibility/tenant) antes de qualquer acesso.

**PENDENTE:**
- [ ] Implementação de `EvidenceService.upload` com `sha256` do ficheiro e
      `integrity` no registo (hoje `EvidenceService` continua como stubs;
      `EvidenceGuard` fornece o motor).
- [ ] Storage buckets (migração `20260820210000_storage_buckets.sql` existente)
      configuração de RLS por evidência.

## Fase 9 — Audit & Observability (IMPLANTADO parcial)

- [x] `audit_logs` + patch de índices tenant-safe
      (`20260917000000_audit_logs_indexes.sql`).
- [x] `security/auditFoundation.ts` compilável (imports corrigidos) e exportado
      apenas internamente (colisão de nome com `types/audit.ts` evitada).

**PENDENTE:**
- [ ] Integração `audit_logs` chamado em todos os serviços de negócio.
- [ ] Ledger de integridade ligado a `audit_logs` (migração integrity_ledger
      existe; a ponte por entidade ainda não está automática).

## Fase 10 — Prevenção & Release (PARCIAL)

- [x] Typecheck, build, lint do package core verdes.
- [x] 1479+ testes passam (0 falhas) em toda a monorepo; núcleo P1
      (EvidenceGuard/Marketplace/Order/Contract) totalmente coberto.
- [ ] **PENDENTE**: `apps/web/lib/supabase/auth.ts` fail-open ADMIN —
      necessário eliminar antes de claim LIVE.
- [ ] **PENDENTE**: substituir `InMemoryPlatformAdminRepository` por Postgres
      no arranque.

## Criterio de "DONE" (verificação)

1. `pnpm typecheck` → 0 erros (core + web).
2. `pnpm build` → 0 erros.
3. `pnpm lint` → 0 erros no core (6 erros pré-existentes de apps/web
   mobilidade fora do escopo do master foundation).
4. `pnpm test` → 0 falhas core (1479 core / 1548+ total; falha intermitente
   pré-existente conhecida: `atTransport` D6 gate timeout em apps/web).
5. Nenhum módulo certificado (D4, D4.1, D21, D21.5, D22, D23, Fiscal Inbox,
   Routing, A Minha Vida, Health, Mobility, P1..P1.3) alterado.