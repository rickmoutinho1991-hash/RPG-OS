# DATA-ARCHITECTURE.md — RPG-OS (Fase 1: Security Foundation)

## 1. Onde os dados vivem

### BUSINESS DATA (tabelas relacionais, RLS ativa)

- Identidades: `users`, `profiles`, `companies`, `contacts`, `addresses`
- Organizações/RBAC: `organizations`, `org_memberships`, `custom_roles`,
  `departments`, `teams`, `team_members`
- Operação: `projects`, `project_tasks`, `project_materials`,
  `project_photos`, `quotes`, `quote_items`, `invoices`, `invoice_items`,
  `payments`, `transport_documents(+_items)`
- Finanças: `bank_accounts`, `bank_transactions`, `expenses`, `diary_entries`,
  `fiscal_obligations`
- Auditoria: `audit_logs` (RLS: só SELECT para o próprio tenant; escritas
  apenas server-side)
- Integridade: `integrity_ledger` (migration 20260830000000; sem PII)

### SECURE DATA (boundary dedicado)

- Credentials, tokens, API keys, secrets → interface `SecureSecretStore`
  (@rpg/core). Implementação atual: `NotConfiguredSecretStore` (falha
  explicitamente; nunca texto simples).
- Documentos altamente sensíveis → storage buckets com policies restritas;
  referências em `documents` (nunca conteúdo em metadata/logs).

## 2. Fluxo de acesso a dados (server-side)

```
Request
  → getSessionContext()            (identidade + membership ACTIVE)
  → requireOrganizationAccess()    (tenant autorizado + permissão)
  → query com filtro de tenant     (ex.: .eq("company_id", tenantId))
  → RLS como segunda linha de defesa
```

O cliente nunca fornece tenant, permissões ou ownership.

## 3. Camadas de isolamento (defesa em profundidade)

1. **Aplicação** — helpers `requireOrganizationAccess/requireCompanyAccess`
   (apps/web/lib/tenant.ts) resolvem o tenant da sessão.
2. **Queries** — todo o acesso inclui filtro explícito de tenant.
3. **Base de dados** — RLS por `auth.uid()`/membership; `audit_logs` e
   `integrity_ledger` só SELECT para membros ACTIVE do tenant; escritas só
   via service role em código server-side.

## 4. Classificação e redação

Ver PRIVACY.md (níveis PUBLIC→HIGHLY_SENSITIVE e regras de redação).
Toda a escrita nova em `audit_logs` deve passar por `recordAuditEvent()`
(apps/web/lib/audit.ts), que sanitiza e encadeia o hash de integridade.

## 5. Integrity Ledger — modelo

```
GENESIS
  ↓  currentHash = SHA-256(prev | type | eventId | ts | org | company | eventHash)
HASH A  (evento 1)
  ↓
HASH B  (evento 2, prev = A)
  ↓
HASH C  (evento 3, prev = B)
```

Adulterar o evento B → B deixa de validar → C também falha.
O conteúdo original do evento fica fora do ledger (no audit log, sanitizado).

Verificação server-side: `verifyTenantIntegrityChain(organizationId)`.

## 6. Retenção

Fundação em `security/retention.ts` — políticas e avaliação pura.
Aplicação/eliminação automática: fora do âmbito desta fase.

## 7. Evolução futura — RPG-OS Global Network

Fase atual é **local e auditável**. Evolução prevista (não implementada):

1. **Âncoras externas**: publicação periódica do head-hash do ledger num
   notário/feed independente, tornando inviável recalcular a cadeia em
   silêncio.
2. **Assinatura digital**: assinatura do head-hash (chave held server-side)
   para atribuição.
3. **Sincronização inter-tenant consentida** pela Global Network, sempre
   baseada em hashes/permitidos — **nunca** PII numa rede distribuída.
4. **Secret store real** (Supabase Vault/KMS) atrás de `SecureSecretStore`.

## 8. Compatibilidade

Nada disto altera contratos existentes: `sanitizeAuditMetadata` já usado
pelas server actions mantém a mesma assinatura; `integrity_ledger` é uma
tabela nova aditiva; helpers de tenant são opt-in para código novo.
