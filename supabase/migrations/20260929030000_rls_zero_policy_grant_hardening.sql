-- RPG-OS — Vaga M-G/O: higiene de grants (pólvora defensiva + TRUNCATE activo)
--
-- Descoberta determinística (proacl real por tabela, vaga M-G/L auditoria):
--   9 tabelas têm RLS_ON com 0 policies mas grants "anon=arwdDxtm" e
--   "authenticated=arwdDxtm" completos em DML + TRUNCATE + REFERENCES + TRIGGER.
--
-- Duas causas de remoção:
--   1. PÓLVORA DEFENSIVA: RLS com 0 policies = deny-all por omissão, MAS o RLS
--      não cobre TRUNCATE/REFERENCES/TRIGGER; e se um dia se fizer
--      DISABLE ROW SECURITY (legítimo), a superfície fica exposta. Com 0
--      policies estas tabelas não são acessíveis por SQL directo via
--      anon/authenticated de qualquer forma (RLS devolve 0 rows) — revogar é
--      estritamente não-regressivo para os fluxos da app (que passam por
--      RPCs/service_role).
--   2. TRUNCATE ACTIVO por anon: RLS não restringe TRUNCATE; rever
--      arwdDxtm a anon elimina um vetor de negação de serviço imediato.
--
-- Ação: REVOKE ALL ... FROM anon, authenticated nas 9 tabelas; mantêm-se
--   postgres (owner, sem bypass RLS em força) e service_role (BYPASSRLS,
--   usado pelos RPCs de serviço). Idempotente (revoke de privilégio inexistente
--   é no-op seguro com mensagem).

revoke all on table public.companies from anon, authenticated;
revoke all on table public.health_audit_integrity from anon, authenticated;
revoke all on table public.health_sync_history from anon, authenticated;
revoke all on table public.invoice_items from anon, authenticated;
revoke all on table public.payments from anon, authenticated;
revoke all on table public.project_materials from anon, authenticated;
revoke all on table public.project_photos from anon, authenticated;
revoke all on table public.project_tasks from anon, authenticated;
revoke all on table public.quote_items from anon, authenticated;