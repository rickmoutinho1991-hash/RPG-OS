-- RPG-OS — Endurecimento RLS owner-only: notifications (M-G/H).
-- Corre a fuga `notif_all` (política sem quals = qualquer autenticado lia/escrevia
-- notificações de todos). Como o app só lê/escreve `notifications` via cliente
-- admin (bypass RLS), fechar owner-only não quebra nada e tranca o leak.

drop policy if exists notif_all on notifications;

drop policy if exists notifications_owner_select on notifications;
create policy notifications_owner_select on notifications
  for select
  using (user_id = auth.uid());

drop policy if exists notifications_owner_insert on notifications;
create policy notifications_owner_insert on notifications
  for insert
  with check (user_id = auth.uid());

drop policy if exists notifications_owner_update on notifications;
create policy notifications_owner_update on notifications
  for update
  using (user_id = auth.uid());

drop policy if exists notifications_owner_delete on notifications;
create policy notifications_owner_delete on notifications
  for delete
  using (user_id = auth.uid());
