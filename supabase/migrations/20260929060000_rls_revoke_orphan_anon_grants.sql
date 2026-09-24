-- RPG-OS — Vaga M-G/S: revogar grants anon órfãos (grant sem policy de leitura anon)
--
-- Auditoria determinística: 97 tabelas public têm grant SELECT a anon (herdado
-- do gene default ACL, já cortado na M-G/R). Dessas, SÓ 2 têm RLS a permitir
-- leitura anon de facto:
--   - categories         (categories_read_active)        [catálogo público]
--   - provider_offerings (offerings_public_read_active)  [catálogo público]
-- As outras 95 têm policies com roles explícitos (authenticated/service_role)
-- e NENHUMA policy aplicável a anon (nem anon, nem PUBLIC) → a RLS nega sempre
-- a leitura anon. O grant SELECT a anon é, portanto, pólvora defensiva:
-- aparenta acesso que a RLS recusa, e o RLS não cobre TRUNCATE/REFERENCES/
-- TRIGGER (vetor M-G/O).
--
-- Ação: REVOKE ALL ... FROM anon nas 95 tabelas (geradas do catálogo via
-- pg_class+has_table_privilege, zero suposição). authenticated (leitura
-- legítima via RLS) e service_role (runtime) intactos. Idempotente.
--
-- Não-regressivo: para anon estas tabelas já devolviam 0 rows (RLS); revogar
-- não altera nenhum resultado visível, só remove a superfície de privilégio.

revoke all on table public.action_plans from anon;
revoke all on table public.addresses from anon;
revoke all on table public.at_connections from anon;
revoke all on table public.audit_logs from anon;
revoke all on table public.bank_accounts from anon;
revoke all on table public.bank_transactions from anon;
revoke all on table public.calendar_events from anon;
revoke all on table public.comms_channel_members from anon;
revoke all on table public.comms_channels from anon;
revoke all on table public.comms_messages from anon;
revoke all on table public.company_employees from anon;
revoke all on table public.company_organizations from anon;
revoke all on table public.contacts from anon;
revoke all on table public.contract_milestones from anon;
revoke all on table public.contracts from anon;
revoke all on table public.custom_roles from anon;
revoke all on table public.departments from anon;
revoke all on table public.diary_entries from anon;
revoke all on table public.document_verifications from anon;
revoke all on table public.documents from anon;
revoke all on table public.evidence from anon;
revoke all on table public.expenses from anon;
revoke all on table public.finance_bills from anon;
revoke all on table public.finance_debts from anon;
revoke all on table public.finance_expenses from anon;
revoke all on table public.finance_incomes from anon;
revoke all on table public.fiscal_inbox_items from anon;
revoke all on table public.fiscal_obligations from anon;
revoke all on table public.fiscal_submissions from anon;
revoke all on table public.government_connections from anon;
revoke all on table public.government_consents from anon;
revoke all on table public.health_appointments from anon;
revoke all on table public.health_audit_logs from anon;
revoke all on table public.health_connections from anon;
revoke all on table public.health_consents from anon;
revoke all on table public.health_documents from anon;
revoke all on table public.health_exams from anon;
revoke all on table public.health_notifications from anon;
revoke all on table public.health_prescriptions from anon;
revoke all on table public.health_profiles from anon;
revoke all on table public.health_vaccinations from anon;
revoke all on table public.integrity_ledger from anon;
revoke all on table public.invoice_routing_assignments from anon;
revoke all on table public.invoices from anon;
revoke all on table public.knowledge_articles from anon;
revoke all on table public.marketing_actions from anon;
revoke all on table public.marketing_campaigns from anon;
revoke all on table public.marketing_config from anon;
revoke all on table public.marketing_leads from anon;
revoke all on table public.marketplace_milestone_payments from anon;
revoke all on table public.notifications from anon;
revoke all on table public.org_memberships from anon;
revoke all on table public.organization_delegations from anon;
revoke all on table public.organization_invitations from anon;
revoke all on table public.organization_subscriptions from anon;
revoke all on table public.organizations from anon;
revoke all on table public.payment_events from anon;
revoke all on table public.payment_payouts from anon;
revoke all on table public.payment_transactions from anon;
revoke all on table public.permissions from anon;
revoke all on table public.personal_deductions from anon;
revoke all on table public.personal_irs_preparation from anon;
revoke all on table public.personal_reminders from anon;
revoke all on table public.platform_fee_config from anon;
revoke all on table public.platform_fees from anon;
revoke all on table public.profiles from anon;
revoke all on table public.project_members from anon;
revoke all on table public.projects from anon;
revoke all on table public.quotes from anon;
revoke all on table public.registered_devices from anon;
revoke all on table public.registrations from anon;
revoke all on table public.revenue_ledger_entries from anon;
revoke all on table public.revenue_refunds from anon;
revoke all on table public.rgpd_consents from anon;
revoke all on table public.role_permissions from anon;
revoke all on table public.roles from anon;
revoke all on table public.saas_subscriptions from anon;
revoke all on table public.service_quote_items from anon;
revoke all on table public.service_quotes from anon;
revoke all on table public.service_requests from anon;
revoke all on table public.task_activity from anon;
revoke all on table public.task_comments from anon;
revoke all on table public.tasks from anon;
revoke all on table public.team_members from anon;
revoke all on table public.teams from anon;
revoke all on table public.transport_document_items from anon;
revoke all on table public.transport_documents from anon;
revoke all on table public.user_memories from anon;
revoke all on table public.user_roles from anon;
revoke all on table public.users from anon;
revoke all on table public.warranties from anon;
revoke all on table public.workflow_definitions from anon;
revoke all on table public.workflow_instances from anon;
revoke all on table public.workflow_steps from anon;
revoke all on table public.workflow_transitions from anon;

-- catálogos públicos (categories, provider_offerings) mantêm o grant anon intencional.