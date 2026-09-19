# Base de dados

As migrations vivem em `supabase/migrations` e devem ser aplicadas por ordem. As migrations de plataforma adicionam organizações, memberships, departamentos, equipas, cargos, tarefas, comunicação, conhecimento, notificações e workflows sem remover tabelas legadas.

`20260821100000_security_rbac_workflows.sql` adiciona definições, passos e transições de workflows e endurece as políticas RLS. `20260821110000_organization_operations.sql` adiciona convites, campos universais de tarefas, comentários e atividade.

`20260821130000_workflow_instances_hardening.sql` adiciona colunas de apresentação (`title`, `summary`, `metadata`), índices de listagem e políticas RLS que permitem decisão apenas pelo aprovador e cancelamento pelo requerente de um pedido de aprovação.

Antes de aplicar a uma base remota, executar `supabase migration list` e rever o plano. Não executar `DROP`, reset ou push destrutivo contra produção.

## Migrações recentes (mercado, comunicação e segurança)

- `20260922000000_marketplace_ofertas.sql` — tabela `provider_offerings` (ofertas de prestadores) com RLS e índices; leitura pública apenas de ofertas `PUBLISHED` (e `APPROVED` quando `moderation_required`), gestão própria via `provider_id`.
- `20260923000000_comms_mensagens_diretas.sql` — mensagens diretas pessoais, threads (`thread_root_id`) e menções `@nome`; `is_comms_member()`, trigger `comms_auto_join_creator`, índice único parcial para DMs (`organization_id` nulo e `type='DIRECT'`), políticas completas (`chan_*`, `cmm_*`, `msg_select`/`msg_insert` apertadas).
- `20260924000000_marketplace_fee_milestone.sql` — comissão de plataforma (300 bps = 3%) aplicada a milestones: colunas snapshot `fee_bps`, `fee_cents`, `net_cents` em `marketplace_milestone_payments`; o prestador recebe o valor líquido e a retenção entra no ledger `platform_fees` (fonte `MARKETPLACE_PAYMENT`).
- `20260925000000_rls_owner_hardening.sql` — políticas owner-only (`user_id = auth.uid()`) de select/insert/update/delete em `contacts` e `fiscal_obligations`.
- `20260926000000_comms_realtime.sql` — publica `comms_messages` na publicação `supabase_realtime` para subscrição em tempo real do cliente browser.

**DEV local** (container `supabase_db_RPG-OS`): todas estas migrações encontram-se aplicadas (contagem `schema_migrations` = 53). **PRODUÇÃO: nunca automático.**

## Aplicar migrações

- **DEV (stack local Supabase):** acesso em **Docker Desktop** — stack do projeto corre no container `supabase_db_RPG-OS`; `docker exec -i supabase_db_RPG-OS psql -U postgres -d postgres`. `supabase migration list --local` seguido de `supabase db push` (ou, para uma migração específica, aplicar apenas o ficheiro correspondente). Nunca aplicar migrações alheias apenas por estarem pendentes: rever o `migration list` primeiro.
- **PRODUÇÃO: nunca automático.** O `push`/CLI contra prod só acontece com revisão humana e aprovação explícita; o caminho normal é revisão do script + aplicação manual (`psql`) ou pipeline de migração previamente aprovado. Nunca executar seed em produção.

`20260913100000_create_user_memories.sql` adiciona a tabela de memória de IA do utilizador (`user_memories`, com RLS por `user_id`).
