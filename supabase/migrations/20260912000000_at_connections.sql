-- RPG-OS: AT connection registry (D3 — credential infrastructure, sem conectividade)
--
-- Regista a EXISTÊNCIA de uma ligação fiscal por company/ambiente, sem
-- guardar segredos (só referências opacas ao Vault) e sem afirmar
-- conectividade AT. NIF deriva sempre de companies.tax_number server-side.
-- Uma conexão por (company, environment): UNIQUE impede duplicados.

-- 1. TABELA at_connections
CREATE TABLE IF NOT EXISTS public.at_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    nif TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'TEST'
        CHECK (environment IN ('TEST', 'PRODUCTION')),
    status TEXT NOT NULL DEFAULT 'NOT_CONNECTED'
        CHECK (status IN ('NOT_CONNECTED', 'CREDENTIALS_PENDING', 'READY', 'ACTIVE', 'REVOKED', 'INVALID', 'EXPIRED')),
    consent_id UUID REFERENCES public.government_consents(id) ON DELETE SET NULL,
    cert_secret_ref TEXT,
    key_secret_ref TEXT,
    chain_secret_ref TEXT,
    wfa_user_secret_ref TEXT,
    wfa_pass_secret_ref TEXT,
    cert_fingerprint TEXT,
    cert_issuer TEXT,
    cert_subject TEXT,
    cert_serial TEXT,
    cert_not_before TIMESTAMPTZ,
    cert_not_after TIMESTAMPTZ,
    last_error TEXT,
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT at_connections_pair_unique UNIQUE (company_id, environment)
);

-- 2. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_at_connections_company
    ON public.at_connections(company_id, environment, status);
CREATE INDEX IF NOT EXISTS idx_at_connections_status
    ON public.at_connections(status, updated_at DESC);

-- 3. RLS: leitura por membership ACTIVE via bridge company_organizations.
ALTER TABLE public.at_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "at_connections_read_org" ON public.at_connections
FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM public.company_organizations co
        JOIN public.org_memberships om
          ON om.organization_id = co.organization_id
        WHERE co.company_id = at_connections.company_id
        AND co.status = 'ACTIVE'
        AND om.user_id = auth.uid()
        AND om.status = 'ACTIVE'
    )
);

-- Escrita: apenas service-role (server actions autorizadas).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.at_connections TO service_role;

COMMENT ON TABLE public.at_connections IS 'Registo de ligação fiscal AT por company/ambiente. Só referências opacas ao Vault; READY nunca significa conectividade AT.';
