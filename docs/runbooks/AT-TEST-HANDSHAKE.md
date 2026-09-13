# Runbook — AT TEST Handshake Controlado (RPG-OS)

> Procedimento do operador para o primeiro handshake AT TEST.
> Nenhum passo coloca segredos no chat, e-mail, tickets, `.env` versionado,
> código, testes ou logs. Segredos entram SOMENTE via Vault (fora do chat).

## Pré-condições (todas obrigatórias)

1. Empresa com NIF válido + utilizador com `fiscal.manage`.
2. Subutilizador WFA ativo no Portal das Finanças (ex.: perfil WFA).
3. `AT_TEST_ENABLED = false` continua a ser o default; a ativação é passo
   explícito e separado (§5), nunca automática.
4. Produção permanece `DISABLED` em todos os passos.

## Passo 1 — Provisionar segredos no Vault (fora do chat)

Tipos suportados (`SecretCredentialType` em
`packages/core/src/security/secureSecretStore.ts`):

- `AT_WFA_USERNAME` (ex.: identificador `NIF/subutilizador`)
- `AT_WFA_PASSWORD`
- `AT_CLIENT_CERTIFICATE`
- `AT_CLIENT_PRIVATE_KEY`
- `AT_CERTIFICATE_CHAIN`

Via `VaultSecretBackend.putRef()` (scope provider/company/environment).
Guardar os IDs de referência devolvidos. Nunca imprimir valores.

## Passo 2 — Criar consentimento interno + conexão TEST

UI `/administracao/at` → Rever → Confirmar, ou `createAtConnection("TEST")`
(`apps/web/app/administracao/at/actions.ts`): cria
`at_connections(NOT_CONNECTED)` + `government_consents(provider=AT)`.
NIF sempre server-side (`companies.tax_number`). Idempotente por
`UNIQUE(company_id, environment)`. O consentimento do Portal das Finanças
NÃO substitui o consentimento interno.

## Passo 3 — Associar as referências Vault à conexão

Preencher `wfa_user_secret_ref`, `wfa_pass_secret_ref`, `cert_secret_ref`,
`key_secret_ref`, `chain_secret_ref` (server-side, com autorização).
Enquanto alguma estiver NULL, o readiness devolve `BLOCKED`
(`MISSING_*_REFERENCE`) — resultado válido, não contornar.

## Passo 4 — Confirmar readiness

`evaluateAtTestReadiness()` (`packages/core/src/security/atReadiness.ts`)
só devolve `READY` com: conexão + ambiente TEST + 5 refs + consentimento
ativo + autorização + endpoint allowlist + `AT_TEST_ENABLED = true`.
Produção nunca é READY.

## Passo 5 — Ativação explícita do TEST gate

Ativação server-side, auditada (`at.test.activation.enabled`), TEST-only,
reversível, com `fiscal.admin` (ou permissão definida pela arquitetura).
Nunca via query/body/cookie/header/browser/`connectionId`.

## Passo 6 — Executar Testar Ligação (UMA vez)

UI `/administracao/at` → Testar, ou
`POST /api/administracao/at/connections/[id]/test`, que delega a
`runAtTestHandshake()` (`apps/web/lib/at/handshakeHarness.ts`):
readiness → (se READY) `testATConnection()` — consulta read-only
`fatshare.Invoices` (`:725`), janela de 1 dia, NIF próprio. Nunca
`RegisterInvoice`/`ChangeInvoice`/`DeleteInvoice`.

## Passo 7 — Ler o resultado

- `CONNECTED` → canal provado por resposta oficial (`EstadoOperacao`).
  Estado verificado, NÃO certificado fiscal.
- `AUTH_FAILED` → credencial/WFA/mTLS inválidos. Não adivinhar password,
  não fazer retry automático, não mutar credenciais.
- `UNKNOWN` (timeout/ambíguo) → reconciliation, sem retry automático,
  sem promoção a CONNECTED/FAILED.
- `CONFIGURATION_ERROR`/`NOT_CONNECTED` → diagnosticar pelo `detail`
  sanitizado + `correlationId`.

## Passo 8 — Não repetir indiscriminadamente

Em timeout, diagnosticar primeiro (endpoint, mTLS, validade do
certificado, expiração/revogação do secret). Uma chamada manual
controlada de cada vez; sem concorrência sobre a mesma conexão.

## Passo 9 — Depois do handshake

Handshake `CONNECTED` NÃO autoriza submissão. O passo seguinte
(D23 — submissão TEST) exige certificação própria separada.
`CAPABILITY` permanece `PREPARED_ONLY`; produção permanece `DISABLED`.

## Auditoria

Eventos metadata-only (`connectionId`, `environment`, `outcome`,
`correlationId`): `at.handshake.blocked`, `at.connectivity.test.started`,
`at.connectivity.test.succeeded`, `at.connectivity.test.failed`.
Nunca segredos, corpos SOAP ou cabeçalhos de autenticação.
