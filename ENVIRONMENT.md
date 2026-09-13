# Environment
Obrigatórias para Supabase:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (apenas servidor)

Integrações opcionais, ainda não ativas sem adapter/configuração:

- `EMAIL_PROVIDER` e credenciais do provider escolhido;
- `PUSH_PROVIDER` e credenciais Web Push;
- `AI_PROVIDER` e respetiva API key;
- `CRON_SECRET` para proteger endpoints de processamento agendado.

Os providers não configurados devolvem explicitamente `*_PROVIDER_NOT_CONFIGURED`; não simulam envio nem respostas de IA.
