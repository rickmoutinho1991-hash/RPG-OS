# Runbook — Secret Vault Operations (RPG-OS)

> Operações sem segredos reais. Sem AT ligado. Comandos seguros para repetir.

## 1. Local setup
Pré-requisitos: Docker Desktop a correr; `apps/web/node_modules/.bin/supabase.cmd`
(v2.116.0, local ao projeto — nada global). Nenhum secret necessário.

## 2. Vault health verification
```powershell
docker ps --format "{{.Names}} {{.Status}}"   # supabase_db_RPG-OS healthy
Test-NetConnection 127.0.0.1 -Port 54322     # Postgres local
# Tabelas/funções (via psql no container):
# \dt vault.*  ·  \df vault.create_secret  ·  ACLs só postgres+service_role
```
Nunca imprimir valores de `vault.decrypted_secrets`.

## 3. Enable backend
`SECRET_BACKEND=vault` no `.env.local` (server-side) + URL/service-role
Supabase já configurados. Sem esta var: `NotConfigured` (fail-closed).

## 4. Disable backend
Remover `SECRET_BACKEND` (ou qualquer valor ≠ `vault`) → `NotConfigured`.
Fake nunca é usado fora de testes (construtor lança em produção).

## 5. Root key handling
Chave raiz pgsodium gerida pelo operador/Supabase. Nunca logar, imprimir,
versionar ou devolver. Rotação da chave raiz: procedimento Supabase oficial,
fora da aplicação.

## 6. Backup
Backup do Postgres inclui `vault.secrets`. Recovery exige backup + chave
raiz. Testar restauro num ambiente isolado antes de produção.

## 7. Recovery
Sem chave raiz não há recovery (by design). Sem fallback plaintext —
reemitir credenciais junto das entidades oficiais.

## 8. Rotation
Via `rotateRef` (app) ou `vault.update_secret` direto (operador, com
autorização). Verificar leitura após rotação; `rotatedAt` em metadata.

## 9. Incident response
1. Revogar referência (`revokeRef` / UPDATE description `REVOKED`).
2. Rodar credencial na entidade oficial (AT: novo CSR/subutilizador).
3. Auditar acessos (`secret.*` no audit RPG-OS).
4. Se suspeita de exfiltração do cofre: tratar como compromisso total —
   rodar chave raiz + todas as credenciais.

## 10. Compromised credential
Revogar primeiro (bloqueio imediato), depois rodar na origem, depois
confirmar leitura negada. Nunca apagar antes de auditar.

## 11. Production checklist
- [ ] Projeto Supabase com Vault ativo (confirmar schema/funções).
- [ ] `SECRET_BACKEND` só via configuração segura (nunca no repo).
- [ ] RLS/policies revistas (apenas service_role executa wrappers).
- [ ] Backup + chave raiz testados.
- [ ] `ALLOW_FAKE_PROVIDERS=false`, `NODE_ENV=production`.
- [ ] Sem `TEST_*` a apontar para produção (isolamento TEST≠PROD).
