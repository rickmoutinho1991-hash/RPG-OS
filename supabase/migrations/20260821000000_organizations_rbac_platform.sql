-- ============================================================
-- RPG-OS — Organizações, Hierarquia, RBAC, Tarefas, Comms,
-- Knowledge Hub e Notificações
-- ============================================================

create extension if not exists "uuid-ossp";

-- ─── Organizações ─────────────────────────────────────────────
create table if not exists organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  legal_name text,
  tax_number text,
  plan_tier text not null default 'FREE',
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists departments (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists teams (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  department_id uuid references departments(id) on delete set null,
  name text not null,
  created_at timestamptz not null default now()
);

-- ─── Cargos personalizados por organização ────────────────────
create table if not exists custom_roles (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  label text not null,
  permissions text[] not null default '{}',
  scope text not null default 'ORGANIZATION',
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);

-- ─── Membros (USER ↔ ORGANIZATION) ────────────────────────────
create table if not exists org_memberships (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null default 'EMPLOYEE',
  custom_role_id uuid references custom_roles(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','INVITED','SUSPENDED','REMOVED')),
  is_primary boolean not null default false,
  title text,
  permissions_override text[] not null default '{}',
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists idx_org_memberships_user on org_memberships(user_id);
create index if not exists idx_org_memberships_org on org_memberships(organization_id);

create table if not exists team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (team_id, user_id)
);

-- ─── Tarefas Universais ───────────────────────────────────────
create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  status text not null default 'TODO'
    check (status in ('TODO','IN_PROGRESS','REVIEW','DONE','CANCELLED')),
  priority text not null default 'MEDIUM'
    check (priority in ('LOW','MEDIUM','HIGH','URGENT')),
  due_date timestamptz,
  assignee_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id),
  organization_id uuid references organizations(id) on delete cascade,
  department_id uuid references departments(id) on delete set null,
  team_id uuid references teams(id) on delete set null,
  client_id uuid,
  project_id uuid,
  parent_task_id uuid references tasks(id) on delete cascade,
  recurrence_rule text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_tasks_assignee on tasks(assignee_id, status);
create index if not exists idx_tasks_org on tasks(organization_id, status);

-- ─── Notificações ─────────────────────────────────────────────
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'INFO'
    check (category in ('INFO','SUCCESS','WARNING','URGENT','SYSTEM','TASK','APPROVAL','MESSAGE','SECURITY')),
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on notifications(user_id, read_at);

-- ─── Comunicação (RPG-OS Comms) ───────────────────────────────
create table if not exists comms_channels (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  type text not null default 'TEAM'
    check (type in ('DIRECT','TEAM','DEPARTMENT','PROJECT','ANNOUNCEMENTS')),
  description text,
  is_private boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists comms_channel_members (
  channel_id uuid not null references comms_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  muted boolean not null default false,
  favorite boolean not null default false,
  last_read_at timestamptz,
  primary key (channel_id, user_id)
);

create table if not exists comms_messages (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid not null references comms_channels(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null,
  kind text not null default 'MESSAGE'
    check (kind in ('MESSAGE','ANNOUNCEMENT','URGENT')),
  thread_root_id uuid references comms_messages(id) on delete cascade,
  mentions uuid[] not null default '{}',
  attachments jsonb not null default '[]'::jsonb,
  requires_read_confirmation boolean not null default false,
  read_by uuid[] not null default '{}',
  scheduled_for timestamptz,
  pinned_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_comms_messages_channel on comms_messages(channel_id, created_at desc);

-- ─── Knowledge Hub ────────────────────────────────────────────
create table if not exists knowledge_articles (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,
  title text not null,
  slug text not null,
  category text not null default 'wiki'
    check (category in ('manual','procedimento','politica','faq','sop','formacao','wiki','legislacao')),
  content text not null default '',
  status text not null default 'DRAFT'
    check (status in ('DRAFT','PUBLISHED','UNDER_REVIEW','ARCHIVED')),
  owner_id uuid references auth.users(id),
  department_id uuid references departments(id) on delete set null,
  version integer not null default 1,
  tags text[] not null default '{}',
  verified_at timestamptz,
  review_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

-- ─── Workflows (fundação para aprovações) ─────────────────────
create table if not exists workflow_instances (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  current_step text not null default 'SUBMITTED',
  status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
  requested_by uuid references auth.users(id),
  approver_id uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_workflow_approver on workflow_instances(approver_id, status);

-- ============================================================
-- RLS — isolamento multi-tenant estrito
-- ============================================================
alter table organizations enable row level security;
alter table departments enable row level security;
alter table teams enable row level security;
alter table custom_roles enable row level security;
alter table org_memberships enable row level security;
alter table team_members enable row level security;
alter table tasks enable row level security;
alter table notifications enable row level security;
alter table comms_channels enable row level security;
alter table comms_channel_members enable row level security;
alter table comms_messages enable row level security;
alter table knowledge_articles enable row level security;
alter table workflow_instances enable row level security;

-- Helper: o utilizador é membro ativo da organização?
create or replace function public.is_org_member(org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_memberships m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'ACTIVE'
  );
$$;

-- Organizations: visíveis apenas a membros; criação pelo próprio utilizador
drop policy if exists "org_select_member" on organizations;
create policy "org_select_member" on organizations for select
  using (is_org_member(id));
drop policy if exists "org_insert_self" on organizations;
create policy "org_insert_self" on organizations for insert
  with check (created_by = auth.uid());

-- Departments / Teams / Custom roles: membros leem, gestão escreve
drop policy if exists "dept_select" on departments;
create policy "dept_select" on departments for select using (is_org_member(organization_id));
drop policy if exists "teams_select" on teams;
create policy "teams_select" on teams for select using (is_org_member(organization_id));
drop policy if exists "croles_select" on custom_roles;
create policy "croles_select" on custom_roles for select using (is_org_member(organization_id));

-- Memberships: cada um vê as suas + membros das suas organizações
drop policy if exists "memb_select" on org_memberships;
create policy "memb_select" on org_memberships for select
  using (user_id = auth.uid() or is_org_member(organization_id));

-- Team members: membros da organização
drop policy if exists "tm_select" on team_members;
create policy "tm_select" on team_members for select
  using (exists (
    select 1 from teams t where t.id = team_id and is_org_member(t.organization_id)
  ));

-- Tasks: pessoais (sem org) só do dono/atribuídas; de organização só para membros
drop policy if exists "tasks_select" on tasks;
create policy "tasks_select" on tasks for select
  using (
    organization_id is null
      or is_org_member(organization_id)
  );
drop policy if exists "tasks_write" on tasks;
create policy "tasks_write" on tasks for insert with check (
  organization_id is null or is_org_member(organization_id)
);
drop policy if exists "tasks_update" on tasks;
create policy "tasks_update" on tasks for update using (
  assignee_id = auth.uid() or created_by = auth.uid()
  or (organization_id is not null and is_org_member(organization_id))
);

-- Notifications: apenas o proprietário
drop policy if exists "notif_all" on notifications;
create policy "notif_all" on notifications for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Comms: canais/mensagens por organização (ou pessoais se organization_id null)
drop policy if exists "chan_select" on comms_channels;
create policy "chan_select" on comms_channels for select
  using (organization_id is null or is_org_member(organization_id));
drop policy if exists "chan_insert" on comms_channels;
create policy "chan_insert" on comms_channels for insert
  with check (created_by = auth.uid());
drop policy if exists "msg_select" on comms_messages;
create policy "msg_select" on comms_messages for select
  using (exists (
    select 1 from comms_channels c
    where c.id = channel_id
      and (c.organization_id is null or is_org_member(c.organization_id))
  ));
drop policy if exists "msg_insert" on comms_messages;
create policy "msg_insert" on comms_messages for insert
  with check (author_id = auth.uid());

-- Knowledge: leitura para membros, escrita pelo dono
drop policy if exists "kb_select" on knowledge_articles;
create policy "kb_select" on knowledge_articles for select
  using (organization_id is null or is_org_member(organization_id));
drop policy if exists "kb_write" on knowledge_articles;
create policy "kb_write" on knowledge_articles for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Workflows: requerente e aprovador + membros da org
drop policy if exists "wf_select" on workflow_instances;
create policy "wf_select" on workflow_instances for select
  using (
    requested_by = auth.uid() or approver_id = auth.uid()
    or (organization_id is not null and is_org_member(organization_id))
  );
