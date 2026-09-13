# RPG-OS CTT/Portagens Integration Documentation

## Overview
This document details the CTT/Portagens integration for the RPG-OS "A Minha Mobilidade" module. **Current status: PREPARED_ONLY / MANUAL** — no live integration authorized.

**Status**: PREPARED_ONLY / MANUAL

> **Critical**: RPG-OS does NOT currently connect to CTT/Portagens' systems live. This module is architected and ready for future official onboarding. No real-time toll data, payments, or vehicle queries are performed against live CTT/Portagens services.

## Official Sources
- **Website**: https://ctt.pt
- **Service**: CTT Portagens / TollCard
- **Regulatory**: IMT (Instituto da Mobilidade e dos Transportes), Portuguese transport authority
- **API Status**: No public REST API documented for programmatic access

## Capability Matrix — CTT/Portagens

| Capability | Status | Evidence | Next Step |
|---|---|---|---|
| Consultar portagens | PREPARED_ONLY/MANUAL | CTT não expõe API pública REST que pode ser chamada programmatically. Consulta via serviço manual ou credenciais autorizadas. | Integração autorizada CTT |
| Consultar TollCard | PREPARED_ONLY/MANUAL | Modo pré-pago requer aquisição de TollCard físico; sem API programática para consulta de saldo/movimentos. | Integração autorizada CTT |
| Consultar dívidas | PREPARED_ONLY/MANUAL | Débitos de portagem consultados via processo manual ou credenciais autorizadas do CTT. | Integração autorizada CTT |
| Consultar veículos | PREPARED_ONLY/MANUAL | Consulta de veículos associados requer credenciais CTT ou processo manual. | Integração autorizada CTT |
| Consultar pagamentos | PREPARED_ONLY/MANUAL | Pagamentos de portagem via TollCard ou processo manual CTT. | Integração autorizada CTT |
| Consultar faturas | PREPARED_ONLY/MANUAL | Faturas de portagem disponíveis via serviço CTT, não via API pública REST. | Integração autorizada CTT |
| Consultar recibos/documentos | PREPARED_ONLY/MANUAL | Recibos e documentos de portagem via serviço CTT, não via API programática. | Integração autorizada CTT |
| Consultar notificações | PREPARED_ONLY/MANUAL | Notificações de portagem via serviço CTT, não via API REST pública. | Integração autorizada CTT |
| Sincronizar veículos | PREPARED_ONLY/MANUAL | Sincronização requer onboarding oficial CTT. | Integração autorizada CTT |
| Sincronizar transações | PREPARED_ONLY/MANUAL | Sincronização de movimentos de portagem requer credenciais autorizadas. | Integração autorizada CTT |

## Authentication & Access
- **Current auth method**: NONE (no programmatic API)
- **OAuth scopes**: Not applicable (no API)
- **Credentials**: Not applicable (no API)
- **Production safety**: `ALLOW_FAKE_PROVIDERS=false` fail-closed enforced

> **Important**: All CTT/Portagens interactions require manual consultation or official onboarding. The system distinguishes between:
> - ** Pré-pago (TollCard)**: Balance-based, physical card, no programmatic API
> - ** Pós-Pagamento**: Post-payment, linked to vehicle registration, manual consultation

## Provider Implementation Details

### CTTPortagensProvider (packages/core/src/services/mobility/CTTPortagensProvider.ts)
- **providerType**: "PREPARED_ONLY"
- **status**: "PREPARED_ONLY"
- **liveAvailable**: false
- **sandboxAvailable**: false
- **authMethod**: "NONE"
- **capabilities**: 15 capabilities listed, all PREPARED_ONLY
- **documentationUrl**: CTT official services documentation

All methods:
- Call `CTTPortagensProvider.checkProductionSafety()` first
- Throw Error in production without authorized credentials
- Return PREPARED_ONLY result with guidance message
- Never return fake/live data

### Classification by Mode

#### Pré-pago (TollCard Mode)
- **Mechanism**: Physical TollCard with pre-paid balance
- **API Availability**: None — card-based system, no programmatic access
- **Consultation**: Manual via CTT services or card issuer
- **RPG-OS Status**: PREPARED_ONLY / MANUAL
- **Guidance**: "Consulta de portagens CTT requires official onboarding. Status: PREPARED_ONLY. Modo TollCard pré-pago: consulta manual ou aquisição de TollCard."

#### Pós-Pagamento Mode
- **Mechanism**: Post-payment linked to vehicle registration
- **API Availability**: None — manual consultation required
- **Consultation**: Manual via CTT website or services
- **RPG-OS Status**: PREPARED_ONLY / MANUAL
- **Guidance**: "Consulta de débitos CTT requires official onboarding. Status: PREPARED_ONLY. Modo pós-pagamento: consulta manual de débitos e faturas."

## Guidance Messages (PREPARED_ONLY)

### CTT Specific Messages
- "Consulta de veículos CTT requires official onboarding. Status: PREPARED_ONLY. Em CTT > Veículos, the status shows 'Preparado para integração oficial'."
- "Histórico de transações de portagem CTT requires official onboarding. Status: PREPARED_ONLY. Histórico de movimentos CTT consulta manual."
- "Consulta de débitos CTT requires official onboarding. Status: PREPARED_ONLY. Consulta de débitos CTT > Débitos, status 'Preparado para integração oficial'."
- "Consulta de pagamentos CTT requires official onboarding. Status: PREPARED_ONLY. Consulta de pagamentos CTT > Pagamentos, status 'Preparado para integração oficial'."
- "Consulta de faturas CTT requires official onboarding. Status: PREPARED_ONLY. Faturas CTT > Faturas, status 'Preparado para integração oficial'."
- "Consulta de recibos/documentos CTT requires official onboarding. Status: PREPARED_ONLY. Recibos/documentos CTT > Documentos, status 'Preparado para integração oficial'."
- "Sincronização de veículos CTT requires official onboarding. Status: PREPARED_ONLY"
- "Sincronização de transações CTT requires official onboarding. Status: PREPARED_ONLY"
- "Sincronização de débitos CTT requires official onboarding. Status: PREPARED_ONLY"
- "Sincronização de pagamentos CTT requires official onboarding. Status: PREPARED_ONLY"

## Development & Testing

### Fake Provider for Tests
- `FakeCTTPortagensProvider` — for development and test scenarios
- Blocked in production via `ALLOW_FAKE_PROVIDERS=false`
- Fake data clearly marked with `source: "TEST"`
- Usage: Set `ALLOW_FAKE_PROVIDERS=true` only in development environment

### Production Fail-Closed
```bash
# In production, fake providers are blocked:
ALLOW_FAKE_PROVIDERS=false pnpm start

# Only for development/testing:
ALLOW_FAKE_PROVIDERS=true pnpm start
```

## UI Integration

### Pages that reference CTT/Portagens status
- `/mobilidade` — Dashboard showing integration status
- `/mobilidade/veiculos` — Shows "Preparado para integração oficial" when CTT unavailable
- `/mobilidade/portagens` — Shows toll information with PREPARED_ONLY/CTT status, distinguishes TollCard vs pós-pagamento
- `/mobilidade/pagamentos` — Payment consultation with manual guidance for both modes
- `/mobilidade/pendentes` — Pending items with CTT status
- `/mobilidade/documentos` — Documents with "Preparado para integração oficial"
- `/mobilidade/ligacoes` — Connection status showing PREPARED_ONLY

### UI Messages for CTT

#### Pré-pago (TollCard) mode:
- "Preparado para integração oficial" — when no live TollCard integration
- "Consulta manual" — when manual TollCard consultation required
- Never present fake balance or fake transaction history

#### Pós-Pagamento mode:
- "Preparado para integração oficial" — when no live integration
- "Consulta manual" — when manual debt/invoice consultation required
- Never present fake debt data or fake invoice data

### Distinguing Modes in UI
When both modes are supported, the UI should:
- Show a toggle or section separator between "TollCard (Pré-pago)" and "Pós-Pagamento"
- Display appropriate guidance message for each mode
- Never mix fake data from different modes
- Clearly indicate which mode the user is consulting

## Security & Privacy
- **No credentials stored**: CTT credentials never stored in RPG-OS
- **No card data**: TollCard numbers, balances (unless via official API), CVV not handled
- **Sensitive info treated as sensitive**: Mobility/payment data classified as personal-sensitive
- **Audit trail**: Access attempts logged without sensitive data
- **Production fail-closed**: Without official onboarding, all operations blocked

## Roadmap to LIVE Integration
1. **Official onboarding with CTT/Portagens** — obtain programmatic API credentials
2. **OAuth 2.0 / OpenID Connect** — authentication flow implementation
3. **Sandbox environment** — if provided by CTT for testing
4. **Real credential management** — no hardcoded secrets, proper secret storage
5. **Consent flow activation** — user consent for actual data access
6. **Live data queries** — real-time toll transactions, vehicle data, debts, payments
7. **Sync operations** — real vehicle/toll transaction synchronization
8. **UI updates** — reflect live data instead of PREPARED_ONLY messages, distinguish TollCard vs pós-pagamento

## Current Limitations (Honest Classification)
- CTT/Portagens does not expose a public REST API that can be called programmatically
- Two operational modes: Pré-pago (TollCard) and Pós-Pagamento
- Pré-pago: Physical card-based, no programmatic API for balance/movement consultation
- Pós-Pagamento: Post-payment, manual consultation of debts, fines, invoices
- Official onboarding with credentials is required for LIVE/SANDBOX access
- System is architected and ready for future onboarding (types, providers, service, UI all prepared)
- No fake production data — `ALLOW_FAKE_PROVIDERS=false` default fail-closed
- All capabilities classified as PREPARED_ONLY / MANUAL until official onboarding
- Distinction between TollCard (pré-pago) and pós-pagamento modes is important for honest UI

## Evidence
- CTT official services: https://ctt.pt — web portal and app based, no documented public REST API
- Portuguese regulatory framework: IMT, SENP regulations for toll systems
- TollCard program: CTT-operated pre-paid card system
- No undocumented APIs, OAuth scopes, or credentials invented
- Classification based on actual API availability (or lack thereof) and official program documentation

## Mode Distinction in Documentation
This is critical for honesty:
- **TollCard (Pré-pago)**: Balance-based, physical card. No API. Manual consultation only.
- **Pós-Pagamento**: Post-payment linked to vehicle. No API. Manual consultation only.
- RPG-OS supports both modes but classifies both as PREPARED_ONLY/MANUAL
- UI must clearly distinguish which mode is being consulted
- Never present TollCard balance as if it were from an API
- Never present pós-pagamento debts as if fetched programmatically

---
*Document generated as part of RPG-OS Mobility module certification.*
*Status: PREPARED_ONLY / MANUAL — CTT/Portagens integration ready for official onboarding*
*Last reviewed: 2026-09-04*