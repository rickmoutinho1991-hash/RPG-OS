-- RPG-OS — Vaga M-G/T: remover TRUNCATE/REFERENCES/TRIGGER de anon+authenticated
--
-- Vulnerabilidade provada (não-teórica): RLS NÃO restringe TRUNCATE/REFERENCES/
-- TRIGGER. O default ACL (gene) concedia "arwdDxtm" a anon+authenticated em todo
-- o objeto, incluindo D (TRUNCATE), x (REFERENCES) e t (TRIGGER). Prova:
--   set role authenticated; truncate table public.audit_logs;  -- executou
--   (rollback; audit_logs intacto) → qualquer authenticated apagava a trilha
--   de auditoria, tabelas-folha e, com CASCADE, o que não estivesse endurecido.
--
-- Escopo medido: authenticated com TRUNCATE/REFERENCES/TRIGGER em 106 tabelas
-- public + 3 storage + 2 supabase_functions; anon em 2 public (catálogos) +
-- 3 storage + 2 supabase_functions.
--
-- Ação: REVOKE TRUNCATE, REFERENCES, TRIGGER a anon e authenticated em todos os
-- objetos existentes dos 3 schemas + reescrever os default privileges do rôle
-- postgres (o gene efectivo) para o futuro nascer sem esses privilégios.
-- Mantém-se SELECT/INSERT/UPDATE/DELETE (DML sob RLS) a authenticated e o
-- conjunto completo a service_role (runtime/maintenance). Idempotente.
--
-- Não-regressivo: a app usa service_role para escritas administrativas e
-- authenticated apenas para DML sob RLS; nenhum fluxo faz TRUNCATE/DDL de FK
-- ou triggers como anon/authenticated.

-- ---- 1. Objetos existentes: public, storage, supabase_functions ----
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke truncate, references, trigger on all tables in schema storage from anon, authenticated;
revoke truncate, references, trigger on all tables in schema supabase_functions from anon, authenticated;

-- ---- 2. Gene: default privileges do postgres (efectivo) ----
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema storage revoke truncate, references, trigger on tables from anon, authenticated;

-- supabase_admin (superuser) não é alterável por nós; 0 tabelas public criadas
-- por ele (provado na M-G/R). Se o ambiente der membership, tapamos também.
do $$
begin
  if pg_has_role('postgres', 'supabase_admin', 'member') then
    execute 'alter default privileges for role supabase_admin in schema public revoke truncate, references, trigger on tables from anon, authenticated';
  end if;
end $$;

-- facing: anon/authenticated sem D/x/t; DML e service_role intactos.