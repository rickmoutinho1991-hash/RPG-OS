"use client";

import { useState } from "react";
import {
  demoPersona,
  demoBriefingItems,
  demoMemoryNotice,
} from "@/lib/demo/marketplaceStory";

/**
 * PASSO 1 — "Um dia acompanhado" (§41).
 * Interativo, com dados fictícios (módulo demo). Nunca dados reais.
 */
export function BriefingDemo() {
  const [expanded, setExpanded] = useState(false    );
  const [dismissed, setDismissed] = useState<string | null>(null);

  return (
    <section aria-labelledby="briefing-heading" className="card">
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
          <h3 id="briefing-heading" style={{ margin: "0 0 6px" }}>
            Bom dia, {demoPersona.name}.
          </h3>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
            São {demoBriefingItems.length} coisas que merecem atenção hoje.
          </p>
        </div>
        <button
          type="button"
          className="button secondary"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Recolher" : "O que é?"}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: "16px" }}>
          <p
            style={{
              fontSize: "14px",
              lineHeight: 1.6,
              borderLeft: "3px solid var(--border)",
              paddingLeft: "12px",
              margin: "0 0 16px",
            }}
          >
            {demoPersona.briefing}
          </p>

          <div className="list">
            {demoBriefingItems.map((item) => (
              <div key={item.id} className="list-row">
                <div>
                  <div className="list-title">{item.label}</div>
                  <div className="list-subtitle">{item.status}</div>
                </div>
                <button
                  type="button"
                  className="button secondary"
                  style={{ padding: "6px 10px", fontSize: "12px" }}
                  onClick={() => setDismissed(item.id)}
                >
                  {dismissed === item.id ? "Feito ✕" : "Tratar"}
                </button>
              </div>
            ))}
          </div>

          <p
            style={{
              margin: "12px 0 0",
              fontSize: "11px",
              color: "var(--muted)",
            }}
          >
            {demoMemoryNotice}
          </p>
        </div>
      )}
    </section>
  );
}
