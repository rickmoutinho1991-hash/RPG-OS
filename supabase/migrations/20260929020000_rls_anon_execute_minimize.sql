-- RPG-OS — Hardening M-G/N: restringir superfície anon-EXECUTE
--
-- Varredura (pg_proc + has_function_privilege REAL, sem suposição):
--   anon tinha EXECUTE (default public) em 7 booleanas SECURITY DEFINER
--   de autorização. Prova empírica mostrou que chamá-las como anon devolve
--   sempre false (auth.uid() null) — não há leak — mas por menor privilégio
--   anon não deve conseguir invocar funções de autorização: reduz-se a
--   superfície public-EXECUTE a ZERO para booleanas definer.
--
-- Nota de privilégio (determinística, verificada via proacl):
--   o proacl REAL mostra grants DIRECTOS "anon=X/postgres" nas booleanas
--   (não apenas o default PUBLIC). Revogue-se ambos: from public (default) e
--   from anon (grant directo). Mais vale revocar a mais e grant de novo aos
--   dois roles que as policies RLS usam (authenticated, service_role), pois o
--   juiz final é has_function_privilege('anon', ...) = false pós-aplicação.
--
-- Triggers (action_plans_guard, reputation_guard_immutable, reputation_in_tenant,
--   comms_auto_join_creator): o executor invoca triggers sem exigir EXECUTE do
--   role do DML — ficam intactas.

revoke execute on function public.has_org_permission(uuid, text) from public;
revoke execute on function public.is_org_member(uuid) from public;
revoke execute on function public.is_comms_member(uuid) from public;
revoke execute on function public.is_same_company(uuid, uuid) from public;
revoke execute on function public.is_same_project(uuid, uuid) from public;
revoke execute on function public.service_request_is_for_client(uuid) from public;
revoke execute on function public.service_quote_is_for_provider(uuid) from public;

revoke execute on function public.has_org_permission(uuid, text) from anon;
revoke execute on function public.is_org_member(uuid) from anon;
revoke execute on function public.is_comms_member(uuid) from anon;
revoke execute on function public.is_same_company(uuid, uuid) from anon;
revoke execute on function public.is_same_project(uuid, uuid) from anon;
revoke execute on function public.service_request_is_for_client(uuid) from anon;
revoke execute on function public.service_quote_is_for_provider(uuid) from anon;

grant execute on function public.has_org_permission(uuid, text) to authenticated, service_role;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;
grant execute on function public.is_comms_member(uuid) to authenticated, service_role;
grant execute on function public.is_same_company(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_same_project(uuid, uuid) to authenticated, service_role;
grant execute on function public.service_request_is_for_client(uuid) to authenticated, service_role;
grant execute on function public.service_quote_is_for_provider(uuid) to authenticated, service_role;