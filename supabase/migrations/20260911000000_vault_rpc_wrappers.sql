-- RPG-OS: Vault RPC wrappers (acesso mínimo e auditável ao cofre).
--
-- Porquê wrappers: o schema `vault` NÃO está exposto no PostgREST
-- (PGRST_DB_SCHEMAS=public,graphql_public) — e expô-lo daria a anon acesso
-- a funções SECURITY DEFINER. Estes wrappers vivem em `public` (exposto),
-- correm como owner (postgres) e têm EXECUTE apenas para service_role.
-- anon/authenticated: sem EXECUTE (revogado explicitamente).
-- Nenhum wrapper devolve segredo sem nome exato; listagem só metadata.

-- 1. CREATE — devolve id. Nome UNIQUE do Vault impede duplicados.
CREATE OR REPLACE FUNCTION public.rpg_vault_create_secret(
  p_name TEXT,
  p_secret TEXT,
  p_description TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_name IS NULL OR p_name = '' THEN
    RAISE EXCEPTION 'invalid name';
  END IF;
  IF p_secret IS NULL OR p_secret = '' THEN
    RAISE EXCEPTION 'invalid secret';
  END IF;
  SELECT vault.create_secret(p_secret, p_name, COALESCE(p_description, '')) INTO v_id;
  RETURN v_id;
END;
$$;

-- 2. GET por nome exato — devolve valor + metadata (chamador valida binding).
CREATE OR REPLACE FUNCTION public.rpg_vault_get_secret(p_name TEXT)
RETURNS TABLE (id UUID, decrypted_secret TEXT, description TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT d.id, d.decrypted_secret, s.description
  FROM vault.decrypted_secrets d
  JOIN vault.secrets s ON s.id = d.id
  WHERE d.name = p_name;
END;
$$;

-- 2b. GET por id (revoke/delete/rotate localizam por id, validam em TS).
CREATE OR REPLACE FUNCTION public.rpg_vault_get_secret_by_id(p_id UUID)
RETURNS TABLE (id UUID, name TEXT, decrypted_secret TEXT, description TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT d.id, d.name, d.decrypted_secret, s.description
  FROM vault.decrypted_secrets d
  JOIN vault.secrets s ON s.id = d.id
  WHERE d.id = p_id;
END;
$$;

-- 3. LIST — só metadata (nunca valores).
CREATE OR REPLACE FUNCTION public.rpg_vault_list_secrets()
RETURNS TABLE (id UUID, name TEXT, description TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.name, s.description, s.created_at
  FROM vault.secrets s
  ORDER BY s.created_at DESC;
END;
$$;

-- 4. UPDATE valor e/ou description por id (revogação marca description).
DROP FUNCTION IF EXISTS public.rpg_vault_update_secret(UUID, TEXT);
DROP FUNCTION IF EXISTS public.rpg_vault_update_secret(UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.rpg_vault_update_secret(
  p_id UUID,
  p_secret TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public, pg_temp
AS $$
BEGIN
  IF p_secret IS NULL AND p_description IS NULL THEN
    RAISE EXCEPTION 'nothing to update';
  END IF;
  PERFORM vault.update_secret(p_id, p_secret, NULL, p_description);
END;
$$;

-- 5. DELETE por id (retorna true se existia).
CREATE OR REPLACE FUNCTION public.rpg_vault_delete_secret(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM vault.secrets WHERE id = p_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

-- 6. Fechar acesso: ninguém além de service_role executa.
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.rpg_vault_create_secret(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.rpg_vault_get_secret(TEXT) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.rpg_vault_get_secret_by_id(UUID) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.rpg_vault_list_secrets() FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.rpg_vault_update_secret(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.rpg_vault_delete_secret(UUID) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.rpg_vault_create_secret(TEXT, TEXT, TEXT) TO service_role;
  GRANT EXECUTE ON FUNCTION public.rpg_vault_get_secret(TEXT) TO service_role;
  GRANT EXECUTE ON FUNCTION public.rpg_vault_get_secret_by_id(UUID) TO service_role;
  GRANT EXECUTE ON FUNCTION public.rpg_vault_list_secrets() TO service_role;
  GRANT EXECUTE ON FUNCTION public.rpg_vault_update_secret(UUID, TEXT, TEXT) TO service_role;
  GRANT EXECUTE ON FUNCTION public.rpg_vault_delete_secret(UUID) TO service_role;
END $$;

COMMENT ON FUNCTION public.rpg_vault_create_secret(TEXT, TEXT, TEXT) IS 'Vault write: service_role only. Sem valores em logs.';
COMMENT ON FUNCTION public.rpg_vault_get_secret(TEXT) IS 'Vault read por nome exato: service_role only. Chamar valida binding.';
