# RPG-OS — "A Minha Vida" Implementation V1

> Action-first experience em `/vida`. Personal Operating System, não dashboard.
> Data: 2026-09-05. Estado: funcional V1.

## O que foi construído

`/vida` responde primeiro a **"O que é importante para mim agora?"** e só
depois a "O que tenho?". Fluxo: **contexto → atenção → ações → timeline → domínios**.

## Camada Life (packages/core)

| Ficheiro | Responsabilidade |
|---|---|
| `src/services/life/LifePriority.ts` | `sortLifeItems` determinístico (overdue → dueDate → priority → actionability → confidence → id). Sem IA. |
| `src/services/life/LifeActionDispatcher.ts` | `resolveLifeAction`: view/consult/pay/validate/download → casa do domínio; `connect_learn` → `/integracoes`; `consult_manually` → instruções (sem link); `none` → sem ação. `sourceLabel` legível (ex.: "CTT Portagens"). |
| `src/services/life/LifeAggregationService.ts` | `aggregateLife` com `Promise.allSettled`: collectors paralelos, isolamento de falhas, `LifeAggregationResult { items, events, domainStatuses, errors, generatedAt }`. Sem event bus. |
| `src/services/life/LifeCollectors.ts` | `FinanceLifeCollector` (LIVE, contas/dívidas reais), `DocumentsLifeCollector` (documentos a expirar ≤30d), `MobilityLifeCollector` (PREPARED_ONLY, zero itens), stubs honestos health/fiscal/government/social_security. Agenda+tarefas NÃO são collectors (sem domínio Life próprio — seria origem falsa); vão em `TodayContext` separado. |
| `src/services/life/__tests__/lifeAggregation.test.ts` | 14 testes: sorting, finance mapping, mobility nunca `pay`, partial failure, empty state, dispatcher, source mapping. |

## Aggregation web (apps/web/lib/vida/lifeAggregation.ts)

Server-only. Resolve `getSessionContext` (nome) + `resolveFinanceTenant`
(userId/companyId). Reutiliza `loadFinanceTenantData` e `applyTenantScope`;
documentos com scope `company_id/user_id`; agenda/tarefas por `user_id`.
Três cargas em `Promise.allSettled`; falhas viram collectors que falham
isoladamente (a agregação degrada, nunca cai). Nome só quando real
(nunca "Utilizador" nem prefixo de email).

## UI (apps/web)

| Ficheiro | Secção |
|---|---|
| `app/vida/page.tsx` | Server component: greeting contextual + `LifeAttention` + `VidaTodaySection` + `LifeTimeline` + `LifeDomains`. Parcial → aviso + "Tentar novamente". Sem sessão → login. |
| `app/vida/loading.tsx` | Skeleton (nunca "0 assuntos" durante loading). |
| `components/vida/LifeAttention.tsx` | Top-3 itens + detalhe em diálogo acessível (Escape, foco, `role="dialog"`). Empty state honesto. |
| `components/vida/VidaTodayTimeline.tsx` | HOJE (agenda + tarefas vencidas/hoje + eventos Life) e TIMELINE agrupada (Em atraso/Hoje/Próximo/Anterior). Empty states sem fake. |
| `components/vida/LifeDomains.tsx` | 7 domínios compactos com estados honestos. |
| `components/vida/StatusBadge.tsx` | LIVE/PREPARED_ONLY/MANUAL/UNAVAILABLE/ERROR com label+ícone+texto (nunca só cor). |
| `components/layout/Sidebar.tsx` | "Centro de Vida" → "A Minha Vida". |

Removidos: `app/vida/VidaClient.tsx`, `app/vida/actions.ts` (dashboard antigo +
assistente IA — fora do âmbito V1).

## Decisões e trade-offs

1. **Finance `pay` não aparece como ação Life**: o collector emite `view`
   (o pagamento acontece no domínio). Evita prometer pagamento cross-domain.
2. **Agenda/tarefas fora do modelo Life**: sem `LifeDomain` próprio, mapear
   para outro domínio seria origem falsa. Vão em canal próprio com links
   corretos (`/agenda`, `/tarefas`).
3. **Eventos Life de finanças**: só contas vencidas (timeline "Em atraso").
   Sem eventos inventados.
4. **Health/Fiscal/Gov/SS**: stubs honestos até haver dados reais acessíveis.
5. **Sem IA, sem event bus, sem notificações**: implementação síncrona.

## Riscos abertos

- `TodayContext` usa tabelas `calendar_events`/`tasks` diretamente na camada
  vida (com scope); se surgir um domínio Agenda formal, migrar para collector.
- `LifeEvent.domainTitle` ("Agenda"/"Tarefas") não é usado em V1 (decisão
  acima); se o modelo `LifeDomain` for estendido, reavaliar.
- Build web falha por erros pre-existentes (mobilidade routes, ready test) —
  ver relatório final.

## Próximo passo recomendado

Ligar o primeiro stub a dados reais (Fiscal via `fiscalCalendar`/`fiscalInbox`
ou Health quando houver consentimento), mantendo o mesmo contrato
`LifeCollector`. Depois: `LifeEvent` com `relatedLifeItemId` e drill-in.
