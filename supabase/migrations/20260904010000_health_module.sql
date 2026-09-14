-- RPG-OS: Health Module Database Schema
-- Phase: A Minha Saúde / SNS 24 Integration
-- This migration adds health-specific tables with proper RLS

-- 1. ENUMS FOR HEALTH MODULE
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'health_provider_status') THEN
        CREATE TYPE health_provider_status AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR', 'EXPIRED', 'REVOKED', 'PREPARED_ONLY');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'health_provider_type') THEN
        CREATE TYPE health_provider_type AS ENUM ('FAKE', 'SANDBOX', 'LIVE', 'PREPARED_ONLY');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'health_provider_id') THEN
        CREATE TYPE health_provider_id AS ENUM ('SNS24', 'SPMS', 'SNS');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'health_consent_scope') THEN
        CREATE TYPE health_consent_scope AS ENUM (
            'health.read.profile',
            'health.read.prescriptions',
            'health.read.medications',
            'health.read.vaccinations',
            'health.read.appointments',
            'health.read.exams',
            'health.read.documents',
            'health.read.notifications'
        );
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prescription_status') THEN
        CREATE TYPE prescription_status AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'SUSPENDED', 'COMPLETED');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
        CREATE TYPE appointment_status AS ENUM ('SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exam_status') THEN
        CREATE TYPE exam_status AS ENUM ('REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESULTS_AVAILABLE');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vaccination_status') THEN
        CREATE TYPE vaccination_status AS ENUM ('ADMINISTERED', 'SCHEDULED', 'CANCELLED', 'EXPIRED');
    END IF;
END $$;

-- 2. HEALTH CONNECTIONS - Ligações a serviços de saúde por pessoa/organização
CREATE TABLE IF NOT EXISTS health_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id health_provider_id NOT NULL,
    environment VARCHAR(20) NOT NULL DEFAULT 'development',
    scopes health_consent_scope[] NOT NULL DEFAULT '{}',
    status health_provider_status NOT NULL DEFAULT 'DISCONNECTED',
    connected_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    external_account_reference TEXT,
    provider_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT health_connections_person_org_check CHECK (
        (person_id IS NOT NULL AND organization_id IS NULL) OR
        (person_id IS NOT NULL AND organization_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_health_connections_person ON health_connections(person_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_health_connections_org ON health_connections(organization_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_health_connections_status ON health_connections(status, created_at DESC);

-- 3. HEALTH CONSENTS - Consentimentos explícitos para acesso a dados de saúde
CREATE TABLE IF NOT EXISTS health_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id health_provider_id NOT NULL,
    scopes health_consent_scope[] NOT NULL DEFAULT '{}',
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    source VARCHAR(20) NOT NULL DEFAULT 'PERSON',
    audit_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_consents_person ON health_consents(person_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_health_consents_org ON health_consents(organization_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_health_consents_expires ON health_consents(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_health_consents_revoked ON health_consents(revoked_at) WHERE revoked_at IS NOT NULL;

-- 4. HEALTH PROFILES - Perfil de saúde da pessoa (cache local)
CREATE TABLE IF NOT EXISTS health_profiles (
    person_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    utente_number VARCHAR(20),
    full_name VARCHAR(255) NOT NULL,
    birth_date DATE,
    gender VARCHAR(1),
    nationality VARCHAR(100),
    address TEXT,
    postal_code VARCHAR(8),
    locality VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(255),
    health_subsystem VARCHAR(50),
    doctor_id VARCHAR(50),
    healthcare_unit VARCHAR(255),
    last_synced_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. PRESCRIPTIONS - Receitas médicas
CREATE TABLE IF NOT EXISTS health_prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    prescription_number VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    medication_id UUID,
    medication_name VARCHAR(255) NOT NULL,
    medication_strength VARCHAR(100),
    medication_form VARCHAR(100),
    dosage TEXT NOT NULL,
    instructions TEXT,
    prescribed_date DATE NOT NULL,
    valid_from DATE NOT NULL,
    valid_until DATE NOT NULL,
    prescribed_by JSONB,
    dispensing_info JSONB,
    renewal_info JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_prescriptions_person ON health_prescriptions(person_id, status);
CREATE INDEX IF NOT EXISTS idx_health_prescriptions_org ON health_prescriptions(organization_id, status);

-- 6. VACCINATIONS - Registo de vacinação
CREATE TABLE IF NOT EXISTS health_vaccinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    vaccine_name VARCHAR(255) NOT NULL,
    target_diseases TEXT[] NOT NULL,
    dose_number INTEGER NOT NULL,
    administration_date DATE NOT NULL,
    administration_location JSONB,
    batch_number VARCHAR(100),
    manufacturer VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'ADMINISTERED',
    administered_by JSONB,
    next_dose_date DATE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_vaccinations_person ON health_vaccinations(person_id, administration_date DESC);

-- 7. APPOINTMENTS - Consultas e agendamentos
CREATE TABLE IF NOT EXISTS health_appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    appointment_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    scheduled_at TIMESTAMPTZ NOT NULL,
    confirmed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    healthcare_unit JSONB NOT NULL,
    professional JSONB,
    appointment_type_detail VARCHAR(255),
    notes TEXT,
    cancellation_reason TEXT,
    reminder_sent BOOLEAN DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_appointments_person ON health_appointments(person_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_appointments_org ON health_appointments(organization_id, status);

-- 8. EXAMS - Exames e resultados
CREATE TABLE IF NOT EXISTS health_exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    exam_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
    name VARCHAR(255) NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL,
    scheduled_at TIMESTAMPTZ,
    performed_at TIMESTAMPTZ,
    healthcare_unit JSONB NOT NULL,
    requested_by JSONB,
    performed_by JSONB,
    result_document_id UUID,
    result_summary TEXT,
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_exams_person ON health_exams(person_id, status, requested_at DESC);

-- 9. HEALTH DOCUMENTS - Documentos de saúde
CREATE TABLE IF NOT EXISTS health_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    file_url TEXT,
    file_size BIGINT,
    mime_type VARCHAR(100),
    issued_at TIMESTAMPTZ NOT NULL,
    issued_by JSONB,
    healthcare_unit JSONB,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_documents_person ON health_documents(person_id, issued_at DESC);

-- 10. HEALTH NOTIFICATIONS
CREATE TABLE IF NOT EXISTS health_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    action_url TEXT,
    related_entity_id UUID,
    related_entity_type VARCHAR(50),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_notifications_person ON health_notifications(person_id, read, created_at DESC);

-- 11. HEALTH AUDIT LOGS
CREATE TABLE IF NOT EXISTS health_audit_logs (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(100) NOT NULL,
    provider_id VARCHAR(50) NOT NULL,
    person_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    source VARCHAR(20) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    success BOOLEAN NOT NULL,
    error TEXT,
    correlation_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_audit_person ON health_audit_logs(person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_audit_provider ON health_audit_logs(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_audit_org ON health_audit_logs(organization_id, created_at DESC);

-- 12. HEALTH AUDIT INTEGRITY (for tamper detection)
CREATE TABLE IF NOT EXISTS health_audit_integrity (
    event_id UUID PRIMARY KEY REFERENCES health_audit_logs(event_id) ON DELETE CASCADE,
    integrity_hash VARCHAR(64) NOT NULL,
    previous_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 13. HEALTH SYNC HISTORY
CREATE TABLE IF NOT EXISTS health_sync_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id VARCHAR(50) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL,
    synced_entities JSONB NOT NULL DEFAULT '{}'::jsonb,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_sync_person ON health_sync_history(person_id, started_at DESC);

-- 14. RLS POLICIES
-- Health Connections
ALTER TABLE health_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_connections_read_person" ON health_connections
FOR SELECT USING (
    person_id IN (
        SELECT om.user_id 
        FROM org_memberships om 
        WHERE om.user_id = auth.uid() 
        AND om.status = 'ACTIVE'
    )
    OR person_id = auth.uid()
);

CREATE POLICY "health_connections_write_service" ON health_connections
FOR ALL USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Health Consents
ALTER TABLE health_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_consents_read_person" ON health_consents
FOR SELECT USING (
    person_id IN (
        SELECT om.user_id 
        FROM org_memberships om 
        WHERE om.user_id = auth.uid() 
        AND om.status = 'ACTIVE'
    )
    OR person_id = auth.uid()
);

CREATE POLICY "health_consents_write_service" ON health_consents
FOR ALL USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Health Profiles
ALTER TABLE health_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_profiles_read_own" ON health_profiles
FOR SELECT USING (person_id = auth.uid());

CREATE POLICY "health_profiles_write_service" ON health_profiles
FOR ALL USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Health Prescriptions
ALTER TABLE health_prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_prescriptions_read_person" ON health_prescriptions
FOR SELECT USING (
    person_id IN (
        SELECT om.user_id 
        FROM org_memberships om 
        WHERE om.user_id = auth.uid() 
        AND om.status = 'ACTIVE'
    )
    OR person_id = auth.uid()
);

CREATE POLICY "health_prescriptions_write_service" ON health_prescriptions
FOR ALL USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Health Vaccinations
ALTER TABLE health_vaccinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_vaccinations_read_person" ON health_vaccinations
FOR SELECT USING (
    person_id IN (
        SELECT om.user_id 
        FROM org_memberships om 
        WHERE om.user_id = auth.uid() 
        AND om.status = 'ACTIVE'
    )
    OR person_id = auth.uid()
);

CREATE POLICY "health_vaccinations_write_service" ON health_vaccinations
FOR ALL USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Health Appointments
ALTER TABLE health_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_appointments_read_person" ON health_appointments
FOR SELECT USING (
    person_id IN (
        SELECT om.user_id 
        FROM org_memberships om 
        WHERE om.user_id = auth.uid() 
        AND om.status = 'ACTIVE'
    )
    OR person_id = auth.uid()
);

CREATE POLICY "health_appointments_write_service" ON health_appointments
FOR ALL USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Health Exams
ALTER TABLE health_exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_exams_read_person" ON health_exams
FOR SELECT USING (
    person_id IN (
        SELECT om.user_id 
        FROM org_memberships om 
        WHERE om.user_id = auth.uid() 
        AND om.status = 'ACTIVE'
    )
    OR person_id = auth.uid()
);

CREATE POLICY "health_exams_write_service" ON health_exams
FOR ALL USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Health Documents
ALTER TABLE health_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_documents_read_person" ON health_documents
FOR SELECT USING (
    person_id IN (
        SELECT om.user_id 
        FROM org_memberships om 
        WHERE om.user_id = auth.uid() 
        AND om.status = 'ACTIVE'
    )
    OR person_id = auth.uid()
);

CREATE POLICY "health_documents_write_service" ON health_documents
FOR ALL USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Health Notifications
ALTER TABLE health_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_notifications_read_person" ON health_notifications
FOR SELECT USING (person_id = auth.uid());

CREATE POLICY "health_notifications_write_service" ON health_notifications
FOR ALL USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Health Audit Logs
ALTER TABLE health_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_audit_read_person" ON health_audit_logs
FOR SELECT USING (
    person_id IN (
        SELECT om.user_id 
        FROM org_memberships om 
        WHERE om.user_id = auth.uid() 
        AND om.status = 'ACTIVE'
    )
    OR person_id = auth.uid()
);

CREATE POLICY "health_audit_write_service" ON health_audit_logs
FOR ALL USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 15. GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE 
    health_connections,
    health_consents,
    health_profiles,
    health_prescriptions,
    health_vaccinations,
    health_appointments,
    health_exams,
    health_documents,
    health_notifications,
    health_audit_logs,
    health_audit_integrity,
    health_sync_history
TO service_role;

GRANT SELECT ON TABLE 
    health_connections,
    health_consents,
    health_profiles,
    health_prescriptions,
    health_vaccinations,
    health_appointments,
    health_exams,
    health_documents,
    health_notifications,
    health_audit_logs
TO authenticated;

-- 16. COMMENTS
COMMENT ON TABLE health_connections IS 'Ligações a serviços de saúde (SNS24, SPMS) por pessoa/organização';
COMMENT ON TABLE health_consents IS 'Consentimentos explícitos para acesso a dados de saúde';
COMMENT ON TABLE health_profiles IS 'Perfil de saúde da pessoa (cache local)';
COMMENT ON TABLE health_prescriptions IS 'Receitas médicas';
COMMENT ON TABLE health_vaccinations IS 'Registo de vacinação';
COMMENT ON TABLE health_appointments IS 'Consultas e agendamentos de saúde';
COMMENT ON TABLE health_exams IS 'Exames e resultados';
COMMENT ON TABLE health_documents IS 'Documentos de saúde';
COMMENT ON TABLE health_notifications IS 'Notificações de saúde';
COMMENT ON TABLE health_audit_logs IS 'Auditoria de operações de saúde';
COMMENT ON TABLE health_audit_integrity IS 'Integridade dos logs de auditoria (hash encadeado)';
COMMENT ON TABLE health_sync_history IS 'Histórico de sincronização de dados de saúde';
COMMENT ON TABLE health_profiles IS 'Perfil de saúde da pessoa';
COMMENT ON TABLE health_prescriptions IS 'Receitas médicas da pessoa';
COMMENT ON TABLE health_vaccinations IS 'Histórico de vacinação';
COMMENT ON TABLE health_appointments IS 'Agendamentos de consultas e exames';
COMMENT ON TABLE health_exams IS 'Exames complementares e resultados';
COMMENT ON TABLE health_documents IS 'Documentos de saúde (receitas, relatórios, certificados)';
COMMENT ON TABLE health_notifications IS 'Notificações de saúde (lembretes, resultados, avisos)';
COMMENT ON TABLE health_audit_logs IS 'Logs de auditoria para operações de saúde (sem dados sensíveis)';
COMMENT ON TABLE health_audit_integrity IS 'Cadeia de integridade para auditoria de saúde';