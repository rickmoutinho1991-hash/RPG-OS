-- RPG-OS — Ofertas de prestadores (lado da oferta) — vaga M-D
-- ---------------------------------------------------------------------------
-- O mercado passa a ser superset de OLX/Fixando/Indeed: além dos pedidos
-- (procura), os profissionais podem publicar ofertas (serviço já existente).
-- A oferta fica pública quando PUBLISHED + moderation APPROVED; a gestão é
-- sempre do próprio provider (RLS auth.uid() = provider_id).
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.provider_offerings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.users(id),
    category_id UUID NOT NULL,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
    description TEXT NOT NULL CHECK (char_length(description) <= 5000),
    price_type TEXT NOT NULL DEFAULT 'NEGOTIABLE'
        CHECK (price_type IN ('FIXED', 'PER_HOUR', 'FREE_ESTIMATE', 'NEGOTIABLE')),
    price_cents BIGINT,
    currency TEXT NOT NULL DEFAULT 'EUR',
    location_service_mode TEXT NOT NULL DEFAULT 'BOTH'
        CHECK (location_service_mode IN ('REMOTE', 'ON_SITE', 'BOTH')),
    location_city TEXT,
    location_district TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'PUBLISHED', 'HIDDEN', 'SUSPENDED')),
    moderation_status TEXT NOT NULL DEFAULT 'APPROVED'
        CHECK (moderation_status IN ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED')),
    published_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_provider_offerings_provider
    ON public.provider_offerings(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_offerings_status
    ON public.provider_offerings(status);
CREATE INDEX IF NOT EXISTS idx_provider_offerings_category
    ON public.provider_offerings(category_id);

ALTER TABLE public.provider_offerings ENABLE ROW LEVEL SECURITY;

-- Leitura pública das ofertas ativas (catálogo).
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'provider_offerings'
          AND policyname = 'offerings_public_read_active'
    ) THEN
        CREATE POLICY "offerings_public_read_active" ON public.provider_offerings
            FOR SELECT TO anon, authenticated
            USING (status = 'PUBLISHED' AND moderation_status = 'APPROVED');
    END IF;
END $$;

-- Criação/gestão apenas pelo próprio prestador.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'provider_offerings'
          AND policyname = 'offerings_own_all'
    ) THEN
        CREATE POLICY "offerings_own_all" ON public.provider_offerings
            FOR ALL TO authenticated
            USING (auth.uid() = provider_id)
            WITH CHECK (auth.uid() = provider_id);
    END IF;
END $$;

GRANT SELECT ON TABLE public.provider_offerings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.provider_offerings
    TO service_role;