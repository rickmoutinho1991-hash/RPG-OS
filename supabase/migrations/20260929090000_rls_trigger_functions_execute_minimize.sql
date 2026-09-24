-- RPG-OS — Vaga M-G/V: menor privilégio em trigger functions
--
-- Descoberta determinística (scan de pg_proc em public): 3 funções de
-- trigger (rettype=trigger) com proacl a conceder EXECUTE a anon e
-- authenticated:
--   public.comms_auto_join_creator()        (SECURITY DEFINER)
--   public.action_plans_guard()             (SECURITY INVOKER)
--   public.reputation_guard_immutable()     (SECURITY INVOKER)
--
-- Porquê revogar:
--   * Trigger functions nunca são chamadas directamente: SELECT directo
--     levanta "trigger functions can only be called as triggers". Logo
--     anon/authenticated não precisam de EXECUTE.
--   * A execução de um trigger NÃO verifica EXECUTE do role que dispara —
--     apenas o CREATE TRIGGER exige EXECUTE no momento da criação. Revogar
--     não impede os triggers de disparar.
--   * comms_auto_join_creator é SECURITY DEFINER: reduzir o seu EXECUTE a
--     apenas service_role elimina uma superfície de invocação privilegiada
--     (defesa em profundidade; alinha com a doutrina da M-G/N).
--
-- Nota (lição M-G/S): o proacl destas funções tem "=X/postgres" (EXECUTE a
-- PUBLIC). Revogar só de anon/authenticated NÃO corta — ambos herdam de
-- PUBLIC. É obrigatório revogar também de PUBLIC. service_role recebe grant
-- explícito para não depender de PUBLIC.
--
-- Sem referências na app (grep apps/ = 0). Idempotente.

revoke execute on function public.comms_auto_join_creator() from public, anon, authenticated;
revoke execute on function public.action_plans_guard() from public, anon, authenticated;
revoke execute on function public.reputation_guard_immutable() from public, anon, authenticated;
grant execute on function public.comms_auto_join_creator() to service_role;
grant execute on function public.action_plans_guard() to service_role;
grant execute on function public.reputation_guard_immutable() to service_role;
