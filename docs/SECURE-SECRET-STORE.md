# RPG-OS — Secure Secret Store (contrato + Vault backend local)

> Backend `VaultSecretBackend` implementado sobre Supabase Vault (Fase D2);
> sem ele ativo, `NotConfigured` fail-closed. Sem credenciais reais.
> Data: 2026-09-06.

> Infraestrutura de segredos sem armazenamento real: contrato pronto,
> backend bloqueado até Vault/KMS. Sem credenciais, sem AT ligado.
> Data: 2026-09-06.

## 1. Purpose
Abstração única (`SecureSecretStore`) para futuros segredos AT (mTLS,
private key, chain, WFA). Código fiscal dependerá dela, nunca de
filesystem/`.env`/DB/browser/logs.

## 2. Threat Model
Exfiltração via UI/logs/audit/erros; cross-company/provider/env;
uso pós-revogação/expiração; fallback plaintext; fake em produção;
mistura TEST/PROD. Cada ameaça tem controlo + teste em
`security/__tests__/secretStore.test.ts`.

## 3. Security Invariants
S1–S15 garantidos por construção: sem retorno à UI (só `reveal()` em
memória na operação), `toString()`/`JSON` redigidos, `sanitizeAuditMetadata`
omite chaves secret/token/password/credential/private-key/certificate/PEM/
WFA, erros só com códigos, sem persistência, acesso server-side autorizado,
isolamento company/provider/environment, revogação/expiração aplicadas,
TEST≠PROD.

## 4. Architecture
`Application → SecureSecretStore → SecretBackend → Vault/KMS/managed`.
Backend concreto: **inexistente** (`NotConfiguredSecretStore` lança em tudo,
incluindo `exists`/`rotate`).

## 5. Secret vs Metadata
Segredo: valores opacos (`reveal()` pontual). Metadata: id, tenant, key,
created/rotated/expiresAt, status — sem valores, sem NIF.

## 6. Storage Backend
Nenhum. Proibido AES caseiro, DB plaintext, `.env`, ficheiros. `FakeSecure
SecretStore` existe só em `__tests__`: in-memory, lança em produção,
sem disco, sem env real.

## 7. Access Control
Fluxo exigido: sessão → permissão → company → conexão → referência →
`retrieve`. Browser nunca recebe segredo; nunca usa `secretId` sem validação.

## 8. Tenant Isolation
Segredos pertencem a COMPANY/NIF (+provider+environment). Sem company:
NO ACCESS. Org só contexto administrativo.

## 9. Provider Isolation
Binding obrigatório `(provider, company, environment, credentialType)`;
AT nunca serve SIBS/GOV_ID/HEALTH.

## 10. Environment Isolation
TEST≠PRODUCTION sem bypass; construção do fake rejeita produção.

## 11. Rotation
`rotate()` substitui + `rotatedAt`; old secret deve ser revogado após
validação (quando houver backend). Sem rotação AT nesta fase.

## 12. Expiration
`expiresAt` em metadata; expirado → `SECRET_EXPIRED`, nunca utilizado.

## 13. Revocation
`REVOKED` bloqueia uso mesmo com valor presente; conexão revogada deve
bloquear operação (camada futura AT).

## 14. Logging
Redação central (`redaction.ts`, estendida a certificate/PEM/WFA);
segunda defesa — a primeira é nunca passar segredos ao logger.

## 15. Audit
Só metadata: `secret.created/rotated/revoked/accessed` futuros com
actor/company/provider/environment/tipo/timestamp/propósito. Sem valores.

## 16. Error Handling
`SecretStoreError` + códigos (`..._NOT_CONFIGURED/_NOT_FOUND/_ACCESS_DENIED/
_REVOKED/_EXPIRED/_BACKEND_ERROR/_INVALID`); `SecretStoreNotConfiguredError`
mantido como subclasse (compat).

## 17. Development
Opção A mantida: `NotConfigured` em dev; sem `dev_secret_store` em disco.

## 18. Production
Fail-closed provado por teste (`NODE_ENV=production` → throw na construção
do fake; `NotConfigured` em tudo).

## 19. AT Preparation
Tipos `AT_CLIENT_CERTIFICATE|AT_CLIENT_PRIVATE_KEY|AT_CERTIFICATE_CHAIN|
AT_WFA_USERNAME|AT_WFA_PASSWORD`; `SecretReference` opaca
(provider/company/environment/tipo/secretId, sem NIF/password).

## 20. Test Matrix
14 testes: fail-closed ×6 ops, códigos, fake-prod, isolamento
company/provider/env/tipo/tenant, revogação, expiração, rotação, leakage
×3. Sem segredos reais.

## 21. Operational Requirements
Backend futuro: KMS/Vault/envelope encryption, rotação, revogação,
least privilege, audit sem segredos, redação em logs.

## 22. Known Limitations
Sem backend real; sem UI de gestão; sem rotação AT; `tenantId` da API base
é opaco (binding forte vive em `putRef/getRef` + validação da camada AT).
