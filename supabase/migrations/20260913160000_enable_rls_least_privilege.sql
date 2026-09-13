-- ============================================================================
-- S1: RLS least-privilege nas 10 tabelas public sem policies
-- ============================================================================
-- PROPOSITO
--   Aplicar ROW LEVEL SECURITY por classe de acesso, fechando lacunas
--   de least-privilege em tabelas public que ainda não tinham policies.
--
-- POLITICA
--   * CATALOGOS RBAC (sem coluna de user/tenant): leitura para
--     authenticated; SEM policies de escrita (writes apenas via
--     service role / migrations).
--   * PESSOAIS (coluna de owner real): owner-only FULL (SELECT/INSERT/
--     UPDATE/DELETE) com USING+WITH CHECK ligados a auth.uid().
--   * MEMBRIAS (user + scope project/company): SELECT own-or-same-scope;
--     SEM policies de escrita.
--
-- SEM DROP; idempotente por natureza (CREATE POLICY em tabelas recém-RLS;
-- cada policy criada uma única vez). Aplicar uma só vez em DEV.
--
-- NOTAS DE DESENHO (colunas reais do PASSO 0.2)
--   * addresses: sem coluna user_id/company_id -> tratada como catalogo
--     (leitura authenticated), pois não existe owner individual.
--   * document_verifications: owner real = verified_by.
--   * user_roles: sem coluna de scope -> SELECT own-only.
--   * project_members: own-or-same-project via users no mesmo project_id.
--   * company_employees: own-or-same-company via users na mesma company_id.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- CLASSE 1: CATALOGOS RBAC (e tabelas sem owner) - SELECT authenticated
-- ---------------------------------------------------------------------------
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_authenticated_read" ON public.roles
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions_authenticated_read" ON public.permissions
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions_authenticated_read" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addresses_authenticated_read" ON public.addresses
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- CLASSE 2: PESSOAIS (owner real) - ALL owner-only
-- ---------------------------------------------------------------------------
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "registrations_owner_all" ON public.registrations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE public.rgpd_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rgpd_consents_owner_all" ON public.rgpd_consents
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE public.document_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_verifications_owner_all" ON public.document_verifications
  FOR ALL TO authenticated
  USING (verified_by = auth.uid())
  WITH CHECK (verified_by = auth.uid());

-- ---------------------------------------------------------------------------
-- CLASSE 3: MEMBRIAS (user + scope) - SELECT own-or-same-scope
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_own_read" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_members_own_or_same_project_read" ON public.project_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR project_id IN (
      SELECT pm.project_id FROM public.project_members pm
      WHERE pm.user_id = auth.uid()
    )
  );

ALTER TABLE public.company_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_employees_own_or_same_company_read" ON public.company_employees
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR company_id IN (
      SELECT ce.company_id FROM public.company_employees ce
      WHERE ce.user_id = auth.uid()
    )
  );