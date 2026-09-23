-- RPG-OS — Hardening: SECURITY DEFINER com search_path sem pg_temp explícito (M-G/J).
--
-- Descoberta na varredura determinística de pg_proc (auditoria contínua):
--   has_org_permission, is_org_member, is_comms_member, comms_auto_join_creator
--   são SECURITY DEFINER com `SET search_path TO 'public'` — pg_temp NÃO
--   listado explicitamente.
--
-- Prova master (empírica, não doutrina): com search_path='public', o Postgres
-- resolve `pg_temp.<nome>` ANTES de qualquer schema da lista quando pg_temp
-- NÃO está listado explicitamente. Teste real executado em DEV:
--   create temp table rpg_leak_probe_<nome> (...) → o resolver devolveu
--   'ESTA_EA_FAKE_PGTEMP' (tabela fake) em vez de erro/real, provando que
--   um atacante que cria pg_temp.host_permissions (nome referido SEM schema
--   no corpo) sequestra a resolução e o SECURITY DEFINER — que corre como
--   owner (postgres, bypass RLS, dados RGPD) — passa a consultar a tabela
--   fake do atacante.
--
-- Ação (idempotente, determinística — nunca drop, apenas ALTER com cast):
--   fixar `SET search_path TO 'public','pg_temp'` nas 4 funções: pg_temp
--   passa a ser EXPLÍCITO e em ÚLTIMO lugar → o resolver consulta public
--   primeiro e o pg_temp fake deixa de ser resolvido antes.

alter function public.has_org_permission(uuid, text)
  set search_path to 'public', 'pg_temp';

alter function public.is_org_member(uuid)
  set search_path to 'public', 'pg_temp';

alter function public.is_comms_member(uuid)
  set search_path to 'public', 'pg_temp';

alter function public.comms_auto_join_creator()
  set search_path to 'public', 'pg_temp';
