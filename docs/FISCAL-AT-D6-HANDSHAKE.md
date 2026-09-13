# RPG-OS — D6 AT Test Handshake + Reconciliation Foundation

> Fundação de certificação TEST sem envio real. Estado: PREPARED_ONLY.
> Produção: DISABLED. Data: 2026-09-06.

## 1. Architecture
D4 reutilizado (endpoints allowlist, SOAP, mTLS estrito, resolver,
transport injetável). D6 acrescenta: gate explícito, reconciliação (tipos),
UI honesta. Sem segundo transporte.

## 2. TEST Environment
`AtEnvironment TEST|PRODUCTION`; `resolveAtEndpoint` bloqueia PROD sem flag
(inexistente); `AT_TEST_ENABLED=false` em `connectivity.ts` impede qualquer
chamada antes de ativação auditada (tripwire em teste).

## 3. Handshake
`testATConnection`: gate → credenciais → binding TEST → envelope fatshare
`Invoices` (próprio NIF, 1 dia) → parse → CONNECTED só com `estadoExecucao`
válido; timeout→UNKNOWN; fault→AUTH_FAILED; resto→NOT_CONNECTED. Atualiza
só `updated_at`. Nunca testado live (sem credenciais).

## 4. WFA
Header UsernameToken por manual; formato exato por revalidar com live.

## 5. Response Codes
Sem tabela oficial verificada → `mapATSubmissionResponse` mantém UNVERIFIED
(teste existente). Blocker documentado, não inventado.

## 6. UNKNOWN
Permanente até reconciliação explícita; sem retry; sem promoção.

## 7. Reconciliation
Tipos `AtReconciliationOutcome/Query` + `requiresReconciliation(state)`:
só UNKNOWN requer. Sem implementação de consulta (aguarda fatshare
validado). Sem fan-out, sem reenvio.

## 8. Idempotency
`at-sub|<env>|<invoice>|RegisterInvoice` + UNIQUE DB; prepare idempotente
(testado); concorrência pela constraint.

## 9. Authorization / 10. Consent / 11. Tenant Isolation
Inalterados D5: `fiscal.manage`, company do perfil, consent AT ativo,
membership; browser só intenções.

## 12. Secrets
Sem mudanças: Vault refs, sem valores em UI/logs/audit/erros.

## 13. Audit
`started/succeeded/failed` existentes; metadata mínima; nunca bloqueiam.

## 14. Current Gates
`PREPARED_ONLY` (capability), `DISABLED` (produção), `AT_TEST_ENABLED=false`
(handshake). Ativação futura = mudança auditada destas três alavancas.

## 15. Blockers
Credenciais TEST oficiais; validação WFA header em live; tabela de códigos;
DP-IVA-WS não verificado.

## 16. Activation Procedure
1. Credenciais TEST no Vault. 2. Mudar gate com commit auditado. 3. Teste
supervisionado único. 4. Confirmar CONNECTED real. 5. Só então ponderar
`TEST_ENABLED`. Produção: checklist D4 + approval (fora de scope).
