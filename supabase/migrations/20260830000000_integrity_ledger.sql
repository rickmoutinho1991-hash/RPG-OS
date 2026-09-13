-- RPG-OS — FASE 1: Security Foundation
-- Tabela integrity_ledger: prova criptográfica de integridade de eventos.
--
-- IMPORTANTE:
--  - NÃO contém PII (nunca nomes, emails, NIF, IBAN, tokens, documentos).
--  - Apenas hashes SHA-256, tipos/IDs de evento e tenant scope.
--  - Migração ADITIVA: não altera nem apaga dados existentes.
--  - Escritas apenas server-side (service role); tenants só leem a própria cadeia.

CREATE TABLE IF NOT EXISTS public.integrity_ledger (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    company_id      UUID,
    event_type      TEXT NOT NULL,
    event_id        TEXT NOT NULL,
    previous_hash   CHAR(64) NOT NULL,
    current_hash    CHAR(64) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.integrity_ledger IS
    'RPG-OS Integrity Ledger — prova criptográfica (hash chain) de eventos de auditoria. Sem PII.';

-- Apenas colunas necessárias; sem dados de conteúdo.
ALTER TABLE public.integrity_ledger ENABLE ROW LEVEL SECURITY;

-- Leitura isolada por tenant: apenas a própria cadeia.
CREATE POLICY "integrity_ledger_read_own_org"
    ON public.integrity_ledger
    FOR SELECT
    USING (
        organization_id IS NOT NULL
        AND organization_id IN (
            SELECT om.organization_id
            FROM public.org_memberships om
            WHERE om.user_id = auth.uid()
              AND om.status = 'ACTIVE'
        )
    );

-- Sem política INSERT/UPDATE/DELETE para authenticated: escritas apenas
-- via service role (server-side), como audit_logs.

-- Índices de consulta e verificação de cadeia.
CREATE INDEX IF NOT EXISTS idx_integrity_ledger_org_created
    ON public.integrity_ledger (organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_integrity_ledger_current_hash
    ON public.integrity_ledger (current_hash);
CREATE INDEX IF NOT EXISTS idx_integrity_ledger_org_event
    ON public.integrity_ledger (organization_id, event_type, event_id);
-- Garante append-only lógico: um event_id por tenant/tipo não se repete.
CREATE UNIQUE INDEX IF NOT EXISTS uq_integrity_ledger_org_event_id
    ON public.integrity_ledger (COALESCE(organization_id::text, ''), event_type, event_id);
