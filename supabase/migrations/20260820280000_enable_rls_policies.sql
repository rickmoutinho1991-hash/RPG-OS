-- RPG-OS: Políticas de Segurança em Nível de Linha (Row Level Security - RLS)
-- Migração 20260820280000

-- Ativar RLS nas tabelas principais
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_document_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registered_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. Políticas para USERS e PROFILES
CREATE POLICY "Users can read own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can read/update own profile" ON public.profiles
    FOR ALL USING (auth.uid() = user_id);

-- 2. Políticas para CALENDAR_EVENTS e PERSONAL_REMINDERS (Isolamento pessoal estrito)
CREATE POLICY "Users can manage own calendar events" ON public.calendar_events
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own personal reminders" ON public.personal_reminders
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own diary entries" ON public.diary_entries
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own devices" ON public.registered_devices
    FOR ALL USING (auth.uid() = user_id);

-- 3. Políticas para PROJETOS, ORÇAMENTOS, FATURAS E DOCUMENTOS FISCAIS (Isolamento por utilizador e por empresa)
CREATE POLICY "Users can manage own quotes" ON public.quotes
    FOR ALL USING (
        auth.uid() = client_id
        OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = quotes.company_id)
    );

CREATE POLICY "Users can manage own invoices" ON public.invoices
    FOR ALL USING (
        auth.uid() = client_id
        OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = invoices.company_id)
    );

CREATE POLICY "Users can manage own projects" ON public.projects
    FOR ALL USING (
        auth.uid() = client_id
        OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = projects.company_id)
    );

CREATE POLICY "Users can manage own transport docs" ON public.transport_documents
    FOR ALL USING (
        auth.uid() = client_id
        OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = transport_documents.company_id)
    );

CREATE POLICY "Users can manage own documents" ON public.documents
    FOR ALL USING (
        auth.uid() = owner_user_id
        OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = documents.company_id)
    );

-- 4. Políticas para BANCA, DESPESAS E OBRIGAÇÕES FISCAIS
CREATE POLICY "Users can manage own bank accounts" ON public.bank_accounts
    FOR ALL USING (
        auth.uid() = user_id
        OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = bank_accounts.company_id)
    );

CREATE POLICY "Users can manage own bank transactions" ON public.bank_transactions
    FOR ALL USING (
        auth.uid() = user_id
        OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = bank_transactions.company_id)
    );

CREATE POLICY "Users can manage own expenses" ON public.expenses
    FOR ALL USING (
        auth.uid() = user_id
        OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = expenses.company_id)
    );

CREATE POLICY "Users can view own subscriptions" ON public.saas_subscriptions
    FOR SELECT USING (
        auth.uid() = user_id
        OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = saas_subscriptions.company_id)
    );

CREATE POLICY "Users can view own audit logs" ON public.audit_logs
    FOR SELECT USING (
        auth.uid() = user_id
        OR auth.uid() IN (SELECT user_id FROM profiles WHERE company_id = audit_logs.company_id)
    );
