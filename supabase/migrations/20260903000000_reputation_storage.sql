-- RPG-OS: Storage privado para anexos de reputação
-- Migração 20260903000000 (FASE 3.1 — Production UX)
--
-- Cria um bucket PRIVADO dedicado aos anexos/evidências das avaliações e
-- reclamações. O bucket é nunca público: os downloads são entregues apenas via
-- signed URLs geradas no servidor (service_role) depois de verificar que o
-- requisitante é autor, membro do tenant ou alvo da avaliação.
-- Software policies: upload sempre server-side (service_role); o cliente nunca
-- escreve diretamente no storage (RLS em reputation_attachments já cobre a BD).
--
-- Segurança de anexos (FASE 3.1):
--   • bucket PRIVADO (public = false) → sem acesso anónimo; só signed URLs.
--   • tamanho máximo + MIME permitidos no próprio bucket (defesa em profundidade).
--   • caminho com tenant + review obrigatórios (folder = {orgId}/{reviewId}/…).
--   • nunca base64 na BD (guardamos storage_path, não o conteúdo).
--   • validação MIME/tamanho/nome também no servidor (lib/reputation/storage.ts).

-- 1. Bucket privado de anexos de reputação
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'reputation-attachments',
    'reputation-attachments',
    false,
    15728640,  -- 15 MB por anexo
    ARRAY['image/jpeg','image/png','image/webp','application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Acesso:
--    - SEM policy pública de leitura (o bucket é privado; leitura apenas via
--      signed URL emitida no servidor para quem tem permissão no RLS da BD).
--    - Escrita apenas server-side (service_role) → sem policy INSERT para
--      authenticated/anon. Isto garante que o cliente NUNCA faz upload direto.
--    - Os UPDATE/DELETE ficam restritos a service_role (default storage RLS).
