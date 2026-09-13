# RPG-OS — Company ↔ Organization Design (DESIGN ONLY)

> Auditoria de schema (`supabase/migrations`) e código. Nenhuma relação
> inventada; nenhuma migration executada; nenhum código funcional alterado.
> Data: 2026-09-06.

## 1. Current architecture

Dois eixos independentes: `USER → profiles.company_id → companies` (0..1) e
`USER → org_memberships → organizations` (0..N, só ACTIVE conta). Sem FK,
tabela de ligação ou matching entre `companies` e `organizations`.

## 2. Current schema

- `companies(id, legal_name, tax_number UNIQUE NOT NULL, country, legal_form,
  registration_number, email, phone)` — sem morada, sem FK para organizations,
  ENABLE RLS sem policies (só service-role).
- `organizations(id, name, slug UNIQUE, legal_name, tax_number independentes,
  plan_tier, settings, created_by)` — sem FK para companies; policy
  `org_select_member`.
- `org_memberships((organization_id,user_id) UNIQUE, role_key, custom_role,
  status ACTIVE/INVITED/SUSPENDED/REMOVED, is_primary, overrides)` — sem
  policies próprias listadas (via service-role + sessão).
- `profiles(user_id UNIQUE, name, phone, address_id, company_id NULLABLE → companies)`.
- `auth.users`/`public.users(id, email UNIQUE)`.

## 3. Current tenant model

| Domínio | Entidade | Tenant atual | Fonte | RLS | App scope |
|---|---|---|---|---|---|
| Finance | bills/debts/incomes/expenses | user_id + company_id | perfil+sesão | bank/expenses: user | `applyTenantScope` |
| Fiscal invoices | invoices | client_id(=user) ou company_id; sem user_id | perfil | client/company | `.eq(company_id)` obrigatório |
| Fiscal obligations | fiscal_obligations | user_id + company_id | perfil | ENABLE-only | `.or(company,user)` |
| Fiscal Inbox | fiscal_inbox_items | organization_id | sessão (org ativa) | member-read + service-all | `.eq(organization_id)` |
| Documents | documents | owner_user_id ou company_id | perfil | policy real | idem |
| Projects/Quotes | projects/quotes | client_id ou company_id | perfil | policy real | idem |
| Reputation | reviews | organization_id + author/target | sessão | a verificar | `.eq(organization_id)` |
| Workflow | instances | organization_id + requester/approver | sessão | tabelas RLS strict | ambos |
| Government | connections/consents | organization_id + user_id | sessão | member-read | `.eq(organization_id)` |
| Health | connections/consents | person_id (+org opcional, CHECK XOR) | sessão | — | person |
| Mobility | — | N/A (sem tabelas) | — | — | — |
| A Minha Vida | — | sessão (agregação) | sessão | — | collectors |

## 4. Problem

`fiscal_inbox_items.organization_id` não é resolvível a partir de eventos
`company_id` (ex.: emissão de invoice usa `company_id: user.companyId || null`,
`faturacao/actions.ts:292`, sem conhecimento de org). Sem relação formal,
qualquer bridge seria cross-tenant por construção.

## 5. Candidate models

### Model A — `organizations.company_id` (1 company → N orgs)
Prós: 1 coluna, simples. Contras: assume cardinalidade não provada (org
pessoal sem company? org multi-company impossível); nullable enfraquece
garantias; migração de dados ambígua.

### Model B — `company_organizations` (recomendado, ver §7)
Prós: cardinalidade explícita e evolutiva; vínculo como facto auditável com
autor/data; sem tocar tabelas existentes. Contras: mais uma tabela + RLS.

### Model C — Organization canónica, company subordinada
Prós: alinha RBAC/government/health. Contras: reescrever Finance/Fiscal/
Documents para org quebraria o eixo fiscal-legal (NIF vive em companies) e
utilizadores sem org.

### Model D — Company canónica, organization workspace
Prós: alinha Finance/Fiscal. Contras: quebra RBAC, government, health
(person/org), reputação; pessoas sem empresa ficariam sem tenant.

### Other
Manter dualidade permanente sem vínculo (status quo): válido se o inbox for
alimentado apenas por eventos org-nativos futuros (ex.: government
connections, que já têm ambos os IDs). Recomendação: vínculo explícito B,
sem forçar uniformização.

## 6. Cardinality

Necessária: **N↔N potencial, com 1↔1 e 1↔N como casos comuns**
(empresa com 1 org; grupo com N orgs; gabinete com N empresas-clientes).
Evidência: perfis 0..1 company × memberships 0..N orgs já permitem todas as
combinações — o schema de vínculo tem de as suportar, não de as proibir.
Incerteza declarada: sem dados de produção, a distribuição real é
desconhecida; o modelo B cobre todos os casos.

## 7. Recommended architecture

```
companies ◄── company_organizations ──► organizations
   (company_id UNIQUE? não — ver abaixo)   (organization_id)
   + created_by, created_at, status, confirmed_at, confirmed_by
   + UNIQUE(company_id, organization_id)
```

Vínculo criado apenas por ação administrativa auditada (`fiscal.admin` ou
equivalente de governance), nunca por heurística. Finance/Fiscal continuam a
escrever `company_id`; leitura com contexto org resolve via vínculo;
lei
...[truncated 3885 chars]