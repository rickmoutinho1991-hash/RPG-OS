# Runbook — AT Invoice Submission (D5, dry-run apenas)

> Nenhuma submissão real existe. Este runbook cobre preparação e diagnóstico.

## 1. TEST preparation
Pré: invoice ISSUED da própria company + `fiscal.manage`. Página da fatura
→ "Preparar submissão (validação local)".

## 2. Credential requirements
N/A nesta fase (sem envio). Para D4-futuro: cert+WFA TEST no Vault.

## 3. Certificate requirements
N/A (sem envio). Validação de formato apenas no dry-run.

## 4. WFA
N/A (sem envio). Nunca colar WFA em lado nenhum para "testar".

## 5. Invoice preparation
Emitir normalmente; estado tem de ser ISSUED; totais consistentes;
NIF emitente/adquirente presentes (adquirente via perfil do cliente).

## 6. Dry run
Botão prepara e regista NOT_SUBMITTED (idempotente). Erros possíveis:
FORBIDDEN, NOT_ELIGIBLE_*, MISSING_FIELDS (lista campos).

## 7. Official test
BLOQUEADO até D4 handshake + decisão de ativação. Não executar envios
manuais por outros meios e chamar-lhes "teste".

## 8. Failure diagnosis
- MISSING_FIELDS → completar dados da fatura/cliente.
- NOT_ELIGIBLE_* → estado da fatura não permite.
- FORBIDDEN → company/permissão.
- Erro DB → logs server (sem segredos), sem retry cego.

## 9. UNKNOWN handling
N/A (sem envios). Futuro: reconciliar via fatshare antes de reenviar.

## 10. Reconciliation
PREPARED_ONLY (futura).

## 11. Rotation / 12. Revocation
Pelos fluxos D3 (credenciais) + estados da submissão (nunca apagar
histórico; revogar conexão bloqueia futuros envios).

## 13. Production promotion
BLOQUEADA. Requer checklist D4 + ativação explícita inexistente.

## 14. Rollback
Apagar linhas NOT_SUBMITTED órfãs se necessário (registos locais, sem
efeito externo); nunca "des-submeter".
