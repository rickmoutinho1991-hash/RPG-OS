-- RPG-OS — Vaga M-G/W: defesa em profundidade em supabase_functions.*
--
-- Descoberta determinística (scan de schemas internos):
--   supabase_functions.migrations e supabase_functions.hooks têm
--     rls = false, acl anon=arwdm, authenticated=arwdm
--   (owner supabase_functions_admin; postgres e service_role com acesso).
--   supabase_functions.hooks guarda configuração de webhooks, que pode
--   conter cabeçalhos/segredos de autenticação.
--
-- Exposição: config.toml expõe apenas ["public","graphql_public"], logo este
--   schema NÃO é alcançável via PostgREST por anon/authenticated. A ação é
--   estritamente DEFESA EM PROFUNDIDADE: com RLS desligado, o único guarda
--   é o grant. Nem anon nem authenticated têm qualquer razão para tocar em
--   hooks/migrations.
--
-- Não-regressivo: a plataforma (edge runtime, dashboard) acede via
--   supabase_functions_admin / postgres / service_role, cujos grants se
--   mantêm. Idempotente; guardado com to_regclass por robustez.

do $$
begin
  if to_regclass('supabase_functions.migrations') is not null then
    revoke all on table supabase_functions.migrations from anon, authenticated;
  end if;
  if to_regclass('supabase_functions.hooks') is not null then
    revoke all on table supabase_functions.hooks from anon, authenticated;
  end if;
end $$;
