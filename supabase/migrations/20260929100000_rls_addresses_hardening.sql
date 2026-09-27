-- RPG-OS — Vaga M-G/V: fechar leitura global de moradas (RGPD)
--
-- Descoberta determinística (scan de policies por tabela): a única policy
-- `FOR SELECT TO authenticated USING (true)` sobre dados PESSOAIS é a
-- `addresses_authenticated_read` em public.addresses (criada em
-- 20260913160000 como "catálogo sem owner").
--
-- Porquê P1: a morada é dado pessoal (art. 4º RGPD) POR REFERÊNCIA —
-- `profiles.address_id` / `companies.address_id` apontam para linhas desta
-- tabela. `USING (true)` + default ACL (SELECT para authenticated) expõe ALL
-- moradas armazenadas a qualquer autenticado, cross-tenant.
--
-- Sem consumidores legítimos diretos: os únicos usos de `addresses` na app
-- são server-side via createAdminClient() (service_role, BYPASSRLS) em
-- apps/web/app/registo/actions/{cliente,empresa,eni}.ts. Nenhum componente
-- cliente consulta a tabela via session client.
--
-- Ação (idempotente, mesmo padrão da Vaga M-G/U em transport_document_items):
--   1. DROP da policy de leitura irrestrita → deny-by-default via RLS;
--   2. REVOKE ALL de anon/authenticated → remove a "pólvora defensiva"
--      (se um dia a RLS for desligada, a tabela não fica exposta).
-- Mantém-se postgres (owner) e service_role (BYPASSRLS).

DROP POLICY IF EXISTS "addresses_authenticated_read" ON public.addresses;

REVOKE ALL ON TABLE public.addresses FROM anon, authenticated;