-- RPG-OS: Assistente de Vida — Plano de Ações Propostas
-- Migração 20260904000000
--
-- Modelo:
--   action_plans → ações propostas pelo assistente (ActionPlanService)
--
-- Semântica:
--   - As ações são SEMPRE criadas como PROPOSED e nunca executam nada por si;
--   - BILL_PAYMENT / MARK_BILL_PAID exigem requires_confirmation = true
--     (ações financeiras irreversíveis → confirmação explícita);
--   - id é a chave determinística do núcleo (userId::type::entityId) usada
--     como desduplicação (proposal_key) entre syncs;
--   - transições: PROPOSED→CONFIRMED/CANCELLED, CONFIRMED→EXECUTED/CANCELLED/FAILED.
--
-- Segurança: RLS ativa. O dono (user_id) gere as suas próprias ações;
-- membros da organização/empresa conseguem LER (visibilidade de tenant).
-- Escritas do assistente são server-side via service_role com o tenant
-- resolvido na sessão (nunca valores do cliente).

-- 1. TABELA
CREATE TABLE IF NOT EXISTS public.action_plans (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL,
    organization_id UUID,
    company_id UUID,
    type TEXT NOT NULL CHECK (type IN (
        'REMINDER','TASK','OBLIGATION_TASK','EVENT','FOLLOW_UP',
        'BILL_PAYMENT','MARK_BILL_PAID','REPLY_REVIEW'
    )),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    impact TEXT NOT NULL DEFAULT '',
    related_entity_type TEXT,
    related_entity_id UUID,
    related_entity_label TEXT,
    required_data JSONB NOT NULL DEFAULT '{}'::JSONB,
    requires_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
    priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('CRITICAL','HIGH','NORMAL','INFO')),
    status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','CONFIRMED','EXECUTED','CANCELLED','FAILED')),
    proposed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    failed_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS action_plans_user_status_idx ON public.action_plans (user_id, status);
CREATE INDEX IF NOT EXISTS action_plans_org_status_idx ON public.action_plans (organization_id, status);
CREATE INDEX IF NOT EXISTS action_plans_user_created_idx ON public.action_plans (user_id, created_at DESC);

-- 2. TRIGGERS
-- Dono/tenant imutáveis após criação (impede re-associação cross-tenant
-- mesmo com service_role) + manutenção automática do updated_at.
CREATE OR REPLACE FUNCTION public.action_plans_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 WHERE NEW IS DISTINCT FROM OLD AND (
      NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.type IS DISTINCT FROM OLD.type
  )) THEN
    RAISE EXCEPTION 'action_plans: dono, tenant e tipo são imutáveis após criação'
      USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS action_plans_guard ON public.action_plans;
CREATE TRIGGER action_plans_guard
  BEFORE UPDATE ON public.action_plans
  FOR EACH ROW EXECUTE FUNCTION public.action_plans_guard();

-- 3. RLS
ALTER TABLE public.action_plans ENABLE ROW LEVEL SECURITY;

-- Leitura: dono OU membro do tenant (org/empresa).
DROP POLICY IF EXISTS "action_plans_scope" ON public.action_plans;
CREATE POLICY "action_plans_scope" ON public.action_plans
    FOR SELECT USING (
        action_plans.user_id = auth.uid()
        OR (action_plans.organization_id IS NOT NULL AND public.has_org_permission(action_plans.organization_id, 'life.view'))
        OR (action_plans.company_id IS NOT NULL AND action_plans.user_id IN (
            SELECT user_id FROM public.profiles WHERE profiles.user_id IS NOT NULL AND profiles.company_id = action_plans.company_id
        ))
    );

-- Escrita: estritamente o dono (WITH CHECK endurecido).
DROP POLICY IF EXISTS "action_plans_owner" ON public.action_plans;
CREATE POLICY "action_plans_owner" ON public.action_plans
    FOR ALL USING (action_plans.user_id = auth.uid())
    WITH CHECK (action_plans.user_id = auth.uid());

-- 4. PERMISSÕES
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.action_plans TO service_role;
GRANT SELECT ON TABLE public.action_plans TO authenticated;

-- 5. DOCUMENTAÇÃO
COMMENT ON TABLE public.action_plans IS 'Ações propostas pelo Assistente de Vida (PROPOSED→CONFIRMED→EXECUTED; financeiras exigem confirmação explícita)';