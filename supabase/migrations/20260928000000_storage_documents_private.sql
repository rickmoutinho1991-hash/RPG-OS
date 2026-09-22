-- RPG-OS — Endurecimento storage: bucket `documents` privado (M-G/I).
--
-- Descoberta na varredura determinística de buckets (vaga M-G/H, auditoria
-- contínua):
--   * `documents` estava `public=true` + política `Public Access for Documents`
--     = SELECT em storage.objects SEM quals e SEM check → qualquer anon/
--     authenticated listava metadados (nomes, donos implícitos, timestamps)
--     de TODOS os ficheiros; e bucket público = download por URL pública
--     (storage/v1/object/public/...) sem auth.
--   * `documents` guarda certidões, faturas, documentos de transporte e
--     dados de saúde = dados pessoais no âmbito RGPD. Ao contrário de
--     `project-photos` (intencionalmente público: fotos de obras/imóveis para
--     o marketplace), `documents` NÃO deve ser servido por URL pública.
--   * Prova de compatibilidade: o app lê/escreve `documents` EXCLUSIVAMENTE
--     via admin client server-side (apps/web/lib/storage/* + rotas API
--     móvel/saúde que fazem stream via admin e NUNCA getPublicUrl —
--     confirmado por grep: zero getPublicUrl em todo o repo). Logo trancar
--     owner-only não quebra nada e fecha o leak.
--
-- Ação (idempotente e determinística):
--   1) bucket `documents` → privado (public=false);
--   2) remover políticas storage "Public Access for Documents" (leak) e
--      qualquer remanescente `Public Access` antigo que não cubra project-photos;
--   3) recriar storage owner-only para `documents` (objectos com
--      owner_id = auth.uid()).

update storage.buckets
   set public = false
 where id = 'documents'
   and public = true;

drop policy if exists "Public Access for Documents" on storage.objects;

-- ANY política `Public Access for *` residual que não seja project-photos
-- (defensivo: nunca endurecer project-photos, fonte de fotos públicas).
drop policy if exists "Public Access for Project Photos" on storage.objects;
drop policy if exists "Public Access for Photos" on storage.objects;
drop policy if exists "Public Access for Documents ON documents" on storage.objects;

-- Owner-only storage para documents: SELECT (via owner_id), INSERT/UPDATE/DELETE
-- (owner via owner_id). O bucket passa a privado: tentativas de URL pública
-- passam a falhar, mas o app não usa URLs públicas.

do $$
declare
  v_existing int;
begin
  select count(*) into v_existing
    from pg_policies
   where schemaname = 'storage'
     and tablename  = 'objects'
     and policyname = 'documents_owner_select';
  if v_existing = 0 then
    execute 'create policy documents_owner_select on storage.objects
             for select to authenticated
             using (bucket_id = ''documents'' and owner_id = auth.uid()::text)';
  end if;

  execute 'drop policy if exists "Public Access for Documents" on storage.objects';

  select count(*) into v_existing
    from pg_policies
   where schemaname = 'storage'
     and tablename  = 'objects'
     and policyname = 'documents_owner_insert';
  if v_existing = 0 then
    execute 'create policy documents_owner_insert on storage.objects
             for insert to authenticated
             with check (bucket_id = ''documents'' and owner_id = auth.uid()::text)';
  end if;

  select count(*) into v_existing
    from pg_policies
   where schemaname = 'storage'
     and tablename  = 'objects'
     and policyname = 'documents_owner_update';
  if v_existing = 0 then
    execute 'create policy documents_owner_update on storage.objects
             for update to authenticated
             using (bucket_id = ''documents'' and owner_id = auth.uid()::text)';
  end if;

  select count(*) into v_existing
    from pg_policies
   where schemaname = 'storage'
     and tablename  = 'objects'
     and policyname = 'documents_owner_delete';
  if v_existing = 0 then
    execute 'create policy documents_owner_delete on storage.objects
             for delete to authenticated
             using (bucket_id = ''documents'' and owner_id = auth.uid()::text)';
  end if;
end $$;

-- Re-aplicar service_role grants (storage usa o seu próprio schema; service_role
-- continua a poder ler todos os objectos — server-side admin continua a servir
-- downloads legitimamente).
