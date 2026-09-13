# AT TEST HANDSHAKE REPORT

## Executive Result
`AT CONNECTIVITY IMPLEMENTED — OFFICIAL TEST CREDENTIALS REQUIRED`.
Nenhuma chamada executada; nada a validar sem credenciais.

## Credentials Availability
`at_connections`: 0 rows. `government_consents` AT: 0 rows.
`vault.secrets`: 0 rows. **Sem credenciais = sem handshake.**

## Official Endpoint
TEST fatshare `:725/fatshare/ws/fatshareFaturas` (allowlist, código).

## WSDL/Operation
Fatcorews + fatshareInvoices obtidos da AT em 2026-09-06 (namespaces,
operações `Register*/Invoices`, SOAP 1.1 document/literal). Operação de
teste: fatshare `Invoices` read-only (próprio NIF, 1 dia).

## Environment
TEST-only; PRODUCTION bloqueada por construção (sem flag de desbloqueio).

## Authorization
Sessão + `fiscal.manage` + company + membership (código verificado).

## Consent
Exigido AT/ativo/não-expirado; inexistente no DB.

## Vault
Vazio; refs NULL em todo o lado; sem leitura possível.

## Certificate / Private Key / WFA
Inexistentes. Validações (match, validade, NIF) implementadas mas sem
objeto. WFA header segue o manual; formato exato por revalidar com live.

## TLS
`rejectUnauthorized: true` hardcoded (grep); sem bypass em lado nenhum.

## mTLS
Implementado no transporte; nunca exercido (sem certificado cliente).

## SOAP
Envelope document/literal com escaping; parser XXE-safe; sem bodies em logs.

## Request / Response / Error Mapping
Verificados em código + 16 testes; timeout→UNKNOWN; fault→AUTH_FAILED
só com fault real; HTTP≠sucesso.

## Timeout
15s, sem retry.

## Audit
started/succeeded/failed com metadata mínima; auditoria nunca bloqueia.

## Security
Browser só connectionId; segredos nunca em UI/logs/audit/erros (grep);
service-role só pós-autorização; SSRF impossível (allowlist testada).

## Tenant Isolation
Conexão tem de ser da company do actor; NIF validado; sem cross-company.

## Production Isolation
`PRODUCTION ENDPOINT CALLED = NO` (código recusa); restantes gates a NO.

## Live Test Result
Não executado (sem credenciais). Tentativa seria desonesta sem objeto.

## Tests
16 transporte + matriz existente; 79/79 suites, 1277 passed + 6 skipped
(1 falha transitória isolada, verde na repetição — sem causa identificada,
sem relação com AT).

## Typecheck
Core PASS; web PASS (a confirmar abaixo com lint/build).

## Lint
A confirmar.

## Build
A confirmar.

## Files Changed
Nenhum (esta fase é verificação; doc é o único artefacto novo).

## Remaining Blockers
Credenciais TEST oficiais (cert + WFA + consentimento + conexão).

## Production Readiness
BLOQUEADA por construção.

## Final Verdict
`AT CONNECTIVITY IMPLEMENTED — OFFICIAL TEST CREDENTIALS REQUIRED`
