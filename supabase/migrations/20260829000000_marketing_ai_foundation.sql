-- RPG-OS: FUNDAÇÃO + FASE 2 DO MARKETING AI / AUTOPILOT (migration aditiva, idempotente).
--
-- Modelo: Marketing → Lead → Cliente → Orçamento → Trabalho → Pagamento → Platform Fee.
-- Princípios:
--  - NENHUMA integração externa nesta fase (Meta/Google/TikTok) — apenas fundação;
--  - Dinheiro em CENTAVOS inteiros (bigint) — padrão do Platform Fee, zero float;
--  - Configuração STRICTLY por empresa (companies) — domínio comercial,
--    tal como platform_fee_config/quotes/invoices;
--  - RLS: leitura para colaboradores da empresa; escrita apenas service-role
--    (Server Actions autorizadas server-side, nunca pelo cliente).
-- ─── Configuração por empresa (uma linha por empresa) ────────────────
-- autonomy_level: COPILOT | SEMI_AUTONOMOUS | AUTOPILOT
-- is_active false = estado OFF (nenhuma ação é decidida).
create table if not exists marketing_config (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  autonomy_level text not null default 'COPILOT'
    check (autonomy_level in ('COPILOT', 'SEMI_AUTONOMOUS', 'AUTOPILOT')),
  is_active boolean not null default false,
  daily_budget_cents bigint not null default 0 check (daily_budget_cents >= 0),
  monthly_budget_cents bigint not null default 0 check (monthly_budget_cents >= 0),
  max_campaign_budget_cents bigint not null default 0 check (max_campaign_budget_cents >= 0),
  max_cost_per_lead_cents bigint not null default 0 check (max_cost_per_lead_cents >= 0),
  max_leads_per_month integer not null default 0 check (max_leads_per_month >= 0),
  min_job_value_cents bigint not null default 0 check (min_job_value_cents >= 0),
  min_margin_bps integer check (min_margin_bps is null or (min_margin_bps >= 0 and min_margin_bps <= 10000)),
  allowed_channels text[] not null default '{}'::text[],
  allowed_services text[] not null default '{}'::text[],
  allowed_zones text[] not null default '{}'::text[],
  requires_human_approval boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id)
);

create index if not exists idx_marketing_config_company
  on marketing_config(company_id);

comment on table marketing_config is
  'Config do Marketing AI por empresa. O servidor é a única fonte de verdade: nunca aceitar budget/autonomia/limites do cliente.';

-- ─── Campanhas (fundação; sem publicação externa nesta fase) ─────────
create table if not exists marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  objective text not null
    check (objective in ('LEADS', 'QUOTES', 'JOBS', 'AWARENESS')),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
  channels text[] not null default '{}'::text[],
  budget_cents bigint not null default 0 check (budget_cents >= 0),
  currency char(3) not null default 'EUR',
  provider_id text,
  provider_external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_campaigns_company
  on marketing_campaigns(company_id, created_at desc);

comment on table marketing_campaigns is
  'Campanhas de marketing. Nesta fase nenhuma campanha é publicada em plataformas externas.';

-- ─── Ações propostas/decididas pela IA (pipeline auditável) ──────────
-- decision: ALLOWED | REQUIRES_APPROVAL | DENIED (saída de canExecuteMarketingAction)
-- status: RECORDED (decidida, não executada) | PENDING_APPROVAL | APPROVED |
--         REJECTED | DENIED
create table if not exists marketing_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  campaign_id uuid references marketing_campaigns(id) on delete set null,
  action_type text not null
    check (action_type in ('CREATE_CAMPAIGN', 'PAUSE_CAMPAIGN', 'RESUME_CAMPAIGN', 'ADJUST_BUDGET', 'GENERATE_CONTENT', 'SUGGEST_TARGETING')),
  objective text not null
    check (objective in ('LEADS', 'QUOTES', 'JOBS', 'AWARENESS')),
  channel text not null
    check (channel in ('META', 'GOOGLE', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'LOCAL', 'WEBSITE')),
  decision text not null
    check (decision in ('ALLOWED', 'REQUIRES_APPROVAL', 'DENIED')),
  reason_code text not null,
  message text not null default '',
  status text not null default 'RECORDED'
    check (status in ('RECORDED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'DENIED', 'EXECUTED', 'FAILED')),
  estimated_cost_cents bigint check (estimated_cost_cents is null or estimated_cost_cents >= 0),
  estimated_cost_per_lead_cents bigint check (estimated_cost_per_lead_cents is null or estimated_cost_per_lead_cents >= 0),
  estimated_leads integer check (estimated_leads is null or estimated_leads >= 0),
  service text,
  zone text,
  job_value_cents bigint check (job_value_cents is null or job_value_cents >= 0),
  provider_id text,
  provider_external_id text,
  executed_at timestamptz,
  requested_by uuid references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_marketing_actions_company
  on marketing_actions(company_id, created_at desc);
create index if not exists idx_marketing_actions_status
  on marketing_actions(company_id, status)
  where status in ('PENDING_APPROVAL', 'RECORDED');

comment on table marketing_actions is
  'Recomendações da IA, decisões de guardrails e execução SIMULADA (sandbox). Status EXECUTED/FAILED registam o resultado no provider fake; nenhuma publicidade real é feita nesta fase.';

-- ─── Leads simulados (sandbox) + trilho de receita futuro ────────────
-- FASE 2: leads vivem no provider fake; aqui guardamos apenas o intake que
-- alimentará o fluxo comercial (lead → quote → job → invoice → payment → fee).
-- Stage começa SEMPRE em 'LEAD'; os links (quote_id, project_id, ...) são
-- preenchidos por fases futuras com IDs das tabelas existentes.
create table if not exists marketing_leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  campaign_id uuid references marketing_campaigns(id) on delete set null,
  provider_id text not null default 'FAKE_SANDBOX',
  external_lead_id text,
  name text,
  contact text,
  service text,
  zone text,
  estimated_job_value_cents bigint check (estimated_job_value_cents is null or estimated_job_value_cents >= 0),
  received_at timestamptz not null default now(),
  stage text not null default 'LEAD'
    check (stage in ('LEAD', 'QUOTE', 'QUOTE_ACCEPTED', 'PROJECT_JOB', 'INVOICE', 'PAYMENT', 'PLATFORM_FEE')),
  links jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (company_id, provider_id, external_lead_id)
);

create index if not exists idx_marketing_leads_company
  on marketing_leads(company_id, received_at desc);
create index if not exists idx_marketing_leads_campaign
  on marketing_leads(campaign_id);

comment on table marketing_leads is
  'Intake de leads de marketing. Stage fixo em LEAD nesta fase; conversão para quote/job/invoice/payment/fee é humana e futura (via módulos existentes).';

-- ─── RLS: leitura por colaboradores; escrita só service-role ─────────
alter table marketing_config enable row level security;
alter table marketing_campaigns enable row level security;
alter table marketing_actions enable row level security;

drop policy if exists "marketing_config_read_members" on marketing_config;
create policy "marketing_config_read_members" on marketing_config for select
  using (
    company_id in (
      select ce.company_id from company_employees ce where ce.user_id = auth.uid()
    )
  );

drop policy if exists "marketing_campaigns_read_members" on marketing_campaigns;
create policy "marketing_campaigns_read_members" on marketing_campaigns for select
  using (
    company_id in (
      select ce.company_id from company_employees ce where ce.user_id = auth.uid()
    )
  );

drop policy if exists "marketing_actions_read_members" on marketing_actions;
create policy "marketing_actions_read_members" on marketing_actions for select
  using (
    company_id in (
      select ce.company_id from company_employees ce where ce.user_id = auth.uid()
    )
  );

alter table marketing_leads enable row level security;

drop policy if exists "marketing_leads_read_members" on marketing_leads;
create policy "marketing_leads_read_members" on marketing_leads for select
  using (
    company_id in (
      select ce.company_id from company_employees ce where ce.user_id = auth.uid()
    )
  );
