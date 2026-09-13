# Segurança

Autenticação usa Supabase SSR e `auth.getUser()`. Cada operação sensível deve confirmar sessão, organização ativa e permissão no servidor. Dados pessoais são filtrados pelo utilizador; dados empresariais pelo `organization_id` e membership.

RLS está ativa nas tabelas de plataforma e nas tabelas legadas. A função `has_org_permission` centraliza a decisão para memberships ativas, validade, cargo e overrides. Convites guardam apenas hash SHA-256 do token.

Exports RGPD/SAF-T e integrações externas devem permanecer em Route Handlers protegidos. Nunca expor service-role key ao browser. Alterações locais existentes não devem ser revertidas automaticamente.
