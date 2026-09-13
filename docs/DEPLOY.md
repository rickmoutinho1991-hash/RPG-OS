# Deploy — RPG-OS (qualquer host HTTPS)

Guia genérico para colocar o app web em produção. Aplica-se a Vercel, Node
autónomo, Docker, etc. Nenhuma instrução é específica de um host.

## Pré-requisitos

- **HTTPS obrigatório.** O Service Worker só regista em contexto seguro; em
  HTTP o modo offline nunca ativa. Usar certificado válido (Let's Encrypt, CDN,
  etc.) e redirecionar HTTP→HTTPS.
- **Env vars de produção**: a lista completa está em `apps/web/.env.example`
  (Supabase URL/keys, `NEXT_PUBLIC_APP_URL`, `CSRF_SECRET`, `SESSION_SECRET`,
  providers, rate limits...). Nunca commitar credenciais reais; usar secret
  manager do host. `ALLOW_FAKE_PROVIDERS=false` e `PAYMENT_PROVIDER` real em
  produção. `ALLOW_DEMO_ACCESS` nunca definido em prod (default fechado; é uma
  ferramenta de desenvolvimento/teste, não sobrevive fora de dev).
- **Migrações**: nunca automáticas. Seguir o procedimento manual em
  `DATABASE.md` (revisão humana + aplicação por psql/pipeline aprovado).

## Build & start

```
pnpm install && pnpm build && pnpm start
```

- `pnpm build` corre o pré-build `scripts/stamp-sw-version.mjs`, que gera
  `apps/web/public/sw-version.json` com `{"v":"<timestamp>-<short-git-sha>"}`
  (artefacto ignorado pelo git; nunca editar à mão).
- `pnpm start` (= `next start`) serve em modo produção. Em produção real usar
  um gestor de processos (systemd, PM2, plataforma do host) ou proxy (nginx/CDN)
  com cache apropriada para `/sw-version.json` e API nunca cacheada.

## Service Worker (SW)

- A versão de cache é **automática por build** (`rpg-os-${v}`), alimentada pelo
  `sw-version.json` gerado. Sem bump manual.
- O SW lê `/sw-version.json` com `cache: "no-store"` no `install`, e o fetch
  handler **nunca cacheia** esse ficheiro.
- Clientes atualizam no próximo registo/fetch do SW: o novo `install` abre um
  cache novo e o `activate` apaga os antigos.
- Mesmo assim, servir `/sw-version.json` com `no-cache`/`no-store` no proxy é
  recomendado, para que o navegador não o reutilize.

## Pós-deploy — checklist de verificação

1. **Landing**: a página pública carrega com markers visuais do produto.
2. **SW registado**: DevTools → Application → Service Worker mostra o worker
   ativo e a versão `rpg-os-<v>` no que estiver em cache.
3. **Offline**: visitar uma página, colocar offline e recarregar — o shell e os
   estáticos continuam a servir nessa página.
4. **API nunca cacheada**: `/api/...` (dados) nunca vem do cache do SW.
5. **Auth fail-closed**: `GET /api/memories` sem sessão responde `401`
   `{"error":"unauthenticated"}`.

## Nota

O túnel `cloudflared` (e qualquer exposição local) é **só para dev/teste** e
**nunca** para produção.