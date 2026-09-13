-- RPG-OS: Payment Engine Foundation
-- 
-- Extensão do schema para suportar o Payment Engine independente de PSP
-- Este migration adiciona tabelas para transactions, payment events e payouts
-- enquanto mantém compatibilidade com a tabela payments existente

-- 1. Enums para estados do Payment Engine
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_provider_type') THEN
        CREATE TYPE payment_provider_type AS ENUM ('FAKE', 'STRIPE_CONNECT', 'ADYEN_FOR_PLATFORMS', 'SIBS');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status') THEN
        CREATE TYPE transaction_status AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payout_status') THEN
        CREATE TYPE payout_status AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REVERSED');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_event_type') THEN
        CREATE TYPE payment_event_type AS ENUM ('PAYMENT_CREATED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'PAYMENT_REFUNDED', 'PAYOUT_CREATED', 'PAYOUT_SUCCEEDED', 'PAYOUT_FAILED');
    END IF;
END $$;

-- 2. Tabela de Transactions (novo conceito - camada de abstração sobre payments)
-- Representa a transação económica completa com platform fee snapshot
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    
    -- Valores monetários em CENTAVOS (bigint) - zero floating point
    gross_amount_cents BIGINT NOT NULL CHECK (gross_amount_cents >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'EUR',
    
    -- Platform fee snapshot (imutável)
    commission_rate_bps INTEGER NOT NULL CHECK (commission_rate_bps >= 0 AND commission_rate_bps <= 10000),
    platform_fee_cents BIGINT NOT NULL CHECK (platform_fee_cents >= 0),
    business_amount_cents BIGINT NOT NULL CHECK (business_amount_cents >= 0),
    
    -- Provider abstrato
    payment_provider payment_provider_type NOT NULL DEFAULT 'FAKE',
    provider_payment_id TEXT,
    provider_transaction_id TEXT,
    
    -- Estado da transação
    status transaction_status NOT NULL DEFAULT 'PENDING',
    
    -- Metadata para tracking
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    captured_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_payment_transactions_org ON payment_transactions(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_company ON payment_transactions(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_customer ON payment_transactions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice ON payment_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider ON payment_transactions(payment_provider, provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status, created_at DESC);

-- Unique constraint para evitar duplicatas de provider payment
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_transaction_provider 
ON payment_transactions(payment_provider, provider_payment_id) 
WHERE provider_payment_id IS NOT NULL;

-- 3. Tabela de Payment Events (webhooks e eventos do provider)
-- Registo imutável de todos os eventos para idempotência e audit trail
CREATE TABLE IF NOT EXISTS payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES payment_transactions(id) ON DELETE CASCADE,
    
    -- Identificação do evento
    payment_provider payment_provider_type NOT NULL,
    provider_event_id TEXT NOT NULL,
    event_type payment_event_type NOT NULL,
    
    -- Payload original do provider (para debugging)
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload_hash TEXT NOT NULL, -- Hash para idempotência
    
    -- Processamento
    processed_at TIMESTAMPTZ,
    processing_status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSED, FAILED
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance e idempotência
CREATE INDEX IF NOT EXISTS idx_payment_events_transaction ON payment_events(transaction_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_provider ON payment_events(payment_provider, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_type ON payment_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_hash ON payment_events(payload_hash);

-- Unique constraint para idempotência de eventos
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_event_idempotent 
ON payment_events(payment_provider, provider_event_id, payload_hash);

-- 4. Tabela de Payouts (transferências para empresas)
-- Registo de transferências de fundos do RPG-OS para as empresas
CREATE TABLE IF NOT EXISTS payment_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
    
    -- Valores monetários em CENTAVOS
    amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'EUR',
    
    -- Provider
    payment_provider payment_provider_type NOT NULL DEFAULT 'FAKE',
    provider_payout_id TEXT,
    destination_account_id TEXT, -- ID da conta no provider (ex: Stripe Connect account)
    
    -- Estado do payout
    status payout_status NOT NULL DEFAULT 'PENDING',
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_payment_payouts_org ON payment_payouts(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_payouts_company ON payment_payouts(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_payouts_transaction ON payment_payouts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_payouts_provider ON payment_payouts(payment_provider, provider_payout_id);
CREATE INDEX IF NOT EXISTS idx_payment_payouts_status ON payment_payouts(status, created_at DESC);

-- Unique constraint para evitar duplicatas de provider payout
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_payout_provider 
ON payment_payouts(payment_provider, provider_payout_id) 
WHERE provider_payout_id IS NOT NULL;

-- 5. RLS Policies para as novas tabelas
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_payouts ENABLE ROW LEVEL SECURITY;

-- Policy para payment_transactions: membros da organização podem ver
CREATE POLICY "payment_transactions_read_org_members" ON payment_transactions
FOR SELECT
USING (
    organization_id IS NULL 
    OR organization_id IN (
        SELECT om.organization_id 
        FROM org_memberships om 
        WHERE om.user_id = auth.uid() 
        AND om.status = 'ACTIVE'
    )
);

-- Policy para payment_transactions: service role pode escrever
CREATE POLICY "payment_transactions_write_service" ON payment_transactions
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Policy para payment_events: membros da organização podem ver
CREATE POLICY "payment_events_read_org_members" ON payment_events
FOR SELECT
USING (
    EXISTS (
        SELECT 1 
        FROM payment_transactions pt 
        WHERE pt.id = payment_events.transaction_id 
        AND (
            pt.organization_id IS NULL 
            OR pt.organization_id IN (
                SELECT om.organization_id 
                FROM org_memberships om 
                WHERE om.user_id = auth.uid() 
                AND om.status = 'ACTIVE'
            )
        )
    )
);

-- Policy para payment_events: service role pode escrever
CREATE POLICY "payment_events_write_service" ON payment_events
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Policy para payment_payouts: membros da organização podem ver
CREATE POLICY "payment_payouts_read_org_members" ON payment_payouts
FOR SELECT
USING (
    organization_id IS NULL 
    OR organization_id IN (
        SELECT om.organization_id 
        FROM org_memberships om 
        WHERE om.user_id = auth.uid() 
        AND om.status = 'ACTIVE'
    )
);

-- Policy para payment_payouts: service role pode escrever
CREATE POLICY "payment_payouts_write_service" ON payment_payouts
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 6. Grant permissions para service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payment_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payment_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payment_payouts TO service_role;

-- 7. Comments para documentação
COMMENT ON TABLE payment_transactions IS 'Camada de abstração do Payment Engine - transações económicas com platform fee snapshot';
COMMENT ON TABLE payment_events IS 'Registo imutável de eventos do provider para idempotência e audit trail';
COMMENT ON TABLE payment_payouts IS 'Transferências de fundos do RPG-OS para empresas (via Stripe Connect, Adyen, etc.)';

COMMENT ON COLUMN payment_transactions.gross_amount_cents IS 'Valor bruto em centavos (sem platform fee)';
COMMENT ON COLUMN payment_transactions.commission_rate_bps IS 'Taxa de comissão em basis points (snapshot imutável)';
COMMENT ON COLUMN payment_transactions.platform_fee_cents IS 'Valor da platform fee em centavos (snapshot imutável)';
COMMENT ON COLUMN payment_transactions.business_amount_cents IS 'Valor líquido para a empresa em centavos (bruto - fee)';
COMMENT ON COLUMN payment_events.payload_hash IS 'Hash do payload para idempotência - impede processamento duplicado';