-- RPG-OS: operações administrativas e tarefas universais. Incremental, sem DROP destrutivo.
create table if not exists organization_invitations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade,
  email text not null, role_key text not null default 'EMPLOYEE', department_id uuid references departments(id) on delete set null,
  team_id uuid references teams(id) on delete set null, invited_by uuid not null references auth.users(id),
  token_hash text not null unique, status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','REJECTED','EXPIRED','REVOKED')),
  expires_at timestamptz not null, accepted_by uuid references auth.users(id), accepted_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists idx_org_invites_email on organization_invitations(lower(email), status);

alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check check (status in ('TODO','IN_PROGRESS','BLOCKED','REVIEW','DONE','CANCELLED'));
alter table tasks add column if not exists labels text[] not null default '{}';
alter table tasks add column if not exists checklist jsonb not null default '[]'::jsonb;
alter table tasks add column if not exists estimated_minutes integer;
alter table tasks add column if not exists related_entity_type text;
alter table tasks add column if not exists related_entity_id uuid;

create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid not null references auth.users(id), body text not null, created_at timestamptz not null default now()
);
create table if not exists task_activity (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references tasks(id) on delete cascade,
  actor_id uuid not null references auth.users(id), action text not null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table organization_invitations enable row level security;
alter table task_comments enable row level security;
alter table task_activity enable row level security;
create policy "org_invites_manage" on organization_invitations for all using (has_org_permission(organization_id, 'admin.manage')) with check (has_org_permission(organization_id, 'admin.manage'));
create policy "task_comments_access" on task_comments for all using (exists (select 1 from tasks t where t.id = task_id and (t.created_by = auth.uid() or t.assignee_id = auth.uid() or (t.organization_id is not null and has_org_permission(t.organization_id, 'tarefas.view'))))) with check (author_id = auth.uid() and exists (select 1 from tasks t where t.id = task_id and (t.created_by = auth.uid() or t.assignee_id = auth.uid() or (t.organization_id is not null and has_org_permission(t.organization_id, 'tarefas.edit')))));
create policy "task_activity_access" on task_activity for select using (exists (select 1 from tasks t where t.id = task_id and (t.created_by = auth.uid() or t.assignee_id = auth.uid() or (t.organization_id is not null and has_org_permission(t.organization_id, 'tarefas.view')))));
