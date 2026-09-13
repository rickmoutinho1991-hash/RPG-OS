-- RPG-OS: Correção definitiva dos tokens do GoTrue para o utilizador admin seed.
-- O GoTrue desta imagem falha ao ler confirmation_token NULL:
--   "error finding user: ... converting NULL to string is unsupported".
-- A migration 20260820240000_seed_admin_user.sql cria o admin sem definir estes
-- campos (ficam NULL). Esta migration aditiva preenche-os com sentinelas vazios
-- e seguros, sem dados pessoais, apenas para o admin criado pelo seed.
-- Não cria utilizadores e não altera o comportamento de autenticação.

do $$
begin
  update auth.users
     set confirmation_token = '',
         recovery_token = '',
         email_change_token_new = '',
         email_change_token_current = '',
         email_change = '',
         phone_change = ''
   where email = 'moutinho@rpg-os.pt';
end $$;