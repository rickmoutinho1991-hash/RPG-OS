-- RPG-OS: Centro Financeiro (Life Finance)
-- Migração 20260901000000
--
-- Tabelas do domínio financeiro pessoal/empresarial, escopadas por
-- user_id (obrigatório) e, opcionalmente, por company_id:
--   finance_bills    → contas a pagar / obrigações (renda, água, luz...)
--   finance_debts    → dívidas (credor, valores, prestação, juros)
--   finance_incomes  → receitas previstas/recorrentes (salário, freelancing...)
--   finance_expenses → despesas pontuais da vida quotidiana
--
-- Segurança: RLS em todas as tabelas; políticas inspiradas nas de bank_accounts
-- (dono user_id OU membro da company_id) mas com WITH CHECK endurecido: escritas
-- requerem user_id = auth.uid() e, se houver company_id, o utilizador é membro da
-- empresa — bloqueia injeção cross-tenant mesmo vinda de cliente autenticado.
-- Escritas server-side via service_role (a aplicação resolve o tenant da sessão).
-- Os dados de escrita nunca vêm do cliente.

-- 1. CONTAS A PAGAR / OBRIGAÇÕES
CREATE TABLE IF NOT EXISTS public.finance_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company_id UUID,
    name TEXT NOT NULL,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
    due_date DATE NOT NULL,
    recurrence TEXT NOT NULL DEFAULT 'MONTHLY'
        CHECK (recurrence IN ('ONE_TIME', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY')),
    category TEXT NOT NULL DEFAULT 'OTHER'
        CHECK (category IN ('RENT', 'WATER', 'ELECTRICITY', 'TELECOM', 'FOOD', 'TRANSPORT', 'INSURANCE', 'LOAN', 'SUBSCRIPTION', 'TAXES', 'OTHER')),
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PAID', 'OVERDUE')),
    priority TEXT NOT NULL DEFAULT 'MEDIUM'
        CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
    notes TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL
);

-- 2. DÍVIDAS
CREATE TABLE IF NOT EXISTS public.finance_debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company_id UUID,
    creditor_name TEXT NOT NULL,
    initial_amount NUMERIC(14, 2) NOT NULL CHECK (initial_amount >= 0),
    outstanding_amount NUMERIC(14, 2) NOT NULL CHECK (outstanding_amount >= 0),
    installment_amount NUMERIC(14, 2) CHECK (installment_amount >= 0),
    next_due_date DATE,
    interest_rate NUMERIC(6, 3),
    status TEXT NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'PAID', 'DEFAULTED')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL
);

-- 3. RECEITAS
CREATE TABLE IF NOT EXISTS public.finance_incomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company_id UUID,
    source TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'OTHER'
        CHECK (category IN ('SALARY', 'FREELANCE', 'INVESTMENT', 'RENTAL', 'OTHER')),
    amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
    recurrence TEXT NOT NULL DEFAULT 'MONTHLY'
        CHECK (recurrence IN ('ONE_TIME', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY')),
    expected_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_received_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL
);

-- 4. DESPESAS PONTUAIS
CREATE TABLE IF NOT EXISTS public.finance_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company_id UUID,
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'OTHER'
        CHECK (category IN ('FOOD', 'TRANSPORT', 'HOUSING', 'UTILITIES', 'HEALTH', 'LEISURE', 'EDUCATION', 'OTHER')),
    amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL
);

-- 5. ÍNDICES DE PERFORMANCE E MULTI-TENANCY
CREATE INDEX IF NOT EXISTS idx_finance_bills_user_id ON public.finance_bills(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_bills_company_id ON public.finance_bills(company_id);
CREATE INDEX IF NOT EXISTS idx_finance_bills_due_date ON public.finance_bills(due_date);
CREATE INDEX IF NOT EXISTS idx_finance_bills_status ON public.finance_bills(status);
CREATE INDEX IF NOT EXISTS idx_finance_debts_user_id ON public.finance_debts(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_debts_company_id ON public.finance_debts(company_id);
CREATE INDEX IF NOT EXISTS idx_finance_debts_status ON public.finance_debts(status);
CREATE INDEX IF NOT EXISTS idx_finance_incomes_user_id ON public.finance_incomes(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_incomes_company_id ON public.finance_incomes(company_id);
CREATE INDEX IF NOT EXISTS idx_finance_incomes_expected_date ON public.finance_incomes(expected_date);
CREATE INDEX IF NOT EXISTS idx_finance_expenses_user_id ON public.finance_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_expenses_company_id ON public.finance_expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_finance_expenses_date ON public.finance_expenses(expense_date);

-- 6. RLS
ALTER TABLE public.finance_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;

-- Isolamento multi-tenant: leitura/gestão apenas para o dono OU membro da empresa associada.
-- WITH CHECK bloqueia escrita cross-tenant: uma linha só pode ser criada/alterada se
-- user_id = auth.uid() e, quando associada a uma empresa, o utilizador é membro dela.
CREATE POLICY "Users can manage own finance bills" ON public.finance_bills
    FOR ALL USING (
        auth.uid() = user_id
        OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = finance_bills.company_id)
    )
    WITH CHECK (
        auth.uid() = user_id
        AND (
            finance_bills.company_id IS NULL
            OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = finance_bills.company_id)
        )
    );

CREATE POLICY "Users can manage own finance debts" ON public.finance_debts
    FOR ALL USING (
        auth.uid() = user_id
        OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = finance_debts.company_id)
    )
    WITH CHECK (
        auth.uid() = user_id
        AND (
            finance_debts.company_id IS NULL
            OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = finance_debts.company_id)
        )
    );

CREATE POLICY "Users can manage own finance incomes" ON public.finance_incomes
    FOR ALL USING (
        auth.uid() = user_id
        OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = finance_incomes.company_id)
    )
    WITH CHECK (
        auth.uid() = user_id
        AND (
            finance_incomes.company_id IS NULL
            OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = finance_incomes.company_id)
        )
    );

CREATE POLICY "Users can manage own finance expenses" ON public.finance_expenses
    FOR ALL USING (
        auth.uid() = user_id
        OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = finance_expenses.company_id)
    )
    WITH CHECK (
        auth.uid() = user_id
        AND (
            finance_expenses.company_id IS NULL
            OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = finance_expenses.company_id)
        )
    );

-- 7. PERMISSÕES SERVICE_ROLE (escritas server-side autorizadas pela aplicação)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_bills TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_debts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_incomes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_expenses TO service_role;

-- 8. COMENTÁRIOS DE DOCUMENTAÇÃO
COMMENT ON TABLE public.finance_bills IS 'Contas a pagar e obrigações recorrentes/pontuais do Centro Financeiro';
COMMENT ON TABLE public.finance_debts IS 'Dívidas em aberto com credor, prestação e progresso';
COMMENT ON TABLE public.finance_incomes IS 'Receitas previstas/recorrentes (salário, freelancing, outros)';
COMMENT ON TABLE public.finance_expenses IS 'Despesas pontuais da vida quotidiana';