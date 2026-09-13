# RPG-OS — Fiscal AT Provider Architecture (DESIGN ONLY)

> Arquitetura para futura integração oficial AT/e-Fatura. Zero chamadas reais,
> zero credenciais, zero OAuth implementado. Data: 2026-09-06.
> Base oficial: Manual Integração Software e-Fatura AT (fatcorews :723,
> fatshare :725/:425, WSDL publicado, test env), FAQs 00978/00996 AT,
> gov.pt certificação software, AMA doc-AUTENTICACAO, IVA Automático AT.

## 1. Executive Summary
Caminho oficial verificado (SOAP + mTLS + WFA); OAuth fiscal inexistente;
classificação e-fatura/deduções e declarações IVA/IRS/IRC sem API terceiros;
secret storage vazio. Design pronto; implementação bloqueada por
infraestrutura de segredos + certificação.

## 2. Certified Baseline
Routing + producer + Vida certificados; 75/75, 1243/1243; fluxo invoice →
assignment → bridge → inbox → collector intacto e intocado nesta fase.

## 3. Scope
Desenho de provider/auth/consent/transporte/erros. Sem chamadas, credenciais,
tokens, scraping ou submissões.

## 4. Non-Goals
Sem OAuth implementado, WSDLs/SOAP inventados, scraping, login automatizado,
CAPTCHA/MFA bypass, cookies de sessão, engenharia reversa.

## 5. Current Adapter Audit
- `ATProvider` (`services/government/atProvider.ts`): `connect()` simula
  sucesso; `submitDocument()` fabrica `SUB-{ts}-{rand}` SUBMITTED;
  `getHealth()` simula; metadata `authMethod:"OAUTH2_PKCE"` (incorreto —
  oficial é mTLS+WFA) e docstring "Production-ready" (incorreto). **Não
  chamado pela web** (grep: zero usos fora de testes); risco = reuso
  acidental futuro. Decisão: não alterar comportamento (testes certificados
  dependem); documentado aqui como não-oficial.
- `FakeATProvider`: só testes; `registerDefaultProviders` no-op em produção
  + `registerFakeProviderForTesting` lança em produção (testado).
- `AtTaxAuthorityAdapter` / `EFaturaAdapter`: já hardened (erro explícito,
  `verificationSource: LOCAL_FORMAT_CHECK`, sem REGISTERED); live paths
  (`validate-nif`, `mbway`) devolvem indisponibilidade honesta.
- `SibsPaymentGatewayAdapter`: indisponível explícito (fase anterior).
- `PortugueseAuthAdapter` (CMD): gera `mock_cmd=true` sem credenciais —
  fora do scope fiscal; registado como INFO para fase própria (é
  autenticação cidadã, não fiscal).

## 6. Target Architecture
`Fiscal Domain → AT Capability Service → AT Provider → AT Authorization →
Secure Secret Store → SOAP/mTLS Transport → Official AT Webservice`, com
`Audit` lateral. Sem adapter monolítico.

## 7. Provider Contract
Reutilizar `GovernmentIntegrationProvider` (`connect/disconnect/
getConnectionStatus/consultDocuments/submitDocument/...`); adicionar
futuramente `getCapabilities()` explícito. Estados de conexão: NOT_CONNECTED,
READY, REQUIRES_CERTIFICATE, REQUIRES_WFA, REVOKED, EXPIRED, ERROR.
Resultados nunca `success:true` sem confirmação AT: SUCCESS,
PROVIDER_REJECTED, UNAUTHORIZED, FORBIDDEN, INVALID_DOCUMENT,
CERTIFICATE_ERROR, WFA_ERROR, NETWORK_ERROR, TIMEOUT, RATE_LIMITED,
UNAVAILABLE.

## 8. Connection Model
`(provider=AT, company/NIF, environment TEST|PRODUCTION)` + status,
external_subject (subutilizador WFA), created/connected/expires/revoked_at.
`government_connections` (org+user+provider) serve de base, estendida por
NIF/company — sem schema novo nesta fase.

## 9. AT Authorization
`USER→SESSION→PERMISSION→COMPANY→NIF→GOVERNMENT CONSENT→AT CONNECTION→
WFA→CERTIFICATE`. Autoridade fiscal = COMPANY/NIF, nunca organization.

## 10. RPG-OS Consent
`government_consents` (org/user/provider/scopes/expiry/revogação/audit,
sem secrets) adequado; consent ≠ autorização AT (camadas distintas).

## 11. WFA Model
Subutilizador por NIF emitente, perfil WFA, senha cifrada com chave pública
AT; lifecycle/revogação no Portal pelo sujeito passivo; responsabilidade
sempre do contribuinte. Detalhes de formato SOAP: OFFICIAL DETAIL já
documentado nos manuais AT (consultar WSDL na implementação).

## 12. Certificate / mTLS Model
CSR do produtor → assinatura AT → import seguro; fingerprint/validade/
ambiente monitorizados; só metadata não-sensível na DB; `verify=false`
proibido; isolamento TEST/PROD.

## 13. Secure Secret Store
Contrato (`store/retrieve/delete/rotate`) já existe como interface;
implementação = `NotConfigured` (lança). **BLOCKED FOR IMPLEMENTATION** até
cofre real (Vault/KMS/Supabase Vault). Nunca: PEM em tabelas, plaintext,
secrets em logs/audit/UI.

## 14. SOAP Transport
Responsável só por TLS/mTLS, endpoint, timeout, request/response, faults,
correlation ID. Sem conhecimento de users/companies/permissions/UI.

## 15. Error Model
`transport | SOAP fault | AT business | auth | cert | validation` → erro
normalizado com causa preservada; nunca `success:false` genérico.

## 16. Submission State Machine
`NOT_SUBMITTED → SUBMISSION_PENDING → SUBMITTED | REJECTED | UNKNOWN`
(timeout após envio = UNKNOWN → reconciliação obrigatória).

## 17. Reconciliation
Localizar por idempotency key → consultar estado (fatshare) → confirmar/
rejeitar/resolver timeout → sem duplicar. Sem worker nesta fase.

## 18. Data Normalization
`AT response → Provider DTO → Domain object → UI`; nunca SOAP cru na UI.

## 19. Data Minimization
Só referência + valores; sem payload SOAP, headers, certs, keys, passwords,
tokens. Retenção fiscal legal a documentar na implementação.

## 20. Audit
Futuros `at.connection.created/revoked`, `at.authorization.failed`,
`at.document.submitted/rejected/confirmed` — sem credenciais/SOAP/NIF
desnecessário. Nada criado agora.

## 21. Permissions
`fiscal.view` (consulta), `fiscal.manage` (conexões/consentimento),
`fiscal.admin` (admin). Sem permissions novas.

## 22. Tenant Isolation
Conexão por (NIF/company, ambiente); org só contexto; RLS por membership +
company; service-role só pós-autorização.

## 23. Fiscal Inbox Integration
Futuro: `AT → evento normalizado → routing explícito obrigatório → inbox`.
AT nunca escolhe org; sem fan-out.

## 24. A Minha Vida Integration
Só via collector, `verified` só com fonte oficial; zero mudanças.

## 25. Threat Model
T1 cert Company A usado por B → cofre por NIF + validação. T2 org A usa
conexão B → binding NIF+validação. T3 sem `fiscal.manage` → gate. T4/T5/T6
revogados/expirados → FAILED explícito. T7 leak → cofre + sem logs. T8 MITM
→ mTLS estrito. T9 duplicados → idempotency key. T10 timeout → UNKNOWN +
reconciliação. T11 fakes → guards existentes. T12 injection → parsing
estrito + tipos. T13 cross-tenant → binding + RLS. T14 payload em logs →
redação. Cada controlo com teste futuro em §26 do plano (unit/security/
integração em sandbox, sem sandbox fake).

## 26. Test Architecture
Futura (não implementada): contrato, capabilities, erros, consent, company,
ambiente, certificados, estados; segurança (isolamentos, revogados,
expirados, NIF errado, colisão UUID); integração em sandbox oficial.

## 27. Implementation Prerequisites
Secret store real; certificação software + CSR; credenciais WFA por NIF;
acesso test env. Nenhum disponível em código (provado).

## 28. Implementation Order
B1 contrato → B2 conexão → B3 secret store → B4 consent → B5 cert/mTLS →
B6 SOAP → B7 sandbox → B8 consulta → B9 submissão → B10 reconciliação →
B11 inbox externo. Zero implementado.

## 29. Known Unknowns
Detalhes de campos SOAP (no WSDL oficial, a consultar na implementação);
DP-IVA-WS de terceiros (fonte secundária, não assumido); quotas/rate limits
AT (não publicados nos manuais lidos).

## 30. Final Verdict
`ARCHITECTURE READY — IMPLEMENTATION BLOCKED BY CREDENTIAL INFRASTRUCTURE`
(e com certificação externa pendente).
