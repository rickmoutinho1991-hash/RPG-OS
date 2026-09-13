-- RPG-OS: Revenue Engine (FASE 7) — Money / Ledger / Subscriptions
-- Migration aditiva LOCAL (20260905000000). NUNCA aplicar em produção sem
-- revisão; não remove nem altera tabelas existentes.
--
-- Conteúdo:
--   1. revenue_ledger_entries   — ledger de receita APPEND-ORIENTED e IMUTÁVEL.
--      A regra é *apenas acrescentar*: um evento de reembolso/reversão cria um
--      novo registo; nunca atualizamos um registo anterior. O saldo derivado é
--      a soma dos registos. Estados: PENDING/COLLECTED/REFUNDED/
--      PARTIALLY_REFUNDED/FAILED/REVERSED.
--   2. organization_subscriptions — ciclo de vida da subscrição de uma
--      organização (TRIALING/ACTIVE/PAST_DUE/PAUSED/CANCELLED).
--   3. revenue_refunds — trilho de auditoria de cada reembolso/reversão.
--
-- Segurança:
--   - Valores em CENTAVOS inteiros (bigint), CHECK >= 0 (ou >0 onde aplica);
--   - RLS ativa; leitura restrita a membros ativos da organização
--     (reutiliza helper `is_org_member`, já existente);
--   - Escritas via service_role (Server Actions autorizadas server-side);
--   - organization_id guardado em TODAS as linhas para isolamento multi-tenant.
--
-- Garantias de integridade:
--   - revenue_ledger_entries: CHECK  gross = fee + net (invariante monetário);
--   - revenue_ledger_entries: fee <= gross;
--   - organization_subscriptions: unique por organização (uma ativa por vez)
--     via partial unique index no estado ativo.

-- ─── 1. Revenue Ledger (append-only) ─────────────────────────────────────
create table if not exists public.revenue_ledger_entries (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    company_id uuid references companies(id) on delete cascade,

    -- Transação económica de origem (payments/payment_transactions).
    source_type text not null default 'PAYMENT'
        check (source_type in ('PAYMENT','SUBSCRIPTION')),
    source_id text,

    -- Identificador da transação de pagamento (se aplicável).
    payment_transaction_id uuid references payment_transactions(id) on delete set null,

    -- Snapshot imutável da fee recolhida no momento da accrual.
    gross_cents bigint not null check (gross_cents >= 0),
    fee_cents bigint not null check (fee_cents >= 0),
    net_cents bigint not null check (net_cents >= 0),
    basis_points integer not null check (basis_points >= 0 and basis_points <= 10000),
    currency char(3) not null default 'EUR',

    -- Rastreio de reembolsos (append-only).
    fee_collected_cents bigint not null check (fee_collected_cents >= 0),
    fee_refunded_cents bigint not null default 0 check (fee_refunded_cents >= 0),

    -- Estado do ledger (append-oriented; ver FASE 7).
    status text not null default 'PENDING' check (status in (
        'PENDING','COLLECTED','REFUNDED','PARTIALLY_REFUNDED','FAILED','REVERSED'
    )),

    -- Plano/subscrição (opcional, fonte de taxa).
    plan_id text,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- Invariante monetário central: bruto = fee + líquido.
    constraint revenue_ledger_split_invariant check (
        fee_cents + net_cents = gross_cents
    ),
    -- A fee recolhida nunca excede o bruto nem é negativa.
    constraint revenue_ledger_fee_not_exceed check (
        fee_cents <= gross_cents and fee_collected_cents <= gross_cents
    )
);

-- Índices para consultas por tenant e por período.
create index if not exists idx_revenue_ledger_org
    on revenue_ledger_entries(organization_id, created_at desc);
create index if not exists idx_revenue_ledger_status
    on revenue_ledger_entries(status, created_at desc);
create index if not exists idx_revenue_ledger_payment
    on revenue_ledger_entries(payment_transaction_id);

-- Assegura que não há duas linhas 'PENDING'/'COLLECTED' para a mesma origem
-- (nunca receita duplicada por pagamento).
create unique index if not exists uq_revenue_ledger_source
    on revenue_ledger_entries (source_type, source_id)
    where source_id is not null;
create unique index if not exists uq_revenue_ledger_payment
    on revenue_ledger_entries (payment_transaction_id)
    where payment_transaction_id is not null;

-- ─── 2. Organization Subscriptions ───────────────────────────────────────
create table if not exists public.organization_subscriptions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null unique references organizations(id) on delete cascade,
    plan_id text not null default 'FREE'
        check (plan_id in ('FREE','BUSINESS','PRO','ENTERPRISE')),
    status text not null default 'TRIALING' check (status in (
        'TRIALING','ACTIVE','PAST_DUE','PAUSED','CANCELLED'
    )),
    monthly_price_cents bigint not null default 0 check (monthly_price_cents >= 0),
    current_period_start timestamptz,
    current_period_end timestamptz,
    cancel_at_period_end boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_org_sub_status
    on organization_subscriptions(status);

-- ─── 3. Refunds / Reversals (trilho imutável) ────────────────────────────
create table if not exists public.revenue_refunds (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    ledger_entry_id uuid references revenue_ledger_entries(id) on delete cascade,
    refund_cents bigint not null check (refund_cents >= 0),
    fee_to_refund_cents bigint not null check (fee_to_refund_cents >= 0),
    net_to_refund_cents bigint not null check (net_to_refund_cents >= 0),
    type text not null default 'REFUND' check (type in ('REFUND','REVERSAL')),
    orientation text not null default 'USER' check (orientation in ('USER','ADMIN','SYSTEM')),
    reason text,
    acted_by uuid references users(id) on delete set null,
    created_at timestamptz not null default now(),
    -- Invariante: montante = fee + líquido a devolver.
    constraint revenue_refund_split_invariant check (
        fee_to_refund_cents + net_to_refund_cents = refund_cents
    )
);

create index if not exists idx_revenue_refunds_org
    on revenue_refunds(organization_id, created_at desc);
create index if not exists idx_revenue_refunds_ledger
    on revenue_refunds(ledger_entry_id);

-- ─── 4. RLS (multi-tenant estrito; reutiliza is_org_member) ───────────────
alter table revenue_ledger_entries enable row level security;
alter table organization_subscriptions enable row level security;
alter table revenue_refunds enable row level security;

drop policy if exists "rev_ledger_read_member" on revenue_ledger_entries;
create policy "rev_ledger_read_member" on revenue_ledger_entries for select
    using (is_org_member(organization_id));

drop policy if exists "rev_sub_read_member" on organization_subscriptions;
create policy "rev_sub_read_member" on organization_subscriptions for select
    using (is_org_member(organization_id));

drop policy if exists "rev_refund_read_member" on revenue_refunds;
create policy "rev_refund_read_member" on revenue_refunds for select
    using (is_org_member(organization_id));

-- Escritas: apenas service_role (Server Actions autorizadas server-side).
drop policy if exists "rev_ledger_write_service" on revenue_ledger_entries;
create policy "rev_ledger_write_service" on revenue_ledger_entries for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "rev_sub_write_service" on organization_subscriptions;
create policy "rev_sub_write_service" on organization_subscriptions for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists "rev_refund_write_service" on revenue_refunds;
create policy "rev_refund_write_service" on revenue_refunds for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

-- ─── 5. Grants ────────────────────────────────────────────────────────────
grant select, insert, update, delete on table public.revenue_ledger_entries to service_role;
grant select, insert, update, delete on table public.organization_subscriptions to service_role;
grant select, insert, update, delete on table public.revenue_refunds to service_role;

grant select on table public.revenue_ledger_entries to authenticated;
grant select on table public.organization_subscriptions to authenticated;
grant select on table public.revenue_refunds to authenticated;

-- ─── 6. Comentários ───────────────────────────────────────────────────────
comment on table revenue_ledger_entries is
  'Ledger de receita APPEND-ORIENTED: cada evento cria um registo; nunca reescreve anteriores.';
comment on column revenue_ledger_entries.status is
  'PENDING/COLLECTED/REFUNDED/PARTIALLY_REFUNDED/FAILED/REVERSED (FASE 7).';
comment on table organization_subscriptions is
  'Subscrição SaaS da organização: TRIALING/ACTIVE/PAST_DUE/PAUSED/CANCELLED.';
comment on table revenue_refunds is
  'Trilho imutável de cada reembolso/reversão com split fee/líquido exato.';
