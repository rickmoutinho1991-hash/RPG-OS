-- RPG-OS — Vaga M-G/R: higiene de grants reputation_* + corte do gene de default ACLs
--
-- Auditoria determinística:
--   (a) As 9 tabelas reputation_* têm grants anon=SELECT+INSERT (proacl herdado por
--       omissão) mas TODAS as policies RLS usam reputation_in_tenant()/auth.uid() e
--       produzem 0 rows para anon (prova: SELECT count(*) AS anon = 0; e INSERT
--       falha no WITH CHECK porque author_user_id NOT NULL nunca iguala uid NULL).
--       → grants anon são pólvora defensiva: aparentam acesso que a RLS nega.
--        Perigo real: RLS não cobre TRUNCATE/REFERENCES/TRIGGER (vetor M-G/O).
--   (b) Os default ACLs (pg_default_acl) em public e storage, quer do rôle postgres
--       quer do supabase_admin, concedem arwdDxtm (ALL + TRUNCATE + REFERENCES
--       + TRIGGER) a anon+authenticated em QUALQUER objeto futuro criado nesses
--       schemas. É o gene dos grants não-intencionais que reaparecem a cada
--       migração nova (106 tabelas atuais têm SELECT anon por esta causa).
--
-- Ação (mantém authenticated → RLS de leitura legítima, e service_role → runtime):
--   1. REVOKE ALL a anon nas 9 tabelas reputation_* (idempotente).
--   2. REVOKE EXECUTE a anon em reputation_in_tenant (helper de RLS: anon já
--      não tem grants nas tabelas → nunca é avaliado como anon; authenticated
--      mantém EXECUTE para o evaluator de RLS correr).
--   3. Reescrever default privileges para o FUTURO nascer sem grants a anon
--      (tabelas, funções, sequências; schemas public e storage; roles postgres
--      e supabase_admin). authenticated e service_role permanecem.
--
-- Nota de segurança: como os grants atuais são 100% cobertos por RLS-ON (auditoria
-- de RLS-off+anon=0 tabelas) e anon não tem mais nada específico, esta migração é
-- estritamente não-regressiva para os fluxos (cliente authenticated + service_role).

-- ---- 1. Sintoma: tabelas reputation_* sem grants anon ----
revoke all on table public.reputation_attachments from anon;
revoke all on table public.reputation_cases from anon;
revoke all on table public.reputation_comments from anon;
revoke all on table public.reputation_events from anon;
revoke all on table public.reputation_external_references from anon;
revoke all on table public.reputation_portal_config from anon;
revoke all on table public.reputation_responses from anon;
revoke all on table public.reputation_reviews from anon;
revoke all on table public.reputation_scores from anon;

-- ---- 2. Helper de RLS: anon sem EXECUTE (authenticated mantém) ----
-- revoke ... from anon não corta (anon herda de PUBLIC) → revogar PUBLIC e
-- reafirmar os grants explícitos a authenticated/service_role (RLS + runtime).
revoke execute on function public.reputation_in_tenant(uuid, uuid) from public;
grant execute on function public.reputation_in_tenant(uuid, uuid) to authenticated, service_role;

-- ---- 3. Gene: default ACLs sem anon (futuros objetos em public e storage) ----
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema storage revoke all on tables from anon;
alter default privileges for role postgres in schema storage revoke all on functions from anon;
alter default privileges for role postgres in schema storage revoke all on sequences from anon;

-- supabase_admin é superuser do Supabase (não somos membros: set role falha aqui).
-- Provado por pg_class: 0 das 115 tabelas public foram criadas por supabase_admin
-- (todas por postgres) → o gene efectivo já foi tapado em cima. Mesmo assim, se o
-- ambiente conceder membership, tapamos também os defaults do supabase_admin.
do $$
begin
  if pg_has_role('postgres', 'supabase_admin', 'member') then
    execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from anon';
    execute 'alter default privileges for role supabase_admin in schema public revoke all on functions from anon';
    execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from anon';
  end if;
end $$;

-- Facing: anon deixa de receber grants automáticos em public/storage;
-- authenticated (RLS de leitura legítima) e service_role (runtime) intactos.