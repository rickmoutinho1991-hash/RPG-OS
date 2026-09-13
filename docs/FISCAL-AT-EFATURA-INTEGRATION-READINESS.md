# RPG-OS — Fiscal AT / e-Fatura Integration Readiness (research, sem implementação)

> O que é oficialmente possível integrar, por que mecanismo e o que continua
> indisponível. Nada implementado; nada ligado. Data: 2026-09-06.

## 1. Executive Summary
Existe caminho oficial verificável para **comunicação e consulta de faturas
via webservice SOAP** (com adesão de produtor + mTLS + subutilizador WFA).
NÃO existe OAuth fiscal, API de e-Fatura consumer (classificação/deduções),
submissão eletrónica de IVA/IRS/IRC por terceiros, nem API de pagamentos.
Veredicto: `PARTIALLY READY — OFFICIAL CAPABILITY GAPS`.

## 2. Current RPG-OS Fiscal Architecture
First-party (invoices/obligations/inbox/bridge/routing/producer certificados);
adapters com respostas locais honestas pós-hardening; fakes confinados a
testes/core com `ALLOW_FAKE_PROVIDERS=false`; `government_consents` existe
para consentimento futuro; secret storage só-interface (`NotConfigured`).

## 3. Official AT Capabilities
- **Doc submission (fatcorews, :723 + test env)**: REAL — SOAP/WSDL oficial,
  registo/alteração/eliminação fatura-a-fatura. Requer: certificação de
  software (gov.pt), CSR assinado pela AT (mTLS), subutilizador WFA do NIF
  emitente (senha cifrada com chave pública AT).
- **Doc query (fatshare, :725/:425 + test env)**: REAL — consulta faturas onde
  o NIF é transmitente/adquirente, mesma autenticação.
- **DP IVA eletrónica**: portal manual; via WS só menção transitória de
  produtores (WSDL novo em 2027) — tratar como NÃO verificado.
- **IRS/IRC**: portal manual; sem API terceiros → UNAVAILABLE.
- **Pagamentos**: referência Multibanco emitida no portal após submissão;
  sem API de iniciação → UNAVAILABLE.

## 4. Official e-Fatura Capabilities
Submissão/consulta via webservices acima: REAL. Classificação de despesas,
deduções, IVA Automático, pré-preenchimentos: **portal manual** (contribuinte
confirma sempre) → sem API → UNAVAILABLE. Ficheiro multidocumento SAF-T ou
JAR CLI como via alternativa manual.

## 5. Authentication
NÃO existe OAuth/OIDC/PKCE fiscal. Real: **mTLS** (certificado produtor
assinado AT) + **subutilizador WFA** (NIF/senha, senha cifrada). Chave Móvel
Digital / Autenticação.Gov (SAML + OAuth2 implicit, AMA) servem para
**autenticação de cidadãos em portais**, não para dados fiscais via API.
`Portal login ≠ OAuth API`. Software certificado é pré-requisito jurídico.

## 6. Authorization
Por sujeito passivo (NIF emitente) via subutilizador WFA criado pelo detentor
do NIF; responsabilidade sempre do sujeito passivo. Terceiro (RPG-OS) age com
credenciais delegadas por NIF, nunca globais.

## 7. Consent
`government_consents` (org/user/provider/scopes/expiry/revogação/audit) é
adequado para registar autorização de uso das credenciais WFA por NIF —
sem guardar segredos no registo. Modelo Health não copiado.

## 8. Credential Requirements
mTLS: chave privada do produtor (nunca sai do cofre) + CSR assinado AT.
WFA: NIF/subutilizador + senha cifrada (só em memória no acto). Test env:
certificado público de testes + subconta de teste (via email à AT).
Rotação por reemissão; revogação = novo CSR + invalidar subutilizador.

## 9. Company/Tenant Model
Autoridade fiscal = **company (NIF)**; credenciais WFA por NIF emitente;
organization = contexto administrativo. Uma conexão AT pertence a
(company NIF, ambiente); nunca usar org como identidade fiscal.

## 10. Provider Architecture
Abstração atual (`prepare/connect/authorize/refresh/revoke/status/consult/
submit/download`) suporta o desenho; falta: mTLS client, SOAP client,
gestão de WFA por NIF, `fatshare` query, mapeamento de erros AT. Nenhuma
interface nova criada nesta fase.

## 11. Capability Matrix
| Capability | Official API? | Auth | Status RPG-OS |
|---|---|---|---|
| Invoice submission | Sim (fatcorews SOAP) | mTLS+WFA | PREPARED_ONLY |
| Invoice consultation | Sim (fatshare SOAP) | mTLS+WFA | PREPARED_ONLY |
| e-Fatura classification/deductions | Não (portal) | — | UNAVAILABLE |
| Series/ATCUD communication | Via doc submission | mTLS+WFA | PREPARED_ONLY |
| IVA declaration submit | Não verificado p/ terceiros | — | UNAVAILABLE |
| IRS/IRC | Não | — | UNAVAILABLE |
| SAF-T submit | Ficheiro portal/JAR | manual | UNAVAILABLE (export local existe) |
| Payments initiation | Não | — | UNAVAILABLE |

## 12. Evidence Matrix
- Manual Integração Software e-Fatura (AT, PDF oficial): fatcorews :723,
  fatshare :725/:425, WSDL Fatcorews, test env + email `asi-psws@at.gov.pt`,
  subutilizador WFA, CSR. Verificado 2026-09-06.
- FAQs e-Fatura 00978/00996 (AT): vias de comunicação, WFA, multidocumento,
  JAR CLI. Verificado 2026-09-06.
- gov.pt certificação software (Portaria 63/...): pré-requisito jurídico.
- AMA doc-AUTENTICACAO (GitHub): SAML+OAuth2 só p/ autenticação cidadã.
- IVA Automático (AT): confirmação sempre humana no portal.
- DP IVA WS transição (fonte secundária, contamarinhense 2026-08-19): carece
  de verificação do WSDL — não assumido.

## 13. Privacy
Dados AT potenciais (NIF, nomes, documentos, valores, deduções): minimizar
para referência + valores; NIF fora de Life por defeito; retention = ciclo
fiscal + RGPD; audit sem payload.

## 14. Security
Fluxo futuro: sessão → permissão → company(NIF) → consentimento explícito →
conexão (credenciais do cofre) → mTLS+WFA → API oficial → dados mínimos.
Sem service-role→AT sem authorization layer. Estados de erro explícitos
(UNAVAILABLE…REVOKED…); nunca `success:true` como prova.

## 15. Future Inbox Integration
`AT → provider oficial → evento normalizado → routing explícito obrigatório
→ inbox`. AT nunca escolhe org. Classificação/deduções se alguma vez
chegarem por API: mesmo caminho.

## 16. Future A Minha Vida Integration
Só via collector existente, `verified` apenas com fonte oficial real; sem
mudanças na camada Life.

## 17. Limitations
Sem credenciais/testes reais executados; DP IVA WS não verificado; sem
secret storage (bloqueador); sem software certificado (bloqueador jurídico).

## 18. Blockers
1. Secret storage real (interfaces vazias) — `BLOCKED FOR IMPLEMENTATION`.
2. Certificação de software + CSR AT — processo jurídico/operacional externo.
3. Credenciais WFA por NIF — detidas pelos contribuintes, com consentimento.

## 19. Recommended Implementation Order
A (esta fase, done) → B provider/auth design → C consent+connection storage
→ D sandbox com test env → E consulta read-only → F normalização → G inbox
externo → H escrita, só com base legal+técnica. Nunca saltar para H.

## 20. Final Readiness Verdict
`PARTIALLY READY — OFFICIAL CAPABILITY GAPS`
