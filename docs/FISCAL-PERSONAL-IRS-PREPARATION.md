# Preparação IRS Pessoal / Modelo 3 (P1.3)

> Draft local de preparação para declaração de rendimentos pessoa singular (IRS Modelo 3).
> **NÃO é submissão. NÃO é integração AT. NÃO calcula reembolso/imposto final.**
> Consome deduções certificadas P1/P1.1/P1.2. Determinístico, sem rede, cents.

---

## 1. Objetivo

Construir a fundação de preparação do IRS / Modelo 3 para **pessoa singular** (particular ou ENI/sócio-gerente sem empresa), consumindo o motor de deduções P1/P1.1/P1.2 já certificado.

**Fluxo:**
```
Dados Fiscais Pessoais (profiles.tax_number)
        ↓
Despesas / Deduções (personal_deductions + motor P1.1/P1.2)
        ↓
Obrigações Fiscais (fiscal_obligations user-scoped)
        ↓
Regras Fiscais Verificadas (ruleset 2026.1-cirs-2026-09-09)
        ↓
IRS Preparation Model (personal_irs_preparation)
        ↓
Validação Local + Proveniência
        ↓
Resumo / Draft → PRONTO PARA REVISÃO HUMANA
        ↓
Submissão Oficial = NÃO IMPLEMENTADA
```

---

## 2. Âmbito e Limites

| Item | Estado | Nota |
|------|--------|------|
| **Ano fiscal** | 2026 | Despesas/rendimentos de 2026 |
| **Ano declaração** | 2027 | Entrega em 2027 |
| **Deduções à coleta** | ✅ PARCIAL | Gerais/Saúde/Educação (caps 2026.1). Limite global art. 78.º n.º 7 = MANUAL_REVIEW |
| **Rendimentos (A/B/E/F/G/H)** | ❌ UNAVAILABLE | Sem modelo de rendimentos pessoais |
| **Retenções na fonte** | ❌ UNAVAILABLE | Sem dados |
| **Pagamentos por conta** | ❌ UNAVAILABLE | Sem dados |
| **Agregado familiar** | ⚠️ MANUAL_REVIEW | Estado civil, união facto, residência não recolhidos |
| **Dependentes** | ⚠️ MANUAL_REVIEW | Não modelados |
| **Residência fiscal** | ⚠️ MANUAL_REVIEW | Não inferida |
| **Benefícios fiscais** | ❌ UNAVAILABLE | Não modelados |
| **Situações especiais** | ❌ UNAVAILABLE | NHR, não residente, etc. |
| **Submissão AT** | ❌ NÃO IMPLEMENTADA | Portal-only, sem API |
| **e-Fatura pessoal** | ❌ NÃO IMPLEMENTADA | Portal-only |
| **Cálculo reembolso** | ❌ NÃO CALCULADO | Exige modelo completo |
| **Cálculo imposto a pagar** | ❌ NÃO CALCULADO | Exige modelo completo |

---

## 3. Arquitetura

### 3.1 Modelo de Dados

**Tabela:** `personal_irs_preparation` (migration `20260916000000`)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | PK |
| `user_id` | UUID | Tenant pessoal (auth.user.id), FK → users |
| `tax_year` | INTEGER | Fixado em 2026 (CHECK) |
| `declaration_year` | INTEGER | Fixado em 2027 (CHECK) |
| `status` | TEXT | `DRAFT \| READY_FOR_REVIEW \| INCOMPLETE \| MANUAL_REVIEW \| LOCKED` |
| `ruleset_version` | TEXT | Ex: `2026.1-cirs-2026-09-09` |
| `totals` | JSONB | Agregados (cents) |
| `sections` | JSONB | Completude por secção Modelo 3 |
| `income_status` | JSONB | Estado por categoria rendimento |
| `unresolved_items` | JSONB | Itens para revisão humana |
| `provenance` | JSONB | Snapshot reprodutibilidade |
| `created_at` / `updated_at` | TIMESTAMPTZ | Auditoria |

**Constraints:**
- `UNIQUE (user_id, tax_year)` → idempotência por utilizador/ano
- `CHECK (tax_year = 2026)` e `CHECK (declaration_year = 2027)` → fase única

### 3.2 RLS

```sql
ALTER TABLE personal_irs_preparation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON personal_irs_preparation
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

- **Tenant = user_id** (nunca company_id, nunca NIF)
- Service-role só via server actions autorizadas

### 3.3 Permissões

| Ação | Permissão | Onde |
|------|-----------|------|
| Ler preparação | `fiscal.view` | Server action `getPersonalIrsPreparation` |
| Gerar/Atualizar | `fiscal.manage` | Server action `createOrRefreshPersonalIrsPreparation` |
| Bloquear/Desbloquear | `fiscal.manage` | Server actions `lock/unlock` |

Todas server-side, sessão validada, user_id da sessão (nunca do browser).

---

## 4. Regras Fiscais (2026.1)

**Fonte:** CIRS republicado (info.portaldasfinancas.gov.pt), verificado 2026-09-09.

| Categoria | Taxa | Cap | Artigo | Estado |
|-----------|------|-----|--------|--------|
| GENERAL_FAMILY_EXPENSES | 35% (3500 bps) | €250 (25000c) | 78.º-B | ✅ Suportado |
| HEALTH | 15% (1500 bps) | €1000 (100000c) | 78.º-C | ✅ Suportado |
| EDUCATION | 30% (3000 bps) | €800 (80000c) | 78.º-D | ✅ Suportado |
| HOUSING | — | — | 78.º-E | ⚠️ MANUAL_REVIEW |
| ELDERLY_CARE | — | — | 84.º | ⚠️ MANUAL_REVIEW |
| ALIMONY / DONATION / INSURANCE / OTHER | — | — | vários | ⚠️ MANUAL_REVIEW |

**Limite global art. 78.º n.º 7:** NÃO calculado (exige rendimento coletável + dependentes + regime tributário → agregado não modelado).

**Variantes não implementadas:** Monoparental 45%/€335, rendas estudante deslocado, refeições escolares (exigem contexto adicional).

---

## 5. Estados do Draft

| Estado | Significado | Quando |
|--------|-------------|--------|
| `DRAFT` | Gerado, pode ser regenerado | Inicial, após unlock |
| `READY_FOR_REVIEW` | RPG-OS tem dados suficientes para draft coerente | Secções COMPLETE/PARTIAL sem UNAVAILABLE/MANUAL_REVIEW |
| `INCOMPLETE` | Faltam secções UNAVAILABLE | Rendimentos, retenções, pagamentos conta indisponíveis |
| `MANUAL_REVIEW` | Requer decisão humana | Agregado, dependentes, residência, limite global |
| `LOCKED` | Congelado pelo utilizador | Impede regeneração automática |

> **REGRA:** `READY_FOR_REVIEW` **nunca** significa "pronto para submissão AT". Significa apenas "draft local coerente com dados disponíveis".

---

## 6. Proveniência e Reprodutibilidade

Cada preparação guarda `provenance` JSONB:

```json
{
  "rulesetVersion": "2026.1-cirs-2026-09-09",
  "rulesetSource": "CIRS art. 78-B/C/D (info.portaldasfinancas.gov.pt)",
  "rulesetVerifiedAt": "2026-09-09",
  "deductionsSnapshot": {
    "count": 12,
    "totalCents": 150000,
    "deductibleCents": 45000,
    "ruleVersions": ["2026.1-cirs-2026-09-09"]
  },
  "obligationsSnapshot": { "count": 4, "categories": ["IVA", "IRS", "SEG_SOCIAL"] },
  "inputFingerprint": "deductions:150000:45000:2026.1|obligations:4|ruleset:2026.1-cirs-2026-09-09"
}
```

- **Fingerprint** determinístico: mesmos inputs → mesmo fingerprint
- Permite detectar se draft precisa regeneração
- Auditorável sem armazenar cópia completa dos dados origem

---

## 7. Server Actions

Todas em `apps/web/app/fiscal/irsPreparationActions.ts`:

| Action | Descrição |
|--------|-----------|
| `createOrRefreshPersonalIrsPreparation({ taxYear, forceRefresh? })` | Gera/atualiza draft (idempotente por user+taxYear) |
| `getPersonalIrsPreparation(taxYear?)` | Lê draft existente |
| `getPersonalIrsPreparationView(taxYear?)` | View simplificada para UI |
| `lockPersonalIrsPreparation(taxYear?)` | Bloqueia (status = LOCKED) |
| `unlockPersonalIrsPreparation(taxYear?)` | Desbloqueia (status = DRAFT) |

**Segurança:**
- `authorizedReader()` → `fiscal.view` + sessão válida
- `authorizedWriter()` → `fiscal.manage` + sessão válida
- `user_id` **sempre** da sessão server-side
- `taxYear` validado (apenas 2026)
- Valores **nunca** vêm do browser (dedutíveis, status, ruleset)

---

## 8. UI

**Rota:** `/fiscal` → Tab **IRS / Modelo 3 — Preparação**

**Componentes:**
- `IrsPreparationClient.tsx` — cliente React
- Mostra: ano fiscal/declaração, status, ruleset, totais, secções, rendimentos, itens pendentes, proveniência
- Linguagem: "Preparação local", "Não submetido à AT", "Não confirmado pela AT"
- Botões: Gerar/Regenerar, Bloquear, Desbloquear

---

## 8. Separação Empresa / Pessoal

| Pessoal (P1.3) | Empresa (AT Enterprise) |
|----------------|------------------------|
| `personal_irs_preparation` | `at_connections`, `fiscal_inbox`, `fiscal_submissions` |
| `personal_deductions` | `invoices`, `transport_documents` |
| `fiscal_obligations` (user_id, company_id NULL) | `fiscal_obligations` (company_id NOT NULL) |
| NIF: `profiles.tax_number` | NIF: `companies.tax_number` |
| Tenant: `user_id` | Tenant: `company_id` |
| Permissões: `fiscal.view/manage` | Permissões: `fiscal.view/manage` + company |
| **NÃO usa** `at_connections` | **USA** `at_connections` (D4/D21/D22/D23) |

**AT Enterprise (D4, D4.1, D21, D21.5, D22, D23) permanece INTACTO.**
**Fiscal Inbox / Routing / A Minha Vida / Health / Mobility permanecem INTACTOS.**

---

## 9. Segurança e Privacidade

- **Dinheiro:** apenas cents (INTEGER, nunca float), EUR
- **Arredondamento:** `Math.floor(base * bps / 10000)` reutiliza P1.1
- **NIF:** nunca armazenado na preparação; só em `profiles.tax_number` (RLS própria)
- **PII:** descrição curta (≤200 chars), sem fornecedor/NIF/documentos no registo
- **Logs/Auditoria:** sem payloads fiscais sensíveis
- **Rede:** ZERO chamadas externas (NETWORK: NONE)
- **Secrets:** ZERO segredos armazenados ou manipulados

---

## 10. Testes

### 10.1 Unitários (core)
`packages/core/src/security/__tests__/personalIrsPreparation.test.ts`
- Anos fiscais (taxYear 2026, declarationYear 2027, wrong year)
- Secções (com/sem deduções, 9 secções)
- Categorias rendimento (6 categorias UNAVAILABLE)
- Status geral (COMPLETE, PARTIAL, MANUAL_REVIEW, UNAVAILABLE)
- Unresolved items
- Fingerprint determinístico

### 10.2 Tipos/Higiene (web)
`apps/web/app/fiscal/__tests__/irsPreparationActions.test.ts`
- Estruturas de input/output
- Tipos válidos

### 10.3 Segurança (a validar manualmente)
- USER A só vê A
- USER B só vê B
- Sem sessão → DENY
- Sem `fiscal.view` → DENY read
- Sem `fiscal.manage` → DENY write
- Browser não define user_id, tax_year, totals, status, ruleset

---

## 11. Migrações

| Migration | Descrição |
|-----------|-----------|
| `20260909100000_personal_deductions.sql` | P1: tabela deduções base |
| `20260915000000_personal_deduction_context.sql` | P1.2: contexto fiscal (3 flags) |
| `20260916000000_personal_irs_preparation.sql` | **P1.3: preparação IRS Modelo 3** |

**NÃO alterar migrações históricas.** Nova migration com timestamp posterior.

---

## 12. Roadmap

| Fase | Item | Estado |
|------|------|--------|
| **P1.3 (AGORA)** | Modelo preparação IRS, deduções P1/P1.1/P1.2, UI, proveniência | ✅ IMPLEMENTADO |
| **P1.4 (FUTURO)** | Contexto agregado familiar (estado civil, dependentes, residência) | 📋 PLANEADO |
| **P1.5 (FUTURO)** | Modelo rendimentos pessoais (categorias A/B/E/F/G/H) | 📋 PLANEADO |
| **P1.6 (FUTURO)** | Retenções na fonte + pagamentos por conta | 📋 PLANEADO |
| **P1.7 (FUTURO)** | Limite global art. 78.º n.º 7 (com agregado + rendimento) | 📋 PLANEADO |
| **P1.8 (FUTURO)** | Simulação IRS final (coleta, taxa, reembolso/pagar) — **só com dados completos** | 📋 PLANEADO |
| **P1.9 (FUTURO)** | Integração oficial AT — **SÓ se API legal/técnica disponível** | ❓ CONDICIONAL |

> **NUNCA prometer integração AT.** Portal-only continua sendo a única via oficial.

---

## 13. Ficheiros Alterados/Criados (P1.3)

### Core
- `packages/core/src/security/personalIrsPreparation.ts` — tipos + lógica pura
- `packages/core/src/security/__tests__/personalIrsPreparation.test.ts` — testes unitários
- `packages/core/src/security/index.ts` — export

### Database
- `supabase/migrations/20260916000000_personal_irs_preparation.sql` — tabela + RLS

### Web App
- `apps/web/app/fiscal/irsPreparationActions.ts` — server actions
- `apps/web/app/fiscal/IrsPreparationClient.tsx` — UI cliente
- `apps/web/app/fiscal/FiscalClient.tsx` — tab IRS_PREP adicionado
- `apps/web/app/fiscal/__tests__/irsPreparationActions.test.ts` — testes tipos

### Documentação
- `docs/FISCAL-PERSONAL-IRS-PREPARATION.md` — este ficheiro

---

## 14. Critérios de READY (Checklist P1.3)

- [x] IRS personal preparation model existe (`personal_irs_preparation`)
- [x] tax_year (2026) separado de declaration_year (2027)
- [x] user-scoped (user_id tenant, nunca NIF, nunca company_id)
- [x] server-authoritative (ações server-side, sessão validada)
- [x] permissions server-side (`fiscal.view` / `fiscal.manage`)
- [x] RLS correta (`auth.uid() = user_id` FOR ALL)
- [x] deduções P1/P1.1/P1.2 reutilizadas (motor certificado)
- [x] regras 2026.1 preservadas (35%/€250, 15%/€1000, 30%/€800)
- [x] sem regras inventadas (HOUSING, etc. → MANUAL_REVIEW)
- [x] sem zero values fictícios (rendimentos, retenções, pagamentos = UNAVAILABLE)
- [x] sem fake income / fake withholding / fake dependents / fake household
- [x] sem cálculo enganoso de refund / tax owed
- [x] sem submissão / sem AT integration / sem network calls
- [x] sem secrets
- [x] sem regressões (AT enterprise, Fiscal Inbox, Routing, A Minha Vida, Health, Mobility intocados)
- [x] testes passam
- [x] documentação atualizada

---

## 15. Veredito

**P1.3 PERSONAL IRS PREPARATION READY**

Fundação local, segura, determinística, auditável e honesta para preparação de IRS pessoa singular. Pronta para evoluir (P1.4+) sem criar falsa integração com AT.