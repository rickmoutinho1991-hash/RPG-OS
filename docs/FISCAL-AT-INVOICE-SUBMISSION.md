# RPG-OS — AT Invoice Submission Foundation (D5, PREPARED_ONLY)

> Capability de submissão desenhada e preparada localmente. Nenhum envio
> real; nenhum estado LIVE. Data: 2026-09-06.

## Architecture
`Invoice → validate → authorize → consent → connection → Vault → mTLS →
WFA → SOAP → AT` (só as 4 primeiras etapas existem; resto preparado).

## Capability
`AT_INVOICE_SUBMISSION = PREPARED_ONLY`. Ativação exige handshake TEST
real (D4) + decisão explícita futura. `TEST_ENABLED`/`LIVE` inexistentes.

## Official WSDL requirements
RegisterInvoice (WSDL Fatcorews, namespace factemi, SOAP 1.1): eFaturaMD
`0.0.1`, AuditFileVersion, NIF emitente, TaxEntity, SoftwareCertificateNumber,
InvoiceData(header, status, hash, linhas, totais). Tipos FT/NC/ND/FS/FR
(+seguradoras, fora de scope). Resposta `{CodigoResposta, Mensagem,
DataOperacao}` — sem tabela de códigos verificada (mapper devolve
UNVERIFIED).

## Request mapping
`validateSubmissionRequest` (core puro): InvoiceNo `[^ ]+ [^/^ ]+/[0-9]+`,
ATCUD, datas ISO, NIF 9 dígitos, país AA, linhas, `net+vat=gross`. Sem
campos inventados; sem endereço (WSDL não o exige no header).

## Response mapping
`mapATSubmissionResponse`: extrai sem promover (UNVERIFIED até tabela
oficial de códigos).

## State machine
NOT_SUBMITTED→PENDING→SUBMITTED→CONFIRMED/REJECTED; PENDING→UNKNOWN em
timeout; transições inválidas rejeitadas (`resolveSubmissionState`).

## Idempotency
Chave `at-sub|<env>|<invoice>|RegisterInvoice` + UNIQUE DB; re-prepare
devolve registo existente; concorrência resolvida pela constraint.

## UNKNOWN / Retry / Reconciliation
Timeout pós-envio = UNKNOWN permanente até reconciliação (futura, via
fatshare — PREPARED_ONLY). Sem retry automático.

## Authorization / Consent / Tenant
`fiscal.manage` + company do perfil + consent AT ativo; browser só
`invoiceId`; sem company = FORBIDDEN.

## Vault / mTLS / WFA
Reutilizados D2–D4; sem mudanças. Produção bloqueada por construção.

## TEST / Production gate
Só TEST; produção impossível (sem flag, sem credenciais, sem código).

## Privacy / Audit
Dry-run persiste modelo mínimo (sem NIF adquirente? — NIF está no request
validado em memória, NÃO persistido; tabela guarda só IDs/estado/chave).
Audit `fiscal.at.submission.prepared` (IDs). Sem SOAP persistido.

## Known limitations
Sem tabela de códigos AT; sem envio; sem reconciliação; NIF adquirente não
persistido (por design minimalista — reavaliar se a AT exigir histórico).

## Future activation procedure
1. D4 TEST CONNECTED. 2. Preencher dry-run OK. 3. Implementar send com
gate de ativação explícita. 4. Primeiro envio TEST supervisionado. 5. Só
então `TEST_ENABLED`. Produção: checklist D4 + approval.
