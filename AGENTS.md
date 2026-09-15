# AGENTS.md

## ESTADO ATUAL DO PROGRAMA (HANDOFF VIVO)
> Auto-manutenção: no fecho de CADA ciclo ou vaga de commits, atualizar HEAD, contagens de gates e menu desta secção (máx 40 linhas). Doutrina completa: secção própria abaixo — nunca duplicar aqui.

- HEAD 4c5d2de | 15-09-2026 | árvore limpa | RAIO-X v2 GREEN
- 15-09-2026: história reescrita para remover blobs .turbo (>100MB); SHAs pré-rewritten preservados em D:\Projetos\rpg-os-pre-rewrite.bundle (offline); remoto origin/main = pós-rewrite
- 15-09-2026: limpeza adicional .next na história (R5); top blob agora <50MB
- Gates: 4x0 — 115 files / 1760 pass / 6 skip; delta de testes obrigatório em todo relatório
- Loop de mercado COMPLETO e verificado: pedido→propostas→aceitação→contrato→milestones→evidência→pagamento→garantia; transições só no core; efeitos (finanças/garantia) idempotentes na web
- Segurança: RLS 0 gaps public · bucket marketplace-evidence privado · audit sem value · demo opt-in ?demo=1 sintético · segredos tracked 0 · rotas mercado login-gated (200 shell, escolha UX registada)
- DB: 46 migrações = disco; DEV aplicado; PROD nunca automático (Regra #99)
- Release: checklist docs/DEPLOY.md exige RAIO-X verde em prod antes de anunciar
- Toolchain: pnpm 11; suspeita → clone fresco em $env:TEMP
- Menu: B2 (SÓ pós-deploy HTTPS) · push pendente owner · polish sob indicação

## Arquitetura do RPG-OS (Personal + Business Operating System)

O RPG-OS é uma plataforma de inteligência e gestão operacional pessoal e empresarial baseada numa arquitetura monorepo com recurso a Turborepo, pnpm como gestor de pacotes e TypeScript strict para tipagem integral de ponta a ponta.

### Estrutura de Diretórios

- **`apps/web`**: Aplicação web principal do RPG-OS (Next.js 16 + React 19 + TypeScript + Tailwind CSS / CSS Modules).
- **`packages/core`**: Pacote partilhado que encapsula validações fiscais e de telecomunicações portuguesas (NIF, NIPC, Códigos Postais, Telefones PT), cálculo de IVA, adaptadores oficiais (AMA Chave Móvel Digital / Cartão de Cidadão, Autoridade Tributária & e-Fatura, SIBS Multibanco & MBWay, SMS Gateway e Sincronização de Dispositivos / Smartwatches).
- **`supabase/migrations`**: Esquema SQL unificado com tabelas relacionais, enums, índices de performance e políticas para gestão de identidades, entidades, obras, propostas, documentos fiscais, guias de transporte AT, agenda/rotinas de saúde, subscrições SaaS, consentimentos RGPD e registo de dispositivos.

---

## Módulos do Sistema

1. **Autenticação & Identidade Digital**:
   - Início de sessão seguro com palavra-passe, link mágico e integração com **Chave Móvel Digital / Cartão de Cidadão (AMA)**.
   - Controlo de acessos baseado em perfis (RBAC) com permissões granulares.
   - Proteção contra concorrência e tratamento robusto de emails/NIFs duplicados.

2. **Clientes, Empresas & Profissionais**:
   - Registo e acompanhamento unificado de Particulares, Empresas (coletivas), ENI e Trabalhadores.
   - Validação fiscal imediata de NIF e NIPC (módulo 11 da AT) e códigos postais portugueses (XXXX-XXX).

3. **Obras & Gestão de Projetos**:
   - Criação de empreitadas associadas a clientes particulares ou empresas.
   - Gestão de tarefas por prioridade, registo de materiais consumidos e evidências fotográficas em nuvem.

4. **Orçamentação & Propostas**:
   - Criação de propostas com cálculo automático de IVA (23%, 13%, 6% ou isenção legal).
   - Conversão direta de orçamento aprovado em obra ativa com tarefas planeadas.

5. **Faturação, Pagamentos & SAF-T (PT)**:
   - Emissão de Faturas (FT), Faturas-Recibo (FR), Faturas Simplificadas (FS) e Notas de Crédito (NC).
   - Geração de código ATCUD e estrutura de comunicação com o Webservice e-Fatura.
   - Exportação do ficheiro oficial **SAF-T (PT) XML Schema v1.04_01** em `/api/saft/export`.
   - Geração de referências Multibanco e pedidos de pagamento instantâneo por MBWay.

6. **Guias de Transporte & Bens em Circulação**:
   - Emissão de Guias de Transporte (GT, GR, GD, GA) em conformidade com o Dec.-Lei n.º 147/2003.
   - Geração de código de circulação AT Doc Code e matrícula da viatura transportadora.

7. **Agenda Universal & Rotinas Pessoais / Saúde**:
   - Agendamento de consultas médicas, reuniões com clientes, visitas e treinos desportivos.
   - Gestão de medicação diária e hábitos com assinalamento de cumprimento diário.
   - Exportação e subscrição iCalendar (`.ics`) RFC 5545 em `/api/agenda/export/ical` para Apple Calendar, Outlook e Google Calendar.

8. **Dispositivos, Smartwatches & Notificações**:
   - Adaptador para Apple Watch e Wear OS (Samsung Galaxy Watch, Google Pixel Watch) com suporte a complicações e mostradores.
   - API de sincronização em tempo real em `/api/devices/sync`.
   - Dispatch de notificações Web Push (W3C Push API) em `/api/devices/push`.
   - Gateway de envio de mensagens SMS e alertas.

9. **Gestão Documental & Arquivo Digital**:
   - Arquivo categorizado de documentos de identificação, certidões permanentes, apólices de seguro e licenças.
   - Fluxo de verificação de documentos.

10. **Inteligência Artificial (IA Assistant)**:
    - Estimador preditivo de orçamentos por setor de atividade e área de intervenção.
    - Assistente conversacional para apoio executivo e pessoal.

11. **Auditoria & Privacidade (RGPD)**:
    - Registo imutável de auditoria (`audit_logs`) para todas as ações críticas.
    - Portabilidade de dados em formato estruturado JSON (Artigo 20.º) em `/api/rgpd/export`.
    - Execução do Direito ao Esquecimento / Anonimização (Artigo 17.º) em `/api/rgpd/delete`.

---

## Comandos de Execução

### Desenvolvimento Web Local
```bash
# Instalar dependências
pnpm install

# Iniciar servidor Next.js em desenvolvimento
pnpm dev
# Aplicação acessível em: http://localhost:3000
```

### Verificação e Compilação
```bash
# Verificação estrita de tipos TypeScript
pnpm typecheck

# Análise estática de código e linting
pnpm lint

# Compilação e build de produção Turborepo
pnpm build
```

### Execução Mobile / PWA / Android
1. **PWA (Progressive Web App)**: Aceder a `http://localhost:3000` (ou URL de produção HTTPS) em qualquer browser móvel (Chrome no Android, Safari no iOS) e selecionar "Adicionar ao ecrã principal" / "Instalar App".
2. **Android (Capacitor / Trusted Web Activity)**:
   ```bash
   # Build da aplicação web
   pnpm build
   # Caso utilize Capacitor CLI:
   # npx cap sync android
   # npx cap open android
   ```

---

## Doutrina operacional dos ciclos

- **Gates 4x obrigatórios** antes de qualquer commit: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — todos com exit 0. Estado de referência: **115 files / 1760 passed / 6 skipped (HEAD `4c5d2de`)**.
- **`git add` seletivo** por ficheiros explícitos do ciclo — nunca `git add -A`.
- **Push nunca automático**: só com instrução explícita do utilizador.
- **Migrações de base de dados só com autorização escrita** (Regra #99): aplicar por ficheiro único e nunca executar `supabase db push`/seed em produção; prod nunca automático (ver `DATABASE.md`).
- **Protocolo anti-loop**: R1 cada comando executado 1x; R2 outputs grandes → `$env:TEMP` + `Tail`; R3 cada gate 1x; R4 PARAR após o relatório.
- **Fail-safe por domínio**: erro numa fonte contribui zero itens e a funcionalidade não cai (briefing, memória, mute).
- **Sem `ts-ignore`, sem `as any`, sem skips** em código novo.
- **Delta de testes obrigatório**: cada vaga de trabalho deve adicionar testes net-new ≥ 5 (regra P7a: baseline 1732 → target 1737, atingido 1749; P7c: baseline 1755 → target 1760, atingido 1760). Verificar `pnpm test` e comparar com baseline registado no AGENTS.md.
