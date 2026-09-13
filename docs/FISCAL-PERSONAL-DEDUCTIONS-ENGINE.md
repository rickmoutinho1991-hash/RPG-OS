# Motor Pessoal de Despesas e Deduções (P1)

> Motor 100% local. Sem AT, sem rede, sem segredos. Sem fake success.

## 1. Objetivo

Representar despesas pessoais, classificá-las e estimar dedutibilidade
local para preparação de IRS. Nunca submeter, nunca consultar a AT.

## 2. Modelo

`personal_deductions` (migration `20260914000000`): id, user_id (tenant),
expense_date, description (≤200), amount_cents (INTEGER >0), currency EUR,
category (CHECK fechado), fiscal_status, deductible_cents, reason_code,
rule_version, source_type/source_reference (idempotência por
UNIQUE(user_id, source_type, source_reference)). RLS próprio utilizador.

## 3. Categorias

GENERAL_FAMILY_EXPENSES, HEALTH, EDUCATION, HOUSING, ELDERLY_CARE, ALIMONY,
PENSION, DONATION, INSURANCE, OTHER, UNKNOWN. Categoria comercial ≠ fiscal.

## 4. Estados

UNKNOWN, PENDING_VALIDATION, ELIGIBLE, PARTIALLY_ELIGIBLE, NOT_ELIGIBLE,
MANUAL_REVIEW. Nunca "aprovado pela AT".

## 5. Motor

`evaluatePersonalExpense(input, rules)` em
`packages/core/src/security/personalDeductions.ts`: puro, determinístico,
cents inteiros. Entrada inválida → NOT_ELIGIBLE/INVALID_INPUT; sem regra
verificada → MANUAL_REVIEW/RULE_UNVERIFIED.

## 6. Regras versionadas

`TaxDeductionRuleSet { taxYear, jurisdiction, version, source, verifiedAt,
rules }`. Ruleset distribuído `2026.0-unverified`: zero taxas → tudo
MANUAL_REVIEW. Taxas só com fonte oficial comprovada.

## 7. Provenance

ruleVersion + reasonCode + sourceType/sourceReference por avaliação.
Sem legislação copiada, sem payloads.

## 8. Dinheiro

Cents INTEGER em todo o lado (DB, motor, UI). `Math.floor` em rateios.

## 9. Tenant

user_id da sessão; sem company; RLS `auth.uid() = user_id`; service-role
só via actions autorizadas (leitura fiscal.view, escrita fiscal.manage).

## 10. RLS

`personal_deductions_owner_all` FOR ALL USING/WITH CHECK auth.uid()=user_id.

## 11. Privacy

Descrição curta; sem fornecedor/NIF/documentos no registo; LifeItems e
audit só com IDs/códigos. Sem "Farmácia X — 32,50€" em agregados.

## 12. UI

`/fiscal` → `DeductionsClient`: registar, listar, remover, resumo anual
("Resumo fiscal pessoal"). Linguagem: "Estimativa local", "Por validar",
"Não confirmado pela AT".

## 13. Limites

Sem elegibilidade fiscal real (regras 2026 não verificadas); sem Modelo 3;
sem e-Fatura; sem pagamentos; sem notificações fiscais dedicadas.

## 14. O que NÃO faz

AT, handshake, submissão, comSP, consulta, Vault, produção, Fiscal Inbox,
routing, A Minha Vida estrutural.

## 15. Roadmap para IRS preparation

Motor de anexos/deduções verificadas → preparador Modelo 3 (sem submissão)
→ só então avaliar integrações oficiais comprovadas.
