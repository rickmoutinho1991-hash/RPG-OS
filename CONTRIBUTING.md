# Contribuir

1. Instalar com `pnpm install`.
2. Desenvolver com `pnpm dev`.
3. Antes de submeter alterações executar `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm build`.
4. Migrations devem ser incrementais, idempotentes quando possível e nunca apagar dados sem plano explícito.
5. Toda nova tabela multi-tenant precisa de `organization_id`, índices, RLS e testes de acesso negativo.
6. Toda Server Action/API deve autorizar no servidor e validar a entrada.
