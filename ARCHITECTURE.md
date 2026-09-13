# RPG-OS — Arquitetura
O monorepo usa Turborepo/pnpm, com `apps/web` (Next.js App Router) e `packages/core` (tipos, validações, RBAC e cálculos). O acesso autenticado é resolvido server-side por `getSessionContext`, que identifica o utilizador, organização ativa, membership e permissões efetivas.

## Camadas
- UI: Server Components para leitura e Client Components para interação.
- Aplicação: Server Actions e Route Handlers validam sessão e permissões antes de qualquer mutação.
- Dados: Supabase PostgreSQL com migrations incrementais e RLS.
- Domínio: `packages/core` sem dependência de Next.js ou Supabase.

A organização ativa é escolhida por cookie apenas entre memberships válidas do próprio utilizador. A service role é usada no backend apenas depois da autorização da aplicação; RLS continua a ser a barreira de base de dados para clientes Supabase normais.

## Memória de IA
- Tabela `user_memories`: `user_id` + `key` únicos por ator, valor JSONB, `kind` em `preference|fact|context`; RLS owner-only (`user_id = auth.uid()`).
- Core (`packages/core/src/memory`): porta `MemoryStore` e `MemoryService` fail-closed (recusa actorId vazio, kind fora do enum e valores null/array).
- Web (`apps/web/lib/memory/supabaseStore.ts`): adapter `SupabaseMemoryStore` com admin client e filtro obrigatório por `user_id`.
- Rota `/api/memories` (GET/POST/DELETE) com `getSessionContext` — **401 sem sessão**. Editor de memória no Perfil; silêncio de categorias do briefing via preferência `muted_categories`.

## Service Worker auto-versionado
- `apps/web/scripts/stamp-sw-version.mjs` gera `public/sw-version.json` no build (`{"v":"<timestamp>-<short-git-sha>"}`; artefacto gitignored, nunca editado à mão).
- O SW lê o ficheiro no `install` com `fetch(..., { cache: "no-store" })` → cache `rpg-os-<v>`; fallback ao constante se indisponível; `/sw-version.json` nunca é cacheado no fetch handler. Cada deploy troca a cache sem bump manual.

## Briefing contextual (§38)
- `apps/web/lib/actionCenter.ts`: `collectActionAlerts` agrega alertas por domínio reutilizando **apenas queries existentes**; `composeBriefingLines` separa FACT / INFERÊNCIA / RECOMENDAÇÃO por item (função pura).
- Cross-domain: finance, aprovacoes, docs (silenciáveis) + tarefas/agenda/notificações (não silenciáveis); fail-safe por domínio — erro numa fonte contribui zero itens e o briefing nunca cai.
- UX de silêncio (`apps/web/components/briefing/MuteCategoryButton.tsx`): optimistic update com rollback, persistência via `/api/memories` (`muted_categories`), coerente com o editor de memória do Perfil.

## Landing pública (demo)
- Fora de sessão, `/` renderiza marcadores e demos (`BriefingDemo`, `MarketCycleStepper`, `MultiActorTabs`, `MemoryControlPreview`, `PublicCTA`) alimentadas pelo módulo fictício `apps/web/lib/demo/marketplaceStory.ts`, etiquetado "Demonstração · dados fictícios". Zero acesso a Supabase no ramo público.