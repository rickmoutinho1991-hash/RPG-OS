# Runbook — AT Connectivity Test (RPG-OS, TEST only)

> Sem credenciais = sem teste real possível. Nunca inventar resultado.

## 1. TEST setup
Pré: Docker + Supabase locais; `at_connections` com empresa/NIF/consent;
credenciais TEST (cert + WFA) configuradas via UI admin (D4.x).

## 2. Credentials
Certificado de TESTES oficial (email AT) + subutilizador WFA de TESTES.
Nunca produção aqui. Nunca colar segredos neste runbook.

## 3. WFA
Subutilizador do NIF emitente com perfil WFA, criado no Portal.

## 4. Connectivity test
UI `/administracao/at` → "Testar ligação", ou POST
`/api/administracao/at/connections/:id/test`. Esperado com credenciais:
`CONNECTED` + `EstadoOperacao` oficial.

## 5. Diagnostics
- `CONFIGURATION_ERROR`: sem credenciais/consent — completar setup.
- `AT_TLS_ERROR`/`AT_CERTIFICATE_ERROR`: cert inválido/expirado/mismatch.
- `AUTH_FAILED` (fault): WFA errado ou sem perfil.
- `UNKNOWN` (timeout): repetir manualmente; nunca assumir AUTH_FAILED.
- `NOT_CONNECTED`: rede/DNS/endpoint.

## 6. TLS / WFA / SOAP faults
Verificar validade do cert, match cert/key, perfil WFA, envelope contra
WSDL; guardar só fault code + correlation.

## 7. Rotation / 8. Revocation
Pelos fluxos D3 (refs) + novas credenciais na origem; revogar conexão
bloqueia testes futuros.

## 9. Production promotion
Só após: TEST CONNECTED + erros tratados + credenciais PROD reais + WFA
PROD + approval explícita + flag de desbloqueio (ainda inexistente).
PRODUÇÃO BLOQUEADA até lá.

## 10. Rollback
Sem estado persistente além de `updated_at`; remover credenciais do Vault
para desativar.
