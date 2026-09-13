-- RPG-OS: Fiscal routing assignments (explicit document-level routing)
--
-- Atribuição explícita e auditável do destino fiscal (organization) de uma
-- invoice. NÃO é um producer: não cria fiscal_inbox_items, não faz fan-out.
-- Sem assignment => NO ROUTE. Reassignment = revogar anterior + criar nova
-- (histórico preservado). Sem matching, sem heurística, sem auto-link.

-- 1. TABELA invoice_routing_assignments
CREATE TABLE IF NOT EXISTS public.invoice_routing_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'ASSIGNED'
        CHECK (status IN ('ASSIGNED', 'REVOKED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL REFERENCES public.users(id),
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. IDEMPOTÊNCIA: no máximo um assignment ACTIVE por invoice.
-- (Reassignment revoga o anterior antes de criar o novo; histórico se mantém.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_routing_active
    ON public.invoice_routing_assignments(invoice_id)
    WHERE status = 'ASSIGNED';

-- 3. ÍNDICES de leitura (destino por invoice; assignments por org)
CREATE INDEX IF NOT EXISTS idx_invoice_routing_invoice
    ON public.invoice_routing_assignments(invoice_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_routing_org
    ON public.invoice_routing_assignments(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_routing_company
    ON public.invoice_routing_assignments(company_id, status, created_at DESC);

-- 4. RLS
ALTER TABLE public.invoice_routing_assignments ENABLE ROW LEVEL SECURITY;

-- Leitura: membros ACTIVE da organization destino.
CREATE POLICY "invoice_routing_read_org" ON public.invoice_routing_assignments
FOR SELECT
USING (
    organization_id IN (
        SELECT om.organization_id
        FROM public.org_memberships om
        WHERE om.user_id = auth.uid()
        AND om.status = 'ACTIVE'
    )
);

-- Escrita: apenas service-role (server actions autorizadas com fiscal.admin).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoice_routing_assignments TO service_role;

-- 5. DOCUMENTAÇÃO
COMMENT ON TABLE public.invoice_routing_assignments IS 'Atribuição explícita do destino fiscal (organization) de uma invoice. Sem assignment = NO ROUTE. Sem fan-out, sem producer.';
COMMENT ON COLUMN public.invoice_routing_assignments.status IS 'ASSIGNED = destino válido; REVOKED = histórico, sem routing futuro.';
