# SECURITY.md — RPG-OS Security Foundation (Fase 1)

> **Aviso fundamental:** Hash/ledger **não é encriptação** e **não torna dados
> privados**. O Integrity Ledger apenas permite _deteção_ de adulteração.
> Não existe "segurança absoluta" — este documento descreve controlos reais
> e os seus limites.

## 1. Modelo de autenticação e autorização

- Autenticação via Supabase SSR (`auth.getUser()`); sessões em cookies httpOnly.
- Autorização RBAC no servidor: `getSessionContext()` (apps/web/lib/session.ts)
  resolve utilizador → memberships ACTIVE → organização ativa → permissões
  efetivas (`resolveEffectivePermissions` em @rpg/core).
- `has_org_permission` (SQL) centraliza decisões de permissão nas policies.
- Guard server-side: `requirePermission(ctx, permission)` e, para tenant
  isolation, `requireOrganizationAccess` / `requireCompanyAccess` /
  `resolveTenantContext` (apps/web/lib/tenant.ts).

## 2. Tenant Isolation — regra inegociável

O cliente **nunca** é autoridade sobre `organizationId`, `companyId`,
`tenantId`, permissões ou ownership. Estes valores são resolvidos
exclusivamente server-side a partir da sessão:

1. resolver identidade (`getSessionContext`);
2. resolver membership (apenas `ACTIVE`);
3. resolver tenant autorizado (`requireOrganizationAccess`);
4. só depois consultar/escrever — sempre com filtro de tenant na query.

Vulnerabilidades corrigidas na Fase 1:

| Local                                                   | Problema                                             | Correção                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `app/documentos/actions.ts` (submitDocumentForApproval) | Documento de outro tenant podia ser submetido (IDOR) | Verificação `owner_user_id`/`company_id` contra sessão antes de qualquer ação |
| `app/clientes/actions.ts` (updateClientAction)          | UPDATE de perfil sem filtro de tenant                | `eq("company_id", …)` + verificação prévia de pertença                        |

## 3. RLS

Ativa nas tabelas de clientes desde a migration `20260820280000`
(SELECT/INSERT/UPDATE/DELETE isolados por `auth.uid()` ou membership via
`profiles.company_id`). `audit_logs`: apenas SELECT para o próprio tenant;
escritas só via service role server-side.

Nova migration `20260830000000_integrity_ledger.sql` (aditiva):

- `integrity_ledger` com RLS: tenants só leem a **própria** cadeia
  (via `org_memberships` ACTIVE); sem INSERT/UPDATE/DELETE para
  `authenticated` — escritas apenas server-side (service role).
- Índices: `(organization_id, created_at)`, `current_hash`,
  `(organization_id, event_type, event_id)` e índice único de
  idempotência por tenant/evento.

## 4. Audit hardening

Pipeline preferencial (novo código): `recordAuditEvent()` em
apps/web/lib/audit.ts:

```
AUDIT EVENT → SANITIZE (sanitizeAuditMetadata) → AUDIT LOG → INTEGRITY HASH
```

Garantias: actor/timestamp/tenant server-side; metadata sanitizada;
nenhuma password/token/API key/secret no log (removidos, nem sequer como
`[REDACTED]`); nenhum documento completo em metadata.

## 5. Integrity Ledger

- Implementação pura em @rpg/core (packages/core/src/security/integrityLedger.ts):
  `createIntegrityRecord`, `computeIntegrityHash`, `verifyIntegrityChain`
  (SHA-256 via Web Crypto; disponível em Node 20+ e browsers).
- `currentHash = SHA-256(previousHash | eventType | eventId | timestamp |
organizationId | companyId | eventHash)` — encadeamento GENESIS → A → B → C.
- O ledger **nunca** contém PII — apenas hashes e identificadores de tenant/evento.
- Adulterar um evento quebra a validação de todos os seguintes.

### O que o ledger NÃO garante

- Um atacante com controlo total da base de dados pode **recalcular toda a
  cadeia**. A proteção forte exige **âncoras externas periódicas**
  (publicação do head-hash num notário/serviço independente — futura
  RPG-OS Global Network).
- Não há consenso, mineração, blockchain pública nem rede distribuída nesta fase.

## 6. Secrets (Secure Data Boundary)

Interface `SecureSecretStore` (@rpg/core) com implementação
`NotConfiguredSecretStore` que **falha explicitamente** — nunca guarda
segredos em texto simples. Segredos vivem (no futuro) num backend dedicado
(Supabase Vault / KMS), nunca em tabelas de negócio, logs ou código.

## 7. Threat model (resumo)

| Ameaça                               | Mitigação atual                                  | Residual                                                                                |
| ------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Cross-tenant access / IDOR           | RLS + filtros server-side + correções Fase 1     | Queries antigas com admin client e filtro implícito devem ser revistas continuamente    |
| Client-controlled tenant/permissions | Resolução só na sessão                           | —                                                                                       |
| PII/secrets em logs                  | sanitizeAuditMetadata obrigatório no helper novo | Server actions antigas chamam sanitize ad-hoc; migração gradual para recordAuditEvent   |
| Service-role misuse                  | createAdminClient só em server code              | Revisão manual de novos usos                                                            |
| Integrity forgery                    | Hash chain + validação                           | Recalc completo por atacante com acesso total à BD (mitigação futura: âncoras externas) |
| Hash collision                       | SHA-256 (sem colisões conhecidas praticáveis)    | —                                                                                       |

## 8. Limites e o que NÃO é garantido

- Não há encriptação field-level em repouso para `CONFIDENTIAL` (depende do
  at-rest encryption do Supabase/postgres).
- O ledger não prova _quem_ assinou — é hash chain, não assinatura digital.
- Logs de auditoria antigos não foram reprocessados.
- Não há proteção contra administradores de plataforma legítimos com service
  role (confiança no operador).
