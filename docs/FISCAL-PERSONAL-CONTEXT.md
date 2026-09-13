# Contexto Fiscal Pessoal (P1.2)

> Despesa → contexto declarado → regra 2026.1 → estimativa local.
> Sem AT, sem rede, sem segredos, sem NIF armazenado.

## Objetivo

Permitir que uma despesa deixe de ficar em `MANUAL_REVIEW` quando o
utilizador declara o contexto fiscal mínimo — sem que isso signifique
confirmação oficial.

## Modelo

Três flags NULLABLE em `personal_deductions` (migration `20260915000000`):

- `fatura_comunicada` — fatura comunicada à AT (declaração local).
- `buyer_nif_match` — adquirente corresponde ao NIF do utilizador
  (booleano; NIF nunca armazenado, nunca comparado contra valor guardado
  — não duplicar PII).
- `cae_elegivel` — atividade/CAE elegível para a categoria.

NULL = não informado. Sem tabela separada (complexidade injustificada).

## Motivo de cada campo

Exigidos pelos art. 78.º-B/C/D (fatura comunicada + NIF adquirente + CAE).
Cada um mapeia `nifAdquirente`/`faturaComunicada`/`caeElegivel` do motor.
Nada mais é recolhido (sem fornecedor, morada, IBAN, OCR, anexos).

## Privacy rationale

Booleanos não identificam ninguém; NIF do utilizador vive só em
`profiles.tax_number` (RLS própria). Sem PII redundante por despesa.

## Fluxo

Criação (flags opcionais) ou edição posterior → validação estrita
(`parseContextFlag`: só booleanos) → `evaluatePersonalExpense()` com
ruleset 2026.1 → `fiscal_status/deductible_cents/reason_code/rule_version`
calculados server-side → idempotente (UPDATE mesma linha).

## Estados

Sem contexto/contexto parcial → `MANUAL_REVIEW` (`MISSING_CONTEXT`).
Contexto total → regra aplicável (`ELIGIBLE/PARTIALLY_ELIGIBLE` ou
`NOT_ELIGIBLE`). Fora de 2026 → `OUT_OF_YEAR`. Estimativa local, nunca
confirmação AT (UI: "não confirmado pela AT").

## Regras 2026.1 (preservadas)

Gerais 35%/€250, Saúde 15%/€1000, Educação 30%/€800. Sem limite global
78.º n.º 7, sem monoparental/rendas/refeições (GAP P1.3).

## Limitações

Contexto é declaração do utilizador, não verificação. Agregado,
receita médica, estudante deslocado continuam MANUAIS. Sem Modelo 3.

## Gaps P1.3

Recolha guiada por categoria; preparador Modelo 3 (só cálculo);
variantes condicionadas com contexto adicional auditado.
