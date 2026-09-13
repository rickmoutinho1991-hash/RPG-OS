# RPG-OS — Arquitetura
O monorepo usa Turborepo/pnpm, com `apps/web` (Next.js App Router) e `packages/core` (tipos, validações, RBAC e cálculos). O acesso autenticado é resolvido server-side por `getSessionContext`, que identifica o utilizador, organização ativa, membership e permissões efetivas.

## Camadas
- UI: Server Components para leitura e Client Components para interação.
- Aplicação: Server Actions e Route Handlers validam sessão e permissões antes de qualquer mutação.
- Dados: Supabase PostgreSQL com migrations incrementais e RLS.
- Domínio: `packages/core` sem dependência de Next.js ou Supabase.

A organização ativa é escolhida por cookie apenas entre memberships válidas do próprio utilizador. A service role é usada no backend apenas depois da autorização da aplicação; RLS continua a ser a barreira de base de dados para clientes Supabase normais.
