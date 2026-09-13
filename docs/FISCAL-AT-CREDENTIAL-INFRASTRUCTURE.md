# RPG-OS — AT Credential Infrastructure (D3, sem conectividade)

> Infraestrutura de credenciais AT preparada. AT NOT_CONNECTED. Sem chamadas,
> sem segredos reais. Data: 2026-09-06.

## 1. Scope
Registo `at_connections` + estados/cripto puros + UI admin mínima. Sem
conectividade, CSR, importação real ou producer.

## 2. Architecture
`UI → server actions → at_connections (+Vault futuro) → estados puros`.
Camadas DOMAIN/AUTH/CONSENT/SECRET/TRANSPORT separadas; só as 4 primeiras
existem.

## 3. AT Connection model
`(company_id, environment)` UNIQUE; NIF copiado de `companies.tax_number`
server-side; consentimento `government_consents(AT)`; refs Vault NULL;
metadata de certificado NULL; RLS member-via-bridge + service-role.

## 4. Company/NIF ownership
NIF sempre de `companies.tax_number` da empresa do perfil; formato validado
localmente; pedido com outra company → FORBIDDEN. Organization nunca é
identidade AT.

## 5. Consent
Criado junto da conexão (provider AT, scopes internos
`at.documents.*`, source user, org ativa); revogável; sem segredos; consent
≠ autorização AT.

## 6. Credential references
Colunas `*_secret_ref` existem, sempre NULL nesta fase; valores futuros só
no Vault com binding (provider, company, env, tipo).

## 7. Vault integration
Nenhuma escrita D3 (refs NULL). Futura: `putRef` por tipo após validação,
nomes `at/<company>/<ENV>/<tipo>/<uuid>`.

## 8. WFA
Sem armazenamento; sem reutilizar password do Portal (documentado).

## 9. Certificate / key / chain
Só metadata futura; PEM nunca na DB/browser; matching via thumbprint JWK
(`certificateMatchesPrivateKey`, testado com chaves efémeras).

## 10. CSR
Abstração pendente: PKCS#10 indisponível em Node nativo.
`ALGORITHM REQUIREMENT — VERIFY BEFORE D4` (histórico AT: RSA; confirmar
no WSDL/CSR da AT antes de submeter).

## 11. Lifecycle
`NOT_CONNECTED → CREDENTIALS_PENDING → READY → (ACTIVE só em D4) →
REVOKED`, mais `INVALID`/`EXPIRED`. READY ≠ CONNECTED (nunca convertido).

## 12. Rotation / 13. Revocation / 14. Expiration
Preparados em tipos/estados; revoke implementado (linha + bloqueio de uso);
rotação real em D4.

## 15. Authorization
Leitura/criação `fiscal.manage`; revogação `fiscal.admin`; actor/company/org
da sessão; sem IDs do browser como autoridade.

## 16. RLS
Member-via-bridge SELECT + service-role writes (verificado no banco).

## 17. Audit
`at.connection.created/revoked` (IDs + env); sem NIF? — NIF da própria
empresa visível a admins: incluído? Não — só IDs e env (decisão conservadora).

## 18. Error mapping
`AtCredentialError` com 12 códigos, sem segredos nas mensagens.

## 19. Failure recovery
Falhas retornam erro explícito; sem estados intermédios (operações atómicas
por query); sem compensação distribuída (sem Vault writes ainda).

## 20. Testing
6 testes estados/crypto + matriz existente; sem fixtures reais.

## 21. Security
Threats T1–T14 cobertos por design (§25 do plano): binding NIF, isolamento,
revogação, expiração, sem logs, fakes bloqueados.

## 22. Production limitations
Sem cofre ligado, sem CSR, sem import, sem conectividade. `ACTIVE`
inalcançável por construção.

## 23. AT connectivity remains D4
Confirmado: zero chamadas, zero tokens, zero scraping no código novo.
