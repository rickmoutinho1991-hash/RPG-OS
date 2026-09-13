-- RPG-OS — Seed do ambiente de DESENVOLVIMENTO (local apenas).
-- Corrido automaticamente pelo Supabase CLI após todas as migrations
-- (`supabase db reset` / `supabase db seed`). NUNCA é aplicado em produção.
--
-- Propósito: reconstruir de forma idempotente o tenant DEV e a membership
-- OWNER que, historicamente, eram criados em runtime (e por isso se perdiam
-- num reset: o `rpg-os-dev` + OWNER não existiam em nenhuma migration).
--
-- Princípios:
--   • NÃO cria utilizadores — o admin `moutinho@rpg-os.pt`, o seu profile e o
--     role ADMIN já são criados pela migration 20260820240000_seed_admin_user.sql
--     (que corre ANTES deste seed). Aqui só fazemos lookup por email.
--   • Idempotente: pode ser corrido várias vezes sem duplicar/danificar dados
--     (ON CONFLICT + guards). Reconstrução segura após `db reset`.
--   • Sem UUIDs hard-coded: os ids do org/membership são resolvidos por slug/email,
--     por isso sobrevivem a regenerações do admin user (id novo) entre resets.
--   • Sem duplicação com migrations: migrations contêm schema + user admin;
--     este seed contém apenas o bootstrap de runtime para o DEV arrancar.

-- ── A. Tenant DEV ──────────────────────────────────────────────────────────
INSERT INTO public.organizations (slug, name, plan_tier, settings, created_by)
SELECT
  'rpg-os-dev',
  'RPG-OS Dev',
  'FREE',
  '{}'::jsonb,
  (SELECT id FROM auth.users WHERE email = 'moutinho@rpg-os.pt')
WHERE NOT EXISTS (
  SELECT 1 FROM public.organizations o WHERE o.slug = 'rpg-os-dev'
);

-- ── B. Membership OWNER do admin DEV ───────────────────────────────────────
-- Upsert para o estado canónico DEV: OWNER + ACTIVE + primária.
-- Resolve os ids por slug/email (nunca hard-coded).
INSERT INTO public.org_memberships
  (organization_id, user_id, role_key, status, is_primary)
SELECT
  o.id, u.id, 'OWNER', 'ACTIVE', true
FROM public.organizations o
JOIN auth.users u ON u.email = 'moutinho@rpg-os.pt'
WHERE o.slug = 'rpg-os-dev'
ON CONFLICT (organization_id, user_id) DO UPDATE SET
  role_key    = EXCLUDED.role_key,
  status      = EXCLUDED.status,
  is_primary  = EXCLUDED.is_primary;