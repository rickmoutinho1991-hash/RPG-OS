# MASTER-ECOSYSTEM-ARCHITECTURE.md — Fundação do Ecossistema RPG-OS

> Documento vivo. Descreve **código real** existente em `packages/core` e
> `supabase/migrations`. Não descreve intenções não implementadas.

## 1. Princípios de autoridade (server-authoritative)

1. **O cliente nunca decide** `organizationId`, `companyId`, `tenantId`,
   permissões ou ownership. Tudo é resolvido server-side a partir da sessão.
2. **Nunca confiar no navegador para autorização.** Autorização é sempre
   re-validada no servidor (RBAC + RLS + guards em services).
3. **ROOT_OWNER é único e imutável.** Não pode ser criado, promovido, suspenso
   ou removido por nenhum outro actor — nem por si próprio.
4. **Moeda é sempre inteiro (cents).** `amountCents`, `unitPriceCents`,
   `maxAutoAmountCents`, etc. Nunca floats.
5. **Negar por omissão (deny-closed).** Duas exceções históricas ficam
   documentadas em SECURITY.md e NÃO são usadas como padrão:

## 2. Universal Actor & Identity (`packages/core/src/types/actor.ts`)

- `ActorType`: `HUMAN | ORGANIZATION | AI_AGENT | SYSTEM | EXTERNAL_SERVICE`.
- `UniversalActor` = identidade base; `HumanActor`, `OrganizationActor`,
  `AIActor`, `SystemActor`, `ExternalServiceActor` estendem-na.
- **Identidade ≠ Role ≠ Permissão ≠ Capability ≠ Tenant** — separação estrita.
- Guards `isHumanActor`, `isOrganizationActor`, `isAIActor`, `isSystemActor`,
  `isExternalServiceActor`.
- `AIApprovalPolicy` (actor.ts) = política única de aprovação de agentes AI
  (reutilizada por `types/aiActor.ts` — sem duplicação).

## 3. Platform Root Owner & Admin (`packages/core/src/types/platformAuth.ts`)

- `PLATFORM_ROLES` — 11 papéis (root, admin, manager, accountant, lawyer,
  finance, support, moderator, operations, technical, auditor), cada um com
  `level`, `permissions`, `capabilities`, `canManageRoles`,
  `maxAssignableLevel`, `canCreateSubUsers`.
- `RootOwnerProtection` — singleton de identidade do ROOT_OWNER:
  - `setRootOwnerId` lança erro se já definido com outro valor.
  - `validateAction` / `validateRoleAssignment` bloqueiam promoção, remoção,
    criação de ROOT_OWNER e atribuição de nível acima do permitido.
- `PlatformUserManager` — gestão repositório-backed:
  - `bootstrapRootOwner(actorId)` — arranque único; idempotência assegurada
    pelo singleton.
  - `createSubUser(input)` — cria sub-users com verificação de permissões
    (canCreateSubUsers + maxAssignableLevel). Nunca cria ROOT_OWNER.
  - `suspendSubUser` / `removeSubUser` — apenas por papel que possa governar o
    alvo; nunca sobre ROOT_OWNER.
  - `getActorRole` (privado) **nunca faz fallback para ADMIN** — devolve
    `undefined` se o actor é desconhecido ou suspenso (deny-closed).
- `PlatformAdminRepository` (interface) + `InMemoryPlatformAdminRepository`
  (default) + `setPlatformAdminRepository()` para ligar Supabase/Postgres no
  boot.

## 4. RBAC + ABAC Granular (`packages/core/src/security/granularRbac.ts`)

- `PermissionAction` / `ModuleDefinition` **importadas de**
  `constants/permissions.ts` (definição única canónica — sem duplicação).
- `PermissionString`: `"<module>.<action>"`, `"<module>.*"`, `"*"`.
- `PolicyMatcher<T>`: `equals` (scalar/objeto), `in`/`notIn` (arrays de
  valores), `all` (AND), `any` (OR), `custom`.
- `ActionMatcher` para `PermissionAction` (unão de strings).
- `AuthorizationPolicy`: `effect: "PERMIT" | "DENY"`, `priority`, `subject`,
  `resource`, `action`, `environment`, `attributes`, `obligations`.
- `PolicyEngine.evaluate(ABACContext)` → `PolicyEvaluationResult`
  (`PERMIT | DENY | NOT_APPLICABLE | INDETERMINATE`).
  - Sem políticas → `DENY` (deny-closed).
  - `enabled: false` é ignorado; omitido = ativo.
  - Explicito `DENY` tem precedência sobre `PERMIT` (design neo-vanilla XACML).
- `EffectivePermissions.contextType` inclui `PERSONAL`.
- `PermissionRegistry` — registo modular central de permissões e módulos.

## 5. AI-as-Actor (`packages/core/src/types/aiActor.ts`)

- `AIAgentRegistry` — registo central de agents e tools.
- `AIInvocationEngine` — security-first:
  1. Tool existe e está `enabled` (senão → erro).
  2. **Permissão do actor** via `PermissionResolver` injetado
     (`checkPermission`). **Default = deny**.
  3. **Capability do agent** (não do actor) + `status === "ACTIVE"`; `"*"`
     permite tudo.
  4. **Approval gate** para tools `requiresApproval` via `ApprovalRequester`
     injetado. **Default = deny**.
  5. **Screening anti prompt-injection** recursivo (objetos + arrays) com
     `dangerousPatterns` configuráveis.
  6. Execução via `ToolExecutor` injetado (default: stub seguro).
- `buildApprovalPolicyRequester(policy, decide)` — guardrail que impõe
  `AIApprovalPolicy`: `canDelegate`, `requireApproval`,
  `requireAdminApproval`, `maxAutoAmountCents`. Nunca deixa a decisão
  financeira para o modelo.
- `AIOrchestrator` — workflows com steps `tool | approval | condition |
  parallel`; cada `AIInvocationContext` carrega `actorId` (quem age em nome).

## 6. Marketplace (`packages/core/src/types/marketplace.ts`)

- Tipos canónicos renomeados para evitar colisões de barrel:
  - `MarketplaceQuoteStatus` (não conflita com `QuoteStatus` de `quote.ts`).
  - `MarketplaceOrderStatus` (não conflita com `OrderStatus` de `order.ts`).
  - `ServiceQuoteItem` (não conflita com `QuoteItem` de `quote.ts`).
- `FacetCount` permanece canónica EM marketplace (evidência importa dela).
- `MarketplaceEventType` consumido por `contract.ts`.

## 7. Contracts (`packages/core/src/types/contract.ts`)

- Tipos de milestones específicos de contrato renomeados:
  `ContractMilestoneDeliverable`, `ContractMilestoneEvidence`,
  `ContractMilestoneApproval`, `ContractPaymentScheduleItem` — distintos dos de
  ordem (`order.ts`) mas não colidentes no barrel.
- Contract mantém `MarketplaceEventType` importado de marketplace.

## 8. Orders (`packages/core/src/types/order.ts`)

- Canónico para `OrderStatus`, `MilestoneStatus`, `MilestoneTrigger`,
  `MilestoneDeliverable`, `MilestoneEvidence`, `MilestoneApproval`,
  `PaymentScheduleItem`, `Order`, `OrderItem`.
- `EvidenceType` / `EvidenceStatus` são **importados de `evidence.ts`**
  (definição única). Amounts em cents.

## 9. Evidence (`packages/core/src/types/evidence.ts`)

- Canónico para `EvidenceType`, `EvidenceStatus`, `EvidenceFacetCount`,
  `EvidencePackage`, `AuthDetails`, `EvidenceSearchFilters`,
  `EvidenceSearchResult`, `EvidenceService` + `evidenceService`.
- `EvidenceService` expõe o contracto completo (upload, getById/search com
  controlo de acesso, updateMetadata, changeVisibility, delete, verifyHash,
  createCollection, share, requestVerification, legal hold).
  Permanece como **stub** (`throw "Not implemented"`); a implementação real
  estado/workflow vive em `services/evidence/EvidenceGuard` (secção 11).
- `FacetCount` importado de marketplace (definição única).

## 10. Auditoria (`supabase/migrations/0001_rpg_os_core.sql` + patch)

- Tabela `audit_logs`: `user_id` (tenant), `company_id`, `action`, `module`,
  `entity_type`, `entity_id`, `timestamp`, `ip`, `metadata`.
- Patch aditivo `20260917000000_audit_logs_indexes.sql`:
  - `(user_id, timestamp DESC)`, `(user_id, action)`, `(user_id, module)`,
    `(user_id, entity_type, entity_id)`, `(user_id, ip) WHERE ip IS NOT NULL` —
    todos índices compósitos começam por `user_id` (tenant-safe).

## 11. EvidenceGuard (`packages/core/src/services/evidence/`)

- `sha256HexSync(content)` — digest SHA-256 hex síncrono (node `crypto`).
- `verifyHash(expectedHash, content)` — devolve `{ valid, expectedHash, actualHash }`;
  nunca lança, para o caller decidir.
- `canAccessEvidence(evidence, actor, ctx)` e `requireEvidenceAccess(...)` —
  controlo de acesso **deny-closed** a evidências:
  - `DELETE_REQUESTED` / `QUARANTINED` / expirada → negado;
  - admin de plataforma pode aceder como último recurso â·o‌dcutado;
  - senão: owner, depois visibilidade `PUBLIC`, `ORGANIZATION`,
    `RESTRICTED` (por actor/role/tag), `PARTIES` (parte envolvida);
  - ações contam sempre contra `requiredFacets` da evidência (ex.: acesso a
    conteúdo legalmente protegido exige `LEGAL_HOLD`).
- Barrel `services/evidence/index.ts` (liga no `services/index.ts`).

## 12. Marketplace services (`packages/core/src/services/marketplace/`)

- `MarketplaceStateMachine`:
  - Quote: `DRAFT→SENT→VIEWED→ACCEPTED→CONVERTED_TO_CONTRACT`;
    terminais `REJECTED | EXPIRED | WITHDRAWN | CONVERTED_TO_CONTRACT`.
  - Order: SM de 12 estados com ciclo de milestones, resolução de disputa e
    terminal `REFUNDED`.
- `MarketplaceFlow`: `markQuoteSent/Viewed`, `accept/reject/withdraw/expireQuote`,
  `convertToContract`, `createOrderFromQuote` — conversão quote→order com
  validação de integridade financeira e plano de pagamento.
- `marketplaceQuoteStateMachine` / `marketplaceOrderStateMachine` singletons.
- Barrel `services/marketplace/index.ts`.

## 13. Order & Milestone services (`packages/core/src/services/order/`)

- `OrderStateMachine`: `OrderStatusStateMachine` (17 estados) +
  `MilestoneStatusStateMachine` (11 estados, terminais
  `PAID | SKIPPED | CANCELLED`).
- `OrderMilestoneFlow`:
  - `submitMilestone` exige deliverables obrigatórios + hash SHA-256 válido;
  - `approveMilestone` com obrigação (`requires`) e auto-liberação de pagamento,
    atualização financeira (paid/due, `CAPTURED`) e deteção de conclusão;
  - `requestRevision` / `rejectMilestone`;
  - `completeOrder` só com todos os milestones concluídos **e** pagamento total
    (`assertReachable` BFS para verificar completabilidade).
  - Todas as transições validadas via SM hop-by-hop (`moveOrderStatus`).
- Barrel `services/order/index.ts`.

## 14. Contract & Signature services (`packages/core/src/services/contract/`)

- `ContractStateMachine`: `ContractStatusStateMachine` (10 estados, terminal
  `ARCHIVED`) + `ContractSignatureStateMachine` (7 estados, terminais
  `DECLINED | EXPIRED | REVOKED`).
- `evaluateSignatureAssurance(type, evidence)` — garante D2 **sem nunca alegar
  equivalência legal**:
  - SIMPLE → email confirmado → MEDIUM;
  - ELECTRONIC → evento de identidade verificado → MEDIUM;
  - ADVANCED → identidade + dados de assinatura → HIGH;
  - QUALIFIED → certificado qualificado + janela de validade + fingerprint +
    timestamp → QUALIFIED; DIGITAL → certificado → QUALIFIED;
  - HANDWRITTEN → LOW; WITNESSED → MEDIUM.
- `ContractFlow`: `validateContractFinancials` (milestones ≤ total e schedule =
  total), `sendForSignature` (só a partir de PENDING_REVIEW/PENDING_SIGNATURE),
  `sign` (gate de assurance + SM), `activate` (exige todos os signatários),
  `terminate`, `archive`, `approveContractMilestone` (ACTIVE + SUBMITTED → PAID
  com atualização do schedule).
- Barrel `services/contract/index.ts`.

## 15. Segurança conhecida & limites

- **fail-open em `apps/web/lib/supabase/auth.ts`**: `getCurrentUser` devolve
  ADMIN como default. **Atenção documentada — não alterado nesta fase** (filho
  da camada de sessão; requer mudança coordenada).
- Todo `AIInvocationEngine` criado sem resolvers configurados **nega por
  defeito**: nenhuma tool é executável sem resolver real injetado.
- `PlatformUserManager` default (InMemory repository) é substituível — em
  produção **tem de** ser ligado a Postgres no arranque.