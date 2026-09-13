-- RPG-OS: Fundação do modelo comercial de sucesso/transação (fee RPG-OS).
--
-- Modelo de negócio: sem mensalidade fixa; o RPG-OS monetiza uma pequena
-- percentagem sobre trabalhos efetivamente pagos gerados pela plataforma
-- (Oportunidade → Orçamento → Aceitação → Trabalho → Faturação → Pagamento → Fee).
--
-- Princípios:
--  - A fee só existe quando há valor económico REAL: cada row do ledger é
--    ancorada num pagamento concreto (payments.id) — nunca numa estimativa.
--  - Valores em CENTAVOS inteiros (bigint): zero erro de floating point.
--  - Idempotência garantida na BD: uq_platform_fee_source impede duas fees
--    para o mesmo pagamento (nunca cobrança duplicada).
--  - Taxa CONFIGURÁVEL: platform_fee_config por empresa com fallback global.
--    O seed inicial (250 bps = 2,5%) é dado de configuração, não lógica hardcoded.
--  - companies ≠ organizations: este módulo vive no domínio comercial
--    (companies), tal como quotes/invoices/payments/projects.
-- ─── Configuração da taxa ────────────────────────────────────────────
-- company_id NULL = configuração GLOBAL (fallback). Uma linha ativa por
-- escopo (expressão única evita duplicados concorrentes de configuração).
create table if not exists platform_fee_config (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  basis_points integer not null check (basis_points >= 0 and basis_points <= 10000),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_fee_config_scope_active
  on platform_fee_config ((coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  where is_active;

comment on table platform_fee_config is
  'Taxa RPG-OS (basis points) por empresa; company_id NULL = global. Alterável sem deploy.';
-- Dado de configuração inicial: 2,5% (idempotente).
insert into platform_fee_config (company_id, basis_points, notes)
select null, 250, 'Taxa global inicial do modelo de sucesso (configurável).'
where not exists (select 1 from platform_fee_config where company_id is null);
-- ─── Ledger de fees (append-only na prática) ────────────────────────
-- Um registo por fonte económica (hoje: PAYMENT). Snapshots imutáveis de
-- bruto/taxa/fee/líquido no momento da accrual — alterações posteriores ao
-- valor da fatura/pagamento ou à config NÃO reescrevem histórico.
create table if not exists platform_fees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  source_type text not null check (source_type in ('PAYMENT')),
  source_id uuid not null,
  invoice_id uuid references invoices(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  quote_id uuid references quotes(id) on delete set null,
  gross_cents bigint not null check (gross_cents >= 0),
  basis_points integer not null check (basis_points >= 0 and basis_points <= 10000),
  fee_cents bigint not null check (fee_cents >= 0),
  net_cents bigint not null check (net_cents >= 0),
  currency char(3) not null default 'EUR',
  status text not null default 'ACCRUED'
    check (status in ('ACCRUED', 'INVOICED', 'SETTLED', 'CANCELLED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index if not exists idx_platform_fees_company on platform_fees(company_id, created_at desc);
create index if not exists idx_platform_fees_invoice on platform_fees(invoice_id);

-- RLS: leitura restrita a colaboradores da empresa; escrita apenas via
-- service-role (Server Actions autorizadas server-side).
alter table platform_fee_config enable row level security;
alter table platform_fees enable row level security;

drop policy if exists "pf_config_read_members" on platform_fee_config;
create policy "pf_config_read_members" on platform_fee_config for select
  using (
    company_id is null
    or company_id in (
      select ce.company_id from company_employees ce where ce.user_id = auth.uid()
    )
  );

drop policy if exists "pf_ledger_read_members" on platform_fees;
create policy "pf_ledger_read_members" on platform_fees for select
  using (
    company_id in (
      select ce.company_id from company_employees ce where ce.user_id = auth.uid()
    )
  );
