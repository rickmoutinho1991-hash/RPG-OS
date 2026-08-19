# AGENTS.md

## Arquitetura do RPG-OS

O RPG-OS é uma plataforma de inteligência negocial baseada em uma arquitetura monorepo com o uso de Turborepo, pnpm como gerenciador de pacotes e TypeScript para a tipagem.

### Estrutura de Diretórios

**apps/web**: A aplicação web principal do RPG-OS, baseada em Next.js + TypeScript + Tailwind CSS.

**packages/core**: Pacote central partilhado que contém utilitários, constantes, tipos de dados, etc.

### Regras de Desenvolvimento

1. **Manter pnpm como package manager**.
2. **Manter Turborepo**.
3. **apps/web é a aplicação principal web**.
4. **packages/core é o pacote central partilhado**.
5. **Não colocar lógica específica do domínio diretamente em packages/core sem necessidade**.
6. **Não mover nem apagar docs/**.
7. **Não apagar components/**.
8. **Se for necessário adaptar components existentes para o Next.js, preservar os ficheiros originais sempre que possível**.
9. **Corrigir erros TypeScript existentes apenas quando necessário para a aplicação funcionar**.
10. **Usar TypeScript strict**.
11. **Não instalar dependências desnecessárias**.
12. **Não usar create-turbo para reconstruir o monoreepo**.
13. **Não criar apps mobile neste momento**.
14. **Não implementar funcionalidades de negócio complexas ainda**.

### Regras Contra Loop

- **Antes de cada alteração, verificar os ficheiros relevantes**.
- **Não procurar indefinidamente por ficheiros que não existem**.
- **Se uma tentativa falhar, analisar o erro antes de repetir**.
- **Não executar o mesmo comando mais de 2 vezes sem alterar a abordagem**.
- **Se houver um erro bloqueante, parar e reportar o erro**

## Comandos pnpm

- **pnpm dev**: Inicia o servidor de desenvolvimento
- **pnpm build**: Compila a aplicação
- **pnpm lint**: Realiza linting no código
- **pnpm typecheck**: Verifica erros de tipo

## Critérios de Conclusão

1. **A aplicação deve abrir localmente e mostrar**:
   - RPG-OS
   - Intelligent Business Operating System
   - Navegação funcional entre Dashboard, Clientes, Obras e Orçamentos

2. **Ficheiros criados**:
   - `apps/web/`
   - `apps/web/page.tsx`
   - `apps/web/layout/Sidebar.tsx`

3. **Ficheiros modificados**:
   - `AGENTS.md`

4. **Dependências instaladas**:
   - next
   - react
   - typescript
   - @types/react
   - @types/node
   - tailwindcss
   - postcss
   - autoprefixer

5. **Resultado do typecheck**: Sem erros
6. **Resultado do build**: Sem erros
7. **URL local**: `http://localhost:3000`