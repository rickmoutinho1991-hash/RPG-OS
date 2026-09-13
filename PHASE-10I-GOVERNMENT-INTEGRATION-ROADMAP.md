# RPG-OS — Phase 10I: Government Integration Roadmap

## Overview

This document outlines the architecture for future official integrations with Portuguese government services. It clearly distinguishes between what is **AVAILABLE NOW** (local/dev/sandbox infrastructure) and what requires **FUTURE OFFICIAL INTEGRATIONS** (real credentials, certified environments, official APIs).

---

## AVAILABLE NOW (Phase 10I Complete)

### 1. Local Fiscal Engine
- **Fiscal Document Lifecycle** (`FiscalDocumentStatus`, `validateFiscalTransition`)
  - States: `draft`, `issued`, `validated`, `submitted`, `accepted`, `rejected`, `cancelled`, `void`, `reconciled`
  - Server-side validated transitions (70 test cases)
- **Document Numbering / Series** (`FiscalSeries`, `allocateDocumentNumber`)
  - Organization-scoped, deterministic numbering
  - No duplicates within org/type/series/year
  - Tenant isolation enforced
- **Portuguese Fiscal Identifiers** (`validateFiscalIdentifier`, `classifyPortugueseNif`)
  - NIF/NIPC validation with Module 11 checksum
  - Individual vs Company vs Public Entity classification
  - EU VAT numbers (PT, ES, FR, DE, IT, NL, BE, AT, PL, IE, etc.)
  - Non-EU tax IDs (US EIN, BR CNPJ, UK UTR, CA BN)
  - Clear distinction: NIF ≠ NIPC ≠ VAT ≠ CAE ≠ IBAN
- **VAT/IVA Engine** (`calculateVat`, `VatLineItem`, `VatRegion`)
  - Rates: 23%, 13%, 6%, 0% (Continente); 16%, 9%, 4%, 0% (Açores); 22%, 12%, 5%, 0% (Madeira)
  - Integer cents only — no floats
  - Exemption reasons, reverse charge, intra-community
  - `gross = net + VAT` invariant verified
- **Portuguese Invoice Data Model** (`Invoice`, `InvoiceCustomer`, `InvoiceSupplier`)
  - FT, FS, FR, NC, ND document types
  - Supplier/Customer with NIF, address, postal code, city, country, VAT region
  - Default currency: EUR
  - Payment terms, VAT breakdown, line items
- **SAF-T PT Foundation** (`SaftPtExporter`, `FiscalExportProvider`)
  - Domain mapping from RPG-OS invoices to SAF-T structure
  - Deterministic serialization
  - Validation (gross = net + VAT, breakdown matches totals)
  - **NOT officially certified** — foundation only
- **E-Fatura / AT Adapter Architecture** (`PortugueseTaxAuthorityProvider`, `FakePortugueseTaxAuthorityProvider`)
  - Interface: `validateDocument`, `submitDocument`, `getDocumentStatus`, `cancelDocument`, `queryDocuments`
  - Fake provider simulates: `ACCEPTED`, `REJECTED`, `PENDING`, `ERROR`
  - Configuration via `PORTUGAL_TAX_PROVIDER=fake` (env)
  - **No real credentials stored** — fake only
- **E-Fatura Reconciliation** (`FiscalReconciliationService`)
  - Statuses: `LOCAL_DOCUMENT`, `EXTERNAL_DOCUMENT`, `MATCHED`, `MISMATCH`, `MISSING_EXTERNAL`, `MISSING_LOCAL`, `PENDING`
  - Compares: NIF/NIPC, document type, series, number, issue date, total, VAT, customer/supplier
  - Deterministic results, no destructive auto-correction
  - Mismatches visible and auditable
- **Fiscal Audit Events** (`FiscalAuditEvents`, `InMemoryFiscalAuditLogger`)
  - Events: `FISCAL_DOCUMENT_CREATED`, `FISCAL_DOCUMENT_ISSUED`, `FISCAL_DOCUMENT_SUBMITTED`, `FISCAL_DOCUMENT_ACCEPTED`, `FISCAL_DOCUMENT_REJECTED`, `FISCAL_DOCUMENT_RECONCILED`, `FISCAL_DOCUMENT_MISMATCH`, `FISCAL_EXPORT_CREATED`, `TAX_AUTHORITY_VALIDATION`, `IDEMPOTENCY_KEY_GENERATED`
  - Sources: `USER`, `SYSTEM`, `AUTOMATION`, `GOVERNMENT_PROVIDER`
  - Sanitization: never logs secrets, tokens, credentials, full NIFs
- **Idempotency Keys** (`generateIdempotencyKey`)
  - Deterministic: `organizationId|documentId|operation|attempt`
  - Prevents duplicate submissions
- **Tenant Isolation** (Organization-scoped)
  - All queries/services enforce `organizationId`
  - FiscalSeries, Invoices, Reconciliation, Audit — all org-scoped
  - Tested: Tenant A cannot read Tenant B documents
- **Security Review**
  - No client-side trust
  - No secret exposure (sanitization in audit logger)
  - No negative money, invalid VAT, invalid NIF, invalid transitions
  - Race condition protection via deterministic idempotency

---

## FUTURE OFFICIAL INTEGRATIONS (Not Implemented)

### 1. Autoridade Tributária / e-Fatura
- **Requirements**: Official software certificate, AT credentials, certified SAF-T generator
- **Integration Points**: 
  - `PortugueseTaxAuthorityProvider` implementation with real AT webservices
  - ATCUD generation (requires certified software)
  - QR code generation for FS (requires AT algorithm)
  - Hash chain validation (requires AT specification)
- **Environment**: `PORTUGAL_TAX_PROVIDER=official` + valid `AT_CREDENTIALS`

### 2. Portal das Finanças
- **Requirements**: OAuth2/Autenticação.Gov integration, user consent
- **Integration Points**: Tax obligation queries, payment references, declaration submissions

### 3. SAF-T PT Official Certification
- **Requirements**: Submission to AT for certification, XSD schema compliance
- **Current Gap**: Full XSD validation, digital signature, certificate integration, hash chain, periodic control totals

### 4. Segurança Social Direta
- **Requirements**: API credentials, company registration
- **Integration Points**: Contribution declarations, payment references

### 5. gov.pt / Autenticação.Gov / Chave Móvel Digital
- **Requirements**: OpenID Connect/OAuth2 integration, citizen card certificates
- **Integration Points**: User authentication, company representation, document signing

---

## Configuration for Future Official Integration

```env
# Current (Development)
PORTUGAL_TAX_PROVIDER=fake

# Future (Production - requires real credentials)
PORTUGAL_TAX_PROVIDER=official
AT_API_ENDPOINT=https://api.at.gov.pt
AT_CLIENT_ID=your_client_id
AT_CLIENT_SECRET=your_client_secret
AT_CERTIFICATE_PATH=/path/to/cert.p12
AT_CERTIFICATE_PASSWORD=cert_password
AT_SOFTWARE_CERTIFICATE=AT-certified-software-id
```

---

## Architecture Principles

1. **Portugal-First**: All fiscal logic designed for Portuguese legislation
2. **Integer Cents**: No floats, no NaN, no Infinity — financial invariants protected
3. **Provider Abstraction**: Swap fake ↔ official without code changes
3. **Tenant Isolation**: Organization-scoped at every layer
4. **Audit Everything**: Every fiscal action logged with source attribution
5. **No Secrets in Logs**: Automatic sanitization of credentials, NIFs masked
6. **Deterministic**: Idempotency keys, reconciliation, numbering — all deterministic
7. **No Auto-Correction**: Mismatches reported, never silently fixed
7. **Sandbox First**: All development/testing against fake provider

---

## Test Coverage (Phase 10I)

| Module | Tests | Coverage |
|--------|-------|----------|
| Fiscal Document Lifecycle | 70 | All valid/invalid transitions |
| Fiscal Series / Numbering | 34 | Allocation, validation, tenant isolation |
| Fiscal Identifiers (NIF/VAT) | 56 | Validation, classification, EU/non-EU |
| VAT/IVA Engine | 38 | Rates, regions, rounding, invariants |
| SAF-T PT Export | 20 | Mapping, validation, structure |
| Tax Authority Adapter | 35 | Fake provider, idempotency, queries |
| Reconciliation | 20 | Match/mismatch/missing, batch |
| Fiscal Audit | 31 | Events, sanitization, sources |
| **Total New Tests** | **304** | **All passing** |

---

## Recommended Phase 10J

1. **Official AT Integration**: Implement `PortugueseTaxAuthorityProvider` with real AT webservices
2. **SAF-T Certification**: Submit to AT for official certification
3. **Portal das Finanças OAuth**: Autenticação.Gov / Chave Móvel Digital integration
4. **Segurança Social API**: Contribution declarations
5. **Advanced UI**: `/fiscalidade` dashboard with real-time AT status
6. **Webhook System**: AT callback handling for async status updates
7. **Multi-company**: Consolidated SAF-T for groups
8. **Archive/Retention**: Legal document retention policies

---

## Disclaimer

**This software does not claim any official integration with Portuguese government services.** All integrations are sandbox/local/fake implementations designed for development and testing. Production use with real fiscal obligations requires official certification, valid credentials, and compliance with AT/ATCUD/SAF-T specifications.

**RPG-OS Phase 10I provides the domain model, validation, audit trail, and sandbox infrastructure required for future official integrations — not the integrations themselves.**