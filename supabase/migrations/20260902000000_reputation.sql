-- RPG-OS: Centro de Reputação, Avaliações e Reclamações
-- Migração 20260902000000
--
-- Modelo (ponta a ponta):
--   reputation_reviews           → reclamações, recomendações, elogios e avaliações
--   reputation_responses         → respostas oficiais à descrição/às ocorrências
--   reputation_comments          → comentários de acompanhamento (autor/alvo/gestores)
--   reputation_cases             → casos de escalamento (críticos, sem resposta)
--   reputation_attachments       → anexos (evidências), com marcação de suspeição
--   reputation_events            → timeline de auditoria (CREATE/SUBMIT/RESPOND/...)
--   reputation_scores            → snapshots mensais de métricas de reputação
--   reputation_portal_config     → ligação ao Portal da Queixa (sem API inventada)
--   reputation_external_references → referências externas registadas manualmente
--
-- Segurança: RLS em todas as tabelas. Escritas server-side via service_role
-- (a aplicação resolve o tenant da sessão); as regras de estado/permissões do
-- negócio vivem no núcleo (ReputationService) e nunca vêm do cliente.
-- Autor e tenant (organization_id/company_id) são IMUTÁVEIS após a criação
-- (trigger de guarda — impede re-associação cross-tenant mesmo com service_role).
-- Leitura por cliente autenticado: autor, membro do tenant (org/empresa) ou alvo.

-- 1. ENUMS
DO $$ BEGIN
  CREATE TYPE public.reputation_entry_type AS ENUM ('COMPLAINT','RECOMMENDATION','PRAISE','REVIEW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reputation_target_type AS ENUM ('CUSTOMER','COMPANY','EMPLOYEE','SERVICE','PROJECT','SUPPLIER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reputation_relation_type AS ENUM (
    'CUSTOMER_TO_COMPANY','CUSTOMER_TO_EMPLOYEE','CUSTOMER_TO_SERVICE',
    'COMPANY_TO_CUSTOMER','COMPANY_TO_EMPLOYEE','COMPANY_TO_SUPPLIER',
    'EMPLOYEE_TO_COMPANY','EMPLOYEE_TO_CUSTOMER','EMPLOYEE_TO_SERVICE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reputation_status AS ENUM (
    'DRAFT','SUBMITTED','UNDER_REVIEW','RESPONDED','IN_PROGRESS','RESOLVED','REJECTED','CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reputation_moderation AS ENUM ('FLAGGED','MODERATION_REQUIRED','APPROVED','REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. AVALIAÇÕES / RECLAMAÇÕES / RECOMENDAÇÕES / ELOGIOS
CREATE TABLE IF NOT EXISTS public.reputation_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_user_id UUID NOT NULL,
    organization_id UUID,
    company_id UUID,
    entry_type public.reputation_entry_type NOT NULL,
    relation_type public.reputation_relation_type NOT NULL,
    target_type public.reputation_target_type NOT NULL,
    target_user_id UUID,
    target_company_id UUID,
    target_project_id UUID,
    target_service_id UUID,
    target_label TEXT,
    rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
    score_10 NUMERIC(3, 1) CHECK (score_10 IS NULL OR score_10 BETWEEN 0 AND 10),
    title TEXT NOT NULL DEFAULT '',
    comment TEXT,
    status public.reputation_status NOT NULL DEFAULT 'DRAFT',
    moderation public.reputation_moderation NOT NULL DEFAULT 'MODERATION_REQUIRED',
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    response_due_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE SET NULL,
    FOREIGN KEY (target_company_id) REFERENCES public.companies(id) ON DELETE SET NULL,
    FOREIGN KEY (target_project_id) REFERENCES public.projects(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE
);

-- 3. RESPOSTAS OFICIAIS / ACOMPANHAMENTOS
CREATE TABLE IF NOT EXISTS public.reputation_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL,
    organization_id UUID,
    company_id UUID,
    author_user_id UUID NOT NULL,
    official BOOLEAN NOT NULL DEFAULT FALSE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (review_id) REFERENCES public.reputation_reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
    FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.reputation_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL,
    organization_id UUID,
    company_id UUID,
    author_user_id UUID NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (review_id) REFERENCES public.reputation_reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
    FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- 4. CASOS DE ESCALAMENTO
CREATE TABLE IF NOT EXISTS public.reputation_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL,
    organization_id UUID,
    company_id UUID,
    case_type TEXT NOT NULL DEFAULT 'ESCALATION'
        CHECK (case_type IN ('CRITICAL','UNANSWERED','MODERATION','STALE')),
    status TEXT NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN','IN_PROGRESS','ESCALATED','RESOLVED','CLOSED')),
    assignee_user_id UUID,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,
    notes TEXT,

    FOREIGN KEY (review_id) REFERENCES public.reputation_reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
    FOREIGN KEY (assignee_user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

-- 5. ANEXOS (evidências)
CREATE TABLE IF NOT EXISTS public.reputation_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL,
    organization_id UUID,
    company_id UUID,
    upload_name TEXT NOT NULL,
    storage_path TEXT,
    mime_type TEXT,
    size_bytes BIGINT,
    is_suspicious BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (review_id) REFERENCES public.reputation_reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE
);

-- 6. TIMELINE DE AUDITORIA
CREATE TABLE IF NOT EXISTS public.reputation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL,
    organization_id UUID,
    company_id UUID,
    action TEXT NOT NULL
        CHECK (action IN ('CREATE','UPDATE','SUBMIT','RESPOND','COMMENT','STATUS_CHANGE','FLAG','MODERATE','RESOLVE','CLOSE','ATTACH','DELETE_REQUEST','ESCALATION','WORKFLOW')),
    user_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (review_id) REFERENCES public.reputation_reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

-- 7. SNAPSHOTS MENSAIS DE MÉTRICAS
CREATE TABLE IF NOT EXISTS public.reputation_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    company_id UUID,
    subject_type TEXT,
    subject_id UUID,
    period TEXT NOT NULL,
    avg_rating NUMERIC(4, 2),
    review_count INTEGER NOT NULL DEFAULT 0,
    complaint_count INTEGER NOT NULL DEFAULT 0,
    praise_count INTEGER NOT NULL DEFAULT 0,
    recommendation_count INTEGER NOT NULL DEFAULT 0,
    resolution_rate NUMERIC(6, 2),
    avg_response_hours NUMERIC(10, 2),
    distribution JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE
);

-- 8. PORTAL DA QUEIXA (configuração por organização — sem scraping/API inventada)
CREATE TABLE IF NOT EXISTS public.reputation_portal_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED'
        CHECK (status IN ('NOT_CONFIGURED','CONFIGURED')),
    brand_name TEXT,
    profile_url TEXT,
    api_provider TEXT,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.reputation_external_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    reference_type TEXT NOT NULL DEFAULT 'OTHER'
        CHECK (reference_type IN ('COMPLAINT','REVIEW','METRIC','OTHER')),
    external_id TEXT,
    reference_url TEXT,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

-- 9. ÍNDICES DE PERFORMANCE E MULTI-TENANCY
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_org ON public.reputation_reviews(organization_id);
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_company ON public.reputation_reviews(company_id);
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_author ON public.reputation_reviews(author_user_id);
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_entry_type ON public.reputation_reviews(entry_type);
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_status ON public.reputation_reviews(status);
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_target_user ON public.reputation_reviews(target_user_id);
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_created_at ON public.reputation_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reputation_responses_review ON public.reputation_responses(review_id);
CREATE INDEX IF NOT EXISTS idx_reputation_comments_review ON public.reputation_comments(review_id);
CREATE INDEX IF NOT EXISTS idx_reputation_events_review ON public.reputation_events(review_id);
CREATE INDEX IF NOT EXISTS idx_reputation_events_action ON public.reputation_events(action);
CREATE INDEX IF NOT EXISTS idx_reputation_cases_review ON public.reputation_cases(review_id);
CREATE INDEX IF NOT EXISTS idx_reputation_cases_status ON public.reputation_cases(status);
CREATE INDEX IF NOT EXISTS idx_reputation_attachments_review ON public.reputation_attachments(review_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reputation_scores_period ON public.reputation_scores (
  period,
  COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::UUID),
  COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::UUID),
  COALESCE(subject_type, ''),
  COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::UUID)
);

-- 10. GUARDA DE IMUTABILIDADE (autor e tenant nunca podem mudar)
CREATE OR REPLACE FUNCTION public.reputation_guard_immutable() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 WHERE NEW IS DISTINCT FROM OLD AND (
      NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.entry_type IS DISTINCT FROM OLD.entry_type
      OR NEW.relation_type IS DISTINCT FROM OLD.relation_type
      OR NEW.target_type IS DISTINCT FROM OLD.target_type
  )) THEN
    RAISE EXCEPTION 'reputation_reviews: autor, tenant e relação são imutáveis após criação'
      USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reputation_reviews_immutable ON public.reputation_reviews;
CREATE TRIGGER reputation_reviews_immutable
  BEFORE UPDATE ON public.reputation_reviews
  FOR EACH ROW EXECUTE FUNCTION public.reputation_guard_immutable();

-- 11. RLS
ALTER TABLE public.reputation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_portal_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_external_references ENABLE ROW LEVEL SECURITY;

-- Helper de escopo por tenant para as políticas de leitura (org OU empresa).
CREATE OR REPLACE FUNCTION public.reputation_in_tenant(org_id UUID, company_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    (org_id IS NOT NULL AND public.has_org_permission(org_id, 'reputation.view'))
    OR
    (company_id IS NOT NULL AND auth.uid() IN (SELECT user_id FROM profiles WHERE profiles.company_id = company_id))
$$;

-- 11.1 reputation_reviews: leitura por autor, membro do tenant ou alvo.
-- Escritas: autor + membro (WITH CHECK endurecido — bloqueia criação cross-tenant).
DROP POLICY IF EXISTS "reputation_reviews_scope" ON public.reputation_reviews;
CREATE POLICY "reputation_reviews_scope" ON public.reputation_reviews
    FOR ALL USING (
        reputation_reviews.author_user_id = auth.uid()
        OR public.reputation_in_tenant(reputation_reviews.organization_id, reputation_reviews.company_id)
        OR reputation_reviews.target_user_id = auth.uid()
    )
    WITH CHECK (
        reputation_reviews.author_user_id = auth.uid()
        AND reputation_reviews.created_by = auth.uid()
        AND (
            reputation_reviews.organization_id IS NULL
            OR public.has_org_permission(reputation_reviews.organization_id, 'reputation.create')
        )
        AND (
            reputation_reviews.company_id IS NULL
            OR auth.uid() IN (SELECT user_id FROM profiles WHERE profiles.company_id = reputation_reviews.company_id)
        )
    );

-- 11.2 Respostas: leitura no escopo do tenant; escrita exige autor + permissão de responder.
DROP POLICY IF EXISTS "reputation_responses_scope" ON public.reputation_responses;
CREATE POLICY "reputation_responses_scope" ON public.reputation_responses
    FOR SELECT USING (
        reputation_responses.author_user_id = auth.uid()
        OR public.reputation_in_tenant(reputation_responses.organization_id, reputation_responses.company_id)
        OR EXISTS (
            SELECT 1 FROM public.reputation_reviews r
            WHERE r.id = reputation_responses.review_id AND r.target_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "reputation_responses_write" ON public.reputation_responses;
CREATE POLICY "reputation_responses_write" ON public.reputation_responses
    FOR INSERT WITH CHECK (
        reputation_responses.author_user_id = auth.uid()
        AND (
            reputation_responses.organization_id IS NULL
            OR public.has_org_permission(reputation_responses.organization_id, 'reputation.respond')
        )
        AND (
            reputation_responses.company_id IS NULL
            OR auth.uid() IN (SELECT user_id FROM profiles WHERE profiles.company_id = reputation_responses.company_id)
        )
    );

DROP POLICY IF EXISTS "reputation_responses_manage" ON public.reputation_responses;
CREATE POLICY "reputation_responses_manage" ON public.reputation_responses
    FOR UPDATE USING (
        reputation_responses.author_user_id = auth.uid()
        OR public.reputation_in_tenant(reputation_responses.organization_id, reputation_responses.company_id)
    )
    WITH CHECK (reputation_responses.author_user_id = auth.uid());

-- 11.3 Comentários: mesmo modelo das respostas.
DROP POLICY IF EXISTS "reputation_comments_scope" ON public.reputation_comments;
CREATE POLICY "reputation_comments_scope" ON public.reputation_comments
    FOR SELECT USING (
        reputation_comments.author_user_id = auth.uid()
        OR public.reputation_in_tenant(reputation_comments.organization_id, reputation_comments.company_id)
        OR EXISTS (
            SELECT 1 FROM public.reputation_reviews r
            WHERE r.id = reputation_comments.review_id AND r.target_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "reputation_comments_write" ON public.reputation_comments;
CREATE POLICY "reputation_comments_write" ON public.reputation_comments
    FOR INSERT WITH CHECK (
        reputation_comments.author_user_id = auth.uid()
        AND public.reputation_in_tenant(reputation_comments.organization_id, reputation_comments.company_id)
    );

-- 11.4 Casos: leitura no escopo; escrita apenas server-side (service_role).
DROP POLICY IF EXISTS "reputation_cases_scope" ON public.reputation_cases;
CREATE POLICY "reputation_cases_scope" ON public.reputation_cases
    FOR SELECT USING (
        public.reputation_in_tenant(reputation_cases.organization_id, reputation_cases.company_id)
        OR auth.uid() = reputation_cases.assignee_user_id
    );

-- 11.5 Anexos: leitura no escopo; escrita exige autor + membro.
DROP POLICY IF EXISTS "reputation_attachments_scope" ON public.reputation_attachments;
CREATE POLICY "reputation_attachments_scope" ON public.reputation_attachments
    FOR SELECT USING (
        reputation_attachments.created_by = auth.uid()
        OR public.reputation_in_tenant(reputation_attachments.organization_id, reputation_attachments.company_id)
    );

DROP POLICY IF EXISTS "reputation_attachments_write" ON public.reputation_attachments;
CREATE POLICY "reputation_attachments_write" ON public.reputation_attachments
    FOR INSERT WITH CHECK (
        reputation_attachments.created_by = auth.uid()
        AND public.reputation_in_tenant(reputation_attachments.organization_id, reputation_attachments.company_id)
    );

-- 11.6 Timeline: apenas leitura no escopo (escrita exclusiva server-side).
DROP POLICY IF EXISTS "reputation_events_scope" ON public.reputation_events;
CREATE POLICY "reputation_events_scope" ON public.reputation_events
    FOR SELECT USING (
        public.reputation_in_tenant(reputation_events.organization_id, reputation_events.company_id)
        OR EXISTS (
            SELECT 1 FROM public.reputation_reviews r
            WHERE r.id = reputation_events.review_id
              AND (r.author_user_id = auth.uid() OR r.target_user_id = auth.uid())
        )
    );

-- 11.7 Métricas: leitura no escopo (gravação server-side).
DROP POLICY IF EXISTS "reputation_scores_scope" ON public.reputation_scores;
CREATE POLICY "reputation_scores_scope" ON public.reputation_scores
    FOR SELECT USING (public.reputation_in_tenant(reputation_scores.organization_id, reputation_scores.company_id));

-- 11.8 Portal da Queixa: configuração lida por membros; escrita por gestores.
DROP POLICY IF EXISTS "reputation_portal_config_scope" ON public.reputation_portal_config;
CREATE POLICY "reputation_portal_config_scope" ON public.reputation_portal_config
    FOR SELECT USING (public.reputation_in_tenant(reputation_portal_config.organization_id, NULL));

DROP POLICY IF EXISTS "reputation_portal_config_manage" ON public.reputation_portal_config;
CREATE POLICY "reputation_portal_config_manage" ON public.reputation_portal_config
    FOR ALL USING (
        reputation_portal_config.organization_id IS NOT NULL
        AND public.has_org_permission(reputation_portal_config.organization_id, 'reputation.manage')
    )
    WITH CHECK (
        reputation_portal_config.organization_id IS NOT NULL
        AND public.has_org_permission(reputation_portal_config.organization_id, 'reputation.manage')
    );

DROP POLICY IF EXISTS "reputation_external_references_scope" ON public.reputation_external_references;
CREATE POLICY "reputation_external_references_scope" ON public.reputation_external_references
    FOR SELECT USING (public.reputation_in_tenant(reputation_external_references.organization_id, NULL));

DROP POLICY IF EXISTS "reputation_external_references_write" ON public.reputation_external_references;
CREATE POLICY "reputation_external_references_write" ON public.reputation_external_references
    FOR INSERT WITH CHECK (
        reputation_external_references.organization_id IS NOT NULL
        AND public.has_org_permission(reputation_external_references.organization_id, 'reputation.manage')
    );

-- 12. PERMISSÕES
-- service_role: crud completo (as default privileges de 0004 já cobrem tabelas novas).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reputation_reviews TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reputation_responses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reputation_comments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reputation_cases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reputation_attachments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reputation_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reputation_scores TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reputation_portal_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reputation_external_references TO service_role;

-- authenticated: apenas leitura no seu escopo (RLS decide o que se vê);
-- escritas diretas são bloqueadas por design (WITH CHECK exige org + permissão).
GRANT SELECT ON TABLE public.reputation_reviews TO authenticated;
GRANT SELECT ON TABLE public.reputation_responses TO authenticated;
GRANT SELECT ON TABLE public.reputation_comments TO authenticated;
GRANT SELECT ON TABLE public.reputation_events TO authenticated;
GRANT SELECT ON TABLE public.reputation_scores TO authenticated;
GRANT SELECT ON TABLE public.reputation_portal_config TO authenticated;
GRANT SELECT ON TABLE public.reputation_external_references TO authenticated;
GRANT SELECT ON TABLE public.reputation_attachments TO authenticated;
GRANT SELECT ON TABLE public.reputation_cases TO authenticated;

-- 13. COMENTÁRIOS DE DOCUMENTAÇÃO
COMMENT ON TABLE public.reputation_reviews IS 'Reclamações, recomendações, elogios e avaliações (autor+tenant imutáveis, RLS por autor/membro/alvo)';
COMMENT ON TABLE public.reputation_responses IS 'Respostas oficiais/particulares às avaliações';
COMMENT ON TABLE public.reputation_comments IS 'Comentários de acompanhamento (autor/alvo/gestores)';
COMMENT ON TABLE public.reputation_cases IS 'Casos de escalamento (crítico, sem resposta, moderação, obsoleto)';
COMMENT ON TABLE public.reputation_attachments IS 'Anexos/evidências com marcação de suspeição';
COMMENT ON TABLE public.reputation_events IS 'Timeline de auditoria das avaliações';
COMMENT ON TABLE public.reputation_scores IS 'Snapshots mensais de métricas de reputação por tenant/assunto';
COMMENT ON TABLE public.reputation_portal_config IS 'Configuração de integração com o Portal da Queixa (sem API oficial → estado NOT_CONFIGURED)';
COMMENT ON TABLE public.reputation_external_references IS 'Referências externas (Portal da Queixa) registadas manualmente';