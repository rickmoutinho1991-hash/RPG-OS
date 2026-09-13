# RPG-OS Via Verde Integration Documentation

## Overview
This document details the Via Verde electronic toll integration for the RPG-OS "A Minha Mobilidade" module. **Current status: PREPARED_ONLY** — no live integration authorized.

**Status**: PREPARED_ONLY

> **Critical**: RPG-OS does NOT currently connect to Via Verde's systems. This module is architected and ready for future official onboarding. No real-time toll data, payments, or vehicle queries are performed against live Via Verde services.

## Official Sources
- **Website**: https://www.viaverde.pt
- **Portal**: A Minha Via Verde (web portal and mobile apps)
- **Regulatory**: Portuguese Road Authority (via relevant decrees and regulations)
- **API Status**: No public REST API documented or available for programmatic access

## Capability Matrix — Via Verde

| Capability | Status | Evidence | Next Step |
|---|---|---|---|
| Consultar portagens | PREPARED_ONLY | Via Verde não expõe API pública que pode ser chamada programmatically. Todas as interações são através do portal web (A Minha Via Verde) e aplicações móveis. | Onboarding with Via Verde for official API access |
| Consultar pagamentos | PREPARED_ONLY | Via Verde não disponibiliza endpoint de consulta de pagamentos via REST. | Onboarding with Via Verde |
| Consultar veículos | PREPARED_ONLY | Consulta de veículos disponível apenas no portal A Minha Via Verde, não via API pública. | Onboarding with Via Verde |
| Consultar transações | PREPARED_ONLY | Histórico de movimentos disponível no portal, não via API programática. | Onboarding with Via Verde |
| Consultar débitos | PREPARED_ONLY | Débitos consultados via portal > Débitos, não via API REST. | Onboarding with Via Verde |
| Consultar faturas | PREPARED_ONLY | Faturas disponíveis no portal > Faturas, não via API pública. | Onboarding with Via Verde |
| Consultar recibos | PREPARED_ONLY | Recibos disponíveis no portal > Documentos, não via API. | Onboarding with Via Verde |
| Consultar notificações | PREPARED_ONLY | Notificações disponíveis no portal > Notificações, não via API REST. | Onboarding with Via Verde |
| Sincronizar veículos | PREPARED_ONLY | Sincronização requer acesso oficial ao portal. | Onboarding with Via Verde |
| Sincronizar transações | PREPARED_ONLY | Sincronização de movimentos requer onboarding oficial. | Onboarding with Via Verde |

## Authentication & Access
- **Current auth method**: NONE (no programmatic API)
- **OAuth scopes**: Not applicable (no API)
- **Credentials**: Not applicable (no API)
- **Production safety**: `ALLOW_FAKE_PROVIDERS=false` fail-closed enforced

> **Important**: All Via Verde interactions in RPG-OS are read-only (GET operations) and require the user to access the A Minha Via Verde portal manually. The system shows "Preparado para integração oficial" status when consulted.

## Provider Implementation Details

### ViaVerdeProvider (packages/core/src/services/mobility/ViaVerdeProvider.ts)
- **providerType**: "PREPARED_ONLY"
- **status**: "PREPARED_ONLY"
- **liveAvailable**: false
- **sandboxAvailable**: false
- **authMethod**: "NONE"
- **capabilities**: 15 capabilities listed, all PREPARED_ONLY
- **documentationUrl**: "https://www.viaverde.pt"

All methods:
- Call `ViaVerdeProvider.checkProductionSafety()` first
- Throw Error in production without authorized credentials
- Return PREPARED_ONLY result with guidance message
- Never return fake/live data

### Guidance Messages (PREPARED_ONLY)
- "Consulta de veículos Via Verde requires official onboarding. Status: PREPARED_ONLY. Em A Minha Via Verde > Veículos, the status shows 'Preparado para integração oficial'."
- "Histórico de transações de portagem Via Verde requires official onboarding. Status: PREPARED_ONLY. Em A Minha Via Verde > Portagens > Movimentos, the status shows 'Preparado para integração oficial'."
- "Consulta de débitos Via Verde requires official onboarding. Status: PREPARED_ONLY. Em A Minha Via Verde > Débitos, the status shows 'Preparado para integração oficial'."
- "Consulta de pagamentos Via Verde requires official onboarding. Status: PREPARED_ONLY. Em A Minha Via Verde > Pagamentos, the status shows 'Preparado para integração oficial'."
- "Consulta de faturas Via Verde requires official onboarding. Status: PREPARED_ONLY. Em A Minha Via Verde > Faturas, the status shows 'Preparado para integração oficial'."
- "Consulta de recibos/documentos Via Verde requires official onboarding. Status: PREPARED_ONLY. Em A Minha Via Verde > Documentos, the status shows 'Preparado para integração oficial'."
- "Sincronização de veículos Via Verde requires official onboarding. Status: PREPARED_ONLY"
- "Sincronização de transações Via Verde requires official onboarding. Status: PREPARED_ONLY"

## Development & Testing

### Fake Provider for Tests
- `FakeViaVerdeProvider` — for development and test scenarios
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

### Pages that reference Via Verde status
- `/mobilidade` — Dashboard showing integration status
- `/mobilidade/veiculos` — Shows "Preparado para integração oficial" when Via Verde unavailable
- `/mobilidade/portagens` — Shows toll information with PREPARED_ONLY status
- `/mobilidade/pagamentos` — Payment consultation with manual guidance
- `/mobilidade/pendentes` — Pending items with Via Verde status
- `/mobilidade/documentos` — Documents with "Preparado para integração oficial"
- `/mobilidade/ligacoes` — Connection status showing PREPARED_ONLY

### UI Messages
When Via Verde is unavailable (PREPARED_ONLY):
- "Preparado para integração oficial" — shown when no live integration
- "Consulta manual" — when manual workflow required
- Never: "Sincronizado", "Atualizado agora", "Ligado", "Dados reais"

## Security & Privacy
- **No credentials stored**: Via Verde credentials never stored in RPG-OS
- **No card data**: Card numbers, CVV, banking passwords not handled
- **Sensitive info treated as sensitive**: Mobility data classified as personal-sensitive
- **Audit trail**: Access attempts logged without sensitive data
- **Production fail-closed**: Without official onboarding, all operations blocked

## Roadmap to LIVE Integration
1. **Official onboarding with Via Verde** — obtain programmatic API credentials
2. **OAuth 2.0 / OpenID Connect** — authentication flow implementation
3. **Sandbox environment** — if provided by Via Verde for testing
4. **Real credential management** — no hardcoded secrets, proper secret storage
5. **Consent flow activation** — user consent for actual data access
6. **Live data queries** — real-time toll transactions, vehicle data, payments
7. **Sync operations** — real vehicle/toll transaction synchronization
8. **UI updates** — reflect live data instead of PREPARED_ONLY messages

## Current Limitations (Honest Classification)
- Via Verde does not expose a public REST API that can be called programmatically
- All interactions are through the web portal (A Minha Via Verde) and mobile apps
- Official onboarding with credentials is required for LIVE/SANDBOX access
- System is architected and ready for future onboarding (types, providers, service, UI all prepared)
- No fake production data — `ALLOW_FAKE_PROVIDERS=false` default fail-closed
- All capabilities classified as PREPARED_ONLY until official onboarding

## Evidence
- Via Verde website: https://www.viaverde.pt — web portal and app based, no documented public API
- Portuguese regulatory framework: IMT, SENP regulations for toll systems
- No undocumented APIs, OAuth scopes, or credentials invented
- Classification based on actual API availability (or lack thereof)

---
*Document generated as part of RPG-OS Mobility module certification.*
*Status: PREPARED_ONLY — Via Verde integration ready for official onboarding*
*Last reviewed: 2026-09-04*