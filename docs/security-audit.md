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
Suite no início: 127 ficheiros / 1832 testes. No fim: 142 ficheiros / 1887 testes.

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
| (← alinhamentos pós-varredura) | **2 P2** (categories, workflows) + **saude** alinhada às permissões declaradas (ver "Alinhamentos pós-varredura") |

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
- Mutações (`saude.manage`) continuam **fail-closed** (403) enquanto não existir grant
  — reativar é decisão de produto (definir `saude.manage` num papel) e fica registada.
Testes: 4 (connections GET/POST).

**Aceites documentados (sem fix)**:
- **`api/mobilidade/*`**: stubs com dados mock hardcoded; `connectionId` nunca validado
  contra a BD. Em produção os fake providers falham fechado (`ALLOW_FAKE_PROVIDERS`).
- **Arquitectura**: existem 2 caminhos de auth nas rotas — `requireAuth()`
  (`lib/supabase/auth.ts`, single-company legacy) e `getSessionContext()`
  (`lib/session.ts`, org + permissões). Nenhuma rota administrativa deve usar o
  primeiro para decisões de RBAC; `role === "ADMIN"` de `user_roles` é grant
  system-wide (não tenant-scoped) — mantido para capacidade de platform admin.

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
- **`api/saude/*`** — permissões `health.*` não existem (módulo `saude`); rotas
  falham fechado. Alinhar o nome das permissões quando o módulo tiver roadmap.
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