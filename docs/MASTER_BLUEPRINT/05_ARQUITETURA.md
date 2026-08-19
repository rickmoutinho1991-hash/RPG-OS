# RPG-OS — Arquitetura Global

## Filosofia

Toda a plataforma será modular.

Nenhum módulo conhece diretamente a base de dados.

Toda a comunicação passa por Services.

Services utilizam Repositories.

Repositories comunicam com Supabase.

A UI nunca comunica diretamente com Supabase.

Fluxo:

UI
↓

Hooks

↓

Services

↓

Repositories

↓

Supabase

---

# Estrutura

apps/

web/

admin/

mobile/

packages/

ui/

database/

auth/

api/

services/

types/

utils/

storage/

pdf/

hooks/

config/

ai/

docs/

MASTER_BLUEPRINT/

supabase/

migrations/

scripts/

---

# Camadas

## UI

Botões

Inputs

Cards

Modais

Tabelas

Dashboard

Calendários

---

## Hooks

Toda lógica reutilizável.

Exemplo:

useClientes()

useDashboard()

useObras()

useAuth()

---

## Services

Regras de negócio.

Exemplo:

ClienteService

ObraService

MarketplaceService

OrcamentoService

---

## Repository

Comunicação com Supabase.

Nunca contém regras.

Apenas CRUD.

---

## Database

Tipos.

Enums.

Interfaces.

Views.

RPC.

SQL.

---

## IA

A IA nunca comunica diretamente com a UI.

Fluxo:

Cliente

↓

Pedido

↓

Service

↓

IA

↓

Resposta

↓

Validação

↓

Utilizador

---

## Marketplace

Cliente

↓

Pedido

↓

Validação RPG

↓

Empresas elegíveis

↓

Propostas

↓

Escolha

↓

Execução

↓

Conclusão

---

## Segurança

Autenticação.

Autorização.

Logs.

Auditoria.

Backups.

Versionamento.

Assinaturas digitais.

Permissões por módulo.

---

## Escalabilidade

Todos os módulos devem funcionar isoladamente.

Todos podem ser distribuídos por servidores diferentes.

Nenhum módulo deverá impedir o funcionamento dos restantes.

---

## Objetivo

Construir uma plataforma preparada para milhões de utilizadores sem necessidade de alterar a arquitetura principal.