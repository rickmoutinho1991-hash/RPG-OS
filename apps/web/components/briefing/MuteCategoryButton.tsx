"use client";

/**
 * RPG-OS — Silenciar/reativar uma categoria do briefing.
 * Persistência via rota existente /api/memories (só fetch, sem Supabase no
 * client): GET para ler o estado atual e POST/DELETE para gravar a preferência
 * muted_categories (kind=preference, value={categories:[...]}).
 * Otimista com rollback em erro e aviso discreto.
 */
import { useState, useCallback } from "react";
import { toggleMutedCategory } from "@/lib/briefingMute";

interface MuteCategoryButtonProps {
  category: string;
  initiallyMuted: boolean;
}

const MUTED_KEY = "muted_categories";

export function MuteCategoryButton({
  category,
  initiallyMuted,
}: MuteCategoryButtonProps) {
  const [muted, setMuted] = useState(initiallyMuted);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3000);
  }, []);

  const handleToggle = useCallback(async () => {
    if (pending) return;
    setPending(true);
    const prev = muted;
    setMuted(!prev);

    try {
      const readRes = await fetch("/api/memories", { cache: "no-store" });
      if (!readRes.ok) throw new Error("leitura falhou");
      const memories = (await readRes.json()) as Array<{
        key?: string;
        kind?: string;
        value?: { categories?: unknown };
      }>;
      const pref = memories.find(
        (m) => m.kind === "preference" && m.key === MUTED_KEY,
      );
      const current = Array.isArray(pref?.value?.categories)
        ? pref.value.categories.filter((c): c is string => typeof c === "string")
        : [];
      const next = toggleMutedCategory(current, category);

      if (next.length === 0) {
        const delRes = await fetch(`/api/memories?key=${MUTED_KEY}`, {
          method: "DELETE",
        });
        if (!delRes.ok) throw new Error("apagar falhou");
      } else {
        const postRes = await fetch("/api/memories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: MUTED_KEY,
            kind: "preference",
            value: { categories: next },
          }),
        });
        if (!postRes.ok) throw new Error("gravar falhou");
      }
    } catch {
      setMuted(prev);
      flash("Erro ao atualizar a preferência.");
    } finally {
      setPending(false);
    }
  }, [category, muted, pending, flash]);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        className="button secondary"
        style={{
          fontSize: "11px",
          padding: "2px 8px",
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {muted ? "Reativar" : "Silenciar"}
      </button>
      {muted && <span style={{ fontSize: "11px", color: "var(--muted)" }}>Silenciada</span>}
      {notice && (
        <span
          style={{ fontSize: "11px", color: "#dc2626" }}
          role="status"
          aria-live="polite"
        >
          {notice}
        </span>
      )}
    </span>
  );
}