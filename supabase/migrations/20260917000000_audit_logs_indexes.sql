-- RPG-OS: Auditoria — índices aditivos para consulta forense (MASTER FOUNDATION)
--
-- Aditivo e não-destrutivo. Acelera:
--   * procura por ação (ex: ai_tool_invoked, platform.subuser.created)
--   * procura por módulo (ex: platform, marketplace, contracts, payments)
--   * janelas temporais (timestamp) sempre com filtro de tenant (user_id)
-- NOTA: audit_logs.tenant = user_id. Todos os índices compósitos começam por
-- user_id para garantir segurança multi-tenant de índices (sem scan por tenant).

-- Consultas por tenant+janela temporal
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp
    ON public.audit_logs(user_id, timestamp DESC);

-- Consultas por tenant+action (ex: "quem executou X?")
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action
    ON public.audit_logs(user_id, action);

-- Consultas por tenant+module (ex: "auditar tudo do Marketplace")
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_module
    ON public.audit_logs(user_id, module);

-- Consultas por tenant+entity (complementa o índice entity existente sem tenant)
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_entity
    ON public.audit_logs(user_id, entity_type, entity_id);

-- Rastreio forense por IP (força-bruta / abuso) — scoped ao tenant
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_ip
    ON public.audit_logs(user_id, ip)
    WHERE ip IS NOT NULL;