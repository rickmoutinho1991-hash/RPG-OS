# RPG-OS — "A Minha Vida" Architecture

## Vision
Transform RPG-OS from a collection of dashboards into a **Personal Operating System** for the Portuguese citizen. The experience must be **action-first**, not data-first: detect → organize → explain → prioritize → act, instead of just showing data.

The user should never need to know in which module a piece of information lives. Instead of "Finance → Portagens → Pagamentos", the system should present: **"Há um assunto de mobilidade que merece a tua atenção."** with options to "Ver", "Resolver", "Consultar" based on real capabilities.

## Problem
RPG-OS has independent domains (Finance, Health, Mobility, Fiscal, Social Security, Government, Documents) each with their own providers, APIs, and UIs. Users must navigate between them separately. There's no cross-domain awareness, no prioritization, and no unified action model. Each domain stands alone.

## Objectives (NOT Dashboard)
- ✅ Create a cross-domain aggregation layer
- ✅ Detect what requires user attention
- ✅ Organize by priority and feasibility
- ✅ Explain with real source context
- ✅ Prioritize actions available
- ✅ Enable actions respecting domain capabilities
- ✅ Never pretend integration exists when it doesn't
- ✅ Privacy by reference, never data duplication
- ✅ Progressive disclosure — calm interface, high information density

**NOT objectives:**
- ❌ Create another dashboard with 12 cards/KPIs/widgets
- ❌ Duplicate domain data
- ❌ Invent capabilities or live integrations
- ❌ Present PREPARED_ONLY as LIVE
- ❌ Circumvent domain authorization/consent

## Architecture Conceptual

```
                    A MINHA VIDA
                          │
        ┌─────────────────┼─────────────────┐
        │               │               │
    Finance           Mobility       Health
        │               │               │
    Fiscal           Gov/Auth       Documents
        │               │               │
        └───────┬───────┼───────────────┘
                  │
            Shared Platform
```

**A Minha Vida consumes capabilities from domains.** It does NOT duplicate data. Each LifeItem references its source domain and entity, never copying sensitive data.

### Non-Goals (explicitly out of scope for this phase):
- ❌ Redesign global UI
- ❌ New design system
- ❌ Animations
- ❌ AI/ML
- ❌ Event bus complex
- ❌ Automations
- ❌ Cross-domain notifications
- ❌ Automatic finance integration
- ❌ Via Verde/CTT LIVE integration (Mobility stays PREPARED_ONLY)
- ❌ Full redesign of existing domains

## Cross-Domain Model

### LifeItem (core abstraction)
Each LifeItem represents "something the user should know or do" — referencing (not copying) the source domain entity.

```typescript
// Conceptual — adapted to project types
interface LifeItem {
  id: string; // unique identifier
  domain: string; // "finance" | "mobility" | "health" | "fiscal" | "documents" | "government"
  type: string; // "pending_toll" | "invoice_due" | "prescription_expires" | etc.
  title: string; // human-readable, domain-specific
  description?: string; // optional elaboration
  priority: "high" | "medium" | "low" | "info";
  status: "LIVE" | "PREPARED_ONLY" | "MANUAL" | "UNAVAILABLE";
  source: "OFFICIAL" | "MANUAL" | "SYSTEM";
  sourceEntityId: string; // ID in the source domain (never copied data)
  sourceDomain: string; // which domain owns this entity
  timestamp: string; // when created/last updated
  dueDate?: string; // if applicable
  capability: string; // which capability reveals this (e.g. "mobility.read.debts")
  action: "view" | "consult" | "connect" | "manual_action" | "pay" | "validate" | "download" | "none";
  capabilityConfidence: "verified" | "prepared_only" | "manual" | "unavailable";
  privacyLevel: "public" | "personal" | "sensitive";
}
```

**Key principles:**
- `sourceEntityId` + `sourceDomain` = identification without data duplication
- `status` reflects the REAL capability status (never faked as LIVE)
- `capabilityConfidence` tells the user how much trust to place
- `action` is what the user CAN actually do, not what we wish existed

### Example LifeItems (real, not invented):

```json
{
  "domain": "mobility",
  "type": "pending_toll_debt",
  "title": "Dívida de portagem CTT em aberto",
  "priority": "high",
  "status": "PREPARED_ONLY",
  "source": "MANUAL",
  "sourceEntityId": "debt-ctt-001",
  "sourceDomain": "mobility",
  "timestamp": "2026-09-04T10:00:00Z",
  "dueDate": "2026-10-01",
  "capability": "mobility.read.debts",
  "capabilityConfidence": "prepared_only",
  "action": "consult_manually",
  "privacyLevel": "personal"
}
```

```json
{
  "domain": "finance", 
  "type": "invoice_due",
  "title": "Fatura da elétrica vence em 3 dias",
  "priority": "high",
  "status": "LIVE",
  "source": "OFFICIAL",
  "sourceEntityId": "invoice-ef-012",
  "sourceDomain": "finance",
  "timestamp": "2026-09-02T09:00:00Z",
  "dueDate": "2026-09-07",
  "capability": "finance.read.invoices",
  "capabilityConfidence": "verified",
  "action": "pay",
  "privacyLevel": "personal"
}
```

```json
{
  "domain": "health",
  "type": "appointment_available",
  "title": "Consulta de rotina disponível",
  "priority": "medium",
  "status": "LIVE",
  "source": "OFFICIAL",
  "sourceEntityId": "appt-sns-001",
  "sourceDomain": "health",
  "timestamp": "2026-09-01T15:00:00Z",
  "capability": "health.read.appointments",
  "capabilityConfidence": "verified",
  "action": "view",
  "privacyLevel": "personal"
}
```

### What LifeItem is NOT:
- ❌ A copy of payment data, prescription data, or document data
- ❌ A dashboard card with embedded values
- ❌ A status indicator that pretends LIVE when PREPARED_ONLY
- ❌ Invented data with "made up" values

## LifeEvent (cross-domain timeline)

```typescript
interface LifeEvent {
  id: string;
  domain: string;
  type: string; // "invoice_received" | "toll_debt_detected" | "appointment_scheduled" | etc.
  title: string;
  domainTitle: string; // human-readable domain name
  sourceEntityId: string;
  timestamp: string;
  status: "upcoming" | "today" | "past" | "overdue";
  relatedLifeItemId?: string; // links to LifeItem if applicable
}
```

**Timeline uses real events from domains.** Never invented events.

### Example timeline entries:
- "Hoje — Pagamento registado (Finance)"
- "Ontem — Consulta de saúde (Health)"  
- "3 dias atrás — Portagem paga (Mobility)"
- "Próxima semana — Prazo fiscal (Fiscal)"

## LifeAction (action model)

Each LifeItem can support specific actions. The action model respects what each domain actually enables:

| Domain | Status | Supported Actions |
|--------|--------|-------------------|
| Finance | LIVE | `pay`, `view`, `download_invoice` |
| Finance | PREPARED_ONLY | `view`, `learn_more` (NOT `pay`) |
| Mobility | LIVE | `view`, `pay`, `connect` |
| Mobility | PREPARED_ONLY | `view`, `consult_manually` (NOT `pay`) |
| Health | LIVE | `view`, `book`, `download_prescription` |
| Health | PREPARED_ONLY | `view`, `learn_more` |
| Fiscal | LIVE | `view`, `download_declaration` |
| Fiscal | MANUAL | `consult_manually` |

**Never create actions that don't have real backing.** If Mobility is PREPARED_ONLY, the action must be `consult_manually` or `connect_learn`, NOT `pay`.

## Priority Model

Priority = f(urgency, dueDate, impact, severity, actionability, sourceConfidence)

Deterministic rule function (no AI in this phase):

```
priority = 
  (dueDate within 48h ? "high" : 
   dueDate within 7d ? "medium" : 
   dueDate within 30d ? "low" : "info")
  ∧ (impact ? "high" : "low")
  ∧ (actionability ? "high" : "low")
  ∧ (sourceConfidence === "verified" ? "boost" : sourceConfidence === "prepared_only" ? "note" : "caution")
```

**Examples:**
- Invoice due in 2d + verified source → "high"
- Toll debt PREPARED_ONLY + manual consultation → "medium" (note the limitation)
- Appointment available LIVE → "high" (actionable)
- Document new + personal → "low" (info)

## Source/Capability Model

Each LifeItem must have:
- `sourceEntityId` — ID in the source domain (never copy the entity)
- `sourceDomain` — which domain owns this
- `capability` — which capability reveals this (e.g. `"mobility.read.debts"`)
- `capabilityConfidence` — `"verified"` / `"prepared_only"` / `"manual"` / `"unavailable"`
- `privacyLevel` — `"public"` / `"personal"` / `"sensitive"`

**Never invent source or capability.** If the provider doesn't expose it, the LifeItem shouldn't claim it.

## Privacy Model

- Prefer `LifeItem metadata` over duplicating sensitive data
- Reference: `sourceEntityId` + `sourceDomain` instead of copying objects
- `privacyLevel` controls what's surface-level vs. what requires drilling in
- **Never** copy: medical data, payment details, credentials, tokens, personal identifiers in full
- Health data: reference only, never display full medical history in LifeItem
- Finance data: reference invoice/debt IDs, not full payment details
- Mobility data: reference toll IDs, not vehicle/financial details

## Security Model

**A Minha Vida cannot circumvent domain boundaries.**

If Finance blocks access → A Minha Vida also blocks.
If Health requires consent → A Minha Vida respects consent.
If Mobility is PREPARED_ONLY → A Minha Vida cannot present as LIVE.

**Architecture chain:**
```
Life Layer
  ↓ Domain capability
  ↓ Authorization  
  ↓ Consent
  ↓ Provider
  ↓ Source
```

**Never:**
```
Life Layer
  ↓ DB direct
  ↓ data
```
when this bypasses domain rules.

## Consent Model

Consent follows the data. A LifeItem can only surface what the user has consented to for that domain. Consent scopes are domain-specific and never transferred across domains without explicit re-consent.

## Status Model

| Status | Meaning | When Used |
|--------|---------|-----------|
| LIVE | Real-time authorized access | Domain has official API credentials |
| PREPARED_ONLY | Ready for integration, no live access | Domain types follow this (e.g., Mobility) |
| MANUAL | Manual consultation required | e.g., CTT TollCard mode, some fiscal processes |
| UNAVAILABLE | Temporarily unavailable / error | Provider error, expired credentials |

**An aggregated view can only show "real" when the origin permits.**

## Timeline Model

Timeline uses events emitted by domains. Each event has:
- `domain` — which domain emitted
- `type` — event type (invoice.received, toll.debt.detected, etc.)
- `title` — human summary
- `timestamp` — when occurred
- `status` — upcoming/today/past/overdue
- `relatedLifeItemId` — optional link to LifeItem

**Only real events.** No invented events.

## UX Principles (for later implementation)

1. **Action before information** — first what can be done, then data
2. **Context before navigation** — show relevant context, don't make user hunt
3. **One life, multiple domains** — unified view, not module-switching
4. **Explain before asking** — show why before what action
5. **Never pretend integration exists** — PREPARED_ONLY stays PREPARED_ONLY
6. **Privacy by reference** — reference, don't duplicate
7. **Explicit source** — always show where information comes from
8. **Consent follows the data** — never surface what consent doesn't allow
9. **Every alert must be actionable** — if it's shown, an action must be possible
10. **Calm interface, high information density** — minimal UI, maximum relevance
11. **Progressive disclosure** — start simple, drill when user acts
12. **User remains in control** — never hidden flows or surprise actions

## Architecture Document (full)

Create: `docs/A-MINHA-VIDA-ARCHITECTURE.md`

This document contains:
- ✅ Vision
- ✅ Problem
- ✅ Objectives (and explicit non-goals)
- ✅ Architecture diagram
- ✅ Domain boundaries
- ✅ LifeItem model
- ✅ LifeEvent model
- ✅ Action model
- ✅ Priority model
- ✅ Source/capability model
- ✅ Privacy model
- ✅ Security model
- ✅ Consent model
- ✅ Status model
- ✅ Timeline model
- ✅ UX principles
- ✅ Extensibility
- ✅ Examples
- ✅ Limitations

## Implementation Minimization

**Only create if necessary to validate architecture:**

1. **Types/interfaces** — LifeItem, LifeEvent, LifeAction, LifePriority, LifeSource, LifeCapability
2. **Contracts** — API contracts between Life Layer and domain services
3. **Adapters** — thin adapters to convert domain types to Life types (NO data duplication)
4. **Tests** — minimal tests for type correctness

**Avoid:**
- ❌ UI components
- ❌ Dashboard pages
- ❌ Event buses complex
- ❌ Automation logic
- ❌ Real integration wiring (Mobility stays PREPARED_ONLY)
- ❌ Data transformation that invents values

Types must be in the correct architectural layer. No duplication of existing types (HealthProviderId stays in health, MobilityProviderId stays in mobility, etc.).

## Future Compatibility

The architecture must allow:
- Finance + Mobility + Health + Fiscal + Social Security + Government + Documents + Notifications
- Provider upgrade: PREPARED_ONLY → SANDBOX → LIVE (without UX fundamental change)
- New domains added without rewriting central layer
- Privacy and security models remain valid

## Quality Gate

If code is altered:
- `pnpm typecheck` — no new errors
- `pnpm lint` — no new errors
- `pnpm test` — no regressions
- `pnpm build` — core builds successfully

No accepting regressions for "feature completeness."

## Final Report Structure

After this phase, present:

A. Current Architecture Audit
B. Domain Map
C. Proposed A Minha Vida Architecture
D. Cross-Domain Model
E. Life Item Model
F. Event Model
G. Action Model
H. Priority Model
I. Source/Capability Model
J. Privacy Model
K. Security Model
L. Consent Model
M. UX Principles
N. Files Created
O. Files Modified
P. Code Actually Implemented
Q. Tests
R. Typecheck
S. Lint
T. Build
U. Remaining Risks
V. Recommended Next Phase

**Important: Do not declare the architecture perfect. Identify explicitly:**
- Risks
- Open decisions
- Trade-offs
- Things that must wait
- External dependencies

## Rule Final

**NÃO TRANSFORMAR "A MINHA VIDA" EM DASHBOARD.**

Estamos a construir a camada que pode transformar:
```
RPG-OS
```
num:
```
PERSONAL OPERATING SYSTEM FOR THE PORTUGUESE CITIZEN.
```

Primeiro arquitetura.
Depois UX.
Depois implementação.

**Executar esta fase agora.**

---
*Document generated as part of RPG-OS "A Minha Vida" phase.*
*Status: V1 IMPLEMENTED — /vida funcional (2026-09-05). Ver docs/A-MINHA-VIDA-IMPLEMENTATION.md*
*Last reviewed: 2026-09-05*