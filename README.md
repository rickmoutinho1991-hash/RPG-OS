# RPG-OS

Sistema operativo digital pessoal e empresarial para tarefas, agenda, clientes, projetos, faturação, documentos, comunicação e governação organizacional.

- Mercado: do pedido à garantia (propostas, contrato, milestones, evidência, pagamento, garantia)

## Demonstração pública

Fora de sessão, a página pública (`/`) apresenta o produto com marcadores e
demos interativas de briefing e de memória — **sempre com dados fictícios**
(módulo `lib/demo`, etiquetado "Demonstração · dados fictícios"). Zero acesso a
Supabase no ramo público e nada é persistido sem sessão autenticada.

## Quickstart

```bash
pnpm install --frozen-lockfile
pnpm dev            # http://localhost:3000
```

## Qualidade (gates)

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Estado de referência: 122 ficheiros de teste / 1805 passed / 6 skipped (HEAD `e6315f2`).

## Produção

```bash
pnpm build && pnpm start
```

- Deploy: [docs/DEPLOY.md](./docs/DEPLOY.md) (HTTPS obrigatório, SW auto-version, checklist pós-deploy).
- Base de dados: [DATABASE.md](./DATABASE.md) (migrações — prod nunca automático).
- Arquitetura: [ARCHITECTURE.md](./ARCHITECTURE.md), [RBAC.md](./RBAC.md), [SECURITY.md](./SECURITY.md), [WORKFLOWS.md](./WORKFLOWS.md).