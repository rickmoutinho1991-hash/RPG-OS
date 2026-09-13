-- ============================================================================
-- S2: RLS nas tabelas de saúde sem policies
-- ============================================================================
-- PROPOSITO
--   Fechar as últimas lacunas de RLS em public: health_audit_integrity e
--   health_sync_history ficam sem acesso authenticated.
--
-- DECISAO (ver PASSO 0.2 do ciclo S2)
--   health_audit_integrity : colunas event_id/integrity_hash/previous_hash/
--                            created_at  -> SEM coluna de owner (user_id/
--                            actor_id). Acesso unicamente service role/
--                            migrations. Sem policies para authenticated.
--   health_sync_history    : colunas id/person_id/provider_id/... ->
--                            person_id NÃO é user_id/actor_id (é referência
--                            a entidade externa de saude). SEM coluna de
--                            owner autenticavel. Acesso unicamente service
--                            role/migrations. Sem policies para authenticated.
--
-- PORQUE SEM POLICIES
--   Estas tabelas são de telemteria/integridade (hash chain de audit) e
--   historial de sincronizacao. Nenhum cliente authenticated precisa de as
--   ler; expô-las ao browser seria ampliação desnecessária da superfície.
--   Com RLS ENABLE e zero policies, TODA a query via anon/authenticated
--   devolve zero linhas; apenas a service role (backend) acede.
--
-- SEM DROP; aditivo; idempotente por natureza. Aplicar uma única vez em DEV.
-- ============================================================================

ALTER TABLE public.health_audit_integrity ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.health_sync_history ENABLE ROW LEVEL SECURITY;