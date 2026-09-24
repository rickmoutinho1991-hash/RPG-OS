-- RPG-OS — Hardening M-G/P: owner-only RLS nos 3 buckets sem policy
--
-- Descoberta determinística (pg_policy + storage.objects, vaga M-G/P):
--   storage.objects tem apenas as 4 policies documents_owner_* (restritas a
--   bucket_id='documents', criadas na M-G/I). Os buckets:
--     marketplace-evidence   (privado, 15MB)
--     project-photos         (publico, 50MB)
--     reputation-attachments(privado, 15MB)
--   têm ZERO policies, logo RLS deny-all para authenticated:
--   INSERT/SELECT/UPDATE/DELETE falham (provado empiricamente: insert como
--   authenticated+claim devolve 0 rows persistidas). Qualquer fluxo de upload
--   destes buckets está partido (classe de bug idêntica à M-G/L).
--
-- Fix (mesmo padrão canónico já provado em documents): 4 owner-only policies
--   por bucket, `owner_id = auth.uid()::text` (o storage grava owner_id do
--   token) — o dono gere, ninguém mais vê/escreve. Idempotente: drop if exists
--   antes de cada create (requerido quando reexecutado em DEV).

-- ============ marketplace-evidence ============
drop policy if exists marketplace_evidence_owner_select on storage.objects;
create policy marketplace_evidence_owner_select on storage.objects
  for select to authenticated
  using ( bucket_id = 'marketplace-evidence' and owner_id = auth.uid()::text );

drop policy if exists marketplace_evidence_owner_insert on storage.objects;
create policy marketplace_evidence_owner_insert on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'marketplace-evidence' and owner_id = auth.uid()::text );

drop policy if exists marketplace_evidence_owner_update on storage.objects;
create policy marketplace_evidence_owner_update on storage.objects
  for update to authenticated
  using ( bucket_id = 'marketplace-evidence' and owner_id = auth.uid()::text )
  with check ( bucket_id = 'marketplace-evidence' and owner_id = auth.uid()::text );

drop policy if exists marketplace_evidence_owner_delete on storage.objects;
create policy marketplace_evidence_owner_delete on storage.objects
  for delete to authenticated
  using ( bucket_id = 'marketplace-evidence' and owner_id = auth.uid()::text );

-- ============ project-photos ============
drop policy if exists project_photos_owner_select on storage.objects;
create policy project_photos_owner_select on storage.objects
  for select to authenticated
  using ( bucket_id = 'project-photos' and owner_id = auth.uid()::text );

drop policy if exists project_photos_owner_insert on storage.objects;
create policy project_photos_owner_insert on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'project-photos' and owner_id = auth.uid()::text );

drop policy if exists project_photos_owner_update on storage.objects;
create policy project_photos_owner_update on storage.objects
  for update to authenticated
  using ( bucket_id = 'project-photos' and owner_id = auth.uid()::text )
  with check ( bucket_id = 'project-photos' and owner_id = auth.uid()::text );

drop policy if exists project_photos_owner_delete on storage.objects;
create policy project_photos_owner_delete on storage.objects
  for delete to authenticated
  using ( bucket_id = 'project-photos' and owner_id = auth.uid()::text );

-- ============ reputation-attachments ============
drop policy if exists reputation_attachments_owner_select on storage.objects;
create policy reputation_attachments_owner_select on storage.objects
  for select to authenticated
  using ( bucket_id = 'reputation-attachments' and owner_id = auth.uid()::text );

drop policy if exists reputation_attachments_owner_insert on storage.objects;
create policy reputation_attachments_owner_insert on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'reputation-attachments' and owner_id = auth.uid()::text );

drop policy if exists reputation_attachments_owner_update on storage.objects;
create policy reputation_attachments_owner_update on storage.objects
  for update to authenticated
  using ( bucket_id = 'reputation-attachments' and owner_id = auth.uid()::text )
  with check ( bucket_id = 'reputation-attachments' and owner_id = auth.uid()::text );

drop policy if exists reputation_attachments_owner_delete on storage.objects;
create policy reputation_attachments_owner_delete on storage.objects
  for delete to authenticated
  using ( bucket_id = 'reputation-attachments' and owner_id = auth.uid()::text );