# D22 FINAL REPORT — AT TEST Controlled Activation + Real Handshake

## Executive Result

`D22 CONTROLLED ACTIVATION READY — BLOCKED BY MISSING TEST CREDENTIALS`.
Infraestrutura auditada e pronta; gate de execução bloqueia corretamente
(`at_connections = 0`, `vault.secrets = 0`, consents AT = 0).
Zero chamadas de rede, zero segredos tocados, 2 ficheiros de documentação
criados (único delta D22).

## D21 Baseline

`BLOCKED CORRECTLY`: WFA subuser `260371408/1` ativo no Portal, mas
password/certificado/chave nunca provisionados via canal seguro.
`AT_TEST_ENABLED = false`, `NETWORK = 0`, `SECRET EXPOSURE = 0`.

## Credentials State

`MISSING` — `at_connections = 0`, `vault.secrets = 0` (contagens metadata,
sem valores lidos). Mecanismo reutilizável: `VaultSecretBackend.putRef()`
via RPC `rpg_vault_create_secret`; tipos `AT_WFA_USERNAME`,
`AT_WFA_PASSWORD`, `AT_CLIENT_CERTIFICATE`, `AT_CLIENT_PRIVATE_KEY`,
`AT_CERTIFICATE_CHAIN`.

## Consent State

`0` consents AT ativos. Portal WFA ativo ≠ consentimento interno
(`government_consents`, provider `AT`, por company, ativo/não expirado).

## Connection State

`0` conexões. `createAtConnection("TEST")` cria `NOT_CONNECTED` + consentimento,
NIF server-side, idempotente por `UNIQUE(company_id, environment)`.
Nenhuma conexão vazia criada (correto sem material).

## Authorization

`sessão → fiscal.manage → actor company → connection company`
(`credentialResolver` + `handshakeHarness`). Browser `connectionId` nunca é
autoridade. Sem bypass.

## Tenant Isolation

Company match obrigatório antes de rede; testes existentes
(`tenantScope`, harness `AUTHORIZATION_REQUIRED` com fetch spy = 0 chamadas).

## TEST Gate

`AT_TEST_ENABLED = false` (default intacto, sem UI/endpoint/query de ativação).
`evaluateAtTestReadiness()` pura: `READY` só com os 9 requisitos;
produção/undefined/null/strings arbitrárias → `INVALID_ENVIRONMENT`.

## Endpoint

Allowlist `:723` (fatcorews TEST) / `:725` (fatshare TEST).
`resolveAtEndpoint(PRODUCTION)` lança `AT_PRODUCTION_DISABLED` sem flag;
`assertTestOnlyEnvironment()` falha closed antes de credenciais/Vault/rede;
`isAllowedAtUrl()` anti-SSRF (só https + host:porta+path exatos).

## TLS

`rejectUnauthorized: true` hardcoded (`transport.ts`); grep sem
`NODE_TLS_REJECT_UNAUTHORIZED`, `rejectUnauthorized: false` ou
`verify: false` no caminho AT. Sem `fs.writeFile`/dumps PEM, sem
`console.log` de segredos.

## mTLS

Não exercitado (sem certificado cliente). Caminho verificado:
`cert_secret_ref` + `key_secret_ref` → `certificateMatchesPrivateKey()` +
validade → `tls: { certPem, keyPem, caPem }` só em memória.

## WFA

Não executado. `buildInvoicesQueryEnvelope()` + `buildWfaHeader()` intactos;
username `NIF/subutilizador` vive como VALOR do Vault secret
(`wfa_user_secret_ref`) — sem coluna nova, sem migration.

## SOAP

Não executado. Parser e limites existentes intactos.

## AT Response

Nenhuma. `CodigoResposta = UNVERIFIED` mantido; sem tabela inventada.

## Connection Result

`NOT_EXECUTED` → estado permanece `CREDENTIALS_PENDING`-equivalente
(`NOT_CONNECTED`, zero conexões). Nenhum estado `READY`/`CONNECTED`/`ACTIVE`
marcado sem resposta oficial.

## Audit

Sem eventos novos. Eventos existentes metadata-only
(`connectionId`, `environment`, `outcome`, `correlationId`).

## Secret Exposure

`0` em logs, audit, DB plaintext, browser, testes, docs, git.

## Network Calls

`0` (sem fetch/https/SOAP/DNS/TLS). Teste com fetch spy prova
`BLOCKED → 0 chamadas`.

## Production Calls

`0` chamadas, `0` credenciais usadas, `0` endpoints chamados.

## Tests

AT/security: 15 suites, 170 passed. Full: 82 suites, 1314 passed,
6 skipped, 0 failed.

## Typecheck

Core PASS, Web PASS.

## Lint

PASS nos ficheiros tocados (só Markdown novo); 6 pre-existing mobilidade
inalterados.

## Build

PASS.

## Files Changed

- NEW `docs/runbooks/AT-TEST-HANDSHAKE.md` (procedimento do operador)
- NEW `docs/FISCAL-AT-TEST-CONTROLLED-ACTIVATION.md` (este relatório)

## Security Findings

HIGH 0, MEDIUM 0, LOW 0. Pre-existing: 6 lint mobilidade, 3 whitespace
`git diff --check`, dirty tree baseline, flaky intermitente full-suite
fora do caminho AT (documentado D17/D18).

## Remaining Blockers

Password WFA + material mTLS via Vault (fora do chat) → refs na conexão →
ativação auditada do TEST gate → handshake.

## D23 Gate

`D23 — AT TEST INVOICE SUBMISSION`, somente após
`D22 REAL TEST HANDSHAKE = CONNECTED`. Sem avanço automático.

## FINAL VERDICT

```text
D22 CONTROLLED ACTIVATION READY — BLOCKED BY MISSING TEST CREDENTIALS
```
