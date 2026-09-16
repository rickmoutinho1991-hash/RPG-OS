-- RPG-OS — Área profissional do ator (vaga M-A "áreas por atuação")
--
-- Objetivo: permitir que o registo do profissional escolha a sua área de
-- atuação (ex.: enfermagem, construcao, ...) e que a área de cliente
-- apresentada após login seja adaptada aos módulos essenciais dessa área.
--
-- Idempotente: pode ser reaplicada sem erro.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS profession_area TEXT;

COMMENT ON COLUMN public.profiles.profession_area IS
    'Área profissional do ator (ex.: enfermagem, construcao, gestao); validada na aplicação (lib/areas.ts).';

CREATE INDEX IF NOT EXISTS idx_profiles_profession_area
    ON public.profiles (profession_area);
