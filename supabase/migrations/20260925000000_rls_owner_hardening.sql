-- RPG-OS: Endurecimento RLS — acesso de dono para tabelas pessoais (M-G)
-- Fecham-se detalhes de débito/contactos a estranhos: cada utilizador só vê o
-- seu. O servidor (admin) continua a aceder sem restrições; tabelas de serviço
-- (integrity/audit/sync) mantêm-se trancadas por design.

-- Contacts: dono = user_id
drop policy if exists "contacts_owner_select" on contacts;
create policy "contacts_owner_select" on contacts for select
  using (user_id = auth.uid());

drop policy if exists "contacts_owner_insert" on contacts;
create policy "contacts_owner_insert" on contacts for insert
  with check (user_id = auth.uid());

drop policy if exists "contacts_owner_update" on contacts;
create policy "contacts_owner_update" on contacts for update
  using (user_id = auth.uid());

drop policy if exists "contacts_owner_delete" on contacts;
create policy "contacts_owner_delete" on contacts for delete
  using (user_id = auth.uid());

-- Obrigações fiscais pessoais: dono = user_id
drop policy if exists "fiscal_obligations_owner_select" on fiscal_obligations;
create policy "fiscal_obligations_owner_select" on fiscal_obligations for select
  using (user_id = auth.uid());

drop policy if exists "fiscal_obligations_owner_insert" on fiscal_obligations;
create policy "fiscal_obligations_owner_insert" on fiscal_obligations for insert
  with check (user_id = auth.uid());

drop policy if exists "fiscal_obligations_owner_update" on fiscal_obligations;
create policy "fiscal_obligations_owner_update" on fiscal_obligations for update
  using (user_id = auth.uid());

drop policy if exists "fiscal_obligations_owner_delete" on fiscal_obligations;
create policy "fiscal_obligations_owner_delete" on fiscal_obligations for delete
  using (user_id = auth.uid());