-- ============================================================================
-- P7a: Marketplace Transacional I — Tabelas de Pedidos + Propostas + RLS
-- ============================================================================
-- PROPOSITO: Criar tabelas do ciclo REQUEST → QUOTES com RLS least-privilege
-- SCOPING:
--   * service_requests: owner (client) FULL; providers com proposta submetida SELECT
--   * service_quotes: provider FULL; client (owner do request) SELECT
--   * contracts: ambas as partes FULL; terceiros com proposta aceita SELECT
--   * contract_milestones: ambas as partes FULL
--   * warranties: ambas as partes FULL
-- SEM DROP; idempotente (CREATE POLICY apenas uma vez)
-- ============================================================================

-- ENUMS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_status') THEN
        CREATE TYPE request_status AS ENUM (
            'DRAFT', 'PUBLISHED', 'QUOTES_RECEIVED', 'ADJUDICATING',
            'ADJUDICATED', 'CONTRACTING', 'CONTRACTED', 'EXECUTING',
            'COMPLETED', 'CANCELLED', 'DISPUTED'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'marketplace_quote_status') THEN
        CREATE TYPE marketplace_quote_status AS ENUM (
            'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED',
            'EXPIRED', 'WITHDRAWN', 'CONVERTED_TO_CONTRACT'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_status') THEN
        CREATE TYPE contract_status AS ENUM (
            'DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'DISPUTED'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'milestone_status') THEN
        CREATE TYPE milestone_status AS ENUM (
            'PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'warranty_status') THEN
        CREATE TYPE warranty_status AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');
    END IF;
END $$;

-- SERVICE REQUESTS
CREATE TABLE IF NOT EXISTS public.service_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.users(id),
    category_id UUID NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    budget_type TEXT NOT NULL CHECK (budget_type IN ('FIXED', 'RANGE', 'NEGOTIABLE')),
    budget_amount_cents BIGINT,
    budget_min_cents BIGINT,
    budget_max_cents BIGINT,
    budget_currency TEXT NOT NULL DEFAULT 'EUR',
    urgency TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (urgency IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    desired_start_date DATE,
    desired_end_date DATE,
    location_service_mode TEXT NOT NULL DEFAULT 'BOTH' CHECK (location_service_mode IN ('REMOTE', 'ON_SITE', 'BOTH')),
    location_address TEXT,
    location_postal_code TEXT,
    location_city TEXT,
    location_district TEXT,
    status request_status NOT NULL DEFAULT 'DRAFT',
    moderation_status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (moderation_status IN ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED')),
    published_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- SERVICE QUOTES
CREATE TABLE IF NOT EXISTS public.service_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.users(id),
    subtotal_cents BIGINT NOT NULL DEFAULT 0,
    tax_cents BIGINT NOT NULL DEFAULT 0,
    total_cents BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'EUR',
    valid_until DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
    terms TEXT,
    warranty_months INTEGER,
    estimated_start_date DATE,
    estimated_duration_days INTEGER,
    response_to_questions TEXT,
    status marketplace_quote_status NOT NULL DEFAULT 'DRAFT',
    sent_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- SERVICE QUOTE ITEMS
CREATE TABLE IF NOT EXISTS public.service_quote_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES public.service_quotes(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'un',
    unit_price_cents BIGINT NOT NULL,
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 23.00,
    total_cents BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CONTRACTS
CREATE TABLE IF NOT EXISTS public.contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.users(id),
    client_id UUID NOT NULL REFERENCES public.users(id),
    adjudicated_quote_id UUID REFERENCES public.service_quotes(id),
    status contract_status NOT NULL DEFAULT 'DRAFT',
    signed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CONTRACT MILESTONES
CREATE TABLE IF NOT EXISTS public.contract_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE,
    amount_cents BIGINT NOT NULL DEFAULT 0,
    status milestone_status NOT NULL DEFAULT 'PENDING',
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- WARRANTIES
CREATE TABLE IF NOT EXISTS public.warranties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
    provider_id UUID NOT NULL REFERENCES public.users(id),
    client_id UUID NOT NULL REFERENCES public.users(id),
    warranty_period_months INTEGER NOT NULL CHECK (warranty_period_months > 0),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NOT NULL,
    coverage TEXT NOT NULL,
    status warranty_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_service_requests_client_id ON public.service_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON public.service_requests(status);
CREATE INDEX IF NOT EXISTS idx_service_quotes_request_id ON public.service_quotes(request_id);
CREATE INDEX IF NOT EXISTS idx_service_quotes_provider_id ON public.service_quotes(provider_id);
CREATE INDEX IF NOT EXISTS idx_service_quotes_status ON public.service_quotes(status);
CREATE INDEX IF NOT EXISTS idx_contracts_request_id ON public.contracts(request_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON public.contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_provider_id ON public.contracts(provider_id);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_contract_id ON public.contract_milestones(contract_id);
CREATE INDEX IF NOT EXISTS idx_warranties_order_id ON public.warranties(order_id);
CREATE INDEX IF NOT EXISTS idx_warranties_client_id ON public.warranties(client_id);
CREATE INDEX IF NOT EXISTS idx_warranties_provider_id ON public.warranties(provider_id);

-- RLS ENABLE
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;

-- SERVICE REQUESTS POLICIES
-- Owner (client) FULL
CREATE POLICY "service_requests_owner_all" ON public.service_requests
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

-- Providers with submitted quote can SELECT
CREATE POLICY "service_requests_provider_read" ON public.service_requests
    FOR SELECT TO authenticated
    USING (
        id IN (
            SELECT sq.request_id FROM public.service_quotes sq
            WHERE sq.provider_id = auth.uid()
        )
    );

-- SERVICE QUOTES POLICIES
-- Provider FULL
CREATE POLICY "service_quotes_provider_all" ON public.service_quotes
    FOR ALL TO authenticated
    USING (provider_id = auth.uid())
    WITH CHECK (provider_id = auth.uid());

-- Client (owner of request) SELECT
CREATE POLICY "service_quotes_client_read" ON public.service_quotes
    FOR SELECT TO authenticated
    USING (
        request_id IN (
            SELECT sr.id FROM public.service_requests sr
            WHERE sr.client_id = auth.uid()
        )
    );

-- SERVICE QUOTE ITEMS - follow parent quote
CREATE POLICY "service_quote_items_provider_all" ON public.service_quote_items
    FOR ALL TO authenticated
    USING (
        quote_id IN (
            SELECT id FROM public.service_quotes WHERE provider_id = auth.uid()
        )
    )
    WITH CHECK (
        quote_id IN (
            SELECT id FROM public.service_quotes WHERE provider_id = auth.uid()
        )
    );

CREATE POLICY "service_quote_items_client_read" ON public.service_quote_items
    FOR SELECT TO authenticated
    USING (
        quote_id IN (
            SELECT sq.id FROM public.service_quotes sq
            JOIN public.service_requests sr ON sr.id = sq.request_id
            WHERE sr.client_id = auth.uid()
        )
    );

-- CONTRACTS POLICIES
-- Both parties FULL
CREATE POLICY "contracts_parties_all" ON public.contracts
    FOR ALL TO authenticated
    USING (client_id = auth.uid() OR provider_id = auth.uid())
    WITH CHECK (client_id = auth.uid() OR provider_id = auth.uid());

-- CONTRACT MILESTONES - follow parent contract
CREATE POLICY "contract_milestones_parties_all" ON public.contract_milestones
    FOR ALL TO authenticated
    USING (
        contract_id IN (
            SELECT id FROM public.contracts WHERE client_id = auth.uid() OR provider_id = auth.uid()
        )
    )
    WITH CHECK (
        contract_id IN (
            SELECT id FROM public.contracts WHERE client_id = auth.uid() OR provider_id = auth.uid()
        )
    );

-- WARRANTIES POLICIES
-- Both parties FULL
CREATE POLICY "warranties_parties_all" ON public.warranties
    FOR ALL TO authenticated
    USING (client_id = auth.uid() OR provider_id = auth.uid())
    WITH CHECK (client_id = auth.uid() OR provider_id = auth.uid());

-- SERVICE_ROLE GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_quotes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_quote_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contracts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contract_milestones TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.warranties TO service_role;