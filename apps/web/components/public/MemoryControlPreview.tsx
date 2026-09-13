"use client";

import { useState } from "react";
import {
  demoMemoryPreferences,
  demoMemoryNotice,
} from "@/lib/demo/marketplaceStory";

type PrefState = "nova" | "editar" | "apagar";

export function MemoryControlPreview() {
  const [prefs, setPrefs] = useState(demoMemoryPreferences);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = (id: string, state: PrefState) => {
    setPrefs((prev) =>
      prev.map((p) => (p.id === id ? { ...p, state } : p)),
    );
    const p = prefs.find((x) => x.id === id);
    if (!p) return;
    setNotice(
      state === "nova"
        ? "Preferência guardada (nova)."
        : state === "editar"
          ? `"${p.label}" marcada para editar — a IA irá rever o contexto.`
          : `"${p.label}" marcada para apagar.`,
    );
  };

  return (
    <section aria-labelledby="memory-heading" className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
        }}
      >
        <div>
          <span className="badge" style={{ marginBottom: "8px" }}>
            Demonstração · dados fictícios
          </span>
          <h3 id="memory-heading" style={{ margin: "0 0 4px" }}>
            Uma IA que acompanha, por decisão sua
          </h3>
          <p
            style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}
          >
            O que a IA lembra fica à vista — e pode ser editado ou apagado
            quando quiser.
          </p>
        </div>
      </div>

      <div className="list" style={{ marginTop: "16px" }}>
        {prefs.map((p) => (
          <div key={p.id} className="list-row" style={{ alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div className="list-title">{p.label}</div>
              <div className="list-subtitle">
                {p.value}
                {p.state !== "nova" && (
                  <span
                    style={{
                      marginLeft: "8px",
                      color: p.state === "apagar" ? "#dc2626" : "#d97706",
                      fontWeight: 600,
                    }}
                  >
                    {p.state === "apagar" ? " · para apagar" : " · para editar"}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                className="button secondary"
                style={{ padding: "6px 10px", fontSize: "12px" }}
                onClick={() => apply(p.id, "editar")}
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
                onClick={() => apply(p.id, "apagar")}
              >
                Apagar
              </button>
            </div>
          </div>
        ))}
      </div>

      <p style={{ margin: "12px 0 0", fontSize: "11px", color: "var(--muted)" }}>
        {notice ?? demoMemoryNotice}
      </p>
    </section>
  );
}