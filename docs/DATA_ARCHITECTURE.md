# Arquitetura de Dados RPG-OS

## Visão Geral

O RPG-OS utiliza uma arquitetura de dados híbrida para suportar diferentes cenários de uso:

1. **Web (Next.js)**: Database SQLite local com sincronização futura
2. **Mobile (Expo/React Native)**: SQLite local com sincronização offline
3. **Backend**: API REST centralizada com validações
4. **Storage Local**: SQLite para desenvolvimento e pequenas instalações
5. **Storage Remoto**: Preparado para Supabase (opcional para escalabilidade)

## Estrutura Atual

### Database SQLite Local

**Localização**: `apps/web/rpgos.db`

**Tabelas Principais**:
- `usuarios` - Utilizadores do sistema
- `clientes` - Clientes e empresas
- `obras` - Projetos/obras associadas a clientes
- `orcamentos` - Orçamentos associados a obras
- `empresas` - Empresas do utilizador

## Estrutura de Permissões

### Roles Definidos

```typescript
enum UserRole {
  ADMIN = "admin",           // Acesso total ao sistema
  GESTOR = "gestor",         // Gestão de projetos e equipa
  TRABALHADOR = "trabalhador", // Acesso limitado a tarefas
  CLIENTE = "cliente",       // Acesso apenas a visualização
  PARCEIRO = "parceiro"     // Acesso limitado a colaborações
}
```

### Permissões por Role

| Funcionalidade | Admin | Gestor | Trabalhador | Cliente | Parceiro |
|---------------|-------|--------|-------------|---------|----------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gestão Clientes | ✅ | ✅ | ❌ | ❌ | ❌ |
| Gestão Obras | ✅ | ✅ | ✅ (próprias) | ✅ (próprias) | ❌ |
| Gestão Orçamentos | ✅ | ✅ | ❌ | ❌ | ❌ |
| Financeiro | ✅ | ✅ | ❌ | ❌ | ❌ |
| RH | ✅ | ✅ | ❌ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ | ❌ | ❌ |

## Arquitetura de Camadas

### 1. Camada de Dados (Database Package)

**Package**: `@rpg/database`

**Responsabilidades**:
- Conexão SQLite via better-sqlite3
- Schema inicialização e migrações
- Repositories pattern para acesso a dados
- Types TypeScript para tipagem segura

**Estrutura**:
```
packages/database/
├── src/
│   ├── client/
│   │   └── sqlite.ts          # Conexão database
│   ├── repositories/
│   │   ├── base/
│   │   │   └── BaseRepository.ts
│   │   └── clientes/
│   │       └── ClienteRepository.ts
│   ├── types/
│   │   └── database.ts        # Interfaces TypeScript
│   └── index.ts
```

### 2. Camada de Autenticação (Auth Package)

**Package**: `@rpg/auth`

**Responsabilidades**:
- Gestão de sessões
- Login/logout
- Proteção de rotas
- Verificação de permissões
- Middleware para Next.js

**Funcionalidades**:
- JWT tokens
- Cookies seguros (httpOnly)
- Refresh tokens
- Session management
- Password hashing (bcrypt)

### 3. Camada de API (API Package)

**Package**: `@rpg/api`

**Responsabilidades**:
- Endpoints REST centralizados
- Validação de requests
- Tratamento de erros
- Rate limiting
- Logging

### 4. Camada de Aplicação (Apps)

**Web App** (`apps/web`):
- Páginas Next.js
- Client components
- API routes específicas
- Context providers

**Mobile App** (`apps/mobile`):
- React Native screens
- Navegação
- Offline support
- Sync logic

## Estratégia de Sincronização

### Fase 1 (Atual)
- SQLite local apenas
- Sem sincronização
- Desenvolvimento e pequenas instalações

### Fase 2 (Futura)
- SQLite local + API REST
- Sincronização manual
- Backup na cloud

### Fase 3 (Avançada)
- SQLite local + Supabase
- Sincronização automática
- Conflict resolution
- Offline-first architecture

## Segurança

### Passwords
- Hash com bcrypt (salt rounds: 10)
- Nunca armazenar passwords em plain text
- Validação de complexidade

### Sessions
- JWT tokens com expiração
- Refresh tokens
- Cookies httpOnly e secure
- CORS configurado

### API
- Rate limiting por IP
- Validação de inputs
- SQL injection prevention (prepared statements)
- XSS protection

## Backup e Recovery

### Local
- Backup automático diário do SQLite
- Retenção: 7 dias
- Compressão de backups

### Cloud (Fase 3)
- Backups automáticos para Supabase
- Retenção: 30 dias
- Multi-region replication

## Performance

### Indexes
- Chaves primárias em todas as tabelas
- Indexes em foreign keys
- Indexes em campos frequentemente pesquisados

### Queries
- Prepared statements para segurança
- Query optimization
- Connection pooling (quando aplicável)

## Escalabilidade

### Vertical
- Aumentar recursos do servidor
- Otimizar queries
- Caching de resultados

### Horizontal
- Sharding de database (Fase 3)
- Load balancing
- CDN para assets estáticos

## Migrações

### Estratégia
- Versionamento de schema
- Rollback automático
- Testes de migração
- Zero downtime (quando possível)

### Ferramentas
- Custom migration runner
- Version control de schema
- Backup antes de migrações

## Conclusão

Esta arquitetura permite:
- ✅ Desenvolvimento rápido com SQLite local
- ✅ Escalabilidade futura com Supabase
- ✅ Mobile-first com offline support
- ✅ Segurança robusta
- ✅ Manutenibilidade e testabilidade

A arquitetura está preparada para evoluir de uma solução local para uma solução cloud escalável sem reescrever a aplicação.