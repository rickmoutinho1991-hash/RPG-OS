-- RPG-OS — Hardening M-G/L: quebrar recursão RLS (infinite recursion, Erro 500) 
--
-- Descoberta determinística (varrimento empírico via \gexec em DEV, ato 10):
--   SELECT count(*) como `authenticated` em 115 tabelas com RLS detectou 11 falhas:
--     * company_employees  — policy auto-referencia a MESMA tabela
--     * project_members    — idem
--     * service_requests ⇄ service_quotes — ciclo circular A→B→A
--   Cada uma destas tabelas fica SEM LEITURA POSSÍVEL para `authenticated`
--   (Postgres: infinite recursion detected in policy for relation "X") — DoS funcional.
--
-- Fix canónico (padrão Postgres/Supabase): funções helper STABLE SECURITY DEFINER
--   que resolvem a subconsulta FORA do escopo da policy (correm como owner = postgres,
--   logo RLS não se re-aplica → sem ciclo). search_path endurecido 'public','pg_temp'
--   (regra das vagas M-G/J): nenhuma função definer sem pg_temp explícito.

create or replace function public.is_same_company(p_uid uuid, p_company uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.company_employees ce
    where ce.user_id = $1 and ce.company_id = $2
  )
$$;

create or replace function public.is_same_project(p_uid uuid, p_project uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.user_id = $1 and pm.project_id = $2
  )
$$;

create or replace function public.service_request_is_for_client(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.service_requests sr
    where sr.id = $1 and sr.client_id = auth.uid()
  )
$$;

create or replace function public.service_quote_is_for_provider(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.service_quotes sq
    where sq.request_id = $1 and sq.provider_id = auth.uid()
  )
$$;

-- Execução restrita aos roles da aplicação (nunca public).
revoke all on function public.is_same_company(uuid, uuid) from public;
revoke all on function public.is_same_project(uuid, uuid) from public;
revoke all on function public.service_request_is_for_client(uuid) from public;
revoke all on function public.service_quote_is_for_provider(uuid) from public;
grant execute on function public.is_same_company(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_same_project(uuid, uuid) to authenticated, service_role;
grant execute on function public.service_request_is_for_client(uuid) to authenticated, service_role;
grant execute on function public.service_quote_is_for_provider(uuid) to authenticated, service_role;

-- Reescrever as 4 policies recursivas usando os helpers (sem subconsulta na policy).
alter policy company_employees_own_or_same_company_read on public.company_employees
  using (
    user_id = auth.uid()
    or public.is_same_company(auth.uid(), company_id)
  );

alter policy project_members_own_or_same_project_read on public.project_members
  using (
    user_id = auth.uid()
    or public.is_same_project(auth.uid(), project_id)
  );

alter policy service_requests_provider_read on public.service_requests
  using ( public.service_quote_is_for_provider(id) );

alter policy service_quotes_client_read on public.service_quotes
  using ( public.service_request_is_for_client(request_id) );