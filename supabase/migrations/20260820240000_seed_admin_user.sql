-- RPG-OS: Criação e Configuração do Administrador Total (Moutinho)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Garantir que o Role ADMIN existe
INSERT INTO public.roles (name)
VALUES ('ADMIN')
ON CONFLICT (name) DO NOTHING;

-- 2. Criar ou Atualizar o Utilizador no Supabase Auth com encriptação bcrypt
DO $$
DECLARE
  v_user_id UUID;
  v_role_id UUID;
BEGIN
  SELECT id INTO v_role_id FROM public.roles WHERE name = 'ADMIN';

  SELECT id INTO v_user_id FROM auth.users WHERE email = 'moutinho@rpg-os.pt';

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      role,
      aud
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'moutinho@rpg-os.pt',
      crypt('rrtm14403874@', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Moutinho","username":"Moutinho"}'::jsonb,
      NOW(),
      NOW(),
      'authenticated',
      'authenticated'
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt('rrtm14403874@', gen_salt('bf')),
        email_confirmed_at = NOW(),
        raw_user_meta_data = '{"name":"Moutinho","username":"Moutinho"}'::jsonb
    WHERE id = v_user_id;
  END IF;

  -- Inserir / atualizar em public.users
  INSERT INTO public.users (id, email)
  VALUES (v_user_id, 'moutinho@rpg-os.pt')
  ON CONFLICT (email) DO UPDATE SET id = v_user_id;

  -- Inserir / atualizar em public.profiles com o nome Moutinho
  INSERT INTO public.profiles (user_id, name, tax_number, phone)
  VALUES (v_user_id, 'Moutinho', '501234567', '910000000')
  ON CONFLICT (user_id) DO UPDATE SET name = 'Moutinho';

  -- Associar Role ADMIN com permissões totais
  IF v_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (v_user_id, v_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;

END $$;
