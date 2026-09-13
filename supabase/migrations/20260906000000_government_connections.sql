-- RPG-OS: Government Connections & Consent Model (FASE 10J-C, 10J-D)
--
-- Tabela de ligações governamentais por organização
-- Tabela de consentimentos para acesso a serviços governamentais

-- 1. ENUMS PARA GOVERNMENT_CONNECTIONS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'government_provider_status') THEN
        CREATE TYPE government_provider_status AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR', 'EXPIRED', 'REVOKED');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'government_provider_environment') THEN
        CREATE TYPE government_provider_environment AS ENUM ('development', 'sandbox', 'production');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'government_provider_id') THEN
        CREATE TYPE government_provider_id AS ENUM ('AT', 'EFATURA', 'SEGURANCA_SOCIAL', 'AUTENTICACAO_GOV', 'CMD', 'GOV_PT');
    END IF;
END $$;

-- 2. TABELA government_connections - Ligações a serviços governamentais
CREATE TABLE IF NOT EXISTS government_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id government_provider_id NOT NULL,
    environment government_provider_environment NOT NULL DEFAULT 'development',
    scopes TEXT[] NOT NULL DEFAULT '{}',
    status government_provider_status NOT NULL DEFAULT 'DISCONNECTED',
    connected_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    external_account_reference TEXT,
    provider_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance e isolamento por organização
CREATE INDEX IF NOT EXISTS idx_government_connections_org ON government_connections(organization_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_government_connections_user ON government_connections(user_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_government_connections_status ON government_connections(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_government_connections_expires ON government_connections(expires_at) WHERE expires_at IS NOT NULL;

-- 3. TABELA government_consents - Consentimentos explícitos para acesso
CREATE TABLE IF NOT EXISTS government_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id government_provider_id NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'admin', 'system')),
    audit_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices para consentimentos
CREATE INDEX IF NOT EXISTS idx_government_consents_org ON government_consents(organization_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_government_consents_user ON government_consents(user_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_government_consents_expires ON government_consents(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_government_consents_revoked ON government_consents(revoked_at) WHERE revoked_at IS NOT NULL;

-- 4. RLS Policies para government_connections
ALTER TABLE government_connections ENABLE ROW LEVEL SECURITY;

-- Policy: Membros da organização podem ler suas próprias conexões
CREATE POLICY "government_connections_read_org" ON government_connections
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
CREATE POLICY "government_connections_write_service" ON government_connections
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 5. RLS Policies para government_consents
ALTER TABLE government_consents ENABLE ROW LEVEL SECURITY;

-- Policy: Membros da organização podem ler seus próprios consentimentos
CREATE POLICY "government_consents_read_org" ON government_consents
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
CREATE POLICY "government_consents_write_service" ON government_consents
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 6. Comments para documentação
COMMENT ON TABLE government_connections IS 'Ligações a serviços governamentais (AT, e-Fatura, Segurança Social, etc.) por organização';
COMMENT ON TABLE government_consents IS 'Consentimentos explícitos para acesso a serviços governamentais';

COMMENT ON COLUMN government_connections.provider_id IS 'Tipo de provedor governamental';
COMMENT ON COLUMN government_connections.environment IS 'Ambiente de conexão (development, sandbox, production)';
COMMENT ON COLUMN government_connections.scopes IS 'Escopos de acesso concedidos';
COMMENT ON COLUMN government_connections.status IS 'Status da conexão';
COMMENT ON COLUMN government_connections.provider_config IS 'Configuração específica do provedor (credenciais, certificados, etc.) - nunca em texto plano sensível';
COMMENT ON COLUMN government_consents.source IS 'Fonte do consentimento (user, admin, system)';