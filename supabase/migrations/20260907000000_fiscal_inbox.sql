-- RPG-OS: Fiscal Inbox Items (FASE 10J-I)
--
-- Tabela de itens da Caixa Fiscal por organização
-- Permite armazenar e consultar itens fiscais unificados

-- 1. ENUMS PARA FISCAL_INBOX_ITEMS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fiscal_inbox_item_type') THEN
        CREATE TYPE fiscal_inbox_item_type AS ENUM (
            'INVOICE_ISSUED',
            'INVOICE_RECEIVED',
            'CREDIT_NOTE',
            'DEBIT_NOTE',
            'GOVERNMENT_NOTIFICATION',
            'REJECTED_SUBMISSION',
            'PENDING_SUBMISSION',
            'RECONCILIATION_ISSUE',
            'VAT_ANOMALY',
            'SAFT_ISSUE',
            'DEADLINE',
            'PAYMENT_DUE',
            'CONSENT_EXPIRING',
            'CONNECTION_ERROR'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fiscal_inbox_priority') THEN
        CREATE TYPE fiscal_inbox_priority AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fiscal_inbox_status') THEN
        CREATE TYPE fiscal_inbox_status AS ENUM ('UNREAD', 'READ', 'ACTION_REQUIRED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fiscal_inbox_entity_type') THEN
        CREATE TYPE fiscal_inbox_entity_type AS ENUM ('INVOICE', 'CONNECTION', 'CONSENT', 'DEADLINE', 'RECONCILIATION', 'PAYMENT', 'NOTIFICATION');
    END IF;
END $$;

-- 2. TABELA fiscal_inbox_items - Itens da Caixa Fiscal
CREATE TABLE IF NOT EXISTS fiscal_inbox_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type fiscal_inbox_item_type NOT NULL,
    priority fiscal_inbox_priority NOT NULL DEFAULT 'MEDIUM',
    status fiscal_inbox_status NOT NULL DEFAULT 'UNREAD',
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    entity_type fiscal_inbox_entity_type NOT NULL,
    entity_id TEXT NOT NULL,
    document_type TEXT, -- FT, FS, FR, NC, ND
    series TEXT,
    document_number TEXT,
    counterparty_nif TEXT,
    counterparty_name TEXT,
    amount_cents BIGINT,
    vat_cents BIGINT,
    issue_date DATE,
    due_date DATE,
    provider TEXT, -- AT, EFATURA, SEGURANCA_SOCIAL, etc.
    recommended_action TEXT,
    action_url TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Índices para performance e isolamento por organização
CREATE INDEX IF NOT EXISTS idx_fiscal_inbox_items_org ON fiscal_inbox_items(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_inbox_items_status ON fiscal_inbox_items(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_inbox_items_priority ON fiscal_inbox_items(organization_id, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_inbox_items_type ON fiscal_inbox_items(organization_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_inbox_items_due_date ON fiscal_inbox_items(organization_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fiscal_inbox_items_entity ON fiscal_inbox_items(organization_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_inbox_items_provider ON fiscal_inbox_items(organization_id, provider) WHERE provider IS NOT NULL;

-- RLS Policies para fiscal_inbox_items
ALTER TABLE fiscal_inbox_items ENABLE ROW LEVEL SECURITY;

-- Policy: Membros da organização podem ler seus próprios itens
CREATE POLICY "fiscal_inbox_items_read_org" ON fiscal_inbox_items
FOR SELECT
USING (
    organization_id IN (
        SELECT om.organization_id 
        FROM org_memberships om 
        WHERE om.user_id = auth.uid() 
        AND om.status = 'ACTIVE'
    )
);

-- Policy: service role pode todas as operações
CREATE POLICY "fiscal_inbox_items_write_service" ON fiscal_inbox_items
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Comments para documentação
COMMENT ON TABLE fiscal_inbox_items IS 'Itens da Caixa Fiscal unificada por organização';
COMMENT ON COLUMN fiscal_inbox_items.type IS 'Tipo de item fiscal';
COMMENT ON COLUMN fiscal_inbox_items.priority IS 'Prioridade do item';
COMMENT ON COLUMN fiscal_inbox_items.status IS 'Status do item';
COMMENT ON COLUMN fiscal_inbox_items.entity_type IS 'Tipo de entidade relacionada';
COMMENT ON COLUMN fiscal_inbox_items.entity_id IS 'ID da entidade relacionada';
COMMENT ON COLUMN fiscal_inbox_items.provider IS 'Provedor governamental de origem';