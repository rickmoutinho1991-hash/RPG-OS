-- RPG-OS: hardening incremental de multi-tenancy, RBAC e workflows.
-- Não remove dados nem altera tabelas legadas.

create table if not exists workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  entity_type text not null,
  version integer not null default 1,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, key, version)
);

create table if not exists workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_definition_id uuid not null references workflow_definitions(id) on delete cascade,
  key text not null,
  name text not null,
  position integer not null default 0,
  required_permission text,
  config jsonb not null default '{}'::jsonb,
  unique (workflow_definition_id, key)
);

create table if not exists workflow_transitions (
  id uuid primary key default gen_random_uuid(),
  workflow_definition_id uuid not null references workflow_definitions(id) on delete cascade,
  from_step text not null,
  to_step text not null,
  required_permission text,
  condition jsonb not null default '{}'::jsonb
);

alter table workflow_definitions enable row level security;
alter table workflow_steps enable row level security;
alter table workflow_transitions enable row level security;

create or replace function public.has_org_permission(org_id uuid, required text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from org_memberships m
    left join custom_roles cr on cr.id = m.custom_role_id
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'ACTIVE'
      and (m.valid_from is null or m.valid_from <= now())
      and (m.valid_until is null or m.valid_until >= now())
      and (
        m.role_key in ('OWNER','FOUNDER','ADMIN','CEO')
        or '*' = any(coalesce(cr.permissions, '{}'::text[]) || coalesce(m.permissions_override, '{}'::text[]))
        or required = any(coalesce(cr.permissions, '{}'::text[]) || coalesce(m.permissions_override, '{}'::text[]))
        or (split_part(required, '.', 1) || '.*') = any(coalesce(cr.permissions, '{}'::text[]) || coalesce(m.permissions_override, '{}'::text[]))
        or (split_part(required, '.', 1) || '.manage') = any(coalesce(cr.permissions, '{}'::text[]) || coalesce(m.permissions_override, '{}'::text[]))
        or (split_part(required, '.', 1) || '.admin') = any(coalesce(cr.permissions, '{}'::text[]) || coalesce(m.permissions_override, '{}'::text[]))
      )
  );
$$;

-- A organização só pode ser atualizada por administradores e nunca pode mudar de tenant.
drop policy if exists "org_update_admin" on organizations;
create policy "org_update_admin" on organizations for update
  using (has_org_permission(id, 'administracao.organization'))
  with check (id = (select o.id from organizations o where o.id = organizations.id)
    and has_org_permission(id, 'administracao.organization'));

-- Tarefas pessoais pertencem exclusivamente ao criador/assignee. Tarefas de org exigem RBAC.
drop policy if exists "tasks_select" on tasks;
create policy "tasks_select" on tasks for select using (
  (organization_id is null and (created_by = auth.uid() or assignee_id = auth.uid()))
  or (organization_id is not null and has_org_permission(organization_id, 'tarefas.view'))
);
drop policy if exists "tasks_write" on tasks;
create policy "tasks_write" on tasks for insert with check (
  created_by = auth.uid() and (
    (organization_id is null and (assignee_id is null or assignee_id = auth.uid()))
    or (organization_id is not null and has_org_permission(organization_id, 'tarefas.create'))
  )
);
drop policy if exists "tasks_update" on tasks;
create policy "tasks_update" on tasks for update
  using (created_by = auth.uid() or assignee_id = auth.uid() or (organization_id is not null and has_org_permission(organization_id, 'tarefas.edit')))
  with check (organization_id is not distinct from (select t.organization_id from tasks t where t.id = tasks.id));

create policy "workflow_definitions_member" on workflow_definitions for select using (has_org_permission(organization_id, 'workflows.view'));
create policy "workflow_definitions_manage" on workflow_definitions for all using (has_org_permission(organization_id, 'workflows.manage')) with check (has_org_permission(organization_id, 'workflows.manage'));
create policy "workflow_steps_member" on workflow_steps for select using (exists (select 1 from workflow_definitions d where d.id = workflow_definition_id and has_org_permission(d.organization_id, 'workflows.view')));
create policy "workflow_steps_manage" on workflow_steps for all using (exists (select 1 from workflow_definitions d where d.id = workflow_definition_id and has_org_permission(d.organization_id, 'workflows.manage'))) with check (exists (select 1 from workflow_definitions d where d.id = workflow_definition_id and has_org_permission(d.organization_id, 'workflows.manage')));
create policy "workflow_transitions_member" on workflow_transitions for select using (exists (select 1 from workflow_definitions d where d.id = workflow_definition_id and has_org_permission(d.organization_id, 'workflows.view')));
create policy "workflow_transitions_manage" on workflow_transitions for all using (exists (select 1 from workflow_definitions d where d.id = workflow_definition_id and has_org_permission(d.organization_id, 'workflows.manage'))) with check (exists (select 1 from workflow_definitions d where d.id = workflow_definition_id and has_org_permission(d.organization_id, 'workflows.manage')));
