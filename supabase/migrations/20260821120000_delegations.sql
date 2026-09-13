-- Delegações temporárias, avaliadas por validade em cada autorização.
create table if not exists organization_delegations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade,
  delegator_user_id uuid not null references auth.users(id), delegate_user_id uuid not null references auth.users(id),
  permissions text[] not null default '{}', scope text not null default 'ORGANIZATION', starts_at timestamptz not null,
  ends_at timestamptz not null, reason text not null, created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), revoked_at timestamptz, check (ends_at > starts_at), check (delegator_user_id <> delegate_user_id)
);
alter table organization_delegations enable row level security;
create policy "delegations_read" on organization_delegations for select using (has_org_permission(organization_id, 'admin.view') or delegator_user_id = auth.uid() or delegate_user_id = auth.uid());
create policy "delegations_manage" on organization_delegations for all using (has_org_permission(organization_id, 'admin.manage')) with check (has_org_permission(organization_id, 'admin.manage') and created_by = auth.uid());
create index if not exists idx_delegations_active on organization_delegations(organization_id, delegate_user_id, starts_at, ends_at) where revoked_at is null;
