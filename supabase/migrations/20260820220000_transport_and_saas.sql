-- RPG-OS: Guias de Transporte AT e Subscrições SaaS da Plataforma

-- 1. ADICIONAR COLUNA DE SETOR DE ATIVIDADE ÀS EMPRESAS E PERFIS
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS sector TEXT DEFAULT 'CONSTRUCTION',
ADD COLUMN IF NOT EXISTS cae TEXT;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS sector TEXT DEFAULT 'CONSTRUCTION';

-- 2. TABELA DE GUIAS DE TRANSPORTE E BENS EM CIRCULAÇÃO (Dec.-Lei 147/2003)
CREATE TABLE IF NOT EXISTS transport_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_number TEXT NOT NULL UNIQUE,
    document_type TEXT NOT NULL DEFAULT 'GT',
    status TEXT NOT NULL DEFAULT 'COMMUNICATED',
    company_id UUID,
    client_id UUID,
    client_name TEXT NOT NULL,
    client_tax_number TEXT NOT NULL,
    vehicle_plate TEXT NOT NULL,
    load_address TEXT NOT NULL,
    load_postal_code TEXT NOT NULL,
    load_city TEXT NOT NULL,
    load_date_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unload_address TEXT NOT NULL,
    unload_postal_code TEXT NOT NULL,
    unload_city TEXT NOT NULL,
    unload_date_time TIMESTAMPTZ,
    at_doc_code TEXT NOT NULL,
    atcud TEXT,
    hash TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (client_id) REFERENCES users(id)
);

-- 3. ITENS DA GUIA DE TRANSPORTE
CREATE TABLE IF NOT EXISTS transport_document_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transport_document_id UUID NOT NULL,
    description TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
    unit TEXT NOT NULL DEFAULT 'un',
    unit_price NUMERIC(12, 2) DEFAULT 0.00,

    FOREIGN KEY (transport_document_id) REFERENCES transport_documents(id) ON DELETE CASCADE
);

-- 4. SUBSCRIÇÕES E MONETIZAÇÃO SAAS DA PLATAFORMA RPG-OS
CREATE TABLE IF NOT EXISTS saas_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company_id UUID,
    tier TEXT NOT NULL DEFAULT 'PRO',
    billing_interval TEXT NOT NULL DEFAULT 'MONTHLY',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    amount NUMERIC(10, 2) NOT NULL DEFAULT 49.00,
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- 5. PERMISSÕES SERVICE_ROLE
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transport_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transport_document_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saas_subscriptions TO service_role;
