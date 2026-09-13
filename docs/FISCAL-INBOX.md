# RPG-OS — Fiscal Inbox (Caixa Fiscal)

> Estado: loader + writer de transições server-side. Sem writer de criação.
> Classificação da fonte para A Minha Vida: **PREPARED_ONLY** (ver § Life).

## Purpose

Work queue de itens fiscais por organização (`fiscal_inbox_items`): prazos,
divergências, submissões pendentes. READ MODEL / WORK QUEUE — nunca source
of truth (a entidade original — invoice, obrigação, connection — continua a
sê-lo via `entity_type` + `entity_id`, sem duplicação).

## Source of truth

A linha do inbox referencia, não copia: `entity_id` aponta para a entidade
real no seu domínio. `counterparty_nif` existe na linha mas é minimizado
(ver § PII).

## Writer

**Só transições de estado** (`apps/web/app/administracao/fiscal/actions.ts`
→ `updateFiscalInboxItemStatus`). Não existe INSERT: `companies` e
`organizations` são tabelas separadas sem FK entre si, por isso nenhum evento
first-party atual (ex.: emissão de invoice, chaveada por `company_id`) consegue
resolver com segurança o `organization_id` do inbox. Criar esse mapeamento sem
fonte real seria risco cross-tenant — propositadamente não implementado.

- Auth: sessão server-side; sem sessão → `UNAUTHENTICATED`.
- Authorization: `fiscal.admin` (mesma permissão da navegação); sem ela → `FORBIDDEN`.
- Organization: `organization_id` lido DA LINHA e verificado contra as
  organizações ACTIVE da sessão; `organizationId` do client é ignorado.
- Validação: `resolveFiscalInboxTransition` (pura, em
  `packages/core/src/services/government/fiscalInbox.ts`, testada); transição
  inválida → `INVALID_TRANSITION`; mesmo estado → no-op idempotente.
- `entity_type`/`entity_id`/`provider` nunca são reescritos pelo writer.
- Audit: `FISCAL_INBOX_ITEM_UPDATED` com `{ from, to, byAction }` (facto real).

## Loader

`getFiscalInboxItems()`: sessão → `fiscal.admin` → organização ativa da
sessão → `select` de colunas mínimas (sem `metadata` JSONB) com
`.eq("organization_id")` explícito, limite 100. Sem organização → `[]`.

## Authorization

Leitura e escrita exigem `fiscal.admin`. `fiscal.view` NÃO chega (separa READ
de WRITE, como exigido). Sem permissão nova criada.

## Organization scope

Unidade de isolamento: **organization** (coluna `organization_id`, RLS por
membership ACTIVE + service-role ALL). Company/user (eixo Finance) e
organization (eixo RBAC) não se misturam neste fluxo — decisão documentada
que impede referências cross-tenant.

## Entity references

`entity_type` ∈ INVOICE/CONNECTION/CONSENT/DEADLINE/RECONCILIATION/PAYMENT/
NOTIFICATION + `entity_id` opaco. O writer valida a posse da LINHA (org da
sessão); a existência da entidade referida é responsabilidade do futuro
creator com mapeamento seguro. Cross-org (`org A` → entity de `org B`)
impossível: o scope deriva sempre da sessão + linha.

## PII handling

`counterparty_nif` (terceiros): incluído na linha para reconciliação e
pesquisa pelos membros `fiscal.admin` da org — o mesmo acesso que a policy
RLS `fiscal_inbox_items_read_org` já permite ao anon client; o loader apenas
troca o canal (server-side) sem alargar o acesso. Excluído de `metadata`
(listagem usa allowlist de colunas) e **nunca propagado**: inputs do
`FiscalLifeCollector` não têm o campo, audit metadata é sanitizado.

## Status semantics

`UNREAD` = por ler no RPG-OS (nunca "notificação AT recebida").
`provider` reflete origem real; valores `AT`/`EFATURA` só quando a fonte for
realmente externa (hoje: nenhuma). Tipos com nomes de submissão
(`PENDING_SUBMISSION`, …) referem-se a fluxos internos/RPG-OS.

## Life integration

`FiscalLifeCollector` consome linhas reais: UNREAD + `due_date` →
`tax_deadline` (`document_received` se entidade INVOICE), `sourceEntityId` =
id da linha, `action: view`, sem NIF, sem payload. Classificação mantém-se
**PREPARED_ONLY** enquanto não existir creator com proveniência: tabela +
loader existem, mas linhas sem produtor confiável não sustentam LIVE.

## External integration status

AT: NOT INTEGRATED. E-Fatura: NOT INTEGRATED. OAuth: não existe. SIBS/MB WAY:
não existe. Fake providers: bloqueados em produção (existente, inalterado).
