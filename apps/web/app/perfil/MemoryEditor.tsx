"use client";

/**
 * RPG-OS — MemoryEditor: gestão real da memória de IA no perfil (CICLO M1).
 * Reutiliza a estética da landing (MemoryControlPreview) mas usa a API
 * /api/memories com dados reais do utilizador autenticado.
 */
import { useEffect, useState } from "react";

type MemoryKind = "preference" | "fact" | "context";

interface UserMemory {
  id: string;
  key: string;
  value: Record<string, unknown>;
  kind: MemoryKind;
  updatedAt: string;
}

interface MemoriesResponse {
  memories?: UserMemory[];
  error?: string;
}

const KIND_LABEL: Record<MemoryKind, string> = {
  preference: "Preferência",
  fact: "Facto",
  context: "Contexto",
};

async function fetchMemories(): Promise<UserMemory[]> {
  const res = await fetch("/api/memories");
  const body = (await res.json()) as MemoriesResponse;
  if (!res.ok) throw new Error(body.error ?? "Falha ao ler memórias.");
  return body.memories ?? [];
}

export function MemoryEditor() {
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [key, setKey] = useState("");
  const [kind, setKind] = useState<MemoryKind>("preference");
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    async function initialLoad() {
      try {
        setMemories(await fetchMemories());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao ler memórias.");
      } finally {
        setLoading(false);
      }
    }
    initialLoad();
  }, []);

  const startEdit = (m: UserMemory) => {
    setEditing(m.id);
    setKey(m.key);
    setKind(m.kind);
    setNotes(String(m.value.note ?? JSON.stringify(m.value)));
    setNotice(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setKey("");
    setKind("preference");
    setNotes("");
    setNotice(null);
  };

  const save = async () => {
    setError(null);
    const trimKey = key.trim();
    if (!trimKey) {
      setError("A chave é obrigatória.");
      return;
    }
    if (!notes.trim()) {
      setError("A nota é obrigatória.");
      return;
    }
    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: trimKey,
          value: { note: notes.trim() },
          kind,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Falha ao guardar memória.");
      setNotice(
        editing
          ? `"${trimKey}" atualizada — a IA passa a usar a versão nova.`
          : `"${trimKey}" guardada.`,
      );
      cancelEdit();
      setMemories(await fetchMemories());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao guardar memória.");
    }
  };

  const remove = async (m: UserMemory) => {
    setError(null);
    try {
      const res = await fetch("/api/memories", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: m.key }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Falha ao apagar memória.");
      setNotice(`"${m.key}" apagada da memória da IA.`);
      if (editing === m.id) cancelEdit();
      setMemories(await fetchMemories());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao apagar memória.");
    }
  };

  return (
    <section aria-labelledby="memory-editor-heading">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
        }}
      >
        <div>
          <h3 id="memory-editor-heading" style={{ margin: "0 0 4px" }}>
            O que a IA lembra de si
          </h3>
          <p
            style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}
          >
            Estas memórias alimentam o briefing diário. São suas: edite ou
            apague quando quiser.
          </p>
        </div>
        <span className="badge success">Dados reais</span>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: "12px",
            padding: "8px 12px",
            borderRadius: "8px",
            background: "rgba(220,38,38,0.08)",
            color: "#dc2626",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}

      <div className="list" style={{ marginTop: "16px" }}>
        {loading ? (
          <div className="list-row">
            <div className="list-title">A carregar…</div>
          </div>
        ) : memories.length === 0 ? (
          <div className="list-row">
            <div>
              <div className="list-title">Ainda não há memórias</div>
              <div className="list-subtitle">
                Adicione uma preferência, facto ou contexto para a IA usar.
              </div>
            </div>
          </div>
        ) : (
          memories.map((m) => (
            <div
              key={m.id}
              className="list-row"
              style={{ alignItems: "center" }}
            >
              <div style={{ flex: 1 }}>
                <div className="list-title">
                  {m.key}{" "}
                  <span className="tag-badge" style={{ fontSize: "10px" }}>
                    {KIND_LABEL[m.kind]}
                  </span>
                </div>
                <div className="list-subtitle">
                  {String(m.value.note ?? JSON.stringify(m.value))}
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  className="button secondary"
                  style={{ padding: "6px 10px", fontSize: "12px" }}
                  onClick={() => startEdit(m)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="button secondary"
                  style={{
                    padding: "6px 10px",
                    fontSize: "12px",
                    color: "#dc2626",
                  }}
                  onClick={() => void remove(m)}
                >
                  Apagar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div
        style={{
          marginTop: "16px",
          display: "grid",
          gap: "8px",
          borderTop: "1px solid var(--border, #e5e7eb)",
          paddingTop: "16px",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: "8px" }}>
          <label style={{ fontSize: "12px", fontWeight: 700 }}>
            Chave
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="ex: iluminacao-refeicoes"
              style={{ width: "100%", marginTop: "4px", padding: "8px" }}
            />
          </label>
          <label style={{ fontSize: "12px", fontWeight: 700 }}>
            Tipo
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as MemoryKind)}
              style={{ width: "100%", marginTop: "4px", padding: "8px" }}
            >
              <option value="preference">Preferência</option>
              <option value="fact">Facto</option>
              <option value="context">Contexto</option>
            </select>
          </label>
        </div>
        <label style={{ fontSize: "12px", fontWeight: 700 }}>
          Nota para a IA
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="O que a IA deve lembrar, em linguagem natural…"
            rows={2}
            style={{ width: "100%", marginTop: "4px", padding: "8px" }}
          />
        </label>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          {editing && (
            <button
              type="button"
              className="button secondary"
              onClick={cancelEdit}
            >
              Cancelar
            </button>
          )}
          <button type="button" className="button" onClick={() => void save()}>
            {editing ? "Guardar alteração" : "Guardar memória"}
          </button>
        </div>
      </div>

      {notice && (
        <p style={{ margin: "12px 0 0", fontSize: "11px", color: "var(--muted)" }}>
          {notice}
        </p>
      )}
    </section>
  );
}