# RPG-OS — Company ↔ Organization Architecture

> Auditoria baseada em schema (`supabase/migrations`) e código (`apps/web/lib`,
> `apps/web/app`, `packages/core`). Nada aqui inventa relações.
> Data: 2026-09-06. Estado: descritivo + recomendação futura (sem implementação).

## 1. Entidades

| Entidade | PK | FKs relevantes | Notas |
|---|---|---|---|
| `auth.users` | id | — | Identidade autenticada. |
| `public.users` | id | — | Espelho aplicacional. |
| `public.profiles` | user_id UNIQUE | `company_id → companies(id)` NULLABLE; `address_id` | **Um utilizador tem 0..1 company.** Sem FK para organizations. |
| `public.companies` | id | — | Entidade fiscal/legal: `legal_name`, `tax_number UNIQUE NOT NULL`, sem morada, sem FK para organizations. |
| `public.organizations` | id | — | Workspace/RBAC: `name`, `slug UNIQUE`, `legal_name`, `tax_number` (próprios, independentes), sem FK para companies. |
| `public.org_memberships` | (organization_id, user_id) UNIQUE | ambas as FKs; `status` ACTIVE/INVITED/SUSPENDED/REMOVED; `is_primary` | **Um utilizador tem 0..N organizations.** Só ACTIVE conta. |

## 2. Relações existentes vs inexistentes

- Existe: `profiles.company_id → companies.id` (0..1 por utilizador).
- Existe: `org_memberships` (N por utilizador, com role/estado).
- **NÃO EXISTE: qualquer relação `companies ↔ organizations`** — sem FK em
  nenhum sentido, sem tabela de ligação, sem matching por nome/NIF/email em
  código ou migrations. `organizations.tax_number` e `companies.tax_number`
  são colunas independentes sem constraint entre si.
- Consequência: um utilizador pode ter company sem organization, organization
  sem company, várias organizations e (via perfil único) no máximo uma company.

## 3. Tenant model (canónico por domínio, estado real)

| Domínio | Tenant canónico atual | Evidência |
|---|---|---|
| Finance (bills/debts/incomes/expenses) | `user_id` + `company_id` opcional | `applyTenantScope` (`lib/finance/tenant.ts:36`) |
| Fiscal invoices | `client_id` (=users.id) ou `company_id`; **sem `user_id`** | DDL + RLS `client_id/company` |
| Fiscal obligations | `user_id` + `company_id` opcional | DDL + scope app |
| Fiscal Inbox | `organization_id` (membership ACTIVE) | DDL + RLS + loader/writer |
| Documents | `owner_user_id` ou `company_id` | RLS policy real |
| Mobility | N/A (sem tabelas; PREPARED_ONLY) | ausência de DDL |
| Health | `person_id` (+ `organization_id` opcional, com CHECK XOR) | `health_connections`/`health_consents` |
| A Minha Vida | sessão (agrega por cima, sem tenant próprio) | `getVidaModel` |

Não forçar uniformização: cada eixo é legítimo no seu domínio. O erro é
misturá-los.

## 4. Implicações fiscais

- `fiscal_obligations` e `invoices` vivem no eixo company/user; o inbox vive
  no eixo organization. Sem relação formal, **nenhum evento de invoice/
  obrigação resolve com segurança um `organization_id`** — por isso não existe
  INSERT automático no inbox (decisão documentada em `docs/FISCAL-INBOX.md`).
- `entity_type/entity_id` do inbox referenciam sem FK (by design: read model).

## 5. Implicações de segurança

- **HIGH (novo, fora do scope desta fase — NÃO corrigido aqui)**:
  `lib/actionCenter.ts:108,116,125` e `lib/commandCenter.ts:145,158,197`
  comparam `company_id.eq.<organization UUID>` (`orgId = ctx.organization.id`)
  em 6 queries da página inicial. Efeito prático: linhas de empresa invisíveis
  no Command Center (fail-closed acidental); risco teórico de cross-tenant só
  por colisão UUID (desprezável), mas a semântica está errada e deve ser
  corrigida com `companyId` do perfil. Service-role faz bypass ao RLS, por isso
  estes scopes app-level são a única barreira — têm de estar certos.
- `lib/tenant.ts:56-60` (`requireCompanyAccess`): comentário alega resolução
  company-a-partir-da-org mas o código devolve `organization.id` como tenant;
  **função morta** (zero importadores) — risco zero runtime, mas comentário
  enganador; remover ou corrigir quando se tocar no ficheiro.
- RLS: policies reais só em documents/transport/quotes/invoices/projects
  (client/company), bank/expenses, pessoais (user), inbox/government/health
  (membership/person). `companies`, `organizations`, `org_memberships`,
  `fiscal_obligations`: ENABLE sem policies → só service-role; tudo assenta
  em scope app-level explícito.

## 6. Recommended future model

**Modelo C modificado (recomendado)**: organization como tenant canónico de
*acesso/governança*; company como entidade fiscal subordinada ligada por
**tabela de ligação explícita** (`company_organizations(company_id,
organization_id, UNIQUE ambos os lados conforme cardinalidade decidida)`,
criada por ação administrativa auditada — nunca heurística).

- Vantagens: preserva os dois eixos; mapeamento explícito e auditável;
  RLS passa a poder usar membership; Finance/Fiscal/Documents mantêm colunas.
- Riscos: backfill de dados existentes sem vínculo (ficam órfãos = invisíveis
  até vínculo explícito — comportamento seguro por omissão).
- Impacto: A Minha Vida inalterado (agrega por cima); auditoria regista o
  vínculo como evento; memberships inalterados.
- Alternativas rejeitadas: A (`organizations.company_id`) — assume 1:1 que o
  schema não prova; B genérica sem decisão de cardinalidade — igual ao C sem
  semântica; D (company canónica) — quebraria RBAC/Mobility/Health
  person/org-centric.

## 7. Future migration plan (conceptual, NÃO executar)

1. Migration 1 (schema): tabela de ligação + UNIQUE + FKs + GRANT service_role.
2. Backfill assistido: UI admin propõe vínculos (org.name/tax_number vs
   companies por NIF **com confirmação humana explícita** — matching apenas
   como sugestão, nunca auto-apply).
3. Validação: órfãos listados, não migrados silenciosamente.
4. RLS: policy de leitura por membership sobre a ligação.
5. App scope: loaders passam a resolver company via ligação (sessão → org →
   ligação → company), mantendo fallback user.
6. Rollback: DROP TABLE reverte sem perda (dados origem intactos).
7. Testes: cross-tenant (org A não vê company de org B), órfãos invisíveis.
8. Rollout faseado por organização; 1 migration + backfill manual assistido.

## 8. Explicit non-goals

Sem matching automático por nome/NIF/email; sem `company_id === organization_id`;
sem UUID assumptions; sem INSERT automático no inbox; sem promoção a LIVE;
sem AT/e-Fatura/OAuth; sem novas permissions; sem RLS global.
