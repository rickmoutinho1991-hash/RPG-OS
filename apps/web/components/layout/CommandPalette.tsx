"use client";

/**
 * RPG-OS — Command Palette (⌘/Ctrl+K): pesquisa universal.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchResultItem } from "@rpg/core";

const TYPE_ICON: Record<string, string> = {
  page: "📄",
  task: "✓",
  person: "👤",
  client: "👤",
  company: "🏢",
  document: "📁",
  message: "💬",
  invoice: "🧾",
  quote: "📄",
  project: "🔨",
  knowledge: "📚",
  workflow: "⏳",
  event: "📅",
  bill: "💰",
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setResults(json.results ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void search(query), 250);
    return () => clearTimeout(t);
  }, [query, search]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pesquisa universal"
      onClick={() => setOpen(false)}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(15,23,42,0.5)",
        display: "flex", justifyContent: "center", alignItems: "flex-start",
        paddingTop: "12vh", padding: "12vh 16px 16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white", borderRadius: "12px", width: "100%", maxWidth: "560px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar tarefas, clientes, faturas, documentos..."
          aria-label="Pesquisar em todo o RPG-OS"
          style={{
            width: "100%", border: "none", outline: "none",
            padding: "16px 18px", fontSize: "16px",
            borderBottom: "1px solid var(--border)",
          }}
        />
        <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
          {loading && (
            <p style={{ padding: "14px 18px", color: "var(--muted)", fontSize: "13px" }}>A pesquisar...</p>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <p style={{ padding: "14px 18px", color: "var(--muted)", fontSize: "13px" }}>
              Sem resultados para “{query}”.
            </p>
          )}
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(r.url);
              }}
              style={{
                display: "flex", width: "100%", gap: "10px", alignItems: "center",
                padding: "10px 18px", background: "none", border: "none",
                cursor: "pointer", textAlign: "left", fontSize: "14px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <span aria-hidden="true">{TYPE_ICON[r.type] ?? "•"}</span>
              <span style={{ flex: 1 }}>
                {r.title}
                {r.subtitle && (
                  <span style={{ color: "var(--muted)", fontSize: "12px" }}> — {r.subtitle}</span>
                )}
              </span>
            </button>
          ))}
        </div>
        <div style={{ padding: "8px 18px", borderTop: "1px solid var(--border)", fontSize: "11px", color: "var(--muted)" }}>
          A pesquisa respeita as suas permissões. Esc para fechar.
        </div>
      </div>
    </div>
  );
}
