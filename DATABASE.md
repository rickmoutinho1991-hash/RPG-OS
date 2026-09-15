# Base de dados

As migrations vivem em `supabase/migrations` e devem ser aplicadas por ordem. As migrations de plataforma adicionam organizações, memberships, departamentos, equipas, cargos, tarefas, comunicação, conhecimento, notificações e workflows sem remover tabelas legadas.

`20260821100000_security_rbac_workflows.sql` adiciona definições, passos e transições de workflows e endurece as políticas RLS. `20260821110000_organization_operations.sql` adiciona convites, campos universais de tarefas, comentários e atividade.

`20260821130000_workflow_instances_hardening.sql` adiciona colunas de apresentação (`title`, `summary`, `metadata`), índices de listagem e políticas RLS que permitem decisão apenas pelo aprovador e cancelamento pelo requerente de um pedido de aprovação.

Antes de aplicar a uma base remota, executar `supabase migration list` e rever o plano. Não executar `DROP`, reset ou push destrutivo contra produção.

## Aplicar migrações

- **DEV (stack local Supabase):** acesso em **Docker Desktop** — stack do projeto corre no container `supabase_db_RPG-OS`; `docker exec -i supabase_db_RPG-OS psql -U postgres -d postgres`. `supabase migration list --local` seguido de `supabase db push` (ou, para uma migração específica, aplicar apenas o ficheiro correspondente). Nunca aplicar migrações alheias apenas por estarem pendentes: rever o `migration list` primeiro.
- **PRODUÇÃO: nunca automático.** O `push`/CLI contra prod só acontece com revisão humana e aprovação explícita; o caminho normal é revisão do script + aplicação manual (`psql`) ou pipeline de migração previamente aprovado. Nunca executar seed em produção.

`20260913100000_create_user_memories.sql` adiciona a tabela de memória de IA do utilizador (`user_memories`, com RLS por `user_id`).
