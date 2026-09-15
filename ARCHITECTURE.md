# RPG-OS — Arquitetura
O monorepo usa Turborepo/pnpm, com `apps/web` (Next.js App Router) e `packages/core` (tipos, validações, RBAC e cálculos). O acesso autenticado é resolvido server-side por `getSessionContext`, que identifica o utilizador, organização ativa, membership e permissões efetivas.

## Camadas
- UI: Server Components para leitura e Client Components para interação.
- Aplicação: Server Actions e Route Handlers validam sessão e permissões antes de qualquer mutação.
- Dados: Supabase PostgreSQL com migrations incrementais e RLS.
- Domínio: `packages/core` sem dependência de Next.js ou Supabase.

A organização ativa é escolhida por cookie apenas entre memberships válidas do próprio utilizador. A service role é usada no backend apenas depois da autorização da aplicação; RLS continua a ser a barreira de base de dados para clientes Supabase normais.

**RLS least-privilege em todas as tabelas `public`**: as 10 tabelas que ainda não tinham policies ficaram com RLS por classe — catálogos RBAC (`roles`, `permissions`, `role_permissions`) e `addresses` (sem coluna de owner) são **read-only para `authenticated`**; pessoais (`registrations`, `rgpd_consents`, `document_verifications`) são owner-only (ALL via `auth.uid()`); membrias (`user_roles`, `project_members`, `company_employees`) permitem SELECT own-or-same-scope. Escritas permanecem via service role/migrations (política least-privilege, migração `20260913160000_enable_rls_least_privilege`).

## Memória de IA
- Tabela `user_memories`: `user_id` + `key` únicos por ator, valor JSONB, `kind` em `preference|fact|context`; RLS owner-only (`user_id = auth.uid()`).
- Core (`packages/core/src/memory`): porta `MemoryStore` e `MemoryService` fail-closed (recusa actorId vazio, kind fora do enum e valores null/array).
- Web (`apps/web/lib/memory/supabaseStore.ts`): adapter `SupabaseMemoryStore` com admin client e filtro obrigatório por `user_id`.
- Rota `/api/memories` (GET/POST/DELETE) com `getSessionContext` — **401 sem sessão**. Editor de memória no Perfil; silêncio de categorias do briefing via preferência `muted_categories`.
- **Mutações auditadas (M3)**: cada POST/DELETE em `/api/memories` regista um evento em `audit_logs` com `{action, key, kind, actorId}` (timestamp server-side) via `recordAuditEvent`, **sem nunca persistir o value** no rasto. Ações canónicas: `MEMORY_ENTRY_SET` / `MEMORY_ENTRY_DELETED`. Falha de audit **não bloqueia** a mutação — o dado é do utilizador, protegido por RLS; o erro é logado server-side (`console.error`) e a resposta mantém 200/400.

## Service Worker auto-versionado
- `apps/web/scripts/stamp-sw-version.mjs` gera `public/sw-version.json` no build (`{"v":"<timestamp>-<short-git-sha>"}`; artefacto gitignored, nunca editado à mão).
- O SW lê o ficheiro no `install` com `fetch(..., { cache: "no-store" })` → cache `rpg-os-<v>`; fallback ao constante se indisponível; `/sw-version.json` nunca é cacheado no fetch handler. Cada deploy troca a cache sem bump manual.

## Briefing contextual (§38)
- `apps/web/lib/actionCenter.ts`: `collectActionAlerts` agrega alertas por domínio reutilizando **apenas queries existentes**; `composeBriefingLines` separa FACT / INFERÊNCIA / RECOMENDAÇÃO por item (função pura).
- Cross-domain: finance, aprovacoes, docs (silenciáveis) + tarefas/agenda/notificações (não silenciáveis); fail-safe por domínio — erro numa fonte contribui zero itens e o briefing nunca cai.
- UX de silêncio (`apps/web/components/briefing/MuteCategoryButton.tsx`): optimistic update com rollback, persistência via `/api/memories` (`muted_categories`), coerente com o editor de memória do Perfil.

## Landing pública (demo)
- Fora de sessão, `/` renderiza marcadores e demos (`BriefingDemo`, `MarketCycleStepper`, `MultiActorTabs`, `MemoryControlPreview`, `PublicCTA`) alimentadas pelo módulo fictício `apps/web/lib/demo/marketplaceStory.ts`, etiquetado "Demonstração · dados fictícios". Zero acesso a Supabase no ramo público.

## Mercado transacional
- Loop completo pedido→garantia: pedido → propostas (quote) → aceitação/rejeição → conversão em contrato → milestones (SUBMITTED/APPROVED) → evidência → pagamento → garantia. Estados centrais em `packages/core/src/marketplace` (`ServiceRequest`, `ServiceQuote`, `OrderMilestonesField`, `OrderWorkflowStatus`).
- As transições de estado (acceptQuote, rejectQuote, convertToContract, submitMilestone, approveMilestone) vivem **só no core** (OrderMilestoneFlow) e validam autorização com `assertResponsibleParty` — funcionário e cliente são as únicas partes admitidas, deny-closed em cada passo.
- Efeitos financeiros/garantia na camada web, **idempotentes**: pagamento regista receita (provider) e despesa (client) em EUR com guard `marketplace_milestone_payments` (`UNIQUE(milestone_id)`); garantia emitida uma única vez (`UNIQUE(warranties.order_id)`) a partir de `service_quotes.warranty_months` no COMPLETED.
- Evidência de milestone em bucket privado `marketplace-evidence` (15 MB; pdf/jpeg/png/webp), upload sempre server-side (service_role) com nome derivado do milestone e validação fail-closed; leitura via `canAccessEvidence` deny-closed (owner ou partes) na rota `/api/mercado/evidence/[id]/download`.
- RLS: leitura de contratos/garantias/pagamentos pelas partes via políticas `contracts_parties_all` + classe de partes; bucket sem acesso público (`public=false`).