-- RPG-OS: Comms — RLS completo, mensagens diretas pessoais e auto-join do criador (M-E)
-- Corrige a ausência total de políticas em comms_channel_members (ninguém lê/inscreve)
-- e tapa a fuga de privacidade em que canais pessoais (organization_id null) eram visíveis a todos.

-- 1. Helper: o utilizador é membro do canal? (definer: lê membros sem RLS, sem recursão)
create or replace function public.is_comms_member(_channel_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from comms_channel_members m
    where m.channel_id = _channel_id and m.user_id = auth.uid()
  );
$$;

grant execute on function public.is_comms_member(uuid) to authenticated;
grant execute on function public.is_comms_member(uuid) to anon;

-- 2. Ao criar um canal, o criador entra automaticamente como membro.
create or replace function public.comms_auto_join_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into comms_channel_members (channel_id, user_id, last_read_at)
    values (new.id, new.created_by, now())
    on conflict on constraint comms_channel_members_pkey do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_comms_auto_join_creator on comms_channels;
create trigger trg_comms_auto_join_creator
  after insert on comms_channels
  for each row execute function public.comms_auto_join_creator();

-- 3. Mensagens diretas pessoais: slug único no espaço pessoal.
-- (Postgres trata NULL como distinto em unique normais — daí o índice parcial.)
drop index if exists uq_comms_channels_dm_personal;
create unique index uq_comms_channels_dm_personal
  on comms_channels (slug) where organization_id is null and type = 'DIRECT';

-- 4. RLS — Canais
drop policy if exists "chan_select" on comms_channels;
create policy "chan_select" on comms_channels for select
  using (
    (
      organization_id is not null
      and is_org_member(organization_id)
    )
    or (
      organization_id is null
      and (is_comms_member(id) or created_by = auth.uid())
    )
  );

drop policy if exists "chan_insert" on comms_channels;
create policy "chan_insert" on comms_channels for insert
  with check (
    created_by = auth.uid()
    and (
      (organization_id is null and type = 'DIRECT')
      or (organization_id is not null and is_org_member(organization_id))
    )
  );

drop policy if exists "chan_update" on comms_channels;
create policy "chan_update" on comms_channels for update
  using (created_by = auth.uid());

drop policy if exists "chan_delete" on comms_channels;
create policy "chan_delete" on comms_channels for delete
  using (created_by = auth.uid());

-- 5. RLS — Membros do canal (faltavam por completo)
drop policy if exists "cmm_select" on comms_channel_members;
create policy "cmm_select" on comms_channel_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from comms_channels c
      where c.id = channel_id
        and c.organization_id is not null
        and is_org_member(c.organization_id)
    )
  );

drop policy if exists "cmm_insert" on comms_channel_members;
create policy "cmm_insert" on comms_channel_members for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from comms_channels c
      where c.id = channel_id
        and (
          (
            c.organization_id is null
            and (c.type = 'DIRECT' or c.created_by = auth.uid())
          )
          or (
            c.organization_id is not null
            and c.is_private = false
            and is_org_member(c.organization_id)
          )
        )
    )
  );

drop policy if exists "cmm_update" on comms_channel_members;
create policy "cmm_update" on comms_channel_members for update
  using (user_id = auth.uid());

drop policy if exists "cmm_delete" on comms_channel_members;
create policy "cmm_delete" on comms_channel_members for delete
  using (user_id = auth.uid());

-- 6. RLS — Mensagens (autor obrigatoriamente com acesso ao canal)
drop policy if exists "msg_select" on comms_messages;
create policy "msg_select" on comms_messages for select
  using (exists (
    select 1 from comms_channels c
    where c.id = channel_id
      and (
        (
          c.organization_id is not null
          and is_org_member(c.organization_id)
          and (not c.is_private or is_comms_member(c.id))
        )
        or (
          c.organization_id is null
          and (is_comms_member(c.id) or c.created_by = auth.uid())
        )
      )
  ));

drop policy if exists "msg_insert" on comms_messages;
create policy "msg_insert" on comms_messages for insert
  with check (author_id = auth.uid() and exists (
    select 1 from comms_channels c
    where c.id = channel_id
      and (
        (
          c.organization_id is not null
          and is_org_member(c.organization_id)
          and (not c.is_private or is_comms_member(c.id))
        )
        or (
          c.organization_id is null
          and (is_comms_member(c.id) or c.created_by = auth.uid())
        )
      )
  ));