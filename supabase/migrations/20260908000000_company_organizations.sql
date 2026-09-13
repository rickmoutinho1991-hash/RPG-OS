-- RPG-OS: Company <-> Organization formal relationship (bridge)
--
-- Relação formal, explícita e auditável entre companies (eixo fiscal/legal)
-- e organizations (eixo RBAC/governance). Nenhuma relação é criada
-- automaticamente: vínculos nascem apenas de ação administrativa explícita.
-- Sem backfill, sem heurística, sem matching por NIF/nome/email/UUID.
-- Os dois eixos continuam semanticamente distintos; a bridge apenas declara:
-- "Company X está formalmente associada à Organization Y".

-- 1. TABELA company_organizations
CREATE TABLE IF NOT EXISTS public.company_organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'REVOKED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL REFERENCES public.users(id),
    confirmed_at TIMESTAMPTZ,
    confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT company_organizations_pair_unique UNIQUE (company_id, organization_id)
);

-- 2. ÍNDICES (UNIQUE já indexa o par; estes servem as duas direções + estado)
CREATE INDEX IF NOT EXISTS idx_company_organizations_company
    ON public.company_organizations(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_organizations_org
    ON public.company_organizations(organization_id, status, created_at DESC);

-- 3. RLS
ALTER TABLE public.company_organizations ENABLE ROW LEVEL SECURITY;

-- Leitura: membros ACTIVE da organization do vínculo.
-- (Leitura pelo eixo company faz-se apenas server-side com fiscal.admin;
--  sem policy company-side para não expor vínculos multi-org.)
CREATE POLICY "company_organizations_read_org" ON public.company_organizations
FOR SELECT
USING (
    organization_id IN (
        SELECT om.organization_id
        FROM public.org_memberships om
        WHERE om.user_id = auth.uid()
        AND om.status = 'ACTIVE'
    )
);

-- Escrita: apenas service-role (server actions autorizadas); sem policies
-- de INSERT/UPDATE/DELETE para roles anon/authenticated.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_organizations TO service_role;

-- 4. DOCUMENTAÇÃO
COMMENT ON TABLE public.company_organizations IS 'Vínculo formal e auditável entre companies (eixo fiscal) e organizations (eixo RBAC). Criação apenas por ação administrativa explícita; sem auto-link.';
COMMENT ON COLUMN public.company_organizations.status IS 'ACTIVE = utilizável; REVOKED = histórico, sem novos acessos/producers.';
