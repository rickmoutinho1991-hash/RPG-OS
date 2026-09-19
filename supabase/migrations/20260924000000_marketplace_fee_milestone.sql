-- RPG-OS: Mercado — snapshot da comissão da plataforma em cada pagamento de milestone (M-F)
-- O cliente paga o valor bruto; a plataforma retém a fee (modelo 3% = 300 bps por defeito);
-- o prestador recebe o líquido. Os valores são imutáveis por pagamento.

alter table marketplace_milestone_payments
  add column if not exists fee_bps integer not null default 300;
alter table marketplace_milestone_payments
  add column if not exists fee_cents bigint not null default 0;
alter table marketplace_milestone_payments
  add column if not exists net_cents bigint not null default 0;

comment on column marketplace_milestone_payments.fee_bps
  is 'Snapshot histórico da comissão em basis points aplicada a este pagamento.';
comment on column marketplace_milestone_payments.fee_cents
  is 'Snapshot histórico da comissão em cêntimos retida pela plataforma.';
comment on column marketplace_milestone_payments.net_cents
  is 'Snapshot histórico do líquido em cêntimos que o prestador recebe (gross - fee).';