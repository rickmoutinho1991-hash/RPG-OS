# RPG-OS Mobility Domain Documentation

## Overview
The "A Minha Mobilidade" module provides vehicle and toll management capabilities for the RPG-OS platform. All integrations are classified as PREPARED_ONLY or MANUAL until official onboarding with authorized production access is obtained.

**Status**: MOBILITY CERTIFIED — PREPARED_ONLY

> **Important**: This module does NOT provide live integration with Via Verde or CTT/Portagens. All capabilities require official onboarding. The system is architected and ready for future official integration.

## Architecture

### Provider Pattern
Follows the RPG-OS integration pattern (based on Health module):
- `MobilityIntegrationProvider` interface — implemented by all providers
- `MobilityProviderRegistry` — registers, looks up, filters providers
- `MobilityService` — orchestrates provider calls with fail-closed behavior
- `MobilityProviderFactory` — creates providers with type validation

### Key Components
- `packages/core/src/types/mobility/index.ts` — Domain types
- `packages/core/src/services/mobility/MobilityService.ts` — Main service
- `packages/core/src/services/mobility/ViaVerdeProvider.ts` — Via Verde provider (PREPARED_ONLY)
- `packages/core/src/services/mobility/CTTPortagensProvider.ts` — CTT Portagens provider (PREPARED_ONLY)
- `packages/core/src/services/mobility/` — Fake providers (development/test only)
- `apps/web/app/mobilidade/` — UI pages
- `apps/web/app/api/mobilidade/` — API routes

## Types

### Provider Identification
- `ProviderId`: Unique identifier (e.g., "ViaVerde", "CTTPortagens")
- `ProviderType`: "PREPARED_ONLY", "FAKE", or future "LIVE"/"SANDBOX"
- `Environment`: "production" or "sandbox" (sandbox not available for current providers)
- `MobilityCapability`: Capability identifiers (see capability matrix below)
- `ConsentScope`: Permission scopes for consent-driven operations

### Core Types
See `packages/core/src/types/mobility/index.ts` for complete type definitions:
- `ProviderMetadata`: Provider configuration and status
- `MobilityResult<T>`: `{ success: true; data: T } | { success: false; error: MobilityError }`
- `MobilityError`: `{ code: MobilityErrorCode; message: string; providerId: MobilityProviderId; connectionId?: string; details?: Record<string, unknown> }`
- `MobilityErrorCode`: `"PROVIDER_UNAVAILABLE" | "INVALID_CREDENTIALS" | "EXPIRED_CREDENTIALS" | "INSUFFICIENT_SCOPES" | "CONNECTION_FAILED" | "SYNC_FAILED" | "VALIDATION_FAILED"`
- `Vehicle`, `TollTransaction`, `TollDebt`, `Payment`, `Invoice`, `Document`, `Notification`

## Providers

### Via Verde (ViaVerdeProvider)
- **Status**: PREPARED_ONLY
- **Country**: PT
- **Capabilities**: READ_PROFILE, READ_VEHICLES, READ_TOLL_TRANSACTIONS, READ_TOLL_DEBTS, READ_PAYMENTS, READ_INVOICES, READ_RECEIPTS, READ_DOCUMENTS, READ_NOTIFICATIONS, SYNC_VEHICLES, SYNC_TRANSACTIONS, SYNC_DEBTS, SYNC_PAYMENTS, SYNC_DOCUMENTS, GET_CONNECTION_STATUS
- **Auth Method**: NONE (no public API)
- **Sandbox**: Not available
- **Live**: Not available (requires official onboarding)
- **Documentation**: https://www.viaverde.pt
- **Classification**: All interactions are through the web portal (A Minha Via Verde) and mobile apps. No public REST API exists for programmatic access.

### CTT/Portagens (CTTPortagensProvider)
- **Status**: PREPARED_ONLY / MANUAL
- **Country**: PT
- **Modes**:
  - Pré-pago (TollCard): Balance-based payment, requires TollCard acquisition
  - Pós-Pagamento: Post-payment, linked to vehicle registration
- **Capabilities**: READ_PROFILE, READ_VEHICLES, READ_TOLL_TRANSACTIONS, READ_TOLL_DEBTS, READ_PAYMENTS, READ_INVOICES, READ_RECEIPTS, READ_DOCUMENTS, READ_NOTIFICATIONS, SYNC_VEHICLES, SYNC_TRANSACTIONS, SYNC_DEBTS, SYNC_PAYMENTS, SYNC_DOCUMENTS, GET_CONNECTION_STATUS
- **Auth Method**: NONE (no public REST API)
- **Sandbox**: Not available
- **Live**: Not available (requires official onboarding)
- **Classification**:
  - Pré-pago mode: Consultation requires manual workflow or official TollCard integration
  - Pós-Pagamento mode: Debt/invoice consultation requires manual process or authorized API

### Fake Providers (Development/Test Only)
- `FakeViaVerdeProvider`: Blocked in production via `ALLOW_FAKE_PROVIDERS=false`
- `FakeCTTPortagensProvider`: Blocked in production via `ALLOW_FAKE_PROVIDERS=false`
- All fake data is clearly marked with `source: "TEST"` and `provider: "ViaVerde"` / `provider: "CTTPortagens"`
- Never available in production without explicit `ALLOW_FAKE_PROVIDERS=true`

## Registry

### MobilityProviderRegistry
- **register(provider)**: Register a provider
- **unregister(providerId)**: Remove a provider
- **get(providerId)**: Get provider by ID
- **getAll()**: Get all registered providers
- **getByCapability(capability)**: Get providers supporting a capability
- **getByType(type)**: Get providers by type
- **clear()**: Clear all providers
- **checkProductionSafety(provider)**: Throws in production if provider type is "FAKE"

### Production Fail-Closed
- `ALLOW_FAKE_PROVIDERS=false` (default) — prevents fake providers in production
- `ALLOW_FAKE_PROVIDERS=true` — only for development/testing
- All real providers implement PREPARED_ONLY status
- No provider can claim LIVE/SANDBOX without authorized credentials

## Service Orchestration

### MobilityService
Main orchestration class that:
- Iterates registered providers for each operation
- Handles PREPARED_ONLY responses gracefully
- Throws/produces errors for unavailable capabilities
- Enforces production safety checks
- Supports consent-scoped operations

### Key Methods
- `getConnectionStatus(connectionId)`: Returns `MobilityConnectionStatus` with PREPARED_ONLY status
- `connect(config)`: Attempts connection, returns PREPARED_ONLY result
- `disconnect(connectionId)`: Returns PREPARED_ONLY result
- `getVehicles(connectionId)`: Returns PREPARED_ONLY with guidance message
- `getTollTransactions(connectionId)`: Returns PREPARED_ONLY with guidance message
- `getTollDebts(connectionId)`: Returns PREPARED_ONLY with guidance message
- `getPayments(connectionId)`: Returns PREPARED_ONLY with guidance message
- `getInvoices(connectionId)`: Returns PREPARED_ONLY with guidance message
- `getReceipts(connectionId)`: Returns PREPARED_ONLY with guidance message
- `getDocuments(connectionId)`: Returns PREPARED_ONLY with guidance message
- `getNotifications(connectionId)`: Returns PREPARED_ONLY with guidance message
- `syncVehicles/Transactions/Debts/Payments/Documents/Notifications`: All return PREPARED_ONLY

All methods return `MobilityResult<T>` with proper error codes and messages guiding users to "Preparado para integração oficial" or "Consulta manual".

## Consentimento

### ConsentScope
Granular consent scopes for mobility operations:
- `READ_PROFILE`: Read user profile information
- `READ_VEHICLES`: View vehicles
- `READ_TOLL_TRANSACTIONS`: View toll transactions
- `READ_TOLL_DEBTS`: View toll debts
- `READ_PAYMENTS`: View payments
- `READ_INVOICES`: View invoices
- `READ_DOCUMENTS`: View documents
- `READ_NOTIFICATIONS`: View notifications

### Consent Flow
- Operations require valid consent before execution
- Revoked consent blocks operations
- Insufficient scope blocks operations
- Consent must be explicitly granted (not assumed)
- Consent scope must match operation requirements

> **Note**: Current implementation classifies all operations as PREPARED_ONLY, meaning consent flow is architecturally ready but operationally blocked until official onboarding. When LIVE integration is obtained, consent will be required for actual data access.

## Segurança / RLS

### Role-Based Access Control
- Personal data isolation between users
- Organization data isolation between tenants
- No cross-tenant data access

### Security Principles
- No credential storage in plaintext
- No card data, CVV, or banking passwords
- Sensitivity: mobility/payment information treated as sensitive
- Audit trail for all access (minimum necessary data logged)
- Production fail-closed for all unauthorized access

> **Note**: RLS policies are applied at the database level. The mobility service layer enforces consent and provider availability before any database operations.

## Auditoria

### Audit Trail
- Logs contain minimum necessary information
- No passwords, tokens, or access secrets in logs
- Provider access attempts recorded (success/failure with error codes)
- Consent grant/revocation events
- No sensitive payment data in audit entries

### Privacy
- Personal identifiers logged only when necessary
- Connection IDs recorded for traceability
- Provider and capability information logged
- No fake data presented as real

## Capability Matrix

| Capability | Provider | Status | Evidência | Próximo passo |
|---|---|---|---|---|
| Consultar portagens | Via Verde | PREPARED_ONLY | Via Verde não expõe API pública pública; interações via portal web (A Minha Via Verde) | Onboarding/API oficial |
| Consultar pagamentos | Via Verde | PREPARED_ONLY | Via Verde não expõe API pública; portal web só | Onboarding/API oficial |
| Consultar movimentos | Via Verde | PREPARED_ONLY | Via Verde não expõe API pública; movimentos no portal | Onboarding/API oficial |
| Consultar portagens | CTT | PREPARED_ONLY/MANUAL | CTT não expõe API pública REST; consulta via serviço manual ou TollCard | Integração autorizada |
| Consultar TollCard | CTT | PREPARED_ONLY/MANUAL | Modopré-pago requer TollCard físico; sem API programática | Integração autorizada |
| Consultar dívidas | CTT | PREPARED_ONLY/MANUAL | Débitos consultados via processo manual ou credenciais autorizadas | Integração autorizada |
| Sincronizar veículos | Via Verde | PREPARED_ONLY | Sem API; sincronização via portal web | Onboarding/API oficial |
| Sincronizar transações | Via Verde | PREPARED_ONLY | Sem API; movimentos no portal web | Onboarding/API oficial |
| Consultar veículos | CTT | PREPARED_ONLY/MANUAL | Consulta manual ou integração TollCard | Integração autorizada |

**Legend**:
- `LIVE`: Officially authorized production access with real-time API
- `SANDBOX`: Test environment with mock data (if available)
- `PREPARED_ONLY`: System ready for integration, no live access yet
- `MANUAL`: Manual consultation workflow required
- `NOT_SUPPORTED`: Capability not applicable or intentionally unsupported

## Limitações Atuais

1. **Via Verde**: No public REST API; all interactions through web portal (A Minha Via Verde) and mobile apps. Official onboarding required for LIVE access.

2. **CTT/Portagens**: No public REST API. Two modes:
   - Pré-pago (TollCard): Physical card-based, no programmatic access
   - Pós-Pagamento: Post-payment, manual consultation or authorized integration required

3. **All capabilities**: CLASSIFIED AS PREPARED_ONLY or MANUAL until official onboarding with authorized production credentials is obtained.

4. **Fake providers**: Only for development/testing. Blocked in production by `ALLOW_FAKE_PROVIDERS=false`.

5. **No invented APIs**: This document only documents capabilities with official programmatic access or clear manual workflows.

## Evidence Sources

- Via Verde: https://www.viaverde.pt (web portal documentation, no programmatic API disclosed)
- CTT/Portagens: CTT official services, Portagens regulation (SENP), TollCard program
- IMT (Instituto da Mobilidade e dos Transportes): Portuguese transport authority regulations
- Portuguese toll ecosystem: Official government sources, not undocumented APIs

## Next Steps for LIVE Integration

1. Official onboarding with Via Verde for programmatic API access
2. Official onboarding with CTT/Portagens for API credentials
3. OAuth 2.0 / OpenID Connect authentication flows (when APIs available)
4. Sandbox environment for testing (if provided by integrations)
5. Real credential management (no hardcoded secrets)
6. Consent flow activation for actual data access
7. RLS policies adjusted for live data access patterns

---
*Document generated as part of RPG-OS Mobility module certification.*
*Status: MOBILITY CERTIFIED — PREPARED_ONLY*
*Last reviewed: 2026-09-04*