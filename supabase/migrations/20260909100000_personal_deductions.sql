-- RPG-OS: deduções fiscais pessoais (P1 — motor local, sem AT)
--
-- Regista despesas pessoais user-scoped para avaliação de dedutibilidade
-- LOCAL. Nenhuma linha afirma aceitação pela AT. Dinheiro em cents
-- (INTEGER, nunca float). Company sempre NULL aqui (pessoal); despesas
-- empresariais usam public.expenses.

-- 1. TABELA personal_deductions
CREATE TABLE IF NOT EXISTS public.personal_deductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    expense_date DATE NOT NULL,
    description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
    category TEXT NOT NULL CHECK (category IN (
        'GENERAL_FAMILY_EXPENSES', 'HEALTH', 'EDUCATION', 'HOUSING',
        'ELDERLY_CARE', 'ALIMONY', 'PENSION', 'DONATION',
        'INSURANCE', 'OTHER', 'UNKNOWN'
    )),
    fiscal_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (fiscal_status IN (
        'UNKNOWN', 'PENDING_VALIDATION', 'ELIGIBLE', 'PARTIALLY_ELIGIBLE',
        'NOT_ELIGIBLE', 'MANUAL_REVIEW'
    )),
    deductible_cents INTEGER NOT NULL DEFAULT 0 CHECK (deductible_cents >= 0),
    reason_code TEXT NOT NULL DEFAULT 'RULE_UNVERIFIED',
    rule_version TEXT NOT NULL,
    source_type TEXT,
    source_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT personal_deductions_source_unique UNIQUE (user_id, source_type, source_reference)
);

-- 2. ÍNDICES tenant-safe
CREATE INDEX IF NOT EXISTS idx_personal_deductions_user
    ON public.personal_deductions(user_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_personal_deductions_status
    ON public.personal_deductions(user_id, fiscal_status);

-- 3. RLS: próprio utilizador, todas as operações.
ALTER TABLE public.personal_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personal_deductions_owner_all" ON public.personal_deductions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Escrita direta: apenas service-role (server actions autorizadas).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.personal_deductions TO service_role;

COMMENT ON TABLE public.personal_deductions IS 'Despesas pessoais para dedutibilidade LOCAL (P1). fiscal_status nunca significa aceitação AT.';
