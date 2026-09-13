-- RPG-OS: preparação IRS pessoal Modelo 3 (P1.3, sem AT)
--
-- Draft local de preparação para declaração de rendimentos pessoa singular.
-- user_id é o tenant (pessoa singular). company_id SEMPRE NULL.
-- status: DRAFT | READY_FOR_REVIEW | INCOMPLETE | MANUAL_REVIEW | LOCKED
-- tax_year = ano das despesas/rendimentos (ex: 2026)
-- declaration_year = ano de entrega (ex: 2027)
-- totals/dados em JSONB para flexibilidade extensível sem migrações.
-- provenance para reprodutibilidade e auditoria.

CREATE TABLE IF NOT EXISTS public.personal_irs_preparation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tax_year INTEGER NOT NULL CHECK (tax_year = 2026),
    declaration_year INTEGER NOT NULL CHECK (declaration_year = 2027),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT', 'READY_FOR_REVIEW', 'INCOMPLETE', 'MANUAL_REVIEW', 'LOCKED'
    )),
    ruleset_version TEXT NOT NULL,
    totals JSONB NOT NULL DEFAULT '{}',
    sections JSONB NOT NULL DEFAULT '[]',
    income_status JSONB NOT NULL DEFAULT '[]',
    unresolved_items JSONB NOT NULL DEFAULT '[]',
    provenance JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT personal_irs_preparation_user_year_unique UNIQUE (user_id, tax_year)
);

-- Índice tenant-safe
CREATE INDEX IF NOT EXISTS idx_personal_irs_preparation_user
    ON public.personal_irs_preparation(user_id, tax_year DESC);

-- RLS: próprio utilizador, todas as operações
ALTER TABLE public.personal_irs_preparation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personal_irs_preparation_owner_all" ON public.personal_irs_preparation
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Escrita direta: apenas service-role (server actions autorizadas)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.personal_irs_preparation TO service_role;

COMMENT ON TABLE public.personal_irs_preparation IS 'Draft local de preparação IRS Modelo 3 (pessoa singular). status nunca significa submissão AT. tax_year=2026, declaration_year=2027 fixos nesta fase.';
COMMENT ON COLUMN public.personal_irs_preparation.totals IS 'Totais agregados: despesas, dedutível confirmado, manual_review, por categoria, rendimentos, retenções, pagamentos conta (cents).';
COMMENT ON COLUMN public.personal_irs_preparation.sections IS 'Completude por secção do Modelo 3: RENDIMENTOS, RETENCOES, PAGAMENTOS_CONTA, DEDUCOES_COLETA, AGREGADO_FAMILIAR, DEPENDENTES, RESIDENCIA_FISCAL, BENEFICIOS_FISCAIS, SITUACOES_ESPECIAIS.';
COMMENT ON COLUMN public.personal_irs_preparation.income_status IS 'Estado de suporte por categoria de rendimento (A/B/E/F/G/H): SUPPORTED, PARTIAL, MANUAL_REVIEW, UNAVAILABLE.';
COMMENT ON COLUMN public.personal_irs_preparation.unresolved_items IS 'Itens pendentes para revisão humana antes de declaração oficial.';
COMMENT ON COLUMN public.personal_irs_preparation.provenance IS 'Snapshot de proveniência: ruleset, contagens, fingerprint para reprodutibilidade.';