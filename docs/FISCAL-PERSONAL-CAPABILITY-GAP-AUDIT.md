# Fiscal Personal Capability Gap Audit (RPG-OS)

> Auditoria read-only. Sem segredos, sem rede, sem alterações funcionais.

## 1. Executive summary

Suporte pessoal real: validações, cálculos locais, obrigações user-scoped,
documentos user-scoped, calendário fiscal, LifeItems pessoais. Ausente por
natureza externa: qualquer API oficial AT/SS para pessoas singulares
(e-Fatura pessoal, IRS, SS Direta são Portal-only). Gaps internos reais são
pequenos (Modelo 3 prep, deduções, IMI/IUC obrigações). Nada a corrigir com
urgência (P0 = 0).

## 2. Current architecture

`auth.user → profiles(.tax_number, .sector) → user_id tenant` para pessoal;
`profiles.company_id → companies` só para empresarial/AT. `personalFiscal.ts`
formaliza o gate (`requiresCompany()`).

## 3. Capability matrix (Personal)

| Capability | Current RPG-OS | Type | Official integration | Status | Gap |
|---|---|---|---|---|---|
| NIF individual (validação) | fiscalIdentifiers | local | n/a | LIVE | — |
| NIF no profile | profiles.tax_number | local | n/a | LIVE | — |
| Obrigações pessoais | fiscal_obligations user_id | local | n/a | LIVE | — |
| Faturas pessoais (cliente) | invoices client sem company | local | n/a | LIVE | — |
| Cálculo TSU/SS | fiscalCalculations | local | n/a | LIVE | taxas fixas 2026 |
| Cálculo retenção IRS/IRC | FinancialCalculationService | local | n/a | LIVE | tabelas 2026 |
| Apuramento IVA | fiscalCalculations | local | n/a | LIVE | — |
| Calendário fiscal | fiscalCalendar (IRS_ANNUAL, IMI_ANNUAL…) | local | n/a | LIVE | — |
| Documentos pessoais | documents user-scoped | local | n/a | LIVE | — |
| Notificações genéricas | notificacoes (sem fiscal) | local | n/a | LIVE | fiscal events |
| LifeItems fiscais pessoais | FiscalLifeCollector | local | n/a | LIVE | — |
| e-Fatura pessoal (consulta/deduções) | EFaturaAdapter hardened (sem rede) | — | Portal-only | UNAVAILABLE | API oficial |
| IRS Modelo 3 prep/submissão | só texto de plano + calendário | — | Portal-only | UNAVAILABLE | implementação |
| Deduções/despesas categorizadas | parcial (clientes/doc) | local | n/a | PREPARED_ONLY | motor deduções |
| SS Direta (declarações/pagamentos) | provider DISCONNECTED | adapter | OAuth2/Portal | PREPARED_ONLY | integração |
| IMI/IUC (obrigação+pagamento) | só calendário | local | Portal/Débito Direto | MANUAL | motor+refs |
| SIBS/MB WAY refs | adapters bloqueiam explícito | — | sem contrato | UNAVAILABLE | contrato SIBS |
| Pagamento imposto c/ confirmação | nenhum | — | Portal/banco | UNAVAILABLE | — |

## 4. Personal fiscal identity

`profiles.tax_number` + `sector` (SOLE_TRADER no registo individual) +
`GovernmentIdentityType` (só tipos). Sem entidade persistida — suficiente.

## 5. IRS

A) cálculo LIVE (retenção, TSU); B) preparação NÃO implementada (só plano);
C) armazenamento N/A; D) validação NIF LIVE; E–H) consulta/submissão/
pagamento/reembolso UNAVAILABLE (Portal-only).

## 6. e-Fatura

Local: criar/receber/classificar internamente (efaturaDomain, workflow
Fake/Manual sem fake success — hardening testado). Oficial: comunicar/
consultar/classificar AT, IVA Automático — sem webservice terceiros.

## 7. IVA

Apuramento local LIVE; obrigações empresa via company; sole trader usa
mesmo motor (não modelado como company). Declaração oficial: Portal.

## 8. Segurança Social

Separada da AT. Cálculos LIVE; provider `SegurancaSocialProvider`
`DISCONNECTED` (operações lançam, testado). Capacidades declaradas
(QUERY_OBLIGATIONS, SUBMIT_DECLARATION…) = roadmap, não live.

## 9. Impostos pessoais

IMI/IUC/IMT/IS: só calendário (IMI_ANNUAL). Sem cálculo próprio, sem
pagamento, sem integração. IUC/IMT/IS sem nada dedicado.

## 10. Documentos

User-scoped (`company_id OR owner_user_id`), retention/audit/privacy
existentes. Suficiente para recibos/faturas/declarações/comprovativos.

## 11. Obrigações

`fiscal_obligations` user_id NOT NULL, company_id NULLABLE; query
user-scoped sem company (fiscal/actions.ts). Calendário oficial PT como
fonte de prazos. Nunca chamar "dívida AT" a cálculo local.

## 12. Pagamentos

SIBS/MB WAY/Multibanco: adapters recusam explícito (sem refs falsas).
Sem execução/confirmação de pagamento fiscal. Portal/banco para o resto.

## 13. Notificações

Página genérica sem conteúdo fiscal. LifeItems cobrem prazos/documentos.
Sem eventos externos inventados.

## 14. Official integration matrix

| Serviço | Singular | API oficial 3ºs | Webservice | Portal | RPG-OS |
|---|---|---|---|---|---|
| WFA faturas | NÃO (software cert.) | SIM (WFA+mTLS) | SIM :723/:725 | — | PREPARED_ONLY |
| e-Fatura pessoal | SIM | NÃO | NÃO | SIM | UNAVAILABLE |
| IRS Modelo 3 | SIM | NÃO | NÃO | SIM | UNAVAILABLE |
| IVA declaração | SIM/EMPRESA | NÃO | NÃO | SIM | UNAVAILABLE |
| SS Direta | SIM | parcial/OAuth2 | futuro | SIM | PREPARED_ONLY |
| IMI/IUC | SIM | NÃO | NÃO | SIM/Débito | MANUAL |

## 15. Sole trader

Pessoa singular com atividade (`sector=SOLE_TRADER`, 70%×21.4% TSU,
retenção). Nunca company. Fluxo pessoal + obrigações adicionais já
possível; falta motor de IVA/recibos dedicado (P2).

## 16. Particular sem atividade

IRS/despesas/documentos/obrigações/impostos/notificações: base pronta
via user-scoped; deduções e Modelo 3 são os gaps reais (P1/P2).

## 17. Security/privacy

user_id boundary; NIF≠tenant; redaction keys incluem nif/tax_number
(lib/services/health/audit.ts); sem payload fiscal em logs. Sem achados.

## 18. Gaps

- P0: nenhum.
- P1 (essencial): motor de deduções/despesas categorizadas; preparador
  IRS Modelo 3 (cálculo+anexos, sem submissão).
- P2 (importante): motor IVA/recibos sole trader; obrigações IMI/IUC;
  eventos fiscais em notificações.
- P3 (futuro): SS Direta OAuth2; refs SIBS (contrato); FiscalSubject só
  se API pessoal surgir.
- Tipos: PRODUCT GAP (P1/P2), OFFICIAL API GAP (e-Fatura/IRS/SS),
  PORTAL-ONLY (comings), UNVERIFIED (detalhes SS OAuth2).

## 19. Priority — TOP 10

1. Motor deduções/despesas (P1, local, baixo risco).
2. Preparador IRS Modelo 3 sem submissão (P1).
3. Motor IVA/recibos sole trader (P2).
4. Obrigações IMI/IUC + refs pagamento manual (P2).
5. Eventos fiscais em notificações (P2, interno).
6. Fixar taxas/tabelas 2026 com fonte (P2, compliance).
7. SS Direta: validar OAuth2 oficial (P3, UNVERIFIED).
8. SIBS: contrato antes de código (P3).
9. Documentar Portal-vs-API por capacidade (P3, docs).
10. FiscalSubject: reavaliar só com API pessoal (P3, adiado).

## 20. Roadmap

Fase 1 (local, sem dependências): 1–4. Fase 2 (integrações verificáveis):
7–8 com prova oficial. Fase 3 (modelo): 10 se necessário. Nunca: fake
success, scraping Portal, credenciais no chat, AT empresarial tocado.
