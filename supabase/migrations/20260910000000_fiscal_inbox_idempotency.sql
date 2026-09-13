-- RPG-OS: Fiscal inbox idempotency (producer support)
--
-- Garante no máximo um item por (organization, entity_type, entity_id):
-- dupla projeção da mesma invoice/org nunca duplica. Sem esta constraint,
-- "select -> if absent -> insert" teria race condition.
-- Sem dados fictícios; sem backfill; apenas constraint + índice.

-- 1. UNIQUE para idempotência do producer (uma row por entidade/org).
-- Inclui NULLS NOT DISTINCT? entity_type/entity_id são NOT NULL no schema,
-- por isso UNIQUE simples é suficiente e correto.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_fiscal_inbox_entity_org'
    ) THEN
        ALTER TABLE public.fiscal_inbox_items
            ADD CONSTRAINT uq_fiscal_inbox_entity_org
            UNIQUE (organization_id, entity_type, entity_id);
    END IF;
END $$;

COMMENT ON CONSTRAINT uq_fiscal_inbox_entity_org ON public.fiscal_inbox_items
    IS 'Idempotência do producer: uma invoice/entidade gera no máximo um item por organização.';
