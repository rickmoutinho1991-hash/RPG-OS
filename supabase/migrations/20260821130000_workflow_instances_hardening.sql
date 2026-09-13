-- RPG-OS: endurecimento incremental do motor de Workflows / Aprovações.
-- Aditivo, sem DROP de dados. Adiciona colunas de apresentação e políticas
-- RLS que permitem decisões seguras também através de clientes Supabase diretos,
-- mantendo o princípio "RLS é a barreira de base de dados".

-- ─── Colunas de apresentação e contexto ──────────────────────────
alter table workflow_instances add column if not exists title text;
alter table workflow_instances add column if not exists summary text;
alter table workflow_instances add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Índices de trabalho (listas do centro de aprovações)
create index if not exists idx_workflow_org_status on workflow_instances(organization_id, status);
create index if not exists idx_workflow_requested on workflow_instances(requested_by, status, created_at desc);

-- ─── RLS: inserção só como requerente ────────────────────────────
drop policy if exists "wf_insert_requester" on workflow_instances;
create policy "wf_insert_requester" on workflow_instances for insert
  with check (
    requested_by = auth.uid()
    and (organization_id is null or is_org_member(organization_id))
  );

-- ─── RLS: decisão (aprovar/rejeitar) apenas pelo aprovador ───────
-- O aprovador só pode passar de PENDING para APPROVED/REJECTED;
-- não pode tocar em requerente, entidade, aprovador ou organização.
drop policy if exists "wf_approver_decide" on workflow_instances;
create policy "wf_approver_decide" on workflow_instances for update
  using (approver_id = auth.uid() and status = 'PENDING')
  with check (
    status in ('APPROVED', 'REJECTED')
    and decided_at is not null
    and approver_id = (select wf.approver_id from workflow_instances wf where wf.id = workflow_instances.id)
    and requested_by = (select wf.requested_by from workflow_instances wf where wf.id = workflow_instances.id)
    and entity_type = (select wf.entity_type from workflow_instances wf where wf.id = workflow_instances.id)
    and entity_id = (select wf.entity_id from workflow_instances wf where wf.id = workflow_instances.id)
    and organization_id is not distinct from (select wf.organization_id from workflow_instances wf where wf.id = workflow_instances.id)
  );

-- ─── RLS: cancelamento só pelo requerente enquanto PENDING ────────
drop policy if exists "wf_requester_cancel" on workflow_instances;
create policy "wf_requester_cancel" on workflow_instances for update
  using (requested_by = auth.uid() and status = 'PENDING')
  with check (
    status = 'CANCELLED'
    and requested_by = (select wf.requested_by from workflow_instances wf where wf.id = workflow_instances.id)
    and approver_id = (select wf.approver_id from workflow_instances wf where wf.id = workflow_instances.id)
    and organization_id is not distinct from (select wf.organization_id from workflow_instances wf where wf.id = workflow_instances.id)
  );

-- ─── Permissões explícitas de serviço ─────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workflow_instances TO service_role;