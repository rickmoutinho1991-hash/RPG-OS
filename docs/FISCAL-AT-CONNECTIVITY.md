# RPG-OS — Fiscal AT Connectivity (D4, TEST only, sem credenciais reais)

> Transporte mTLS+SOAP implementado e testado; sem credenciais AT no
> ambiente → estado certificado: READY FOR OFFICIAL TEST, NOT VERIFIED.
> Data: 2026-09-06.

## 1. Official sources verified
- WSDL Fatcorews obtido do info.portaldasfinancas.gov.pt em 2026-09-06:
  namespace `http://factemi.at.min_financas.pt/documents`, SOAP 1.1
  document/literal, operações Register/Change/Delete × Invoice/Work/Payment,
  resposta `{CodigoResposta, Mensagem, DataOperacao}`.
- WSDL fatshareInvoices obtido na mesma data: namespace
  `http://factemi.at.min_financas.pt/fatshareInvoices`, operação `Invoices`,
  resposta `{estadoExecucao:{EstadoOperacao, Desc}}`.
- Endpoints: TEST `:723/fatcorews/ws/`, `:725/fatshare/ws/fatshareFaturas`;
  PROD `:423`, `:425`. Divergência registada: fatshare é recente e a
  comunidade reporta instabilidade/500s (não usar para prova crítica sem
  validação manual).

## 2. Environment model
TEST permitido; PRODUCTION bloqueada por defeito (`AT_PRODUCTION_DISABLED`
sem flag explícita — flag nem sequer exposta).

## 3. Endpoint configuration
Allowlist fechada em `lib/at/endpoints.ts` (host+porta+path, só https);
SSRF impossível por construção (localhost/privados/http recusados, testado).

## 4. Credential resolution
`resolveATTransportCredentials(connectionId)`: sessão → fiscal.manage →
company do perfil → conexão (company match) → NIF == tax_number →
consent AT ativo → refs Vault → valores → cert/key match + validade +
env binding. Sem NIF/segredos do browser.

## 5. Vault integration
Somente via `getSecretStore()` + `getSecretById` com company; sem acesso
direto do SOAP client ao Vault.

## 6. mTLS / 7. TLS validation
`node:https` com cert/key/chain em memória; `rejectUnauthorized: true`
hardcoded (sem toggle, sem env); sem escrita em disco.

## 8. WFA
Header UsernameToken (username/password/nonce/created, escapados) conforme
manual; senha só em memória no envelope. Formato exato revalidado contra
WSDL na D4.x com credenciais.

## 9. SOAP transport
Envelope document/literal; timeout 15s; limite 2MB; correlation ID;
sem bodies em logs; `httpPost` injetável só em testes.

## 10. XML security
`fast-xml-parser` sem DTD/entities; sem `eval`; escaping em todos os valores.

## 11. Certificate validation
Thumbprint JWK + validade antes de qualquer handshake (D3); chain do
servidor validada pelo TLS.

## 12. CSR status
Não implementado (PKCS#10 sem suporte nativo; algoritmo por confirmar).

## 13. Connectivity test
`testATConnection`: resolver → TEST-only → envelope fatshare Invoices
(read-only, janela 1 dia, próprio NIF) → parse → CONNECTED só com
`estadoExecucao` válido; timeout→UNKNOWN; fault→AUTH_FAILED; resto→
NOT_CONNECTED. Atualiza só `updated_at`. Audit started/succeeded/failed
(sem segredos).

## 14. Response validation
HTTP 2xx insuficiente: exige envelope+operação+estado parseável.

## 15. Error mapping
Rede/TLS/cert/auth/fault/HTTP/timeout/malformed → códigos normalizados,
sem detalhes internos.

## 16. Timeout/retry
15s, sem retry automático (timeout em teste = UNKNOWN, não AUTH_FAILED).

## 17. Authorization
Rota + resolver exigem sessão e `fiscal.manage`; browser só envia
connectionId; rate limit `government` (30/min).

## 18. Tenant isolation
Conexão tem de ser da company do actor; NIF validado; sem cross-company.

## 19. SSRF protection
Allowlist + validação; testado (localhost/privados/http/domínios).

## 20. Audit / 21. Observability
Eventos started/succeeded/failed (connection, env, operação, resultado,
erro, duração, correlation); sem bodies/segredos/NIF.

## 22. UI
Botão "Testar ligação" em `/administracao/at`; resultado honesto
(sucesso só com resposta oficial; caso contrário motivo). Sem "AT
operacional".

## 23. Tests
16 testes (endpoints/SSRF, envelope/escaping, parser fault/fatcorews/
fatshare/malformed/XXE, erros, transporte injetado). Sem rede, sem AT.

## 24. Integration tests
Bloqueados por ausência de credenciais TEST oficiais (condição honesta,
não falha). Manual: obter cert+WFA de teste (email AT), configurar,
correr teste, confirmar CONNECTED.

## 25. Files changed
`lib/at/{endpoints,soap,transport,credentialResolver,connectivity}.ts`,
`__tests__/atTransport.test.ts`, rota de teste, botão UI, dep
`fast-xml-parser`.

## 26. Security findings
HIGH/MEDIUM: nenhum. LOW: nenhum novo. INFO: fatshare instável na
comunidade; WFA header a revalidar com credenciais; rota governo antiga
simula sucesso (pré-existente, fora de scope, documentado).

## 27. Production readiness
PRODUCTION bloqueada por construção; promoção exige TEST CONNECTED,
credenciais reais, runbook, approval explícita.

## 28. Remaining blockers
Credenciais TEST oficiais (cert + WFA); validação WFA header com chamada
real; DP-IVA-WS não verificado.

## 29. FINAL VERDICT
`AT CONNECTIVITY IMPLEMENTED — OFFICIAL TEST CREDENTIALS REQUIRED`
