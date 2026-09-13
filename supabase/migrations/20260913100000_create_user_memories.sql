-- RPG-OS: Memória de IA — tabela user_memories + RLS owner-only (CICLO M1)
--
-- O que a IA "lembra" de um utilizador fica explícito, editável e apagável.
-- Nunca executado sem autorização (Regra #99). Schema idempotente-ish:
-- tabela/índice/policy usam nomes fixos (aplicar uma única vez).

CREATE TABLE user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('preference','fact','context')),
  source TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

CREATE INDEX idx_user_memories_user ON user_memories(user_id, updated_at DESC);

ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;

-- Owner-only: USING cobre SELECT/UPDATE/DELETE; WITH CHECK cobre INSERT.
CREATE POLICY "user_memories_owner" ON user_memories
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);