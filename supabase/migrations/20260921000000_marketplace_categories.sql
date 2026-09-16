-- RPG-OS — Categorias do Mercado (vaga M-B)
-- ---------------------------------------------------------------------------
-- A tabela `categories` era consultada por /api/categories e exigida na criação
-- de pedidos (service_requests.category_id), mas nunca existia → o mercado não
-- arrancava. Idempotente e com seed PT-PT do catálogo de oportunidades.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_categories_active
    ON public.categories (active, sort_order);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Leitura pública (catálogo de oportunidades); escrita reservada a service_role.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'categories'
          AND policyname = 'categories_read_active'
    ) THEN
        CREATE POLICY "categories_read_active" ON public.categories
            FOR SELECT TO anon, authenticated
            USING (active = true);
    END IF;
END $$;

GRANT SELECT ON TABLE public.categories TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.categories TO service_role;

INSERT INTO public.categories (name, slug, sort_order) VALUES
    ('Serviços Domésticos', 'servicos-domesticos', 10),
    ('Construção & Remodelações', 'construcao-remodelacoes', 20),
    ('Eletricidade & Canalização', 'eletricidade-canalizacao', 30),
    ('Limpezas', 'limpezas', 40),
    ('Jardinagem & Exterior', 'jardinagem', 50),
    ('Informática & Web', 'informatica-web', 60),
    ('Design & Marketing', 'design-marketing', 70),
    ('Consultoria & Contabilidade', 'consultoria-contabilidade', 80),
    ('Aulas & Formação', 'aulas-formacao', 90),
    ('Saúde & Bem-estar', 'saude-bem-estar', 100),
    ('Transportes & Entregas', 'transportes-entregas', 110),
    ('Eventos & Catering', 'eventos-catering', 120),
    ('Beleza & Estética', 'beleza-estetica', 130),
    ('Automóvel & Reparações', 'automovel-reparacoes', 140),
    ('Emprego & Recrutamento', 'emprego-recrutamento', 150),
    ('Outros', 'outros', 999)
ON CONFLICT (slug) DO NOTHING;
