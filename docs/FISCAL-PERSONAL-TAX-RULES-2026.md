# Regras Fiscais Pessoais 2026 — IRS Deduções (P1.1)

> Fonte: CIRS republicado (info.portaldasfinancas.gov.pt), verificado em
> 2026-09-09. Despesas de 2026 → declaração Modelo 3 em 2027.
> Sem valores inventados; sem integração AT.

## Fichas de regra

### GENERAL_FAMILY_EXPENSES

- TAX YEAR: 2026 · DECLARATION YEAR: 2027 · APLICAÇÃO: faturas emitidas em 2026.
- RULE: 35% das despesas gerais familiares comunicadas à AT.
- ELIGIBILITY: fatura comunicada (DL 198/2012) ou Portal; NIF adquirente;
  fora do âmbito empresarial para sujeitos passivos de IVA.
- RATE: 3500 bps · CAP: €250/sujeito passivo (25000c).
- VARIANTE NÃO IMPLEMENTADA: monoparental 45%/€335 (exige contexto agregado).
- SOURCE: CIRS art. 78.º-B · SOURCE DATE: 2026-09-09.
- VERIFIED: YES · IMPLEMENTABLE: YES (com contexto) · IMPLEMENTADO: YES.

### HEALTH

- TAX YEAR: 2026 · DECLARATION YEAR: 2027.
- RULE: 15% das despesas de saúde (incl. seguros de saúde exclusivos).
- ELIGIBILITY: fatura comunicada, CAE saúde/farmácia/ótica, NIF; taxa normal
  só com receita médica (Portal); exclui comparticipações.
- RATE: 1500 bps · CAP: €1000 global (100000c).
- SOURCE: CIRS art. 78.º-C · VERIFIED: YES · IMPLEMENTADO: YES (com contexto).

### EDUCATION

- TAX YEAR: 2026 · DECLARATION YEAR: 2027.
- RULE: 30% das despesas de educação/formação.
- ELIGIBILITY: fatura comunicada, CAE educação/livros/creches, NIF;
  estabelecimentos reconhecidos; exclui reembolsos/planos.
- RATE: 3000 bps · CAP: €800 global (80000c).
- VARIANTES NÃO IMPLEMENTADAS: rendas estudante deslocado (teto €800+€300,
  rendas máx €400; condições idade/distância/Portal) e refeições escolares
  (exigem contexto + indicações Portal).
- SOURCE: CIRS art. 78.º-D · VERIFIED: YES · IMPLEMENTADO: YES (base).

### HOUSING / ELDERLY_CARE / ALIMONY / DONATION / INSURANCE / OTHER

- VERIFIED: NO (não pesquisadas a fundo nesta fase) · IMPLEMENTADO: NO →
  MANUAL_REVIEW + RULE_UNVERIFIED.
- Notas: habitação (78.º-E) e lares (art. 84.º) têm regras próprias com
  condições; donativos/alimentos dependem de agregado/documentos.

## Limite global (art. 78.º n.º 7)

Soma de saúde+educação+imóveis+lares+alimentos+exigência fatura+benefícios:
sem limite (1.º escalão) / fórmula intermédia / €1000 (último escalão);
+5%/dependente (3+). Exige rendimento coletável + dependentes + regime
tributário → NUNCA calculado no motor (sem agregado). Documentado, não
implementado.

## Contexto exigido (Fase 6/7)

Por despesa: faturaComunicada + nifAdquirente + caeElegivel. Ausente →
MANUAL_REVIEW + MISSING_CONTEXT. P1 não recolhe estes dados (decisão
consciente — Fase 7: SUPPORTED_WITH_CURRENT_DATA = taxas/caps;
REQUIRES_FISCAL_DATA = confirmação de elegibilidade).

## Arredondamento

`floor(base × bps / 10000)` em cents inteiros; teto via `min()`.
Testes: 1/99/999/10000c, cap-1/cap/cap+1.

## Provenance

ruleVersion `2026.1-cirs-2026-09-09`, source e verifiedAt no ruleset;
reasonCode por avaliação. URLs só aqui, nunca em dados pessoais.
