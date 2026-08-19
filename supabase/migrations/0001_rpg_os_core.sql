CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ENUMS

CREATE TYPE registration_type AS ENUM (
    'CUSTOMER',
    'SOLE_TRADER',
    'COMPANY'
);

CREATE TYPE registration_status AS ENUM (
    'DRAFT',
    'PENDING_DOCUMENTS',
    'PENDING_VERIFICATION',
    'VERIFIED',
    'REJECTED',
    'SUSPENDED',
    'CANCELLED'
);

CREATE TYPE document_status AS ENUM (
    'PENDING',
    'VERIFIED',
    'REJECTED',
    'EXPIRED'
);

CREATE TYPE document_type AS ENUM (
    'IDENTITY_CARD',
    'PASSPORT',
    'RESIDENCE_PERMIT',
    'TAX_DOCUMENT',
    'ADDRESS_PROOF',
    'COMPANY_REGISTRATION',
    'COMPANY_TAX_DOCUMENT',
    'COMPANY_BANK_DOCUMENT',
    'INSURANCE',
    'LICENSE',
    'CERTIFICATE',
    'POWER_OF_ATTORNEY',
    'OTHER'
);

CREATE TYPE contact_type AS ENUM (
    'CUSTOMER',
    'SOLE_TRADER',
    'COMPANY'
);

CREATE TYPE document_verification_status AS ENUM (
    'PENDING',
    'VERIFIED',
    'REJECTED'
);

-- ADDRESSES

CREATE TABLE addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    street TEXT NOT NULL,
    number TEXT NOT NULL,
    complement TEXT,
    postal_code TEXT NOT NULL,
    city TEXT NOT NULL,
    district TEXT NOT NULL,
    country TEXT NOT NULL,
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- COMPANIES

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name TEXT NOT NULL,
    commercial_name TEXT,
    tax_number TEXT NOT NULL UNIQUE,
    country TEXT NOT NULL,
    legal_form TEXT NOT NULL,
    registration_number TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    website TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- USERS

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- PROFILES

CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    address_id UUID,
    company_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (address_id) REFERENCES addresses(id),
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- CONTACTS

CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company_id UUID,
    type contact_type NOT NULL,
    value TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- REGISTRATIONS

CREATE TABLE registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company_id UUID,
    type registration_type NOT NULL,
    status registration_status NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    terms_accepted_at TIMESTAMPTZ,
    privacy_accepted_at TIMESTAMPTZ,

    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- DOCUMENTS

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL,
    company_id UUID,
    type document_type NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    issued_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status document_status NOT NULL DEFAULT 'PENDING',

    FOREIGN KEY (owner_user_id) REFERENCES users(id),
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- DOCUMENT VERIFICATIONS

CREATE TABLE document_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL,
    status document_verification_status NOT NULL DEFAULT 'PENDING',
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    rejection_reason TEXT,
    notes JSONB,

    FOREIGN KEY (document_id) REFERENCES documents(id),
    FOREIGN KEY (verified_by) REFERENCES users(id)
);

-- ROLES

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- PERMISSIONS

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (module, action)
);

-- ROLE PERMISSIONS

CREATE TABLE role_permissions (
    role_id UUID NOT NULL,
    permission_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (role_id, permission_id),

    FOREIGN KEY (role_id) REFERENCES roles(id),
    FOREIGN KEY (permission_id) REFERENCES permissions(id)
);

-- USER ROLES

CREATE TABLE user_roles (
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, role_id),

    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- AUDIT LOGS

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company_id UUID,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip TEXT,
    device TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- INDEXES

CREATE INDEX idx_profiles_user_id
    ON profiles(user_id);

CREATE INDEX idx_profiles_company_id
    ON profiles(company_id);

CREATE INDEX idx_profiles_address_id
    ON profiles(address_id);

CREATE INDEX idx_contacts_user_id
    ON contacts(user_id);

CREATE INDEX idx_contacts_company_id
    ON contacts(company_id);

CREATE INDEX idx_registrations_user_id
    ON registrations(user_id);

CREATE INDEX idx_registrations_company_id
    ON registrations(company_id);

CREATE INDEX idx_registrations_status
    ON registrations(status);

CREATE INDEX idx_documents_owner_user_id
    ON documents(owner_user_id);

CREATE INDEX idx_documents_company_id
    ON documents(company_id);

CREATE INDEX idx_documents_status
    ON documents(status);

CREATE INDEX idx_document_verifications_document_id
    ON document_verifications(document_id);

CREATE INDEX idx_document_verifications_verified_by
    ON document_verifications(verified_by);

CREATE INDEX idx_user_roles_user_id
    ON user_roles(user_id);

CREATE INDEX idx_user_roles_role_id
    ON user_roles(role_id);

CREATE INDEX idx_role_permissions_role_id
    ON role_permissions(role_id);

CREATE INDEX idx_role_permissions_permission_id
    ON role_permissions(permission_id);

CREATE INDEX idx_audit_logs_user_id
    ON audit_logs(user_id);

CREATE INDEX idx_audit_logs_company_id
    ON audit_logs(company_id);

CREATE INDEX idx_audit_logs_entity
    ON audit_logs(entity_type, entity_id);