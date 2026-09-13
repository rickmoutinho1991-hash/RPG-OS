-- RPG-OS: contexto fiscal por despesa pessoal (P1.2, sem AT)
--
-- Três flags NULLABLE (NULL = não informado). Nenhum NIF é armazenado:
-- a correspondência do adquirente é uma declaração booleana local
-- (buyer_nif_match), nunca um valor fiscal. RLS existente cobre as colunas.

ALTER TABLE public.personal_deductions
    ADD COLUMN IF NOT EXISTS fatura_comunicada BOOLEAN,
    ADD COLUMN IF NOT EXISTS buyer_nif_match BOOLEAN,
    ADD COLUMN IF NOT EXISTS cae_elegivel BOOLEAN;

COMMENT ON COLUMN public.personal_deductions.fatura_comunicada IS 'Declaração local: fatura comunicada à AT (nunca confirmação oficial).';
COMMENT ON COLUMN public.personal_deductions.buyer_nif_match IS 'Declaração local: adquirente corresponde ao NIF do utilizador (sem armazenar NIF).';
COMMENT ON COLUMN public.personal_deductions.cae_elegivel IS 'Declaração local: CAE/atividade elegível para a categoria.';
