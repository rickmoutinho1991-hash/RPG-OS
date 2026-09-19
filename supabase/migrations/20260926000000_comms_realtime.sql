-- RPG-OS: Comms — realtime (subscrição a novas mensagens) (vaga realtime)
-- Publica comms_messages na publicação supabase_realtime para o cliente Supabase
-- (browser) receber inserts do canal ativo. Idempotente.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'comms_messages'
  ) then
    alter publication supabase_realtime add table public.comms_messages;
  end if;
end $$;