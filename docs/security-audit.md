# Auditoria de segurança — camada de aplicação + RLS

Data: 2026-09-27 · Escopo: (1) usos de `createAdminClient()` (service_role, bypass de
RLS) em server actions, páginas server-side e API routes; (2) verificação estática
das políticas RLS em `supabase/migrations/`.

## Contexto e método

A aplicação usa o Supabase com `service_role` em praticamente toda a lógica de dados
(server actions/páginas) via `createAdminClient()`. Isso neutraliza a RLS do Postgres
como primeiro filtro: a **camada de aplicação é o único controlo de isolamento de
tenants (cross-tenant) e authorization**. Esta auditoria varreu **todos** os usos de
`createAdminClient()` e impôs o padrão **fail-closed**:

- **Sem `companyId`** → só os PRÓPRIOS registos (`client_id` / `user_id` /
  `owner_user_id` do ator). Nunca query global.
- **Com `companyId`** → `company_id` do ator; nos modelos "pessoal/empresa"
  (contas bancárias, audit_logs, documentos) usa-se `or(company, self)`.
- **Permissões** → `hasPermission(permissions, "modulo.regra")` via `getSessionContext()`
  em todas as áreas restritas (administração, fiscal, workflow, plataforma).

Gates em cada lote: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
Suite no início: 127 ficheiros / 1832 testes. No fim: 152 ficheiros / 1926 testes.

## Eixos de tenant

| Eixo | Significado | Implicação para scope |
|---|---|---|
| `company_id` | Empresa (faturação, fiscal, operação comercial) | Filtrar por `company_id` do ator |
| `organization_id` | Organização (governança, canais, workflows) | Filtrar por `organization_id` da org ativa |
| `client_id` / `user_id` / `owner_user_id` | Pessoa | Self-service sem empresa |

`getCurrentUser()` resolve o `companyId`; `getSessionContext()` resolve org +
permissões (`hasPermission` de `@rpg/core`).

## Fixes por commit

| Commit | Fecho em |
|---|---|
| `3ae1cf8` | **P0** — atualiza Next 16.3.1→16.3.6 (2 CVEs RCE não autenticadas) |
| `d442eee` | **P0×2** — exfiltração cross-tenant anónima em páginas de leitura |
| `90fc1d6` | **P0 #3/#4** — leak de documentos sem tenant; hijack de perfil (update por `id` arbitrário) |
| `d61e9bd` | **P1×3** — dashboard fail-closed; cancelar workflow de instância de outra org; `api/search` com eixos (perm + org/user/company) |
| `ccdfac7` | **P1×5** — ownership/permissões em banco, documentos, portal-da-queixa, comunicacao, governo |
| `0b833c8` | **P1** — listagens de ações com fallback global (sem scope) passam a fail-closed |
| `5a01b5a` | auditoria AT com o ator real (removido actor fixo `"system"`) |
| `9212228` | comunicacao: não listar canais pessoais de terceiros |
| `d2e9974` / `af21cf1` | `api/mercado/quote` exige `marketplace.quotes.create` (+ teste) |
| `cf0f645` | regressão do fallback fail-closed da faturação (+ teste) |
| `d19b99e` | documentos: atribuir a terceiro só se membro da mesma empresa (`company_employees`) |
| `4810342` | documentos: verificar/rejeitar docs de terceiros exige `documentos.manage` |
| `b994436` | assinatura: remover `createAdminClient` de componente cliente (service_role no browser) |
| `4ba3d9e` | **P1** obras: 4 mutações escreviam em qualquer projeto por UUID sem sessão/ownership (`assertProjectAccess`); clientes: `getClientById` escopava projects/quotes |
| `72b3d58` | 6 P2 (ver abaixo) |
| `448522d` | **mercado** — 3 gaps: `api/mercado/pedido` sem `marketplace.requests.create`; auto-cota (dono cotava o próprio pedido); auto-aceitação (dono aceitava própria proposta → auto-contrato/pagamento) |
| `1fd40d9` | **P0 webhooks + 6 P1 + 3 P2** em rotas API (ver "Varredura de rotas API") |
| `9477820` | **2 P2** (categories, workflows) + **saude** alinhada às permissões declaradas (ver "Alinhamentos pós-varredura") |
| `2b7ef0f` | backfill do hash na tabela |
| `e078c9e` | **varredura de permissões usadas vs concedidas** + limite 8 KiB em `api/memories` (ver "Varredura de permissões") |
| `ece42a7` | **P0 segredos** — password admin removida da seed migration; teste de regressão de segredos (ver "Varredura de segredos/env") |
| `9fbe445` | **P1 RLS** — leitura global de moradas fechada (addresses); teste de regressão de policies (ver "Revisão RLS") |
| `256f022` | **Reativação `saude.manage`** — grant na baseline pessoal self-scoped; testes (ver "Reativação saude.manage") |
| `908bd4c` | **Storage RLS espelhado** — guarda estática de buckets/policies storage (ver "Revisão RLS — storage") |
| `919d2a0` | **Guarda do caminho RBAC legacy** — grants colon mortos (ver "Caminho RBAC legacy — colon") |
| `1e1d3b5` | **Fronteira web** — `X-Powered-By` desligado + espelho real dos headers/`public`/dev-only (ver "Fronteira web — headers e guardas dev-only") |
| `822e273` | **Cobertura RLS por tabela** — nenhuma tabela nova nasce sem RLS (ver "Cobertura RLS por tabela") |
| `4e5eb3f` | **SECURITY DEFINER** — guarda de `search_path` com `pg_temp` (ver "SECURITY DEFINER — search_path") |
| `88ed34f` | **EXECUTE grants** — nenhuma função SECURITY DEFINER com EXECUTE líquido para `anon`/`public` (ver "EXECUTE grants em funções") |
| `ed0faa6` | **Realtime publication** — só tabelas allowlist na publication `supabase_realtime` (ver "Realtime publication") |
| `cc37c56` | **Migration naming/order** — convenção `YYYYMMDDHHMMSS` + ordem cronológica (ver "Migration naming/order") |
| `3b511df` | **CI** — workflow de gates (typecheck/lint/test/build) em push/PR, binding das 8 fases de guardas (ver "CI") |

## Fechos da última fase (6 P2, `72b3d58`)

1. **mercado/pedidos/[id]** — as propostas de um pedido eram devolvidas a qualquer
   provider com uma proposta (exposição de preços da concorrência). Novo
   `loadVisibleQuotes`: owner vê todas; provider vê só as próprias.
2. **comunicacao `startDmAction`** — DM para qualquer `user_id` global. Agora exige
   colegialidade: `org_memberships` ATIVO na org ativa **ou** `company_employees` da
   mesma empresa.
3. **faturacao `createInvoiceAction`** — email arbitrário criava `users`/`profiles`
   com NIF fabricado `999999990` (account-squatting + dados fiscais falsos). Cria
   perfil consumidor com `tax_number: null`, `company_id`, validação de email, reuso
   por email e audit `INVOICE_GUEST_CREATED`.
4. **documentos `getDocumentsList`** — a coleção de docs da empresa ficava disponível
   a qualquer membro (contra a copy "administradores autorizados"). Só quem tem
   `documentos.manage` vê os da empresa; os restantes veem apenas os próprios.
5. **clientes `getClientById`** — `audit_logs` do cliente devolvidos sem scope
   (cliente partilhado expunha o registo das outras empresas). Escopados via
   `or(company_id.eq.X, company_id.is.null)`.
6. **PortugueseAuthAdapter** — stub CMD/CC devolvia `authenticated: true` com NIF
   `999999990` em qualquer ambiente. Agora, em produção, não inicia login sem AMA
   configurado e recusa qualquer verificação (não há validação real implementada); o
   stub fica confinado a dev/demo.

## Varredura de rotas API (√ todas as `app/api/**`)

Varredura exaustiva das 56 rotas de `apps/web/app/api/` (3 subauditorias paralelas).
Fechos aplicados nesta fase:

**P0 — `api/webhooks/payments`**: o replay-protection (dedup in-memory keyed por event
id, 24h) era marcado ANTES da verificação de assinatura. Portanto, um caller anónimo
podia envenenar o cache com event ids arbitrários e causar DoS (409) em webhooks
genuínos dos providers. Reordenado: a autenticidade é verificada primeiro
(`paymentEngine.processWebhook`), e só depois se marca/migo o dedup. Testes: 4.

**P1 — `api/rgpd/export`**: a autorização comparava o email em bruto mas a query
filtrava normalizado (`trim().toLowerCase()`). Agora authz e query usam o mesmo valor
normalizado; um pedido com outro email (mesmo com caixa diferente) → 403 sem tocar na
BD. Testes: 3.

**P1 — `api/administracao/governo/connections` (+ `[id]`)**: os GET/POST/PUT devolviam
`provider_config` (credenciais/certificados) via `select("*")`. Sanitização
`redactConnection()` (strip `provider_config`) em listagem, detalhe, criação e update.

**P1 — `api/devices/push`**: qualquer autenticado despachava um broadcast para a
fleet inteira sem permissão. Agora exige `comunicacao.manage` (getSessionContext)
antes de criar payload/registar auditoria. Testes: 3.

**P1 — `api/sibs/mbway`**: `invoiceId` nunca era validado (IDOR sobre faturas de
outras organizações). Agora valida ownership (`client_id` do ator OU `company_id` da
sua empresa) → 404/403 antes de qualquer tentativa no gateway. Testes: 3.

**P1 — `api/search`**: o eixo fiscal/empresa vinha de `profiles.company_id` (empresa
legada) enquanto as permissões vêm da org ativa — um utilizador com permissões na org
A via dados da empresa B. A empresa passa a resolver-se da **org ativa via bridge
`company_organizations` (status ACTIVE)**, com fallback self (`profiles.company_id`)
apenas na ausência de org. Queries de perfis/orçamentos/faturas/obras/financeiro/docs
passam a `.in(company_ids)`.

**P1 — `api/auth/callback/cmd`**: a rota auto-provisionava um utilizador VERIFIED a
partir de `token`+`tx`. O adapter já falha fechado em produção; agora a ROTA também
(guard explícito `NODE_ENV === production` → redirect de erro), defesa em profundidade.

**P2 — `api/session-context`**: devolvia `200` com `ctx: null` para anónimos +
podia ser cacheado. Agora `401`, com `export const dynamic = "force-dynamic"`. Testes: 2.

**P2 — `api/rgpd/delete`**: `Promise.all` descartava erros das 4 operações de
anonimização → "erasure parcial" era reportada como sucesso (violação RGPD Art. 17).
Erros agora coletados; qualquer falha → 500. Testes: 2.

## Alinhamentos pós-varredura (2 P2 + saude)

**P2 — `api/categories`**: o catálogo público (categorias do mercado) era lido via
`createAdminClient` (service_role). A RLS já concede SELECT a anon/authenticated
(`categories_read_active`, `active = true`); trocado para o cliente de sessão (RLS
respeitada) — removida a escalada desnecessária. Testes: 2.

**P2 — `api/admin/workflow-definitions`**: o gate da rota aceitava `admin.view` OU
`workflows.manage`, mas `getWorkflowDefinitionsAction` exige exclusivamente
`workflows.manage` → um ator com só `admin.view` passava na rota e recebia `[]`
silencioso. Gate alinhado → 403 explícito. Testes: 3.

**P3 — `api/saude/*` (renomeação de permissões)**: as 9 rotas gateavam com
`health.view`/`health.manage` — permissões que NÃO existem (módulo registado `saude`;
baseline concede `saude.view`; `saude.manage` não existe em nenhum papel). Renomeadas
para o espaço declarado `saude.*`:
- Vistas (`saude.view`, baseline para todos os autenticados) reativadas — todos os
  queries são self-scoped (`person_id = ator`), sem exposição cross-tenant;
- Mutações (`saude.manage`) ficam **fail-closed** (403) até decisão de produto
  (desde então **reativado** — ver "Reativação saude.manage (decisão de produto)").
Testes: 4 (connections GET/POST).

**Aceites documentados (sem fix)**:
- **`api/mobilidade/*`**: stubs com dados mock hardcoded; `connectionId` nunca validado
  contra a BD. Em produção os fake providers falham fechado (`ALLOW_FAKE_PROVIDERS`).
- **Arquitectura**: existem 2 caminhos de auth nas rotas — `requireAuth()`
  (`lib/supabase/auth.ts`, single-company legacy) e `getSessionContext()`
  (`lib/session.ts`, org + permissões). Nenhuma rota administrativa deve usar o
  primeiro para decisões de RBAC; `role === "ADMIN"` de `user_roles` é grant
  system-wide (não tenant-scoped) — mantido para capacidade de platform admin.

## Varredura de permissões (usadas vs concedidas)

Script estático: extraiu as permissões declaradas (`MODULES` + `PERMISSION_ACTIONS` +
baseline de `constants/permissions.ts`, grants por papel em `orgRoles.ts`/`roles.ts`/
`platformAuth.ts`) e cruzou com os literais `hasPermission("...")`/`guard("...")` em
`apps/web` + `packages/core/src` (fora de testes).

**Fix 1 — baseline `reputacao.view` → `reputation.view`** (permissions.ts:86): o módulo
está registado como `{ id: "reputacao" }`, mas TODO o resto do sistema (orgRoles.ts,
roles.ts, serviços, rotas `/reputacao`) usa o espaço `reputation.*`. Resultado: o
módulo de reputação pessoal era inacessível a utilizadores sem organização (baseline
nunca coincidia com o gate). Baseline agora alinhada ao namespace usado; teste regressa
`hasPermission(baseline, "reputation.view") === true`. Sem drift residual de
`reputacao.*` em código.

**Fix 2 — P2 `api/memories` (tamanho do `value`)**: `MemoryService.set` aceitava valor
pessoal sem limite (blob arbitrário). Novo `MAX_VALUE_BYTES = 8192`; valores acima são
rejeitados (403 pelos gates existentes) com `"Valor inválido (não pode ser null, array
ou exceder 8 KiB)."`. Mantém a exclusão de `null`/arrays. Testes: 2 novos.

**Aceites documentados (sem fix)** — gates sem grant que só `OWNER`/`FOUNDER` (papéis
com `["*"]` em orgRoles.ts) alcançam via wildcard; fail-closed para todo o resto:
- `government.view` / `government.manage`;
- `marketing.*` (view/manage);
- `platform_fees.manage`;
- `workflows.manage` (derivação: só guard no service, gate na rota);
- alias morto `administracao.view` (nada o usa — não é leak, é lixo de nomenclatura);
- `saude.manage` — **reativado** (ver "Reativação saude.manage");
- `tarefas.edit` — coberto por `tarefas.manage` (implicação), não é bug.

**Ruído excluído (não-RBAC)**: eventos de auditoria (`reputation.responded`,
`at.connection.created`, `contract.activated`, `routing.*`); scopes de consentimento
(`health.read.*`, `mobility.read.*`); capacidades de AI actors (`aiActor.ts`,
`MarketplaceAiAgent`: `contracts.edit`, `orders.edit`, `evidence.create`,
`marketplace.edit`); URLs; textos `module.action` em granularRbac.ts.

## Varredura de segredos/env

`git grep` por literais (tokens `sk-`/`ghp_`/`AKIA`/JWT `eyJ…`, chaves privadas,
connection strings, atribuições de `password`/`secret`/`api_key`) sobre ficheiros
tracked + `.env.example`/`config.toml`/CI. Resultado: **1 achado real, P0**.

**P0 — password admin plaintext em `20260820240000_seed_admin_user.sql`**: a migration
embutia `crypt('rrtm14403874@', gen_salt('bf'))` (bootstrap do admin
`moutinho@rpg-os.pt`), com o plaintext duplicado no INSERT e no UPDATE, mais o
telemóvel pessoal `910000000` na profile. Atribuição de `createAdmin`-style que não é
de app mas é de **bootstrap**: credencial previsível em todos os ambientes criados a
partir do repo. Fix:
- Password apenas via GUC `app.initial_admin_password` (`current_setting(guc, true)`);
  sem GUC → `encrypted_password` NULL (conta sem password: login só por magic link /
  password reset) + `RAISE LOG` instrutivo. Nunca versionar segredos;
- Telemóvel pessoal → `NULL` (`profiles.phone` nullable);
- Cabeçalho da migration documenta o mecanismo (rótulo "Moutinho" removido do título).

**Regressão (teste novo)**: `apps/web/lib/__tests__/migrationSecrets.test.ts` (4
testes) — nenhuma migration/seed embute password inline em `crypt()`, não contém JWTs
type `eyJ…`, e `.env.example` só tem placeholders nas variáveis secretas.

**Resultado da varredura — limpo**:
- Sem `.env` em git (`apps/web/.env.example` é o único ficheiro env tracked;
  `.gitignore` cobre `.env` / `.env.*` excepto o example);
- `supabase/config.toml` só com `env(VAR)` (nunca valores);
- Chaves privadas/SOAP: apenas fakes de teste e validação de input em
  `atProvisioning.ts`; sem connection strings; sem tokens reais;
- `NEXT_PUBLIC_` não expõe `service_role` (client usa publishable key; service role é
  server-only via `SUPABASE_SERVICE_ROLE_KEY`).

**Hygiene documentada (sem fix agora)**: a seed ainda referencia o email do dono
(`moutinho@rpg-os.pt`) e o NIF `501234567` — dados pessoais do próprio dono, já
usados como placeholders/aliases em `login/actions.ts`, `IntegracoesClient.tsx` e
vários testes; param etrizar por ambiente é possível mas tem blast radius. Ação
**externa obrigatória** (fora do código): rotacionar a password do admin em produção —
o plaintext esteve no histórico git antes deste commit.

## Revisão RLS (supabase/migrations)

Extractor estático de políticas por tabela sobre `supabase/migrations/` (106
`CREATE POLICY` em 135 tabelas public). **Todo o esquema tem RLS enabled**; a
postura é deny-by-default (maioria das tabelas com RLS_ON + 0 policies) ou
self-scoped (`auth.uid()`/`is_org_member`/`has_org_permission`). O serviço expõe
`anon` a apenas 2 catálogos públicos com filtro (`categories.active`,
`provider_offerings` PUBLISHED/APPROVED). As tabelas com dados fiscais/pagamentos
expõem SELECT a membros de org/company — a app sobrepõe `hasPermission` na camada
de serviço (RLS é defesa em profundidade; service_role faz bypass).

**P1 — `addresses_authenticated_read`** (Vaga M-G/V): única policy
`FOR SELECT TO authenticated USING (true)` sobre dados PESSOAIS. Moradas são dado
pessoal por referência (`profiles.address_id`/`companies.address_id`) e a policy +
default ACL expunha todas as moradas a qualquer autenticado (cross-tenant, RGPD).
Sem consumidores legítimos: a app só escreve `addresses` via `createAdminClient()`
(`registo/actions/{cliente,empresa,eni}.ts`). Fix (idempotente, padrão da Vaga
M-G/U): `DROP POLICY ... addresses_authenticated_read` + `REVOKE ALL ... FROM
anon, authenticated` → deny-by-default e sem "pólvora defensiva" se a RLS for
desligada. Teste de regressão (3): `USING (true)` fora de catálogos RBAC tem de
estar dropped; `anon` restrito aos 2 catálogos com filtro; addresses é dropped e
revogada.

**Aceites documentados (por desenho)**:
- Catálogos RBAC `roles`/`permissions`/`role_permissions` legíveis por
  authenticated (metadados de autorização, necessários para RBAC client-side);
- `health_connections_read_person`/afins: subquery `om.user_id = auth.uid()`
  reduz a self-only — MENOS permissivo que o intuito de partilha por org;
  fail-closed, sem leak (rever quando a partilha de saúde com org for produto);
- Leituras de org/company em financeiro/marketing/government/revenue (membership
  ACTIVE) — a fronteira de autorização fina está na camada de app;
- Reputação/evidence/marketplace: scoped por tenant + partes, coerente com produto.

## Revisão RLS — storage (buckets e storage.objects)

Espelho da varredura RLS no schema `storage`: o endurecimento vivia só em
migrações (M-G/I `documents` privado; M-G/P owner-only nos buckets sem policy)
sem guarda estática — agora fechado (`storagePolicies.test.ts`, 5 testes).

**Estado líquido (todas as migrações)**:
- `documents` **privado** (`public = false`, flipped na M-G/I) — dados fiscais/
  certidões/dados de saúde; o app lê/escreve apenas via admin server-side,
  **zero `getPublicUrl`** no repo;
- `project-photos` **único bucket público por desenho** (fotos de obras/imóveis
  para o marketplace); `marketplace-evidence` e `reputation-attachments`
  também privados;
- Políticas "Public Access for Documents/Photos" (bucket público + SELECT sem
  owner) **dropadas** — nenhuma sobrevive em efeito líquido;
- 16 políticas owner-only (`*_owner_select/insert/update/delete` por bucket)
  escopam `owner_id = auth.uid()::text`.

**Invariantes testadas**: nenhum "Public Access for *" survive (net-effect);
toda policy de storage.objects não-dropada é owner-only; `documents` privado e
nunca reaberto; `project-photos` é o único bucket público permitido; as 4
`documents_owner_*` (via execute) escopam a `auth.uid()`.

## Caminho RBAC legacy — grants colon mortos (guarda)

Existem dois modelos de permissões no repo:
- **moderno (dot)**: `getSessionContext()` + `hasPermission(ctx.permissions,
  "modulo.acao")` — usado por TODAS as rotas de RBAC fino;
- **legacy (colon)**: `getCurrentUser()` resolve `SYSTEM_ROLES`
  (`packages/core/src/constants/roles.ts`) cujas permissões têm namespace de
  dois-pontos (`saft:export`, `company:manage`, `invoices:read`, …). Esses
  literais NUNCA coincidem com os gates dot — são **dead grants** hoje. Os
  únicos consumidores possíveis seriam `requirePermission`/`requireRole` de
  `lib/auth/rbac.ts`, que **não têm nenhum caller no app** (confirmação via
  grep: só as definições em `rbac.ts` e um helper ctx-no `session.ts`).

O risco de regressão: se alguém ligar uma rota a `requirePermission("saft:export")`,
um ACCOUNTANT passa (SYSTEM_ROLES concede-o) — grant real fora do modelo dot
declarado, inconsistência de RBAC. **Guarda estática** (`legacyRbacGates.test.ts`,
3 testes): (a) `@/lib/auth/rbac` só pode ser importado para `requireAuth`; (b)
`requirePermission(`/`requireRole(` nunca são invocados no app (fora das
definições); (c) nenhum gate (`hasPermission`/`guard`/`requirePermission`/
`requireRole`) recebe literal dois-pontos.

**Aceite documentado (sem fix)**: os grants colon em `SYSTEM_ROLES` são lixo de
nomenclatura (fail-closed — nada os consome); mantidos por compatibilidade com
o `getCurrentUser()` de PWA/smartwatch, que só usa `role`/`permissions` em
contextos self (sync). Não é leak.

## Fronteira web — headers e guardas dev-only

**Fix — `X-Powered-By` desligado**: o repo não tinha `next.config.ts`, logo o
Next.js servia `X-Powered-By: Next.js 16.3.6` (fingerprint de versão/framework em
todas as respostas). Criado `apps/web/next.config.ts` com `poweredByHeader: false`.

**Bug encontrado no espelho existente**: `apps/web/middleware.test.ts` era uma
**tautologia** — testava uma cópia *hardcoded* dos headers definida dentro do
próprio teste (o CSP estava duplicado literal nas linhas 46–57 do ficheiro), sem
ler `middleware.ts`. Passaria 100% verde mesmo que alguém apagasse todos os
headers de segurança do middleware. **Reescrito** para ler o source real e
verificar os 3 invariantes que o teste original *pretendia* cobrir: os 5 headers
(`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy`, `Content-Security-Policy`), as directives críticas do CSP
(`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`,
`form-action 'self'`, `default-src 'self'`) e as ligações externas necessárias
(Supabase/Stripe/AT).

**Nova guarda — `webFrontier.test.ts`** (4 testes, leitura local):
- `next.config.ts` mantém `poweredByHeader: false`;
- `apps/web/public/` só contém ativos estáticos numa **allowlist** (ícones PWA,
  `manifest.json`, `sw.js` e o `sw-version.json` gerado no build e gitignored) —
  apanha qualquer `.env`, config ou dump de dados dropped aí;
- `.env.example` nunca habilita dev-only: `ALLOW_FAKE_PROVIDERS=false` é
  obrigatório e `ALLOW_DEMO_ACCESS` tem de ficar comentado;
- `api/auth/callback/cmd` (auto-provision da Chave Móvel Digital) mantém a
  guarda `NODE_ENV === "production"` **antes** de qualquer `createAdminClient()`
  ou `.insert(` no source — impede alguém mover a guarda para depois do
  provisionamento.

## Cobertura RLS por tabela (fail-closed por default)

O footgun clássico do Supabase: `CREATE TABLE` nasce **sem** Row Level
Security, logo a tabela fica legível por `anon`/`authenticated` via PostgREST até
alguém se lembrar do `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Nem o
typecheck nem o build apanha isso — a falha só aparece em produção, e é um dump
de tabela. As guardas existentes (`rlsPolicies.test.ts` / `storagePolicies.test.ts`)
só cobriam `public.*` e os buckets de storage, ou seja: **não havia nada que
impedisse uma tabela nova sem RLS**.

Nova guarda `rlsCoverage.test.ts` (5 testes) sobre as 67 migrations, com parsing
**comment-aware** (comentários SQL removidos antes da extração — sem isso o
comentário `-- SEM DROP; idempotente (CREATE TABLE IF NOT EXISTS / DO BLOCK)`
era lido como uma tabela chamada `if`):

| Invariante | Estado |
|---|---|
| Toda tabela `CREATE TABLE` tem `ENABLE ROW LEVEL SECURITY` | 115/115 |
| Nenhuma migration faz `DISABLE ROW LEVEL SECURITY` | 0 ocorrências |
| Toda tabela com RLS é criada nas nossas migrations (sem tabelas fantasma) | 115/115 |
| Tabelas com RLS mas **zero** policies (deny-all) estão em allowlist | 11 declaradas |
| Nenhuma migration faz `GRANT ALL` em tabelas | 0 ocorrências |

**Allowlist deny-all** (RLS ativo, mas nenhuma policy — inacessíveis para
`anon`/`authenticated`, servidas só via `service_role` no backend): `companies`,
`health_audit_integrity`, `health_sync_history`, `integrity_ledger`,
`invoice_items`, `payments`, `project_materials`, `project_photos`,
`project_tasks`, `quote_items`, `transport_document_items`. Uma tabela nova
nesta situação **quebraria a app em silêncio**, por isso fica num allowlist
explícito: nova entrada = decisão deliberada, não acidente.

**Decisão documentada — sem `FORCE ROW LEVEL SECURITY`**: 0 ocorrências no repo,
e é intencional. O backend usa `service_role` (admin client) extensivamente
(downloads de storage, upserts de perfil, sync de dispositivos); `FORCE RLS`
aplicaria RLS também ao dono da tabela e bloquearia o próprio backend. O que a
RLS protege é o que o browser alcança: `anon` e `authenticated`. O risco residual
aceite é o `SECURITY DEFINER` mal escrito (já auditado nas vagas anteriores).

## SECURITY DEFINER — search_path

Em PostgreSQL, uma função `SECURITY DEFINER` executa com os privilégios do
DONO (tipicamente `postgres`), que **bypassa RLS** e tem acesso total aos dados
RGPD. Se `SET search_path` não incluir `pg_temp` explicitamente, um atacante
pode criar um objeto malicioso no schema temp e **sequestrar a resolução de
nomes** referenciados no corpo — executando SQL arbitrário como owner.

Prova empírica documentada na migration `20260929000000_rls_search_path_pgtemp.sql`:
com `search_path='public'`, o Postgres resolve `pg_temp.<nome>` ANTES de qualquer
schema da lista quando `pg_temp` NÃO está listado — um `create temp table`
fake no `pg_temp` passa a ser resolvido em vez da tabela real.

**Hardening já aplicado**: `ALTER FUNCTION ... SET search_path TO 'public', 'pg_temp'`
nas 4 funções de autorização (`has_org_permission`, `is_org_member`,
`is_comms_member`, `comms_auto_join_creator`) + `SET search_path = vault, public, pg_temp`
nos wrappers do vault (`rpg_vault_*`) + `SET search_path to 'public', 'pg_temp'`
nos helpers de recursão (`is_same_company`, `is_same_project`, etc.).

**Guarda estática nova** (`securityDefiner.test.ts`, 3 testes, parse comment-aware):
- toda função `SECURITY DEFINER` tem `SET search_path` (no CREATE ou num ALTER posterior);
- todo `search_path` efetivo inclui `pg_temp`;
- nenhum bloco `SECURITY DEFINER` fica sem o delimitador `$$` de fecho.

A guarda reconhece ambos os mecanismos (CREATE + ALTER) e aceita qualquer schema
(`public`, `rpg_vault`, etc.).

## EXECUTE grants em funções SECURITY DEFINER

Uma função `SECURITY DEFINER` executa com os privilégios do DONO
(tipicamente `postgres`), que **bypassa RLS**. Se `anon` ou `public`
(que inclui `anon`) tem EXECUTE numa função SECURITY DEFINER, um
atacante pode chamá-la diretamente via Postgrest (`/rpc/<nome>`) e
executar SQL como owner — bypass total de RLS e acesso a dados RGPD.

**Hardening já aplicado**: `20260929020000_rls_anon_execute_minimize.sql`
revogou EXECUTE de `anon`/`public` em 7 funções booleanas de autorização
(`has_org_permission`, `is_org_member`, `is_comms_member`, `is_same_company`,
`is_same_project`, `service_request_is_for_client`,
`service_quote_is_for_provider`, `reputation_in_tenant`).

**Guarda estática nova** (`functionExecuteGuard.test.ts`, 3 testes, parse
comment-aware ordenado por migration, computando o efeito líquido de
GRANT/REVOKE):
- nenhuma função `SECURITY DEFINER` tem EXECUTE líquido para `anon`;
- nenhuma função `SECURITY DEFINER` tem EXECUTE líquido para `public`;
- nenhuma função (qualquer) tem EXECUTE líquido para `public` sem estar
  numa allowlist explícita.

A guarda reconhece GRANT/REVOKE em cascata (o REVOKE posterior ao GRANT
é computado como efeito líquido correto). Aceita qualquer schema.

## Realtime publication

O Supabase Realtime broadcast de mudanças de tabelas para clientes
via WebSocket. Se uma tabela sensível (saúde, documentos, etc.) for
adicionada à publication `supabase_realtime`, qualquer cliente
autenticado pode subscrever e receber updates em tempo real de
dados sensíveis — mesmo que a API esteja bloqueada.

Hoje só `comms_messages` está na publication (intencional: o
feature de mensagens precisa de real-time). Mas não há guarda
estática que impeça regressão: se alguém adicionar
`ALTER PUBLICATION supabase_realtime ADD TABLE public.health_connections`,
nenhum teste apanha.

**Guarda estática nova** (`realtimePublication.test.ts`, 2 testes,
parse comment-aware):
- toda tabela na publication `supabase_realtime` está numa allowlist
  explícita (hoje: `comms_messages`);
- nenhuma tabela sensível (saúde, documentos, pagamentos, reputação,
  vault, audit, profiles, users, etc.) está na publication.

## Migration naming/order

O Supabase CLI espera migrations com prefixo `YYYYMMDDHHMMSS_nome.sql`.
Migrações fora da convenção (ex.: `0001_...`) não são reconhecidas pelo
`supabase db diff` / `supabase migration list`, o que quebra o fluxo de
deploy e pode causar conflitos silenciosos de ordem.

**Achados reais** (o teste apanhou):
- 2 migrations com prefixo legado `NNNN_` (`0001_rpg_os_core`,
  `0004_grant_service_role_permissions`) — criadas antes da convenção.
  **Não renomeadas**: já estão aplicadas em produção e renomear corromperia
  o histórico do `supabase_migrations.schema_migrations`. Allowlist
  explícita no teste.
- 1 timestamp duplicado: `20260929100000` é usado por
  `20260929100000_rls_addresses_hardening.sql` e
  `20260929100000_rls_supabase_functions_internal_hardening.sql`.
  **Risco aceite**: a ordenação é determinística (alfabética dentro do mesmo
  prefixo). TODO: corrigir num follow-up renomeando uma para `20260929100001`.

**Guarda estática nova** (`migrationNaming.test.ts`, 3 testes):
- toda migration segue `YYYYMMDDHHMMSS_nome.sql` (allowlist para as 2 legadas);
- as migrations estão em ordem cronológica crescente pelo prefixo;
- não há timestamps duplicados (allowlist para o conhecido).

## Reativação saude.manage (decisão de produto)

As mutações de saúde (`saude.manage` — criar/editar/eliminar ligações e
consentimentos nos endpoints `api/saude/{connections,consents}*`) estavam
**fail-closed** desde a varredura (permissão não concedida a nenhum papel),
mantendo saudavelmente bloqueada uma funcionalidade pessoal pretendida. Decisão
de produto (confirmada): **reativar via baseline pessoal** — `saude.manage`
adicionado a `PERSONAL_BASELINE_PERMISSIONS`. Não é escalada de privilégio nas
mutações: todas as rotas são self-scoped a `person_id = ctx.user.id` (+ scoping
org membership quando em contexto org/company), pelo que o grant só permite ao
ator gerir as SUAS ligações/consentimentos de saúde. Testes: baseline (`saude.view`
+ `saude.manage`), 403 sem a permissão, e POST 201 + self-scoping verificado.

## Fecho do módulo mercado (`448522d`)

1. **`api/mercado/pedido` POST** não verificava `marketplace.requests.create` (a
   action `createRequestAction` verificava) — qualquer autenticado criava pedidos.
   Agora 403 sem tocar na BD.
2. **Auto-cota**: o dono do pedido podia cotar o próprio pedido (`submitQuoteAction`
   + rota `/api/mercado/quote`). Recusado quando `request.client_id === ator`.
3. **Auto-aceitação**: o dono podia aceitar a própria proposta → auto-contrato,
   auto-milestones, auto-pagamentos e garantias (fraude de integridade). Recusado
   quando `quote.provider_id === ator`.

Resto do módulo verificado OK: ownership em milestones (provider)/aprovação (client),
`getContractAction` client OU provider, lista de contratos `or(client_id, provider_id)`,
evidências com dupla verificação (README do core deny-closed + rota), feed com
`marketplace.*` e status PUBLISHED/APPROVED.

## Módulos varridos e estado final (fail-closed)

- **OK:** banco, aprovacoes, agenda, diario, tarefas, conhecimento, comunicacao,
  clientes, documentos, faturacao (lista/detalhe/ganhos/relatorios/submissoes/
  credenciais AT/convidados), fiscal (obrigações, deduções, IRS, preparação),
  administração (page, [section], membros, governo, fiscal, assinatura,
  taxa-plataforma, workflows), guias, integrações (portal-da-queixa, gov), marketing,
  mercado, notificações, obras, reputação (reviews e métricas), dashboard, root page,
  `api/search`, `api/mercado/quote`, `lib/audit`, `lib/commandCenter`/`actionCenter`,
  `lib/feeConfig`, `lib/at/*` (credentialResolver, connectivity, handshake),
  `lib/life/tenant`.

## RLS que a BD deve espelhar (defesa em profundidade)

### Verificação (estática, 2026-09-27) — políticas em `supabase/migrations/`

Estado: 4 de 5 itens **já espelhados**; `documents` parcial (gap aceite). A BD não
tem função/view de permissões (`resolveEffectivePermissions` vive só em TS) — o
espelho usa helpers `stable security definer` com `set search_path to 'public',
'pg_temp'` (`20260929000000`/`20260929010000`) e grants mínimos via série M-G
(`20260929020000`–`20260929100000`: revoke anon em 95 tabelas, tables zero-policy,
`truncate/references/trigger`, functions execute).

1. **documents** — ⚠️ **parcial / gap aceite**. Política `Users can manage own
   documents` (`20260820280000` L77) = `owner_user_id = auth.uid()` OU empregado da
   mesma empresa (via `profiles.company_id`), FOR ALL. Mais ampla que a nova regra do
   app (`documentos.manage` para docs da empresa; `72b3d58`). Justificação do gap:
   - O app lê/escreve `documents` EXCLUSIVAMENTE via admin client (service_role,
     bypass de RLS); `getPublicUrl` ausente no repo; os clientes que o têm não
     consultam tabelas de negócio como `authenticated` (o `createClient` de
     `lib/session.ts` só usa `auth.getUser()`). Não existe superfície direta.
   - Espelhar `documentos.manage` em SQL duplicaria `resolveEffectivePermissions`
     (role_key + custom_roles + override + baseline) — drift com duas fontes de
     verdade. Sem custo/benefício enquanto não houver cliente `authenticated` direto.
   - Mitigação a montante já aplicada: bucket `documents` privado + owner-only
     (`20260928000000`).
2. **service_quotes** — ✅ `20260918000000` (provider own / client do pedido) corrigido
   em `20260929010000` para helpers SEM recursão infinita; `service_quote_items`
   segue o parent. Espelha o `loadVisibleQuotes` do app.
3. **audit_logs / bank_accounts / notifications** — ✅ base `20260820280000`
   (audit_logs SELECT-only: `user_id` OU `company_id`; bank: `user_id` OU company),
   notifications owner-only em `20260927000000` (dropped `notif_all`).
4. **invoices / quotes / projects / personal_* / transport_documents / saas** — ✅
   `20260820280000` (`company_id` OU `client_id`/`user_id`), políticas SELECT para
   `saas_subscriptions`/`audit_logs`, contactos/diário/dispositivos owner-only.
5. **comms_channels / comms_messages** — ✅ `20260821000000` + rework de DMs
   `20260923000000` (org: `is_org_member`; DM: `is_comms_member`/`created_by`; falta de
   policies em `comms_channel_members` corrigida com `cmm_*`).

**Storage** (verificado): `documents` privado + owner-only `documents_owner_*`
(`20260928000000`); `marketplace-evidence`/`reputation-attachments` privados +
owner-only, `project-photos` **intencionalmente público** (fotos de obras/imóveis
para o marketplace — ver nota M-G/I) com owner-only adicional (`20260929040000`).
Apps/móvel/saúde stream via admin client, nunca `getPublicUrl`.

**Grants (verificado)**: série `20260929*` revogou anon/authenticated do superfície
indevida (95 tabelas + tables zero-policy + `truncate/references/trigger` +
EXECUTE de functions). `service_role` mantém permissões completas (runtime).

Conclusão: RLS em estado sólido; o único hiato (RBAC `documentos.manage` na BD)
é aceitável hoje — registar como pendente se um dia existir cliente `authenticated`
direto a tabelas de negócio.

## Fiabilidade de escrita

- Writes em qualquer tenant foram o foco: hoje toda escrita valida sessão + tenant
  do alvo (or `company_id`/`user_id`) ou ownership de referência (ex. `decideInvoiceRouting`,
  `resolveCampaignScope`, `assertProjectAccess`, aprovacoes com `authorization` server-side
  e guarda anti-TOCTOU).
- Components clientes não tocam em service_role (o import foi retirado de
  `AssinaturaClient`).

## Melhorias de qualidade não essenciais aplicadas

- `documentos`: removido o campo fantasma `fileUrl` (nunca era preenchido; link morto).
- `mercado/pedidos/[id]`: removido o stub `redirect()` local que devolvia 404 em vez
  de redirecionar para `/login`.

## Pendentes por decisão de produto

- **Fluxo de convite real** para faturção a novos clientes (hoje o email cria uma
  conta fantasma sem onboarding) — eventualmente migrar para email com link de registo.
- **Auditoria da camada RLS** — já executada de forma estática (ver §"RLS que a BD
  deve espelhar"): 4/5 espelhados; `documents` é gap aceite. Rever se algum dia
  existir cliente `authenticated` direto a tabelas de negócio.
- **`api/saude/*`** — alinhado: rotas usam `saude.view`/`saude.manage` (baseline
  pessoal); reativado em "Reativação saude.manage". Os scopes `health.read.*`
  são de consentimento (ao SNS), não permissões RBAC.
- **`api/mobilidade/*`** — stubs mock sem validação de `connectionId`; fake providers
  falham fechado em produção. Substituir por integração real quando houver endpoint.
- **`api/auth/callback/cmd`** — a rota não estabelece sessão real (não invoca
  `supabase.auth`); o guard de produção parte-o em prod. Manter como demo/dev.
- `PortugueseAuthAdapter`: em dev/demo o stub continua a autenticar — por design,
  fechar se um ambiente pré-prod ficar ligado a prod.
- Ruído de console pré-existente nos testes de faturação (projeção fiscal lê
  `cookies()` fora de request scope; falha capturada, fatura mantida).

## Como reproduzir/verificar

```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Testes de regressão relevantes:
`apps/web/app/obras/actions.test.ts`, `apps/web/app/documentos/actions.test.ts`,
`apps/web/app/comunicacao/actions.test.ts`, `apps/web/app/faturacao/creationActions.test.ts`,
`apps/web/app/mercado/pedidos/[id]/requestQuotes.test.ts`,
`apps/web/app/login/portugueseAuthAdapter.test.ts`,
`apps/web/app/api/webhooks/payments/route.test.ts`, `apps/web/app/api/sibs/mbway/route.test.ts`,
`apps/web/app/api/rgpd/export/route.test.ts`, `apps/web/app/api/rgpd/delete/route.test.ts`,
`apps/web/app/api/devices/push/route.test.ts`, `apps/web/app/api/session-context/route.test.ts`.

## CI

O repo não tinha CI (`.github/workflows` vazio) — as 8 fases de guardas
só eram executáveis localmente. Nenhum regressor podia ser barrado antes
de chegar à base. Criado `.github/workflows/ci.yml`:

| Detalhe | Valor |
|---|---|
| Trigger | push para `main`, `pull_request`, `workflow_dispatch` |
| Execução | `concurrency` group por ref, `cancel-in-progress` |
| Permissões | `contents: read` (menor privilégio para checkout) |
| Node | 20.20.2 (ler `.nvmrc`) |
| pnpm | 8.15.9 via `pnpm/action-setup@v4` + `corepack` |
| Cache | `~/.pnpm-store`, chaveada por hash do `pnpm-lock.yaml` |
| Gates | `pnpm typecheck && pnpm lint && pnpm test && pnpm build` |

Decisões documentadas:
- `run_install: false` no action-setup + `pnpm install --frozen-lockfile`
  separado — trava a versão do lockfile (regressão de dependências).
- Jobs `fail-fast: false` — todos os gates correm independentemente.
- Nenhum passo de deploy ou `supabase` CLI — o CI verifica o que é
  verificável estaticamente; migrações e o seed admin permanecem ação
  externa (review de PR + rotação de credenciais em produção).