-- RPG-OS: Fiscal submission records (D5 — capability foundation, sem LIVE)
--
-- Registo local de submissões AT por invoice: idempotência, estado e
-- reconciliação futura. Nenhuma linha aqui significa submissão oficial;
-- apenas resposta oficial validada (futura) move para CONFIRMED.
-- Sem NIF do adquirente, sem payload SOAP, sem segredos.

-- 1. TABELA fiscal_submissions
CREATE TABLE IF NOT EXISTS public.fiscal_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'AT',
    environment TEXT NOT NULL DEFAULT 'TEST'
        CHECK (environment IN ('TEST', 'PRODUCTION')),
    operation TEXT NOT NULL DEFAULT 'RegisterInvoice',
    status TEXT NOT NULL DEFAULT 'NOT_SUBMITTED'
        CHECK (status IN ('NOT_SUBMITTED', 'PENDING', 'SUBMITTED', 'CONFIRMED', 'REJECTED', 'UNKNOWN')),
    idempotency_key TEXT NOT NULL,
    external_reference TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    submitted_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    last_error_code TEXT,
    correlation_id TEXT,
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fiscal_submissions_idempotency_unique UNIQUE (idempotency_key)
);

-- 2. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_fiscal_submissions_invoice
    ON public.fiscal_submissions(invoice_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_submissions_company
    ON public.fiscal_submissions(company_id, environment, status);

-- 3. RLS: leitura por membership ACTIVE via bridge company_organizations.
ALTER TABLE public.fiscal_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fiscal_submissions_read_org" ON public.fiscal_submissions
FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM public.company_organizations co
        JOIN public.org_memberships om
          ON om.organization_id = co.organization_id
        WHERE co.company_id = fiscal_submissions.company_id
        AND co.status = 'ACTIVE'
        AND om.user_id = auth.uid()
        AND om.status = 'ACTIVE'
    )
);

-- Escrita: apenas service-role (server actions autorizadas).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fiscal_submissions TO service_role;

COMMENT ON TABLE public.fiscal_submissions IS 'Submissões fiscais AT por invoice: idempotência + estado. Linha nunca prova submissão oficial; só resposta AT validada move para CONFIRMED.';
