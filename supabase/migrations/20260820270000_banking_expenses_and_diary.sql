-- RPG-OS: Módulos de Banca, Despesas/Custos Reais, Diário Universal e Obrigações Fiscais
-- Migração 20260820270000

-- 1. TABELA DE CONTAS BANCÁRIAS
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company_id UUID,
    bank_name TEXT NOT NULL,
    bank_code TEXT NOT NULL DEFAULT 'SEPA',
    account_number TEXT,
    iban TEXT NOT NULL,
    swift_bic TEXT,
    currency TEXT NOT NULL DEFAULT 'EUR',
    balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    available_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    is_main_account BOOLEAN NOT NULL DEFAULT FALSE,
    is_connected_open_banking BOOLEAN NOT NULL DEFAULT FALSE,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL
);

-- 2. TABELA DE TRANSAÇÕES BANCÁRIAS
CREATE TABLE IF NOT EXISTS public.bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,
    user_id UUID NOT NULL,
    company_id UUID,
    type TEXT NOT NULL CHECK (type IN ('CREDIT', 'DEBIT')),
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'EUR',
    description TEXT NOT NULL,
    counterparty_name TEXT,
    counterparty_iban TEXT,
    category TEXT NOT NULL DEFAULT 'GENERAL',
    status TEXT NOT NULL DEFAULT 'SETTLED',
    reference TEXT,
    date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (account_id) REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL
);

-- 3. TABELA DE DESPESAS / COMPRAS A FORNECEDORES
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company_id UUID,
    document_number TEXT,
    supplier_name TEXT NOT NULL,
    supplier_tax_number TEXT,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 23.00,
    vat_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    withholding_tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    category TEXT NOT NULL DEFAULT 'OPERATIONAL', -- OPERATIONAL, MATERIALS, SERVICES, UTILITIES, TAXES, SALARIES, OTHER
    status TEXT NOT NULL DEFAULT 'PAID', -- PENDING, PAID, CANCELLED
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL
);

-- 4. TABELA DE DIÁRIO UNIVERSAL
CREATE TABLE IF NOT EXISTS public.diary_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company_id UUID,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'BUSINESS', -- PERSONAL, BUSINESS, HEALTH, FINANCIAL, PROJECT, ROUTINE
    content TEXT NOT NULL,
    mood_score INTEGER CHECK (mood_score >= 1 AND mood_score <= 5),
    tags TEXT[] DEFAULT '{}',
    amount NUMERIC(12, 2),
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL
);

-- 5. TABELA DE OBRIGAÇÕES FISCAIS
CREATE TABLE IF NOT EXISTS public.fiscal_obligations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company_id UUID,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL, -- IVA, SEG_SOCIAL, IRS, IRC, SAFT, IES
    period TEXT NOT NULL,
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, SUBMITTED, PAID, OVERDUE
    estimated_amount NUMERIC(12, 2),
    payment_reference TEXT,
    submitted_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL
);

-- 6. ÍNDICES DE PERFORMANCE E MULTI-TENANCY
CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON public.bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_company_id ON public.bank_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_id ON public.bank_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_user_id ON public.bank_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON public.expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_company_id ON public.expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_diary_entries_user_id ON public.diary_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_obligations_user_id ON public.fiscal_obligations(user_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_obligations_company_id ON public.fiscal_obligations(company_id);

-- 7. PERMISSÕES SERVICE_ROLE
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bank_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bank_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expenses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.diary_entries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fiscal_obligations TO service_role;
