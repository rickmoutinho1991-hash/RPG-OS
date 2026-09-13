# Runbook — AT Credentials (RPG-OS, sem conectividade)

> Operações administrativas sobre registos de ligação AT. Nenhum passo
> contacta a AT. Sem segredos reais em lado nenhum.

## 1. Credential onboarding
Pré: empresa com NIF válido + `fiscal.manage`. UI `/administracao/at` →
Rever → Confirmar. Cria `at_connections(NOT_CONNECTED)` + consentimento AT.
Verificar na lista (estado + data).

## 2. Certificate import
NÃO DISPONÍVEL nesta fase (marcador D4). Não colar PEMs em lado nenhum.

## 3. CSR workflow
NÃO DISPONÍVEL (PKCS#10 requer confirmação de algoritmo/requisitos AT).
Quando existir: gerar par seguro → CSR → exportar sob permissão → submeter
à AT fora da app → importar certificado.

## 4. WFA credential setup
NÃO DISPONÍVEL. Quando existir: credenciais por NIF no Vault, nunca na DB;
NIF validado contra empresa; subutilizador criado no Portal pelo detentor.

## 5. Rotation
Futura via `rotateRef` + validação + switch de referência. Nunca apagar a
antiga antes de validar a nova.

## 6. Revocation
UI Revogar (fiscal.admin) ou `revokeAtConnection`. Efeito imediato no acesso;
segredos seguem quarentena→delete explícito (D4).

## 7. Expiration
Monitorizar `cert_not_after` (quando preenchido); expirado bloqueia READY.

## 8. Incident response
1. Revogar conexão. 2. Revogar consentimento. 3. Rodar credenciais na origem
(AT/Portal). 4. Auditar acessos. 5. Se suspeita de Vault: compromisso total.

## 9. Backup / 10. Recovery
Cobertos pelo runbook do Vault (backup Postgres + chave raiz). Conexões são
linhas normais no backup.

## 11. Production checklist
- [ ] `at_connections` com RLS ativa (verificar policies).
- [ ] Sem refs NULL inesperadas em produção quando D4 chegar.
- [ ] `ALLOW_FAKE_PROVIDERS=false`, `NODE_ENV=production`.
- [ ] Nenhum estado ACTIVE sem conectividade verificada (D4).
