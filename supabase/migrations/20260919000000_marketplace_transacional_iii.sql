-- ============================================================================
-- P7c: Marketplace Transacional III — Evidência + Pagamento + Garantia
-- ============================================================================
-- PROPOSITO:
--   * bucket PRIVADO `marketplace-evidence` (evidências de milestones)
--   * tabela `evidence` (registo do core EvidenceService ligado ao milestone)
--   * tabela `marketplace_milestone_payments` (guard de idempotência do
--     pagamento por milestone + vista de movimentos por contrato)
--   * UNIQUE em warranties(order_id) -> garantia emitida uma única vez
-- SCOPING:
--   * evidence: dono FULL; partes do contrato (via milestone->contract) SELECT
--   * marketplace_milestone_payments: partes do contrato FULL
--   * nunca base64 em colunas de texto (ficheiro em bucket privado)
-- SEM DROP; idempotente (CREATE TABLE IF NOT EXISTS / DO BLOCK).
-- ============================================================================

-- 1. Bucket privado de evidências de milestones
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'marketplace-evidence',
    'marketplace-evidence',
    false,
    15728640,  -- 15 MB por ficheiro
    ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Tabela de evidências (registo do EvidenceServiceImpl)
CREATE TABLE IF NOT EXISTS public.evidence (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES public.users(id),
    related_entity_type TEXT,
    related_entity_id TEXT,
    visibility TEXT NOT NULL DEFAULT 'PRIVATE'
        CHECK (visibility IN ('PRIVATE', 'PARTIES', 'ORGANIZATION', 'PUBLIC', 'RESTRICTED')),
    authorized_viewers UUID[] NOT NULL DEFAULT '{}',
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'OTHER',
    type TEXT NOT NULL DEFAULT 'DOCUMENT',
    status TEXT NOT NULL DEFAULT 'UPLOADED',
    "hash" TEXT NOT NULL,
    hash_algorithm TEXT NOT NULL DEFAULT 'SHA-256',
    storage_path TEXT NOT NULL,
    storage_bucket TEXT NOT NULL DEFAULT 'marketplace-evidence',
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    original_name TEXT,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_evidence_owner_id ON public.evidence(owner_id);
CREATE INDEX IF NOT EXISTS idx_evidence_related ON public.evidence(related_entity_type, related_entity_id);

ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;

-- Owner FULL
DROP POLICY IF EXISTS "evidence_owner_all" ON public.evidence;
CREATE POLICY "evidence_owner_all" ON public.evidence
    FOR ALL TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- Partes do contrato (via milestone->contract) SELECT
DROP POLICY IF EXISTS "evidence_parties_read" ON public.evidence;
CREATE POLICY "evidence_parties_read" ON public.evidence
    FOR SELECT TO authenticated
    USING (
        auth.uid() = ANY (authorized_viewers)
        OR (
            related_entity_type = 'MILESTONE'
            AND related_entity_id IS NOT NULL
            AND related_entity_id::uuid IN (
                SELECT cm.id FROM public.contract_milestones cm
                JOIN public.contracts c ON c.id = cm.contract_id
                WHERE c.client_id = auth.uid() OR c.provider_id = auth.uid()
            )
        )
    );

-- 3. Guard de pagamentos por milestone (idempotência + vista)
CREATE TABLE IF NOT EXISTS public.marketplace_milestone_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    milestone_id UUID NOT NULL UNIQUE REFERENCES public.contract_milestones(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.users(id),
    provider_id UUID NOT NULL REFERENCES public.users(id),
    amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
    currency TEXT NOT NULL DEFAULT 'EUR',
    income_id UUID NOT NULL REFERENCES public.finance_incomes(id),
    expense_id UUID NOT NULL REFERENCES public.finance_expenses(id),
    paid_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mmp_contract_id ON public.marketplace_milestone_payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_mmp_milestone_id ON public.marketplace_milestone_payments(milestone_id);

ALTER TABLE public.marketplace_milestone_payments ENABLE ROW LEVEL SECURITY;

-- Partes do contrato FULL
DROP POLICY IF EXISTS "mmp_parties_all" ON public.marketplace_milestone_payments;
CREATE POLICY "mmp_parties_all" ON public.marketplace_milestone_payments
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

-- 4. Garantia única por contrato (emissão automática em COMPLETED)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'warranties_order_id_unique'
    ) THEN
        ALTER TABLE public.warranties
            ADD CONSTRAINT warranties_order_id_unique UNIQUE (order_id);
    END IF;
END $$;

-- 5. Evidência obrigatória por milestone (preenchido em acceptQuoteAction)
ALTER TABLE public.contract_milestones
    ADD COLUMN IF NOT EXISTS require_evidence BOOLEAN NOT NULL DEFAULT false;

-- 6. SERVICE_ROLE grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.evidence TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketplace_milestone_payments TO service_role;