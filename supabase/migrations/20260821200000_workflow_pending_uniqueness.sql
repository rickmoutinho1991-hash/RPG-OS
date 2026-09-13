-- RPG-OS: hardening de idempotência do startApproval.
-- Garante, ao nível da base de dados, que não podem existir duas
-- workflow_instances PENDING para a mesma entidade (entity_type + entity_id),
-- eliminando a janela de corrida check-then-insert existente na aplicação.
--
-- O índice é PARTIAL (WHERE status = 'PENDING'):
--  - workflows históricos/finalizados (APPROVED/REJECTED/CANCELLED) não são
--    tocados e podem repetir entity_type/entity_id livremente;
--  - corresponde exatamente ao modelo atual: uma entidade tem, no máximo,
--    um fluxo de aprovação em curso;
--  - entity_id é UUID da tabela de origem, pelo que identifica a entidade
--    globalmente (organization_id seria redundante).
--
-- NOTA: se existirem duplicados PENDING históricos, esta migration falha
-- de forma explícita (fail-closed) em vez de saltar a garantia silenciosamente.
create unique index if not exists uq_workflow_one_pending_per_entity
  on workflow_instances (entity_type, entity_id)
  where status = 'PENDING';