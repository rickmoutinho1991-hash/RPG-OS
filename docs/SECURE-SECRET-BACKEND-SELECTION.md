# RPG-OS — Secure Secret Backend Selection (D1, sem implementação)

> Auditoria de infraestrutura real + decisão. Nada instalado, nada guardado.
> Data: 2026-09-06.

## 1. Executive Summary
Backend recomendado: **Supabase Vault** (já presente e vazio no Postgres
local; nativo em Supabase Cloud). Zero infraestrutura nova; contrato atual
compatível. `BACKEND IDENTIFIED — READY FOR D2` com requisitos operacionais.

## 2. Current Secret Architecture
Contrato `SecureSecretStore` + `NotConfigured` fail-closed + fake só em
testes + redação central (incl. certificate/PEM/WFA). Sem backend, sem
segredos em lado nenhum (verificado).

## 3. Infrastructure Audit
- Compose/K8s/Terraform/Helm/CI/deploy: **inexistentes** no repo.
- Docker local: só stack Supabase (db, kong, auth, rest, storage, realtime,
  studio, mailpit, analytics, vector) + `rpg_os_postgres`. Sem sidecars.
- Cloud provider: **UNKNOWN** (sem evidência; `PRODUCTION-ENVIRONMENT.md`
  cita AWS/Vault como orientação, sem implementação).
- `.env.example`: só placeholders vazios (incl. AT/SIBS); sem valores reais.
- Git (tree + histórico): sem PEM, sem `SECRET_VALUE`/tokens, sem tabelas
  de segredos em migrations. Limpo.

## 4. Environment Audit
Local: Supabase self-hosted via CLI local. Produção: não configurada neste
repo (apenas doc de princípios). CI: inexistente. `UNKNOWN` para staging/prod.

## 5. Security Requirements
R1–R15 do briefing: Vault cumpre R1 (libsodium sealed), R2 (service-role +
RLS por implementar em D2), R4 (update = rotação app-level), R6/R7
(namespacing por nome), R9–R11 (sem plaintext/logs/UI), R14 (chave raiz
gerida pelo operador/Supabase). R3 parcial (sem audit device nativo —
compensar com audit RPG-OS), R12/R13 operacionais (backup do Postgres cobre
Vault; recovery = chave raiz + backup).

## 6. Candidate Backends
Avaliados realmente: HashiCorp Vault (inexistente; overhead injustificado sem
equipa/HA), AWS/Azure/GCP managers (sem cloud definida; lock-in + custo),
Docker Secrets (só swarm/ficheiros; sem rotação/audit; inadequado),
SOPS/age (git-ops, sem servidor; inadequado a runtime), Supabase Vault.

## 7. Comparison Matrix
| Backend | Encryption | Rotation | IAM | Audit | HA | Local | Prod | Complex. | Fit |
|---|---|---|---|---|---|---|---|---|---|
| HashiCorp Vault | Sim | Sim | Sim | Sim | Sim | média | alta | alta | Excesso atual |
| AWS/Azure/GCP | Sim | Sim | Sim | Sim | Sim | N/A | alta | média | Sem cloud definida |
| Docker Secrets | Fraca | Não | Não | Não | N/A | Sim | Não | baixa | Inadequado |
| SOPS/age | Sim | Manual | Não | Não | N/A | Sim | Não | baixa | Inadequado runtime |
| **Supabase Vault** | **Sim (sealed)** | **App-level** | **Service-role+RLS** | **App-level** | **=Postgres** | **Sim** | **Sim** | **baixa** | **Recomendado** |

## 8. Local Development
Vault local já operacional (schema presente, 0 segredos). D2 usa-o
diretamente; `NotConfigured` mantém-se até D2 ligar o backend.

## 9. Production
Mesmo mecanismo em Supabase Cloud (Vault nativo). Sem provider novo.

## 10. Access Model
Sessão→permissão→company→conexão→referência (`vault.secrets.name` =
`at/<company>/<env>/<tipo>/<uuid>`)→leitura service-role → uso em memória.
Browser nunca toca no Vault.

## 11. Secret Lifecycle
CREATE (D2, com consentimento) → STORE (Vault) → USE (memória) → ROTATE
(update + `rotatedAt`) → REVOKE (apagar ou marcar; sem leitura) → DELETE.
Quem/onde/estado/audit por operação (detalhe na D2).

## 12. Rotation / 13. Revocation
Update de linha + `rotatedAt`; old invalidado por substituição atómica;
sem leitura após revoke (status em metadata RPG-OS ou ausência da linha).

## 14. Audit
Leituras/escritas via audit RPG-OS (`secret.created/rotated/revoked/
accessed`, só IDs); Vault sem audit device → compensação documentada.

## 15. Recovery
Backup Postgres inclui Vault; recovery exige chave raiz pgsodium +
backup (requisito operacional a documentar na D2; `OPERATIONAL REQUIREMENT`
para runbooks).

## 16. Availability
= disponibilidade do Postgres; sem Vault, fail-closed (nunca fallback).

## 17. Threat Model
T1 (backend creds) → só service-role server-side. T2 (app comprometida) →
isolamento atenua, não elimina (declarado). T3–T5 (tenant/provider/env
errados) → namespacing + validação. T6–T8 (logs/erros/browser) → redação +
API sem valores. T9 (operador) → least privilege + audit. T10 (backup) →
encriptação + controlo de acesso ao backup. T11–T13 (expirado/revogado/
rotação) → verificações. T14 (outage) → fail-closed.

## 18. CI/CD
Inexistente no repo; quando existir: OIDC/identidade de workload, sem
segredos no repo nem impressos em logs (requisito, não implementação).

## 19. AT Requirements
Tipos já definidos; nomes Vault por NIF/company; WFA username pode ser
metadata; rotação por reemissão; expiração por validade do certificado.

## 20. Recommended Backend
**Supabase Vault**, via novo `VaultSecretBackend` em D2 implementando o
contrato atual (put/get/delete/list/exists/rotate sobre `vault.secrets`
com namespacing + RLS por implementar).

## 21. Implementation Prerequisites
Nada a provisionar localmente; produção exige projeto Supabase com Vault
ativo + runbook de chave raiz + política de backup.

## 22. D2 Implementation Plan
1) `VaultSecretBackend` (service-role, namespacing, sem valores em erro/log).
2) RLS em `vault.secrets` (defesa em profundidade; app continua authority).
3) Ligar ao contrato (seletor TEST-only vs Vault, produção rejeita fake).
4) Testes de integração contra Vault local (sem segredos reais).
5) Runbook operacional. Sem AT, sem WFA, sem mTLS ainda.

## 23. Known Unknowns
Comportamento Vault em Supabase Cloud gerido (assumido equivalente);
quotas de tamanho (verificar PEM+chain na D2); historial de versões
(confirmar `updated_at` suficiente ou tabela de versões).

## 24. Final Verdict
`BACKEND IDENTIFIED — READY FOR D2`
